import { Injectable, Logger } from '@nestjs/common';
import {
  Prisma,
  ProvisioningStepKey,
  ProvisioningStepStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { LoorCoreException } from '../../integrations/loor-core/loor-core.exception';
import { AdministratorService } from '../administrator/administrator.service';
import { GatewayService } from '../gateway/gateway.service';
import { PlatformConfigService } from '../platform-config/platform-config.service';
import { SmtpService } from '../smtp/smtp.service';
import { TermsService } from '../terms/terms.service';
import { WhitelabelService } from '../whitelabel/whitelabel.service';
import { ProvisioningSecretsStore } from './provisioning-secrets.store';
import {
  containsSecretLikeKey,
  isSettingsCellCopyable,
  scrubSecrets,
} from './provisioning.constants';

export type ProvisioningWithSteps = Prisma.WhitelabelProvisioningGetPayload<{
  include: { steps: true };
}>;
export type ProvisioningStepRow = ProvisioningWithSteps['steps'][number];

export type ProvisioningRunMeta = {
  operatorId: string;
  correlationId?: string;
  ip?: string;
  userAgent?: string;
};

export type StepContext = {
  provisioning: ProvisioningWithSteps;
  step: ProvisioningStepRow;
  meta: ProvisioningRunMeta;
};

export type StepOutcome = {
  status: 'SUCCESS' | 'SKIPPED';
  result?: Record<string, unknown>;
};

/** Domain failure of a step. `result` (never secret) is persisted with the FAILED step. */
export class ProvisioningStepError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly result?: Record<string, unknown>,
  ) {
    super(message);
  }
}

type TermsRevision = {
  title?: string;
  content_markdown?: string;
  revision_id?: unknown;
};

type ProvenanceCell = {
  page?: unknown;
  key?: unknown;
  stored?: unknown;
  storedValue?: unknown;
};

@Injectable()
export class ProvisioningStepsService {
  private readonly logger = new Logger(ProvisioningStepsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whitelabels: WhitelabelService,
    private readonly administrators: AdministratorService,
    private readonly platformConfig: PlatformConfigService,
    private readonly smtp: SmtpService,
    private readonly gateways: GatewayService,
    private readonly terms: TermsService,
    private readonly secrets: ProvisioningSecretsStore,
  ) {}

  async execute(ctx: StepContext): Promise<StepOutcome> {
    switch (ctx.step.key) {
      case ProvisioningStepKey.CREATE_TENANT:
        return this.createTenant(ctx);
      case ProvisioningStepKey.APPLY_SETTINGS_TEMPLATE:
        return this.applySettingsTemplate(ctx);
      case ProvisioningStepKey.UPLOAD_BRAND:
        // MVP: the create payload carries no brand bytes. Always SKIPPED at creation time.
        return {
          status: 'SKIPPED',
          result: { reason: 'brand_upload_not_supported_in_mvp' },
        };
      case ProvisioningStepKey.INITIAL_ADMIN:
        return this.initialAdmin(ctx);
      case ProvisioningStepKey.TERMS:
        return this.publishTerms(ctx);
      case ProvisioningStepKey.SMTP:
        return this.configureSmtp(ctx);
      case ProvisioningStepKey.GATEWAY_CONFIG:
        return this.configureGateway(ctx);
      case ProvisioningStepKey.VALIDATE:
        return this.validate(ctx);
      case ProvisioningStepKey.DELIVER:
        return this.deliver(ctx);
      case ProvisioningStepKey.FE_DEPLOY_CHECK:
      case ProvisioningStepKey.DNS_CHECK:
        throw new ProvisioningStepError(
          'E_MANUAL_STEP',
          `${ctx.step.key} is a manual gate and can only be completed via the manual-complete endpoint`,
        );
      default:
        throw new ProvisioningStepError(
          'E_UNKNOWN_STEP',
          `Unknown step ${String(ctx.step.key)}`,
        );
    }
  }

  // ---------------------------------------------------------------------------
  // CREATE_TENANT
  // ---------------------------------------------------------------------------

