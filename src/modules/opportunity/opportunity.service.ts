import { Injectable } from '@nestjs/common';
import { LoorCoreClient } from '../../integrations/loor-core/loor-core.client';
import { AuditService } from '../audit/audit.service';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

@Injectable()
export class OpportunityService {
  private readonly base = '/internal/super-admin/v1/opportunities';

  constructor(
    private readonly core: LoorCoreClient,
    private readonly audit: AuditService,
  ) {}

  list(query: PaginationQueryDto | Record<string, unknown>, correlationId?: string) {
    return this.core.request({ method: 'GET', path: this.base, query, correlationId });
  }

  detail(id: string, correlationId?: string) {
    return this.core.request({ method: 'GET', path: `${this.base}/${id}`, correlationId });
  }

  async approve(
    id: string,
    meta: { operatorId: string; correlationId?: string; ip?: string; userAgent?: string },
  ) {
    const result = await this.core.request({
      method: 'POST',
      path: `${this.base}/${id}/approve`,
      correlationId: meta.correlationId,
    });
    await this.audit.write({
      action: 'APPROVE_OPPORTUNITY',
      superAdminId: meta.operatorId,
      resourceType: 'opportunity',
      resourceId: id,
      result: 'success',
      correlationId: meta.correlationId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return result;
  }

  async deny(
    id: string,
    body: Record<string, unknown>,
    meta: { operatorId: string; correlationId?: string; ip?: string; userAgent?: string },
  ) {
    const result = await this.core.request({
      method: 'POST',
      path: `${this.base}/${id}/deny`,
      body,
      correlationId: meta.correlationId,
    });
    await this.audit.write({
      action: 'DENY_OPPORTUNITY',
      superAdminId: meta.operatorId,
      resourceType: 'opportunity',
      resourceId: id,
      afterData: body,
      result: 'success',
      correlationId: meta.correlationId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return result;
  }
}
