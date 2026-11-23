import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FrontendEnvironment,
  FRONTEND_TO_CAPABILITY,
  normalizeEnabledEnvironments,
  suggestedFrontendUrls,
} from './frontend-urls';
import { scrubSecrets, truncate } from './provisioning.constants';

const NETLIFY_API = 'https://api.netlify.com/api/v1';

export type NetlifyAliasAction = 'already_present' | 'created' | 'unchanged_error';

export type NetlifyEnvironmentDomainResult = {
  environment: FrontendEnvironment;
  capability: 'INVESTOR' | 'ENTREPRENEUR' | 'ADMIN';
  host: string;
  url: string;
  siteId: string;
  siteName: string | null;
  action: NetlifyAliasAction;
  aliasCountBefore: number;
  aliasCountAfter: number;
  ssl: {
    attempted: boolean;
    ok: boolean;
    skipped: boolean;
    error: string | null;
    note: string | null;
  };
  /** Soft probe only — never gates CONFIGURE_FRONTEND_DOMAINS success. */
  readinessProbe: {
    attempted: boolean;
    note: string;
  };
  error: string | null;
};

export type NetlifyDomainsReport = {
  mode: 'HOSTNAME';
  slug: string;
  environments: NetlifyEnvironmentDomainResult[];
  ok: boolean;
};

type NetlifySite = {
  id?: string;
  name?: string;
  custom_domain?: string | null;
  domain_aliases?: string[] | null;
  ssl_url?: string | null;
  default_domain?: string | null;
};

@Injectable()
export class NetlifyDomainService {
  private readonly logger = new Logger(NetlifyDomainService.name);

  constructor(private readonly config: ConfigService) {}

  accessToken(): string | null {
    const token =
      this.config.get<string>('netlify.accessToken')?.trim() ||
      process.env.NETLIFY_ACCESS_TOKEN?.trim() ||
      '';
    return token || null;
  }

  siteIdFor(env: FrontendEnvironment): string | null {
    const map = {
      investor:
        this.config.get<string>('netlify.siteIds.investor')?.trim() ||
        process.env.NETLIFY_INVESTOR_SITE_ID?.trim() ||
        '',
      entrepreneur:
        this.config.get<string>('netlify.siteIds.entrepreneur')?.trim() ||
        process.env.NETLIFY_ENTREPRENEUR_SITE_ID?.trim() ||
        '',
      admin:
        this.config.get<string>('netlify.siteIds.admin')?.trim() ||
        process.env.NETLIFY_ADMIN_SITE_ID?.trim() ||
        '',
    };
    return map[env] || null;
  }

