import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { LoorCoreClient } from '../../integrations/loor-core/loor-core.client';
import { AuditService } from '../audit/audit.service';

type AuditMeta = {
  operatorId: string;
  correlationId?: string;
  ip?: string;
  userAgent?: string;
};

@Injectable()
export class ShowcaseService {
  private readonly logger = new Logger(ShowcaseService.name);

  private path(whitelabelId: string) {
    return `/internal/super-admin/v1/whitelabels/${whitelabelId}/showcase`;
  }

  constructor(
    private readonly core: LoorCoreClient,
    private readonly audit: AuditService,
  ) {}

  async get(whitelabelId: string, correlationId?: string) {
    const result = await this.core.request({
      method: 'GET',
      path: this.path(whitelabelId),
      correlationId,
    });
    return result.data;
  }

  async put(whitelabelId: string, body: Record<string, unknown>, meta: AuditMeta) {
    const expectedRevision = body.expectedRevision ?? null;
    const contentHash = createHash('sha256')
      .update(JSON.stringify(body.document ?? null))
      .digest('hex')
      .slice(0, 16);

    try {
      const result = await this.core.request({
        method: 'PUT',
        path: this.path(whitelabelId),
        body,
        correlationId: meta.correlationId,
      });
      const revision = (result.data as { data?: { revision?: number } })?.data?.revision;
      await this.safeAudit({
        action: 'PUT_SHOWCASE',
        superAdminId: meta.operatorId,
        resourceType: 'showcase',
        resourceId: revision != null ? String(revision) : undefined,
        whitelabelId: Number(whitelabelId) || null,
        afterData: {
          expectedRevision,
          revision,
          contentHash,
          schemaVersion: body.schemaVersion ?? null,
        },
        result: 'success',
        correlationId: meta.correlationId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return result.data;
    } catch (error) {
      await this.safeAudit({
        action: 'PUT_SHOWCASE',
        superAdminId: meta.operatorId,
        resourceType: 'showcase',
        whitelabelId: Number(whitelabelId) || null,
        afterData: { expectedRevision, contentHash },
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
        msg: 'showcase_audit_failed',
        action: input.action,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
