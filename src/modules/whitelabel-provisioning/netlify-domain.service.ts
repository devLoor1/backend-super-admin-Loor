import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { lookup } from 'node:dns/promises';
import {
  FrontendEnvironment,
  FRONTEND_TO_CAPABILITY,
  normalizeEnabledEnvironments,
  suggestedFrontendUrls,
} from './frontend-urls';
import { FrontendReadinessService } from './frontend-readiness.service';
import { scrubSecrets, truncate } from './provisioning.constants';

const NETLIFY_API = 'https://api.netlify.com/api/v1';

export type NetlifyAliasAction = 'already_present' | 'created' | 'unchanged_error';

export type NetlifyEnvironmentDomainResult = {
  environment: FrontendEnvironment;
  capability: 'INVESTOR' | 'ENTREPRENEUR' | 'ADMIN';
  host: string;
  url: string;
  siteId: string;
  action: NetlifyAliasAction;
  aliasCountBefore: number;
  aliasCountAfter: number;
  ssl: {
    attempted: boolean;
    ok: boolean;
    error: string | null;
  };
  readiness: {
    resolves: boolean;
    httpsOk: boolean;
    bootstrapOk: boolean;
    bootstrapSlug: string | null;
    status: 'ok' | 'failed';
    error: string | null;
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
};

@Injectable()
export class NetlifyDomainService {
  private readonly logger = new Logger(NetlifyDomainService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly frontendReadiness: FrontendReadinessService,
  ) {}

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
      ok: environments.every((row) => row.error == null && row.readiness.status === 'ok'),
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
      action: 'unchanged_error',
      aliasCountBefore: 0,
      aliasCountAfter: 0,
      ssl: { attempted: false, ok: false, error: null },
      readiness: {
        resolves: false,
        httpsOk: false,
        bootstrapOk: false,
        bootstrapSlug: null,
        status: 'failed',
        error: null,
      },
      error: null,
    };

    if (!siteId) {
      return {
        ...base,
        error: `Netlify site id missing for ${env}`,
      };
    }

    try {
      const site = await this.getSite(siteId);
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

      const ssl = await this.ensureSsl(siteId);
      const readiness = await this.verifyHost(slug, env, url, host);

      return {
        ...base,
        action,
        ssl,
        readiness,
        error:
          readiness.status === 'ok'
            ? null
            : readiness.error || `Hostname ${host} not ready`,
      };
    } catch (error) {
      const message = this.safeErrorMessage(error);
      this.logger.warn(`Netlify domain ensure failed for ${env}/${host}: ${message}`);
      return {
        ...base,
        error: message,
        readiness: {
          ...base.readiness,
          error: message,
        },
      };
    }
  }

  private async getSite(siteId: string): Promise<NetlifySite> {
    return this.netlifyFetch<NetlifySite>(`/sites/${encodeURIComponent(siteId)}`);
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

  private async ensureSsl(
    siteId: string,
  ): Promise<NetlifyEnvironmentDomainResult['ssl']> {
    try {
      await this.netlifyFetch(`/sites/${encodeURIComponent(siteId)}/ssl`, {
        method: 'POST',
        // Empty body — Netlify provisions certs for configured custom domains.
        body: '{}',
      });
      return { attempted: true, ok: true, error: null };
    } catch (error) {
      // Certificate may already exist or still provisioning; readiness HTTPS check is authoritative.
      const message = this.safeErrorMessage(error);
      return { attempted: true, ok: false, error: message };
    }
  }

  private async verifyHost(
    slug: string,
    env: FrontendEnvironment,
    url: string,
    host: string,
  ): Promise<NetlifyEnvironmentDomainResult['readiness']> {
    let resolves = false;
    try {
      await lookup(host);
      resolves = true;
    } catch {
      resolves = false;
    }

    const report = await this.frontendReadiness.verifyProvisioning({
      slug,
      enabledEnvironments: [FRONTEND_TO_CAPABILITY[env]],
      urlMode: 'HOSTNAME',
    });
    const row = report.environments.find((e) => e.environment === env);
    return {
      resolves: resolves || Boolean(row?.resolves),
      httpsOk: Boolean(row?.httpsOk),
      bootstrapOk: Boolean(row?.bootstrapOk),
      bootstrapSlug: row?.bootstrapSlug ?? null,
      status: row?.status === 'ok' ? 'ok' : 'failed',
      error: row?.error ?? (resolves ? null : `DNS lookup failed for ${host}`),
    };
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
        .replace(/NETLIFY_ACCESS_TOKEN[=:]\s*\S+/gi, 'NETLIFY_ACCESS_TOKEN=[REDACTED]'),
      500,
    );
  }
}