  /** Netlify site ids are UUIDs. Truncation yields GET /sites/{id} → 404. */
  isValidSiteId(siteId: string | null | undefined): boolean {
    return Boolean(
      siteId &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          siteId,
        ),
    );
  }

  isConfigured(enabled: readonly FrontendEnvironment[]): boolean {
    if (!this.accessToken()) return false;
    return enabled.every((env) => Boolean(this.siteIdFor(env)));
  }

  hostnameFor(
    slug: string,
    env: FrontendEnvironment,
  ): { host: string; url: string } {
    const url = suggestedFrontendUrls(slug, [env], 'HOSTNAME')[env];
    return { host: new URL(url).host.toLowerCase(), url };
  }

  /** Pure merge helper — never drops existing aliases. */
  mergeDomainAliases(
    existing: readonly string[] | null | undefined,
    customDomain: string | null | undefined,
    nextHost: string,
  ): { aliases: string[]; alreadyPresent: boolean } {
    const wanted = nextHost.trim().toLowerCase();
    const primary = String(customDomain || '')
      .trim()
      .toLowerCase();
    const set = new Set<string>();
    for (const raw of existing ?? []) {
      const host = String(raw || '')
        .trim()
        .toLowerCase();
      if (host) set.add(host);
    }
    const alreadyPresent = set.has(wanted) || primary === wanted;
    if (!alreadyPresent && wanted) set.add(wanted);
    return { aliases: [...set].sort(), alreadyPresent };
  }

  /**
   * CONFIGURE_FRONTEND_DOMAINS responsibility:
   * ensure hostname aliases exist on shared Netlify sites (idempotent merge).
   * DNS / HTTPS / bootstrap belong to FE_DEPLOY_CHECK and DNS_CHECK.
   */
  async ensureHostnameAliases(input: {
    slug: string;
    enabledEnvironments?: unknown;
  }): Promise<NetlifyDomainsReport> {
    const slug = input.slug.trim().toLowerCase();
    const enabled = normalizeEnabledEnvironments(input.enabledEnvironments);
    const environments: NetlifyEnvironmentDomainResult[] = [];

    for (const env of enabled) {
      environments.push(await this.ensureOne(slug, env));
    }

    return {
      mode: 'HOSTNAME',
      slug,
      environments,
      ok: environments.every((row) => row.error == null),
    };
  }

  private async ensureOne(
    slug: string,
    env: FrontendEnvironment,
  ): Promise<NetlifyEnvironmentDomainResult> {
    const { host, url } = this.hostnameFor(slug, env);
    const siteId = this.siteIdFor(env);
    const base: NetlifyEnvironmentDomainResult = {
      environment: env,
      capability: FRONTEND_TO_CAPABILITY[env],
      host,
      url,
      siteId: siteId || '',
      siteName: null,
      action: 'unchanged_error',
      aliasCountBefore: 0,
      aliasCountAfter: 0,
      ssl: {
        attempted: false,
        ok: false,
        skipped: false,
        error: null,
        note: null,
      },
      readinessProbe: {
        attempted: false,
        note: 'Deferred to FE_DEPLOY_CHECK / DNS_CHECK (retry with backoff).',
      },
      error: null,
    };

    if (!siteId) {
      return {
        ...base,
        error: `Netlify site id missing for ${env}`,
      };
    }
    if (!this.isValidSiteId(siteId)) {
      return {
        ...base,
        error: `Invalid NETLIFY_${env.toUpperCase()}_SITE_ID format (len=${siteId.length}, value=${siteId}). Expected a full UUID — check Render env for truncation.`,
      };
    }

    try {
      const site = await this.getSite(siteId);
      base.siteName = site.name ?? null;
      const before = this.mergeDomainAliases(
        site.domain_aliases,
        site.custom_domain,
        host,
      );
      base.aliasCountBefore = (site.domain_aliases ?? []).length;

      let action: NetlifyAliasAction = 'already_present';
      if (!before.alreadyPresent) {
        const patched = await this.patchAliases(siteId, before.aliases);
        const after = this.mergeDomainAliases(
          patched.domain_aliases,
          patched.custom_domain,
          host,
        );
        if (!after.alreadyPresent) {
          return {
            ...base,
            action: 'unchanged_error',
            aliasCountAfter: (patched.domain_aliases ?? []).length,
            error: `Alias ${host} missing after Netlify PATCH`,
          };
        }
        action = 'created';
        base.aliasCountAfter = (patched.domain_aliases ?? []).length;
      } else {
        base.aliasCountAfter = before.aliases.length;
      }

      // Soft SSL nudge only — shared sites already have Let's Encrypt.
      // Empty POST often returns 422 requiring certificate payload; treat as OK.
      const ssl = await this.ensureSsl(siteId);

      return {
        ...base,
        action,
        ssl,
        error: null,
      };
    } catch (error) {
      const message = this.safeErrorMessage(error);
      this.logger.warn(
        `Netlify domain ensure failed for ${env}/${host}: ${message}`,
      );
      return {
        ...base,
        error: message,
      };
    }
  }

  private async getSite(siteId: string): Promise<NetlifySite> {
    return this.netlifyFetch<NetlifySite>(
      `/sites/${encodeURIComponent(siteId)}`,
    );
  }

  private async patchAliases(
    siteId: string,
    aliases: string[],
  ): Promise<NetlifySite> {
    return this.netlifyFetch<NetlifySite>(
      `/sites/${encodeURIComponent(siteId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ domain_aliases: aliases }),
      },
    );
  }

  /**
   * Best-effort SSL refresh. Shared homolog sites already hold active certs;
   * Netlify auto-extends coverage for new aliases. Empty POST returns 422 when
   * a certificate already exists — that is not a configure failure.
   */
  private async ensureSsl(
    siteId: string,
  ): Promise<NetlifyEnvironmentDomainResult['ssl']> {
    try {
      await this.netlifyFetch(`/sites/${encodeURIComponent(siteId)}/ssl`, {
        method: 'POST',
        body: '{}',
      });
      return {
        attempted: true,
        ok: true,
        skipped: false,
        error: null,
        note: 'ssl_post_accepted',
      };
    } catch (error) {
      const message = this.safeErrorMessage(error);
      if (
        /HTTP 422/.test(message) ||
        /certificate parameter is required/i.test(message)
      ) {
        return {
          attempted: true,
          ok: true,
          skipped: true,
          error: null,
          note: 'existing_certificate_managed_by_netlify',
        };
      }
      // Soft: do not fail CONFIGURE_FRONTEND_DOMAINS on SSL nudge errors.
      this.logger.warn(`Netlify SSL nudge soft-failed for ${siteId}: ${message}`);
      return {
        attempted: true,
        ok: false,
        skipped: false,
        error: message,
        note: 'ssl_nudge_soft_failure',
      };
    }
  }

  private async netlifyFetch<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const token = this.accessToken();
    if (!token) {
      throw new Error('NETLIFY_ACCESS_TOKEN is not configured');
    }
    const response = await fetch(`${NETLIFY_API}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers as Record<string, string> | undefined),
      },
    });
    const text = await response.text();
    let json: unknown = null;
    if (text.trim()) {
      try {
        json = JSON.parse(text);
      } catch {
        json = { raw: truncate(text, 400) };
      }
    }
    if (!response.ok) {
      const scrubbed = scrubSecrets(json);
      throw new Error(
        `Netlify HTTP ${response.status}: ${truncate(JSON.stringify(scrubbed), 500)}`,
      );
    }
    return (json ?? {}) as T;
  }

  private safeErrorMessage(error: unknown): string {
    const raw =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : 'Netlify request failed';
    return truncate(
      raw
        .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, 'Bearer [REDACTED]')
        .replace(
          /NETLIFY_ACCESS_TOKEN[=:]\s*\S+/gi,
          'NETLIFY_ACCESS_TOKEN=[REDACTED]',
        ),
      500,
    );
  }
}
