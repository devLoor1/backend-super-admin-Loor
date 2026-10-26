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
export class TermsService {
  private readonly logger = new Logger(TermsService.name);
  private base(whitelabelId: string) {
    return `/internal/super-admin/v1/whitelabels/${whitelabelId}/terms-of-use`;
  }

  constructor(
    private readonly core: LoorCoreClient,
    private readonly audit: AuditService,
  ) {}

  async get(whitelabelId: string, correlationId?: string) {
    const result = await this.core.request({
      method: 'GET',
      path: this.base(whitelabelId),
      correlationId,
    });
    return result.data;
  }

  async publish(whitelabelId: string, body: Record<string, unknown>, meta: AuditMeta) {
    const title = String(body.title || '');
    const content = String(body.content_markdown ?? body.contentMarkdown ?? '');
    const contentHash = createHash('sha256').update(content).digest('hex').slice(0, 16);

    try {
      const result = await this.core.request({
        method: 'PUT',
        path: this.base(whitelabelId),
        body,
        correlationId: meta.correlationId,
      });
      const revisionId = (result.data as { data?: { revision_id?: number } })?.data?.revision_id;
      await this.safeAudit({
        action: 'PUBLISH_TERMS_OF_USE',
        superAdminId: meta.operatorId,
        resourceType: 'terms_of_use',
        resourceId: revisionId != null ? String(revisionId) : undefined,
        whitelabelId: Number(whitelabelId) || null,
        afterData: {
          titleLength: title.trim().length,
          contentLength: content.trim().length,
          contentHash,
          expectedCurrentRevisionId:
            body.expectedCurrentRevisionId ?? body.expected_current_revision_id ?? null,
        },
        result: 'success',
        correlationId: meta.correlationId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return result.data;
    } catch (error) {
      await this.safeAudit({
        action: 'PUBLISH_TERMS_OF_USE',
        superAdminId: meta.operatorId,
        resourceType: 'terms_of_use',
        whitelabelId: Number(whitelabelId) || null,
        afterData: { titleLength: title.trim().length, contentHash },
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
        msg: 'terms_audit_failed',
        action: input.action,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
