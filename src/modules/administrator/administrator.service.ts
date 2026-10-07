import { Injectable } from '@nestjs/common';
import { LoorCoreClient } from '../../integrations/loor-core/loor-core.client';
import { AuditService } from '../audit/audit.service';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

@Injectable()
export class AdministratorService {
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

  async create(
    whitelabelId: string,
    body: Record<string, unknown>,
    meta: { operatorId: string; correlationId?: string; ip?: string; userAgent?: string },
  ) {
    const result = await this.core.request({
      method: 'POST',
      path: `${this.base}/${whitelabelId}/admins`,
      body,
      correlationId: meta.correlationId,
    });
    await this.audit.write({
      action: 'CREATE_ADMIN',
      superAdminId: meta.operatorId,
      resourceType: 'whitelabel_admin',
      whitelabelId: Number(whitelabelId) || null,
      afterData: body,
      result: 'success',
      correlationId: meta.correlationId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return result;
  }

  async setActive(
    whitelabelId: string,
    id: string,
    active: boolean,
    meta: { operatorId: string; correlationId?: string; ip?: string; userAgent?: string },
  ) {
    const result = await this.core.request({
      method: 'PATCH',
      path: `${this.base}/${whitelabelId}/admins/${id}/status`,
      body: { active },
      correlationId: meta.correlationId,
    });
    await this.audit.write({
      action: active ? 'ENABLE_ADMIN' : 'DISABLE_ADMIN',
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
    return result;
  }
}
