import { Injectable, Logger } from '@nestjs/common';
import { LoorCoreClient } from '../../integrations/loor-core/loor-core.client';
import { AuditService } from '../audit/audit.service';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

type AuditMeta = {
  operatorId: string;
  correlationId?: string;
  ip?: string;
  userAgent?: string;
};

@Injectable()
export class OpportunityService {
  private readonly logger = new Logger(OpportunityService.name);
  private readonly base = '/internal/super-admin/v1/opportunities';

  constructor(
    private readonly core: LoorCoreClient,
    private readonly audit: AuditService,
  ) {}

  async list(query: PaginationQueryDto | Record<string, unknown>, correlationId?: string) {
    const result = await this.core.request({
      method: 'GET',
      path: this.base,
      query,
      correlationId,
    });
    return result.data;
  }

  async detail(id: string, correlationId?: string) {
    const result = await this.core.request({
      method: 'GET',
      path: `${this.base}/${id}`,
      correlationId,
    });
    return result.data;
  }

  async helperEntrepreneurs(whitelabelId: string, correlationId?: string) {
    const result = await this.core.request({
      method: 'GET',
      path: `${this.base}/helpers/entrepreneurs`,
      query: { whitelabelId },
      correlationId,
    });
    return result.data;
  }

  async helperContracts(whitelabelId: string, correlationId?: string) {
    const result = await this.core.request({
      method: 'GET',
      path: `${this.base}/helpers/contracts`,
      query: { whitelabelId },
      correlationId,
    });
    return result.data;
  }

  async helperInvestorProfiles(whitelabelId: string, correlationId?: string) {
    const result = await this.core.request({
      method: 'GET',
      path: `${this.base}/helpers/investor-profiles`,
      query: { whitelabelId },
      correlationId,
    });
    return result.data;
  }

  async create(body: Record<string, unknown>, meta: AuditMeta) {
    try {
      const result = await this.core.request({
        method: 'POST',
        path: this.base,
        body,
        correlationId: meta.correlationId,
      });
      const data = (result.data as { data?: { id?: number; whitelabelId?: number; entrepreneurId?: number } })
        ?.data;
      await this.safeAudit({
        action: 'CREATE_OPPORTUNITY',
        superAdminId: meta.operatorId,
        resourceType: 'opportunity',
        resourceId: data?.id != null ? String(data.id) : undefined,
        whitelabelId: Number(body.whitelabelId) || data?.whitelabelId || undefined,
        afterData: {
          whitelabelId: body.whitelabelId,
          entrepreneurId: body.entrepreneurId,
          opportunityId: data?.id,
        },
        result: 'success',
        correlationId: meta.correlationId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return result.data;
    } catch (error) {
      await this.safeAudit({
        action: 'CREATE_OPPORTUNITY',
        superAdminId: meta.operatorId,
        resourceType: 'opportunity',
        whitelabelId: Number(body.whitelabelId) || undefined,
        afterData: { whitelabelId: body.whitelabelId, entrepreneurId: body.entrepreneurId },
        result: 'failed',
        correlationId: meta.correlationId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      throw error;
    }
  }

  async update(id: string, body: Record<string, unknown>, meta: AuditMeta) {
    try {
      const before = await this.detail(id, meta.correlationId).catch(() => null);
      const result = await this.core.request({
        method: 'PATCH',
        path: `${this.base}/${id}`,
        body,
        correlationId: meta.correlationId,
      });
      await this.safeAudit({
        action: 'UPDATE_OPPORTUNITY',
        superAdminId: meta.operatorId,
        resourceType: 'opportunity',
        resourceId: id,
        beforeData: before ? { status: (before as any)?.data?.status } : undefined,
        afterData: body,
        result: 'success',
        correlationId: meta.correlationId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return result.data;
    } catch (error) {
      await this.safeAudit({
        action: 'UPDATE_OPPORTUNITY',
        superAdminId: meta.operatorId,
        resourceType: 'opportunity',
        resourceId: id,
        afterData: body,
        result: 'failed',
        correlationId: meta.correlationId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      throw error;
    }
  }

  async approve(id: string, body: Record<string, unknown>, meta: AuditMeta) {
    try {
      const result = await this.core.request({
        method: 'POST',
        path: `${this.base}/${id}/approve`,
        body,
        correlationId: meta.correlationId,
      });
      await this.safeAudit({
        action: 'APPROVE_OPPORTUNITY',
        superAdminId: meta.operatorId,
        resourceType: 'opportunity',
        resourceId: id,
        beforeData: { status: 'review' },
        afterData: { status: 'active' },
        result: 'success',
        correlationId: meta.correlationId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return result.data;
    } catch (error) {
      await this.safeAudit({
        action: 'APPROVE_OPPORTUNITY',
        superAdminId: meta.operatorId,
        resourceType: 'opportunity',
        resourceId: id,
        result: 'failed',
        correlationId: meta.correlationId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      throw error;
    }
  }

  async deny(id: string, body: Record<string, unknown>, meta: AuditMeta) {
    try {
      const result = await this.core.request({
        method: 'POST',
        path: `${this.base}/${id}/deny`,
        body,
        correlationId: meta.correlationId,
      });
      await this.safeAudit({
        action: 'DENY_OPPORTUNITY',
        superAdminId: meta.operatorId,
        resourceType: 'opportunity',
        resourceId: id,
        beforeData: { status: 'review' },
        afterData: { status: 'archived', reason: body.reason },
        result: 'success',
        correlationId: meta.correlationId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return result.data;
    } catch (error) {
      await this.safeAudit({
        action: 'DENY_OPPORTUNITY',
        superAdminId: meta.operatorId,
        resourceType: 'opportunity',
        resourceId: id,
        afterData: body,
        result: 'failed',
        correlationId: meta.correlationId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      throw error;
    }
  }

  async archive(id: string, body: Record<string, unknown>, meta: AuditMeta) {
    try {
      const result = await this.core.request({
        method: 'POST',
        path: `${this.base}/${id}/archive`,
        body,
        correlationId: meta.correlationId,
      });
      await this.safeAudit({
        action: 'ARCHIVE_OPPORTUNITY',
        superAdminId: meta.operatorId,
        resourceType: 'opportunity',
        resourceId: id,
        beforeData: { status: 'review' },
        afterData: { status: 'archived', reason: body.reason },
        result: 'success',
        correlationId: meta.correlationId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return result.data;
    } catch (error) {
      await this.safeAudit({
        action: 'ARCHIVE_OPPORTUNITY',
        superAdminId: meta.operatorId,
        resourceType: 'opportunity',
        resourceId: id,
        afterData: body,
        result: 'failed',
        correlationId: meta.correlationId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      throw error;
    }
  }

  private async safeAudit(input: Parameters<AuditService['write']>[0]) {
    try {
      await this.audit.write(input);
    } catch (error) {
      this.logger.error({
        msg: 'opportunity_audit_failed',
        action: input.action,
        result: input.result,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
