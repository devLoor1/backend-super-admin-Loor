import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { LoorCoreClient } from '../../integrations/loor-core/loor-core.client';
import { AuditService } from '../audit/audit.service';

export type EmailAuditMeta = {
  operatorId: string;
  correlationId?: string;
  ip?: string;
  userAgent?: string;
};

@Injectable()
export class EmailTemplatesService {
  private readonly logger = new Logger(EmailTemplatesService.name);
  constructor(
    private readonly core: LoorCoreClient,
    private readonly audit: AuditService,
  ) {}

  private id(value: string): string {
    if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
      throw new BadRequestException('Invalid numeric identifier');
    }
    return value;
  }

  private base(tenant: string): string {
    return `/internal/super-admin/v1/whitelabels/${this.id(tenant)}/emails/templates`;
  }

  private body(
    value: Record<string, unknown>,
    fields: string[],
  ): Record<string, unknown> {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.keys(value).some((key) => !fields.includes(key))
    ) {
      throw new BadRequestException('Invalid template payload');
    }
    return value;
  }

  async list(tenant: string, type?: string, correlationId?: string) {
    const result = await this.core.request({
      method: 'GET',
      path: this.base(tenant),
      query: type === undefined ? undefined : { type },
      correlationId,
    });
    return result.data;
  }

  async types(tenant: string, correlationId?: string) {
    return (
      await this.core.request({
        method: 'GET',
        path: `${this.base(tenant)}/types`,
        correlationId,
      })
    ).data;
  }

  async show(tenant: string, id: string, correlationId?: string) {
    return (
      await this.core.request({
        method: 'GET',
        path: `${this.base(tenant)}/${this.id(id)}`,
        correlationId,
      })
    ).data;
  }

  async preview(
    tenant: string,
    body: Record<string, unknown>,
    correlationId?: string,
  ) {
    // Pure renderer: no audit mutation, credential handling or delivery service.
    return (
      await this.core.request({
        method: 'POST',
        path: `${this.base(tenant)}/preview`,
        body: this.body(body, [
          'type',
          'subject',
          'body_html',
          'brandingDraft',
        ]),
        correlationId,
      })
    ).data;
  }

  async mutate(
    tenant: string,
    method: 'POST' | 'PATCH' | 'DELETE',
    body: Record<string, unknown>,
    meta: EmailAuditMeta,
    id?: string,
  ) {
    const path = `${this.base(tenant)}${id === undefined ? '' : `/${this.id(id)}`}`;
    this.body(
      body,
      method === 'POST'
        ? ['name', 'type', 'subject', 'body_html', 'active']
        : method === 'PATCH'
          ? ['name', 'subject', 'body_html', 'active']
          : [],
    );
    const action =
      method === 'POST'
        ? 'CREATE_EMAIL_TEMPLATE'
        : method === 'PATCH'
          ? 'UPDATE_EMAIL_TEMPLATE'
          : 'DELETE_EMAIL_TEMPLATE';
    const audit = {
      action,
      superAdminId: meta.operatorId,
      resourceType: 'email_template',
      whitelabelId: Number(tenant),
      afterData: {
        templateId: id === undefined ? null : Number(id),
        changedFields: Object.keys(body).filter(
          (key) =>
            body[key] !== undefined &&
            ['name', 'type', 'subject', 'body_html', 'active'].includes(key),
        ),
      },
      correlationId: meta.correlationId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    };
    try {
      const result = await this.core.request({
        method,
        path,
        ...(method === 'DELETE' ? {} : { body }),
        correlationId: meta.correlationId,
      });
      const envelope = result.data as { data?: { id?: unknown } };
      const returnedId = envelope?.data?.id;
      const templateId =
        typeof returnedId === 'number' &&
        Number.isSafeInteger(returnedId) &&
        returnedId > 0
          ? returnedId
          : audit.afterData.templateId;
      await this.safeAudit({
        ...audit,
        resourceId: templateId,
        afterData: { ...audit.afterData, templateId },
        result: 'success',
      });
      return result.data;
    } catch (error) {
      await this.safeAudit({ ...audit, result: 'failed' });
      throw error;
    }
  }

  private async safeAudit(input: Parameters<AuditService['write']>[0]) {
    try {
      await this.audit.write(input);
    } catch {
      this.logger.error({
        msg: 'email_template_audit_failed',
        action: input.action,
        correlationId: input.correlationId,
      });
    }
  }
}
