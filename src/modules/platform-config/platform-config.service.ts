import { Injectable } from '@nestjs/common';
import { LoorCoreClient } from '../../integrations/loor-core/loor-core.client';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class PlatformConfigService {
  constructor(
    private readonly core: LoorCoreClient,
    private readonly audit: AuditService,
  ) {}

  async get(whitelabelId: string, correlationId?: string) {
    const result = await this.core.request({
      method: 'GET',
      path: `/internal/super-admin/v1/whitelabels/${whitelabelId}/settings`,
      correlationId,
    });
    return result.data;
  }

  async update(
    whitelabelId: string,
    body: Record<string, unknown>,
    meta: { operatorId: string; correlationId?: string; ip?: string; userAgent?: string },
  ) {
    const result = await this.core.request({
      method: 'PUT',
      path: `/internal/super-admin/v1/whitelabels/${whitelabelId}/settings`,
      body,
      correlationId: meta.correlationId,
    });
    await this.audit.write({
      action: 'UPDATE_PLATFORM_CONFIG',
      superAdminId: meta.operatorId,
      resourceType: 'platform_config',
      whitelabelId: Number(whitelabelId) || null,
      afterData: body,
      result: 'success',
      correlationId: meta.correlationId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return result.data;
  }
}
