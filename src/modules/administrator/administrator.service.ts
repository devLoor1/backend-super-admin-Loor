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
export class AdministratorService {
  private readonly logger = new Logger(AdministratorService.name);
  private readonly base = '/internal/super-admin/v1/whitelabels';

  constructor(
    private readonly core: LoorCoreClient,
    private readonly audit: AuditService,
  ) {}

  list(whitelabelId: string, query: PaginationQueryDto, correlationId?: string) {
    return this.core.request({
      method: 'GET',
      path: `${this.base}/${whitelabelId}/admins`,
      query: { ...query },
      correlationId,
    });
  }

  detail(whitelabelId: string, id: string, correlationId?: string) {
    return this.core.request({
      method: 'GET',
      path: `${this.base}/${whitelabelId}/admins/${id}`,
      correlationId,
    });
  }

  async create(whitelabelId: string, body: Record<string, unknown>, meta: AuditMeta) {
    try {
      const result = await this.core.request({
        method: 'POST',
        path: `${this.base}/${whitelabelId}/admins`,
        body,
        correlationId: meta.correlationId,
      });
      await this.safeAudit({
        action: 'CREATE_WHITELABEL_ADMIN',
        superAdminId: meta.operatorId,
        resourceType: 'whitelabel_admin',
        whitelabelId: Number(whitelabelId) || null,
        afterData: { email: body.email },
        result: 'success',
        correlationId: meta.correlationId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return result.data;
    } catch (error) {
      await this.safeAudit({
        action: 'CREATE_WHITELABEL_ADMIN',
        superAdminId: meta.operatorId,
        resourceType: 'whitelabel_admin',
        whitelabelId: Number(whitelabelId) || null,
        afterData: { email: body.email },
        result: 'failed',
        correlationId: meta.correlationId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      throw error;
    }
  }

  async update(
    whitelabelId: string,
    id: string,
    body: { name?: string; email?: string },
    meta: AuditMeta,
  ) {
    try {
      const result = await this.core.request({
        method: 'PATCH',
        path: `${this.base}/${whitelabelId}/admins/${id}`,
        body,
        correlationId: meta.correlationId,
      });
      await this.safeAudit({
        action: 'UPDATE_WHITELABEL_ADMIN',
        superAdminId: meta.operatorId,
        resourceType: 'whitelabel_admin',
        resourceId: id,
        whitelabelId: Number(whitelabelId) || null,
        afterData: body,
        result: 'success',
        correlationId: meta.correlationId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return result.data;
    } catch (error) {
      await this.safeAudit({
        action: 'UPDATE_WHITELABEL_ADMIN',
        superAdminId: meta.operatorId,
        resourceType: 'whitelabel_admin',
        resourceId: id,
        whitelabelId: Number(whitelabelId) || null,
        afterData: body,
        result: 'failed',
        correlationId: meta.correlationId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      throw error;
    }
  }

  async setActive(whitelabelId: string, id: string, active: boolean, meta: AuditMeta) {
    const path = active
      ? `${this.base}/${whitelabelId}/admins/${id}/activate`
      : `${this.base}/${whitelabelId}/admins/${id}/deactivate`;
    try {
      const result = await this.core.request({
        method: 'PATCH',
        path,
        body: active ? {} : undefined,
        correlationId: meta.correlationId,
      });
      await this.safeAudit({
        action: active ? 'ACTIVATE_WHITELABEL_ADMIN' : 'DEACTIVATE_WHITELABEL_ADMIN',
        superAdminId: meta.operatorId,
        resourceType: 'whitelabel_admin',
        resourceId: id,
        whitelabelId: Number(whitelabelId) || null,
        afterData: { active },
        result: 'success',
        correlationId: meta.correlationId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return result.data;
    } catch (error) {
      await this.safeAudit({
        action: active ? 'ACTIVATE_WHITELABEL_ADMIN' : 'DEACTIVATE_WHITELABEL_ADMIN',
        superAdminId: meta.operatorId,
        resourceType: 'whitelabel_admin',
        resourceId: id,
        whitelabelId: Number(whitelabelId) || null,
        afterData: { active },
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
        msg: 'whitelabel_admin_audit_failed',
        action: input.action,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
