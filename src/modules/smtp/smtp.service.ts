import { Injectable, Logger } from '@nestjs/common';
import { LoorCoreClient } from '../../integrations/loor-core/loor-core.client';
import { AuditService } from '../audit/audit.service';

type AuditMeta = {
  operatorId: string;
  correlationId?: string;
  ip?: string;
  userAgent?: string;
};

@Injectable()
export class SmtpService {
  private readonly logger = new Logger(SmtpService.name);

  constructor(
    private readonly core: LoorCoreClient,
    private readonly audit: AuditService,
  ) {}

  async get(whitelabelId: string, correlationId?: string) {
    const result = await this.core.request({
      method: 'GET',
      path: `/internal/super-admin/v1/whitelabels/${whitelabelId}/smtp`,
      correlationId,
    });
    return result.data;
  }

  async update(whitelabelId: string, body: Record<string, unknown>, meta: AuditMeta) {
    try {
      const result = await this.core.request({
        method: 'PUT',
        path: `/internal/super-admin/v1/whitelabels/${whitelabelId}/smtp`,
        body,
        correlationId: meta.correlationId,
      });
      await this.safeAudit({
        action: 'UPDATE_SMTP',
        superAdminId: meta.operatorId,
        resourceType: 'smtp',
        whitelabelId: Number(whitelabelId) || null,
        afterData: this.auditSafeBody(body, 'put'),
        result: 'success',
        correlationId: meta.correlationId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return result.data;
    } catch (error) {
      await this.safeAudit({
        action: 'UPDATE_SMTP',
        superAdminId: meta.operatorId,
        resourceType: 'smtp',
        whitelabelId: Number(whitelabelId) || null,
        afterData: this.auditSafeBody(body, 'put'),
        result: 'failed',
        correlationId: meta.correlationId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      throw error;
    }
  }

  async patch(whitelabelId: string, body: Record<string, unknown>, meta: AuditMeta) {
    try {
      const result = await this.core.request({
        method: 'PATCH',
        path: `/internal/super-admin/v1/whitelabels/${whitelabelId}/smtp`,
        body,
        correlationId: meta.correlationId,
      });
      await this.safeAudit({
        action: 'PATCH_SMTP',
        superAdminId: meta.operatorId,
        resourceType: 'smtp',
        whitelabelId: Number(whitelabelId) || null,
        afterData: this.auditSafeBody(body, 'patch'),
        result: 'success',
        correlationId: meta.correlationId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return result.data;
    } catch (error) {
      await this.safeAudit({
        action: 'PATCH_SMTP',
        superAdminId: meta.operatorId,
        resourceType: 'smtp',
        whitelabelId: Number(whitelabelId) || null,
        afterData: this.auditSafeBody(body, 'patch'),
        result: 'failed',
        correlationId: meta.correlationId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      throw error;
    }
  }

  async test(whitelabelId: string, body: Record<string, unknown>, meta: AuditMeta) {
    const result = await this.core.request({
      method: 'POST',
      path: `/internal/super-admin/v1/whitelabels/${whitelabelId}/smtp/test`,
      body,
      correlationId: meta.correlationId,
    });
    await this.safeAudit({
      action: 'TEST_SMTP',
      superAdminId: meta.operatorId,
      resourceType: 'smtp',
      whitelabelId: Number(whitelabelId) || null,
      afterData: { destinationPresent: Boolean(body.to ?? body.email) },
      result: 'success',
      correlationId: meta.correlationId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return result.data;
  }

  /** Never persist username/password/aliases in audit. */
  private auditSafeBody(body: Record<string, unknown>, mode: 'put' | 'patch') {
    const changed = Object.keys(body).filter(
      (k) => !/password|username|secret|token/i.test(k),
    );
    return {
      mode,
      changedFields: changed,
      credentialsReplaced: {
        username: body.replaceUsername !== undefined || (mode === 'put' && body.username !== undefined),
        password: body.replacePassword !== undefined || (mode === 'put' && body.password !== undefined),
      },
    };
  }

  private async safeAudit(input: Parameters<AuditService['write']>[0]) {
    try {
      await this.audit.write(input);
    } catch (error) {
      this.logger.error({
        msg: 'smtp_audit_failed',
        action: input.action,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
