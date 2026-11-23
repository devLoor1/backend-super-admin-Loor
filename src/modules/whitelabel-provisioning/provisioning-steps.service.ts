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
import { PlatformAssetsService } from '../platform-assets/platform-assets.service';
import { PlatformConfigService } from '../platform-config/platform-config.service';
import { SmtpService } from '../smtp/smtp.service';
import { TermsService } from '../terms/terms.service';
import { WhitelabelService } from '../whitelabel/whitelabel.service';
import {
  FrontendReadinessService,
  type ReadinessReport,
} from './frontend-readiness.service';
import {
  FRONTEND_ENVIRONMENTS,
  FRONTEND_TO_CAPABILITY,
  FrontendEnvironment,
  FrontendUrlMode,
  normalizeEnabledEnvironments,
  normalizeFrontendUrlMode,
  parseDnsHosts,
  parseFrontendUrls,
  suggestedFrontendUrls,
  urlsFromDnsHosts,
} from './frontend-urls';
import { NetlifyDomainService } from './netlify-domain.service';
import {
  ProvisioningBrandingPage,
  ProvisioningSecretsStore,
} from './provisioning-secrets.store';
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

/** Safe, non-secret UPLOAD_BRAND step payload (no urls, no bytes). */
type BrandPayload = {
  hasEmail?: boolean;
  hasLoginColor?: boolean;
  hasMainAreaFile?: boolean;
  mainAreaPages?: ProvisioningBrandingPage[];
};

