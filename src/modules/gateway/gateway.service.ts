import { Injectable } from '@nestjs/common';
import { LoorCoreClient } from '../../integrations/loor-core/loor-core.client';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class GatewayService {
  constructor(
    private readonly core: LoorCoreClient,
    private readonly audit: AuditService,
  ) {}

  list(whitelabelId: string, correlationId?: string) {
    return this.core.request({
      method: 'GET',
      path: `/internal/super-admin/v1/whitelabels/${whitelabelId}/gateways`,
      correlationId,
    });
  }

  async upsert(
    whitelabelId: string,
    body: Record<string, unknown>,
    meta: { operatorId: string; correlationId?: string; ip?: string; userAgent?: string },
  ) {
    const result = await this.core.request({
      method: 'PUT',
      path: `/internal/super-admin/v1/whitelabels/${whitelabelId}/gateways`,
      body,
      correlationId: meta.correlationId,
    });
    const safe = { ...body };
    for (const key of Object.keys(safe)) {
      if (/(secret|key|password|token)/i.test(key)) safe[key] = '[REDACTED]';
    }
    await this.audit.write({
      action: 'UPDATE_GATEWAY',
      superAdminId: meta.operatorId,
      resourceType: 'gateway',
      whitelabelId: Number(whitelabelId) || null,
      afterData: safe,
      result: 'success',
      correlationId: meta.correlationId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return result;
  }
}