  private async createTenant({
    provisioning,
    meta,
  }: StepContext): Promise<StepOutcome> {
    if (provisioning.whitelabelId != null) {
      return {
        status: 'SUCCESS',
        result: {
          whitelabelId: provisioning.whitelabelId,
          source: 'already_bound',
        },
      };
    }

    let id: number | null = null;
    let source: 'existing' | 'created' | 'existing_after_conflict' = 'existing';

    const existing = await this.whitelabels.findExactBySlug(
      provisioning.slug,
      meta.correlationId,
    );
    if (existing) {
      id = Number(existing.id);
    } else {
      try {
        const created = await this.whitelabels.create(
          {
            name: provisioning.name,
            slug: provisioning.slug,
            baseUrl: provisioning.baseUrl,
          },
          meta,
        );
        id = toNumericId((created?.data as { id?: unknown } | undefined)?.id);
        source = 'created';
        if (id == null) {
          // Created, but the response had no usable id: reconcile by slug — never create twice.
          const found = await this.whitelabels.findExactBySlug(
            provisioning.slug,
            meta.correlationId,
          );
          id = found ? Number(found.id) : null;
        }
      } catch (error) {
        if (!isCode(error, 'E_SLUG_TAKEN')) throw error;
        const found = await this.whitelabels.findExactBySlug(
          provisioning.slug,
          meta.correlationId,
        );
        if (!found) throw error;
        id = Number(found.id);
        source = 'existing_after_conflict';
      }
    }

    if (id == null || !Number.isFinite(id)) {
      throw new ProvisioningStepError(
        'E_TENANT_ID_UNRESOLVED',
        'Core did not return a usable Whitelabel id; retry will reconcile by slug',
      );
    }

    await this.prisma.whitelabelProvisioning.update({
      where: { id: provisioning.id },
      data: { whitelabelId: id },
    });
    return { status: 'SUCCESS', result: { whitelabelId: id, source } };
  }

  // ---------------------------------------------------------------------------
  // APPLY_SETTINGS_TEMPLATE
  // ---------------------------------------------------------------------------

  private async applySettingsTemplate({
    provisioning,
    meta,
  }: StepContext): Promise<StepOutcome> {
    const targetId = requireWhitelabelId(provisioning);
    const templateId = provisioning.templateFromWhitelabelId;
    if (templateId == null) {
      return { status: 'SKIPPED', result: { reason: 'no_template' } };
    }
    if (templateId === targetId) {
      throw new ProvisioningStepError(
        'E_TEMPLATE_INVALID',
        'templateFromWhitelabelId must differ from the provisioned Whitelabel',
      );
    }

    const body = (await this.platformConfig.get(
      String(templateId),
      meta.correlationId,
    )) as { data?: { provenance?: ProvenanceCell[] } } | undefined;
    const provenance = body?.data?.provenance;
    if (!Array.isArray(provenance)) {
      throw new ProvisioningStepError(
        'E_TEMPLATE_PROVENANCE_MISSING',
        'Core settings response has no provenance[]; cannot copy template settings',
      );
    }

    const copied: string[] = [];
    const skipped: Array<{ cell: string; reason: string }> = [];

    for (const cell of provenance) {
      const page = typeof cell.page === 'string' ? cell.page : '';
      const key = typeof cell.key === 'string' ? cell.key : '';
      const label = `${page}.${key}`;
      if (!page || !key) continue;
      if (cell.stored !== true) continue; // only explicit overrides; defaults are inherited anyway
      if (!isSettingsCellCopyable(page, key)) {
        skipped.push({ cell: label, reason: 'not_allowlisted' });
        continue;
      }
      if (cell.storedValue === undefined || cell.storedValue === null) {
        skipped.push({ cell: label, reason: 'empty_value' });
        continue;
      }
      if (containsSecretLikeKey(cell.storedValue)) {
        skipped.push({ cell: label, reason: 'secret_like_content' });
        continue;
      }
      await this.platformConfig.update(
        String(targetId),
        { page, key, value: cell.storedValue },
        meta,
      );
      copied.push(label);
    }

    return {
      status: 'SUCCESS',
      result: { templateFromWhitelabelId: templateId, copied, skipped },
    };
  }

