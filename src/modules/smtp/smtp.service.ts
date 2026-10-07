import { Injectable } from '@nestjs/common';
import { LoorCoreClient } from '../../integrations/loor-core/loor-core.client';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class SmtpService {
  constructor(
    private readonly core: LoorCoreClient,
    private readonly audit: AuditService,
  ) {}

  get(whitelabelId: string, correlationId?: string) {
    return this.core.request({
      method: 'GET',
      path: `/internal/super-admin/v1/whitelabels/${whitelabelId}/smtp`,
      correlationId,
    });
  }

  async update(
    whitelabelId: string,
    body: Record<string, unknown>,
    meta: { operatorId: string; correlationId?: string; ip?: string; userAgent?: string },
  ) {
    const result = await this.core.request({
      method: 'PUT',
      path: `/internal/super-admin/v1/whitelabels/${whitelabelId}/smtp`,
      body,
      correlationId: meta.correlationId,
    });
    const safeAfter = { ...body };
    if ('password' in safeAfter) safeAfter.password = '[REDACTED]';
    await this.audit.write({
      action: 'UPDATE_SMTP',
      superAdminId: meta.operatorId,
      resourceType: 'smtp',
      whitelabelId: Number(whitelabelId) || null,
      afterData: safeAfter,
      result: 'success',
      correlationId: meta.correlationId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return result;
  }

  async test(
    whitelabelId: string,
    body: Record<string, unknown>,
    meta: { operatorId: string; correlationId?: string; ip?: string; userAgent?: string },
  ) {
    const result = await this.core.request({
      method: 'POST',
      path: `/internal/super-admin/v1/whitelabels/${whitelabelId}/smtp/test`,
      body,
      correlationId: meta.correlationId,
    });
    await this.audit.write({
      action: 'TEST_SMTP',
      superAdminId: meta.operatorId,
      resourceType: 'smtp',
      whitelabelId: Number(whitelabelId) || null,
      afterData: { destination: body.to ?? body.email },
      result: 'success',
      correlationId: meta.correlationId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return result;
  }
}