/** Resumable progress persisted on the UPLOAD_BRAND step result. */
type BrandProgress = {
  emailApplied?: boolean;
  loginColorApplied?: boolean;
  assetRef?: string;
  pagesApplied?: ProvisioningBrandingPage[];
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
    private readonly platformAssets: PlatformAssetsService,
    private readonly secrets: ProvisioningSecretsStore,
    private readonly frontendReadiness: FrontendReadinessService,
    private readonly netlifyDomains: NetlifyDomainService,
  ) {}

  async execute(ctx: StepContext): Promise<StepOutcome> {
    switch (ctx.step.key) {
      case ProvisioningStepKey.CREATE_TENANT:
        return this.createTenant(ctx);
      case ProvisioningStepKey.APPLY_SETTINGS_TEMPLATE:
        return this.applySettingsTemplate(ctx);
      case ProvisioningStepKey.UPLOAD_BRAND:
        return this.uploadBrand(ctx);
      case ProvisioningStepKey.INITIAL_ADMIN:
        return this.initialAdmin(ctx);
      case ProvisioningStepKey.TERMS:
        return this.publishTerms(ctx);
      case ProvisioningStepKey.SMTP:
        return this.configureSmtp(ctx);
      case ProvisioningStepKey.GATEWAY_CONFIG:
        return this.configureGateway(ctx);
      case ProvisioningStepKey.CONFIGURE_FRONTEND_DOMAINS:
        return this.configureFrontendDomains(ctx);
      case ProvisioningStepKey.FE_DEPLOY_CHECK:
        return this.feDeployCheck(ctx);
      case ProvisioningStepKey.DNS_CHECK:
        return this.dnsCheck(ctx);
      case ProvisioningStepKey.VALIDATE:
        return this.validate(ctx);
      case ProvisioningStepKey.DELIVER:
        return this.deliver(ctx);
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
  // UPLOAD_BRAND (client branding: email_branding, login text color, main_area image)
  //
  // Out of scope (build-time `VITE_*`, Core lacuna): institutional AppLogo, favicon, PWA icons.
  // Idempotency: progress (emailApplied / loginColorApplied / assetRef / pagesApplied) is
  // persisted on the FAILED step result, so a retry resumes (replace-in-place on the same
  // main_area assetRef) instead of creating duplicate assets.
  // ---------------------------------------------------------------------------

  private async uploadBrand({
    provisioning,
    step,
    meta,
  }: StepContext): Promise<StepOutcome> {
    const payload = (step.payload ?? {}) as BrandPayload;
    const hasEmail = payload.hasEmail === true;
    const hasLoginColor = payload.hasLoginColor === true;
    const hasMainAreaFile = payload.hasMainAreaFile === true;
    if (!hasEmail && !hasLoginColor && !hasMainAreaFile) {
      return { status: 'SKIPPED', result: { reason: 'no_branding' } };
    }

    const whitelabelId = requireWhitelabelId(provisioning);
    const wl = String(whitelabelId);
    const branding = this.secrets.get(provisioning.id).branding;
    const prior = (step.result ?? {}) as BrandProgress;

    const pages: ProvisioningBrandingPage[] = (
      branding?.mainAreaPages?.length
        ? branding.mainAreaPages
        : payload.mainAreaPages?.length
          ? payload.mainAreaPages
          : ['login']
    ).filter(isBrandingPage);

    const progress: BrandProgress = {
      emailApplied: prior.emailApplied === true,
      loginColorApplied: prior.loginColorApplied === true,
      ...(typeof prior.assetRef === 'string' && prior.assetRef
        ? { assetRef: prior.assetRef }
        : {}),
      pagesApplied: Array.isArray(prior.pagesApplied)
        ? prior.pagesApplied.filter(isBrandingPage)
        : [],
    };

    // Everything still to do needs the in-memory branding (lost on restart → re-supply on retry).
    const needEmail = hasEmail && !progress.emailApplied;
    const needLogin = hasLoginColor && !progress.loginColorApplied;
    const pagesPending = pages.filter(
      (p) => !progress.pagesApplied?.includes(p),
    );
    const needMainArea = hasMainAreaFile && pagesPending.length > 0;

    const missing: string[] = [];
    if (needEmail && !branding?.email) missing.push('email');
    if (needLogin && !branding?.loginBrandPanelTextColor)
      missing.push('loginBrandPanelTextColor');
    if (needMainArea && !branding?.mainAreaFile && !progress.assetRef)
      missing.push('mainAreaImage');
    if (missing.length > 0) {
      throw new ProvisioningStepError(
        'E_SECRETS_REQUIRED',
        `Branding (${missing.join(', ')}) is not in memory (restart/expiry). Retry with \`branding\` in the body (and \`mainAreaImage\` as multipart file).`,
        { ...progress },
      );
    }

    try {
      if (needEmail && branding?.email) {
        const value: Record<string, string | null> = {};
        if (branding.email.primary_color !== undefined)
          value.primary_color = branding.email.primary_color;
        if (branding.email.logo_url !== undefined)
          value.logo_url = branding.email.logo_url;
        await this.platformConfig.update(
          wl,
          { page: 'email_branding', key: 'config', value },
          meta,
        );
        progress.emailApplied = true;
      }

      if (needLogin && branding?.loginBrandPanelTextColor) {
        await this.platformConfig.update(
          wl,
          {
            page: 'login',
            key: 'brand_panel_text_color',
            value: branding.loginBrandPanelTextColor,
          },
          meta,
        );
        progress.loginColorApplied = true;
      }

      if (needMainArea) {
        const file = branding?.mainAreaFile;
        if (file) {
          const multerLike = {
            buffer: file.buffer,
            mimetype: file.mimetype,
            originalname: file.originalname,
            size: file.size,
          } as Express.Multer.File;
          if (progress.assetRef) {
            // Idempotent retry: same assetRef, bytes replaced in place (main_area only).
            await this.platformAssets.replace(
              wl,
              progress.assetRef,
              multerLike,
              meta,
            );
          } else {
            const uploaded = (await this.platformAssets.upload(
              wl,
              multerLike,
              'main_area',
              meta,
            )) as { data?: { asset_ref?: unknown } } | undefined;
            const ref = uploaded?.data?.asset_ref;
            if (typeof ref !== 'string' || !ref) {
              throw new ProvisioningStepError(
                'E_ASSET_REF_MISSING',
                'Core did not return asset_ref for the main_area upload',
              );
            }
            progress.assetRef = ref;
          }
        }

        const assetRef = progress.assetRef as string;
        for (const page of pagesPending) {
          await this.platformConfig.update(
            wl,
            {
              page,
              key: 'main_area_image',
              value: {
                capabilityId: 'platform.main_area_image',
                version: 1,
                enabled: true,
                assetRef,
              },
            },
            meta,
          );
          progress.pagesApplied = [...(progress.pagesApplied ?? []), page];
        }
      }
    } catch (error) {
      if (error instanceof ProvisioningStepError && error.result) throw error;
      throw new ProvisioningStepError(
        error instanceof ProvisioningStepError
          ? error.code
          : (errorCode(error) ?? 'E_BRANDING_FAILED'),
        messageOf(error),
        { ...progress },
      );
    }

    this.secrets.discard(provisioning.id, 'branding');
    return {
      status: 'SUCCESS',
      result: {
        emailApplied: progress.emailApplied === true,
        loginColorApplied: progress.loginColorApplied === true,
        ...(progress.assetRef
          ? {
              mainArea: {
                assetRef: progress.assetRef,
                pages: progress.pagesApplied ?? [],
              },
            }
          : {}),
      },
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
  // FE_DEPLOY_CHECK / DNS_CHECK (shared frontend readiness)
  // ---------------------------------------------------------------------------

  private tenantPayloadOf(provisioning: ProvisioningWithSteps): {
    enabledEnvironments?: unknown;
    urlMode?: unknown;
  } {
    const tenant = provisioning.steps.find(
      (s) => s.key === ProvisioningStepKey.CREATE_TENANT,
    );
    return (tenant?.payload ?? {}) as {
      enabledEnvironments?: unknown;
      urlMode?: unknown;
    };
  }

  private enabledEnvironmentsFromProvisioning(
    provisioning: ProvisioningWithSteps,
  ): FrontendEnvironment[] {
    return normalizeEnabledEnvironments(
      this.tenantPayloadOf(provisioning).enabledEnvironments,
    );
  }

  private urlModeFromProvisioning(
    provisioning: ProvisioningWithSteps,
  ): FrontendUrlMode {
    return normalizeFrontendUrlMode(this.tenantPayloadOf(provisioning).urlMode);
  }

  private urlsFromReadiness(
    report: ReadinessReport,
  ): Record<string, { url: string; status: 'ok' | 'failed'; error: string | null }> {
    const urls: Record<
      string,
      { url: string; status: 'ok' | 'failed'; error: string | null }
    > = {};
    for (const row of report.environments) {
      urls[row.environment] = {
        url: row.url,
        status: row.status,
        error: row.error,
      };
    }
    return urls;
  }

  private hostsFromReadiness(
    report: ReadinessReport,
  ): Record<
    string,
    {
      host: string;
      url: string;
      status: 'ok' | 'failed';
      https: boolean;
      resolves: boolean;
      bootstrapOk: boolean;
      bootstrapSlug: string | null;
      error: string | null;
    }
  > {
    const hosts: Record<
      string,
      {
        host: string;
        url: string;
        status: 'ok' | 'failed';
        https: boolean;
        resolves: boolean;
        bootstrapOk: boolean;
        bootstrapSlug: string | null;
        error: string | null;
      }
    > = {};
    for (const row of report.environments) {
      hosts[row.environment] = {
        host: row.host,
        url: row.url,
        status: row.status,
        https: row.httpsOk,
        resolves: row.resolves,
        bootstrapOk: row.bootstrapOk,
        bootstrapSlug: row.bootstrapSlug,
        error: row.error,
      };
    }
    return hosts;
  }

  private assertReadinessOk(
    report: ReadinessReport,
    code: string,
  ): void {
    if (report.ok) return;
    const failed = report.environments.filter((e) => e.status !== 'ok');
    const detail = failed
      .map((e) => `${e.environment}: ${e.error ?? 'failed'}`)
      .join('; ');
    throw new ProvisioningStepError(
      code,
      `Shared frontend readiness failed — ${detail}`,
      {
        mode: report.mode,
        corePublicUrl: report.corePublicUrl,
        enabledEnvironments: report.enabledEnvironments,
        environments: report.environments,
        urls: this.urlsFromReadiness(report),
        hosts: this.hostsFromReadiness(report),
      },
    );
  }

  private async configureFrontendDomains({
    provisioning,
  }: StepContext): Promise<StepOutcome> {
    const urlMode = this.urlModeFromProvisioning(provisioning);
    if (urlMode === 'PATH') {
      return {
        status: 'SKIPPED',
        result: {
          reason: 'not_required_path_mode',
          urlMode,
          note: 'PATH mode uses shared Netlify hosts with /w/{slug}; domain aliases are not required.',
        },
      };
    }

    const enabled = this.enabledEnvironmentsFromProvisioning(provisioning);
    if (!this.netlifyDomains.isConfigured(enabled)) {
      return {
        status: 'SKIPPED',
        result: {
          reason: 'netlify_not_configured',
          urlMode,
          note: 'NETLIFY_ACCESS_TOKEN / site ids missing — configure env to automate domain aliases.',
        },
      };
    }

    const report = await this.netlifyDomains.ensureHostnameAliases({
      slug: provisioning.slug,
      enabledEnvironments: enabled.map((e) => FRONTEND_TO_CAPABILITY[e]),
    });

    const result = scrubSecrets({
      mode: report.mode,
      urlMode,
      slug: report.slug,
      enabledEnvironments: enabled.map((e) => FRONTEND_TO_CAPABILITY[e]),
      environments: report.environments,
      urls: Object.fromEntries(
        report.environments.map((row) => [
          row.environment,
          { url: row.url, host: row.host, action: row.action, siteId: row.siteId },
        ]),
      ),
    });

    if (!report.ok) {
      const failed = report.environments
        .filter((row) => row.error || row.readiness.status !== 'ok')
        .map((row) => `${row.environment}: ${row.error ?? row.readiness.error ?? 'failed'}`)
        .join('; ');
      throw new ProvisioningStepError(
        'E_NETLIFY_DOMAIN_CONFIG_FAILED',
        `Netlify domain configuration failed — ${failed}`,
        result,
      );
    }

    return { status: 'SUCCESS', result };
  }

  private async feDeployCheck({
    provisioning,
  }: StepContext): Promise<StepOutcome> {
    const enabled = this.enabledEnvironmentsFromProvisioning(provisioning);
    const urlMode = this.urlModeFromProvisioning(provisioning);
    const report = await this.frontendReadiness.verifyProvisioning({
      slug: provisioning.slug,
      enabledEnvironments: enabled.map((e) => FRONTEND_TO_CAPABILITY[e]),
      urlMode,
    });
    this.assertReadinessOk(report, 'E_FRONTEND_READINESS_FAILED');
    return {
      status: 'SUCCESS',
      result: {
        mode: report.mode,
        urlMode: report.urlMode,
        sharedFrontend: true,
        corePublicUrl: report.corePublicUrl,
        enabledEnvironments: report.enabledEnvironments,
        environments: report.environments,
        urls: this.urlsFromReadiness(report),
      },
    };
  }

  private async dnsCheck({
    provisioning,
  }: StepContext): Promise<StepOutcome> {
    const urlMode = this.urlModeFromProvisioning(provisioning);
    if (urlMode === 'PATH') {
      return {
        status: 'SKIPPED',
        result: {
          reason: 'not_required_path_mode',
          urlMode,
          note: 'PATH mode uses shared Netlify hosts; per-tenant DNS is not required.',
        },
      };
    }
    const enabled = this.enabledEnvironmentsFromProvisioning(provisioning);
    const report = await this.frontendReadiness.verifyProvisioning({
      slug: provisioning.slug,
      enabledEnvironments: enabled.map((e) => FRONTEND_TO_CAPABILITY[e]),
      urlMode,
    });
    this.assertReadinessOk(report, 'E_DNS_READINESS_FAILED');
    return {
      status: 'SUCCESS',
      result: {
        mode: report.mode,
        urlMode: report.urlMode,
        sharedFrontend: true,
        corePublicUrl: report.corePublicUrl,
        enabledEnvironments: report.enabledEnvironments,
        environments: report.environments,
        hosts: this.hostsFromReadiness(report),
        urls: this.urlsFromReadiness(report),
      },
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
      ['configure_frontend_domains', ProvisioningStepKey.CONFIGURE_FRONTEND_DOMAINS],
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

  /**
   * Prefer FE_DEPLOY_CHECK attested urls; fall back to DNS_CHECK hosts.
   * When both gates were skipped, returns null (delivery.urls.* stay null except primary).
   */
  private enabledEnvironmentsOf(
    steps: ProvisioningStepRow[],
  ): FrontendEnvironment[] {
    const tenant = steps.find((s) => s.key === ProvisioningStepKey.CREATE_TENANT);
    const payload = (tenant?.payload ?? {}) as { enabledEnvironments?: unknown };
    return normalizeEnabledEnvironments(payload.enabledEnvironments);
  }

  private urlModeOf(steps: ProvisioningStepRow[]): FrontendUrlMode {
    const tenant = steps.find((s) => s.key === ProvisioningStepKey.CREATE_TENANT);
    const payload = (tenant?.payload ?? {}) as { urlMode?: unknown };
    return normalizeFrontendUrlMode(payload.urlMode);
  }

  private resolveConfirmedFrontendUrls(
    steps: ProvisioningStepRow[],
  ): Partial<Record<FrontendEnvironment, string>> | null {
    const enabled = this.enabledEnvironmentsOf(steps);
    const fe = steps.find((s) => s.key === ProvisioningStepKey.FE_DEPLOY_CHECK);
    if (fe?.status === ProvisioningStepStatus.SUCCESS) {
      const result = (fe.result ?? {}) as { urls?: unknown };
      const raw = result.urls;
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const flat: Record<string, unknown> = {};
        for (const [env, cell] of Object.entries(
          raw as Record<string, unknown>,
        )) {
          if (cell && typeof cell === 'object' && !Array.isArray(cell)) {
            flat[env] = (cell as Record<string, unknown>).url;
          } else {
            flat[env] = cell;
          }
        }
        const parsed = parseFrontendUrls(flat, enabled);
        if (parsed.ok) return parsed.urls;
      }
    }

    const dns = steps.find((s) => s.key === ProvisioningStepKey.DNS_CHECK);
    if (dns?.status === ProvisioningStepStatus.SUCCESS) {
      const result = (dns.result ?? {}) as { hosts?: unknown };
      const parsed = parseDnsHosts(result.hosts, enabled);
      if (parsed.ok) return urlsFromDnsHosts(parsed.hosts);
    }

    return null;
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

    const brandStep = current.steps.find(
      (s) => s.key === ProvisioningStepKey.UPLOAD_BRAND,
    );
    const brandResult = (brandStep?.result ?? {}) as {
      emailApplied?: boolean;
      mainArea?: { assetRef?: string };
    };
    const branding =
      brandStep?.status === ProvisioningStepStatus.SUCCESS
        ? {
            email: brandResult.emailApplied === true,
            ...(brandResult.mainArea?.assetRef
              ? { mainAreaAssetRef: brandResult.mainArea.assetRef }
              : {}),
          }
        : null;

    const enabled = this.enabledEnvironmentsOf(current.steps);
    const urlMode = this.urlModeOf(current.steps);
    const confirmed = this.resolveConfirmedFrontendUrls(current.steps);
    const suggested = suggestedFrontendUrls(current.slug, enabled, urlMode);
    const urls: Record<string, string | null> = { primary: current.baseUrl };
    for (const env of FRONTEND_ENVIRONMENTS) {
      if (!enabled.includes(env)) continue;
      urls[env] = confirmed?.[env] ?? null;
    }
    const delivery = {
      branding,
      name: current.name,
      slug: current.slug,
      baseUrl: current.baseUrl,
      whitelabelId: current.whitelabelId,
      urlMode,
      enabledEnvironments: enabled.map((e) => FRONTEND_TO_CAPABILITY[e]),
      admin: hasAdmin
        ? { email: adminPayload.email, name: adminPayload.name ?? null }
        : null,
      // Only enabled + attested URLs. Disabled environments are omitted (not errors).
      urls,
      suggestedUrls: {
        ...suggested,
        note:
          urlMode === 'PATH'
            ? 'PATH mode: shared Netlify /w/{slug}. delivery.urls come from readiness (HTTPS + bootstrap?slug=).'
            : 'HOSTNAME mode: Netlify domain aliases + readiness (DNS + HTTPS + bootstrap). delivery.urls come from readiness.',
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

function isBrandingPage(value: unknown): value is ProvisioningBrandingPage {
  return value === 'login' || value === 'register' || value === 'quick_profile';
}

function messageOf(error: unknown): string {
  const response = (error as { getResponse?: () => unknown })?.getResponse?.();
  if (response && typeof response === 'object') {
    const message = (response as { message?: unknown }).message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.join('; ');
  }
  return error instanceof Error ? error.message : String(error);
}

function isCode(error: unknown, code: string): boolean {
  return errorCode(error) === code;
}

function isNotFound(error: unknown): boolean {
  const status = (error as { getStatus?: () => number })?.getStatus?.();
  return status === 404;
}