  // ---------------------------------------------------------------------------
  // INITIAL_ADMIN
  // ---------------------------------------------------------------------------

  private async initialAdmin({
    provisioning,
    step,
    meta,
  }: StepContext): Promise<StepOutcome> {
    const whitelabelId = requireWhitelabelId(provisioning);
    const payload = (step.payload ?? {}) as {
      email?: string;
      name?: string | null;
    };
    const email = payload.email;
    if (!email) {
      throw new ProvisioningStepError(
        'E_ADMIN_EMAIL_MISSING',
        'Initial admin email is missing',
      );
    }

    const found = await this.adminOnTenant(
      whitelabelId,
      email,
      meta.correlationId,
    );
    if (found) {
      this.secrets.discard(provisioning.id, 'initialAdmin');
      return {
        status: 'SUCCESS',
        result: {
          email,
          name: payload.name ?? null,
          source: 'existing',
          adminId: found.id,
        },
      };
    }

    const secret = this.secrets.get(provisioning.id).initialAdmin;
    if (!secret) {
      throw new ProvisioningStepError(
        'E_SECRETS_REQUIRED',
        'Initial admin credentials are not in memory (restart/expiry). Retry with `initialAdmin` in the body.',
      );
    }

    try {
      const created = (await this.administrators.create(
        String(whitelabelId),
        {
          email: secret.email,
          password: secret.temporaryPassword,
          ...(secret.name ? { name: secret.name } : {}),
        },
        meta,
      )) as { data?: { id?: unknown }; id?: unknown } | undefined;
      const adminId = created?.data?.id ?? created?.id ?? null;
      this.secrets.discard(provisioning.id, 'initialAdmin');
      return {
        status: 'SUCCESS',
        result: {
          email,
          name: payload.name ?? null,
          source: 'created',
          adminId,
        },
      };
    } catch (error) {
      if (!isCode(error, 'E_EMAIL_TAKEN')) throw error;
      const again = await this.adminOnTenant(
        whitelabelId,
        email,
        meta.correlationId,
      );
      if (!again) throw error; // taken by an admin outside this tenant
      this.secrets.discard(provisioning.id, 'initialAdmin');
      return {
        status: 'SUCCESS',
        result: {
          email,
          name: payload.name ?? null,
          source: 'existing_after_conflict',
          adminId: again.id,
        },
      };
    }
  }

