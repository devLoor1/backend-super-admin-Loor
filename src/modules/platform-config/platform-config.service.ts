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
export class PlatformConfigService {
  private readonly logger = new Logger(PlatformConfigService.name);

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

  async update(whitelabelId: string, body: Record<string, unknown>, meta: AuditMeta) {
    try {
      const result = await this.core.request({
        method: 'PUT',
        path: `/internal/super-admin/v1/whitelabels/${whitelabelId}/settings`,
        body,
        correlationId: meta.correlationId,
      });
      await this.safeAudit({
        action: 'UPDATE_PLATFORM_CONFIG',
        superAdminId: meta.operatorId,
        resourceType: 'platform_config',
        whitelabelId: Number(whitelabelId) || null,
        afterData: {
          page: body.page,
          key: body.key,
          valueType: body.value === null ? 'null' : Array.isArray(body.value) ? 'array' : typeof body.value,
        },
        result: 'success',
        correlationId: meta.correlationId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return result.data;
    } catch (error) {
      await this.safeAudit({
        action: 'UPDATE_PLATFORM_CONFIG',
        superAdminId: meta.operatorId,
        resourceType: 'platform_config',
        whitelabelId: Number(whitelabelId) || null,
        afterData: { page: body.page, key: body.key },
        result: 'failed',
        correlationId: meta.correlationId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      throw error;
    }
  }

  async deleteOverride(
    whitelabelId: string,
    page: string,
    key: string,
    meta: AuditMeta,
  ) {
    const path = `/internal/super-admin/v1/whitelabels/${whitelabelId}/settings/${encodeURIComponent(page)}/${encodeURIComponent(key)}/override`;
    try {
      const result = await this.core.request({
        method: 'DELETE',
        path,
        correlationId: meta.correlationId,
      });
      await this.safeAudit({
        action: 'RESET_PLATFORM_CONFIG_OVERRIDE',
        superAdminId: meta.operatorId,
        resourceType: 'platform_config',
        whitelabelId: Number(whitelabelId) || null,
        afterData: { page, key },
        result: 'success',
        correlationId: meta.correlationId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return result.data;
    } catch (error) {
      await this.safeAudit({
        action: 'RESET_PLATFORM_CONFIG_OVERRIDE',
        superAdminId: meta.operatorId,
        resourceType: 'platform_config',
        whitelabelId: Number(whitelabelId) || null,
        afterData: { page, key },
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
        msg: 'platform_config_audit_failed',
        action: input.action,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