  private async adminOnTenant(
    whitelabelId: number,
    email: string,
    correlationId?: string,
  ): Promise<{ id: unknown } | null> {
    const wanted = email.trim().toLowerCase();
    const perPage = 100;
    const maxPages = 50;
    for (let page = 1; page <= maxPages; page += 1) {
      const response = (await this.administrators.list(
        String(whitelabelId),
        { page, perPage },
        correlationId,
      )) as {
        data?: {
          data?: Array<{ id?: unknown; email?: unknown }>;
          meta?: { lastPage?: number };
        };
      };
      const rows = Array.isArray(response?.data?.data)
        ? response.data.data
        : [];
      const hit = rows.find(
        (row) =>
          typeof row.email === 'string' &&
          row.email.trim().toLowerCase() === wanted,
      );
      if (hit) return { id: hit.id ?? null };
      const lastPage = Number(response?.data?.meta?.lastPage ?? 1);
      if (page >= lastPage || rows.length === 0) break;
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // TERMS / SMTP / GATEWAY_CONFIG
  // ---------------------------------------------------------------------------

  private async publishTerms({
    provisioning,
    step,
    meta,
  }: StepContext): Promise<StepOutcome> {
    const whitelabelId = String(requireWhitelabelId(provisioning));
    const payload = (step.payload ?? {}) as {
      title?: string;
      contentMarkdown?: string;
    };
    if (!payload.title || !payload.contentMarkdown) {
      throw new ProvisioningStepError(
        'E_TERMS_MISSING',
        'Terms title/content missing from step payload',
      );
    }

    // A timed-out publish may have landed: do not create a duplicate immutable revision.
    const current = await this.currentTerms(whitelabelId, meta.correlationId);
    if (
      current &&
      current.title === payload.title &&
      current.content_markdown === payload.contentMarkdown
    ) {
      return {
        status: 'SUCCESS',
        result: { source: 'existing', revisionId: current.revision_id ?? null },
      };
    }

    const published = (await this.terms.publish(
      whitelabelId,
      { title: payload.title, content_markdown: payload.contentMarkdown },
      meta,
    )) as { data?: { revision_id?: unknown } } | undefined;
    return {
      status: 'SUCCESS',
      result: {
        source: 'published',
        revisionId: published?.data?.revision_id ?? null,
      },
    };
  }

  private async currentTerms(
    whitelabelId: string,
    correlationId?: string,
  ): Promise<TermsRevision | null> {
    try {
      const body = (await this.terms.get(whitelabelId, correlationId)) as
        | {
            data?: { current?: TermsRevision | null };
            current?: TermsRevision | null;
          }
        | undefined;
      return body?.data?.current ?? body?.current ?? null;
    } catch (error) {
      this.logger.warn({
        msg: 'provisioning_terms_precheck_failed',
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private async configureSmtp({
    provisioning,
    meta,
  }: StepContext): Promise<StepOutcome> {
    const whitelabelId = String(requireWhitelabelId(provisioning));
    const smtp = this.secrets.get(provisioning.id).smtp;
    if (!smtp) {
      throw new ProvisioningStepError(
        'E_SECRETS_REQUIRED',
        'SMTP config is not in memory (restart/expiry). Retry with `smtp` in the body.',
      );
    }
    await this.smtp.update(whitelabelId, smtp, meta);
    this.secrets.discard(provisioning.id, 'smtp');
    return {
      status: 'SUCCESS',
      result: { configured: true, fields: Object.keys(scrubSecrets(smtp)) },
    };
  }

  private async configureGateway({
    provisioning,
    meta,
  }: StepContext): Promise<StepOutcome> {
    const whitelabelId = String(requireWhitelabelId(provisioning));
    const gateway = this.secrets.get(provisioning.id).gateway;
    if (!gateway) {
      throw new ProvisioningStepError(
        'E_SECRETS_REQUIRED',
        'Gateway config is not in memory (restart/expiry). Retry with `gateway` in the body.',
      );
    }
    await this.gateways.upsert(whitelabelId, { items: gateway.items }, meta);
    this.secrets.discard(provisioning.id, 'gateway');
    return {
      status: 'SUCCESS',
      result: { configured: true, items: gateway.items.length },
    };
  }

  // ---------------------------------------------------------------------------
  // VALIDATE / DELIVER
  // ---------------------------------------------------------------------------

  private async validate({
    provisioning,
    meta,
  }: StepContext): Promise<StepOutcome> {
    const fresh = await this.prisma.whitelabelProvisioning.findUnique({
      where: { id: provisioning.id },
      include: { steps: true },
    });
    const steps = new Map(
      (fresh?.steps ?? provisioning.steps).map((s) => [s.key, s]),
    );
    const statusOf = (key: ProvisioningStepKey) => steps.get(key)?.status;

    const checks: Array<{
      name: string;
      ok: boolean;
      skipped?: boolean;
      detail?: string;
    }> = [];
    const whitelabelId = fresh?.whitelabelId ?? provisioning.whitelabelId;

    checks.push({ name: 'whitelabel_bound', ok: whitelabelId != null });
    checks.push({
      name: 'create_tenant',
      ok:
        statusOf(ProvisioningStepKey.CREATE_TENANT) ===
        ProvisioningStepStatus.SUCCESS,
    });

    const conditional: Array<[string, ProvisioningStepKey]> = [
      ['initial_admin', ProvisioningStepKey.INITIAL_ADMIN],
      ['settings_template', ProvisioningStepKey.APPLY_SETTINGS_TEMPLATE],
      ['terms', ProvisioningStepKey.TERMS],
      ['smtp', ProvisioningStepKey.SMTP],
      ['gateway', ProvisioningStepKey.GATEWAY_CONFIG],
      ['fe_deploy_check', ProvisioningStepKey.FE_DEPLOY_CHECK],
      ['dns_check', ProvisioningStepKey.DNS_CHECK],
    ];
    for (const [name, key] of conditional) {
      const status = statusOf(key);
      if (status === ProvisioningStepStatus.SKIPPED) {
        checks.push({ name, ok: true, skipped: true });
      } else {
        checks.push({
          name,
          ok: status === ProvisioningStepStatus.SUCCESS,
          detail: status,
        });
      }
    }

    if (whitelabelId != null) {
      const exists = await this.whitelabels
        .detail(String(whitelabelId), meta.correlationId)
        .then(() => true)
        .catch((error: unknown) => {
          if (isNotFound(error)) return false;
          throw error;
        });
      checks.push({ name: 'core_tenant_exists', ok: exists });
    }

    const ready = checks.every((c) => c.ok);
    const result = { ready, checks };
    if (!ready) {
      const failed = checks.filter((c) => !c.ok).map((c) => c.name);
      throw new ProvisioningStepError(
        'E_VALIDATION_FAILED',
        `Validation failed: ${failed.join(', ')}`,
        result,
      );
    }
    return { status: 'SUCCESS', result };
  }

  private async deliver({
    provisioning,
    meta,
  }: StepContext): Promise<StepOutcome> {
    const fresh = await this.prisma.whitelabelProvisioning.findUnique({
      where: { id: provisioning.id },
      include: { steps: true },
    });
    const current = fresh ?? provisioning;
    const adminStep = current.steps.find(
      (s) => s.key === ProvisioningStepKey.INITIAL_ADMIN,
    );
    const adminPayload = (adminStep?.payload ?? null) as {
      email?: string;
      name?: string | null;
    } | null;
    const hasAdmin =
      adminStep?.status === ProvisioningStepStatus.SUCCESS &&
      adminPayload?.email;

    const delivery = {
      name: current.name,
      slug: current.slug,
      baseUrl: current.baseUrl,
      whitelabelId: current.whitelabelId,
      admin: hasAdmin
        ? { email: adminPayload.email, name: adminPayload.name ?? null }
        : null,
      urls: { primary: current.baseUrl, investor: current.baseUrl },
      // Convention only (`{slug}.empresa.loor.vc` / `{slug}.admin.loor.vc`) — not verified, not guaranteed.
      suggestedUrls: {
        entrepreneur: `https://${current.slug}.empresa.loor.vc`,
        admin: `https://${current.slug}.admin.loor.vc`,
        note: 'Suggested by naming convention; confirm FE deploy / DNS before sharing.',
      },
      credentialsNote:
        'The temporary admin password is never stored; communicate it through a secure out-of-band channel.',
      generatedAt: new Date().toISOString(),
      correlationId: meta.correlationId ?? null,
    };

    await this.prisma.whitelabelProvisioning.update({
      where: { id: provisioning.id },
      data: { delivery },
    });
    return { status: 'SUCCESS', result: { delivered: true } };
  }
}

function requireWhitelabelId(provisioning: {
  whitelabelId: number | null;
}): number {
  if (provisioning.whitelabelId == null) {
    throw new ProvisioningStepError(
      'E_TENANT_NOT_BOUND',
      'Whitelabel id is not bound yet (CREATE_TENANT must succeed first)',
    );
  }
  return provisioning.whitelabelId;
}

function toNumericId(value: unknown): number | null {
  const n =
    typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null;
}

function errorCode(error: unknown): string | undefined {
  if (error instanceof LoorCoreException) return error.code;
  const response = (error as { getResponse?: () => unknown })?.getResponse?.();
  if (response && typeof response === 'object') {
    const code = (response as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return undefined;
}

function isCode(error: unknown, code: string): boolean {
  return errorCode(error) === code;
}

function isNotFound(error: unknown): boolean {
  const status = (error as { getStatus?: () => number })?.getStatus?.();
  return status === 404;
}
