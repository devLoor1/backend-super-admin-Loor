import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { lookup } from 'node:dns/promises';
import {
  CAPABILITY_TO_FRONTEND,
  FrontendEnvironment,
  FrontendUrlMode,
  FRONTEND_TO_CAPABILITY,
  normalizeEnabledEnvironments,
  normalizeFrontendUrlMode,
  suggestedFrontendUrls,
} from './frontend-urls';

export type EnvironmentReadiness = {
  environment: FrontendEnvironment;
  capability: 'INVESTOR' | 'ENTREPRENEUR' | 'ADMIN';
  url: string;
  host: string;
  resolves: boolean;
  httpsOk: boolean;
  httpStatus: number | null;
  bootstrapOk: boolean;
  bootstrapSlug: string | null;
  expectedSlug: string;
  status: 'ok' | 'failed';
  error: string | null;
};

export type ReadinessReport = {
  mode: 'shared_frontend';
  urlMode: FrontendUrlMode;
  corePublicUrl: string;
  enabledEnvironments: Array<'INVESTOR' | 'ENTREPRENEUR' | 'ADMIN'>;
  environments: EnvironmentReadiness[];
  ok: boolean;
  dnsRequired: boolean;
};

/**
 * Automatic FE/DNS readiness for shared-frontend homolog.
 * HOSTNAME mode: per-tenant DNS + HTTPS + bootstrap.
 * PATH mode: shared site HTTPS + bootstrap?slug= (DNS per tenant not required).
 */
@Injectable()
export class FrontendReadinessService {
  private readonly logger = new Logger(FrontendReadinessService.name);

  constructor(private readonly config: ConfigService) {}

  corePublicUrl(): string {
    return (
      this.config.get<string>('PROVISIONING_CORE_PUBLIC_URL')?.trim() ||
      this.config.get<string>('loorCore.baseUrl')?.trim() ||
      this.config.get<string>('LOOR_CORE_BASE_URL')?.trim() ||
      'https://back.loor.vc/service'
    ).replace(/\/$/, '');
  }

  resolveUrlMode(raw?: unknown): FrontendUrlMode {
    if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
      return normalizeFrontendUrlMode(raw);
    }
    return normalizeFrontendUrlMode(
      this.config.get<string>('PROVISIONING_FRONTEND_URL_MODE'),
    );
  }

  candidateUrls(
    slug: string,
    enabled: readonly FrontendEnvironment[],
    urlMode: FrontendUrlMode,
  ): Record<FrontendEnvironment, string[]> {
    const safe = slug.trim().toLowerCase();
    const suggested = suggestedFrontendUrls(safe, enabled, urlMode);
    const out = {} as Record<FrontendEnvironment, string[]>;
    for (const env of enabled) {
      const list = [suggested[env]];
      if (urlMode === 'HOSTNAME') {
        if (env === 'investor') {
          // Legacy / alternate investor hosts (primary is already {slug}.loor.vc).
          list.push(`https://${safe}.investor.loor.vc`);
          list.push(`https://${safe}.investidor.loor.vc`);
          if (safe === 'homologacao' || safe === 'homolog') {
            list.push('https://homolog.loor.vc');
          }
          if (safe.startsWith('finapop')) {
            list.push('https://finapop.investidor.loor.vc');
          }
          if (safe.startsWith('laguna')) {
            list.push('https://laguna.investor.loor.vc');
          }
        }
        if (env === 'admin') {
          if (safe === 'homologacao' || safe === 'homolog') {
            list.push('https://homolog.admin.loor.vc');
          }
          if (safe.startsWith('finapop')) {
            list.push('https://finapop.admin.loor.vc');
          }
        }
        if (env === 'entrepreneur') {
          list.push(`https://${safe}.empreendedor.loor.vc`);
          if (safe === 'homologacao' || safe === 'homolog') {
            list.push('https://homolog.empresa.loor.vc');
          }
        }
      }
      out[env] = [...new Set(list.filter(Boolean))];
    }
    return out;
  }

  slugMatches(expectedSlug: string, actualSlug: string | null | undefined): boolean {
    if (!actualSlug) return false;
    const expected = expectedSlug.trim().toLowerCase();
    const actual = actualSlug.trim().toLowerCase();
    if (actual === expected) return true;
    if (actual.startsWith(`${expected}-`) || expected.startsWith(`${actual}-`)) {
      return true;
    }
    const expectedRoot = expected.split('-')[0];
    const actualRoot = actual.split('-')[0];
    return Boolean(expectedRoot && actualRoot && expectedRoot === actualRoot);
  }

  async verifyProvisioning(input: {
    slug: string;
    enabledEnvironments?: unknown;
    urlMode?: unknown;
  }): Promise<ReadinessReport> {
    const enabled = normalizeEnabledEnvironments(input.enabledEnvironments);
    const urlMode = this.resolveUrlMode(input.urlMode);
    const candidates = this.candidateUrls(input.slug, enabled, urlMode);
    const corePublicUrl = this.corePublicUrl();
    const environments: EnvironmentReadiness[] = [];
    const dnsRequired = urlMode === 'HOSTNAME';

    for (const env of enabled) {
      const urls = candidates[env] ?? [];
      let best: EnvironmentReadiness | null = null;
      for (const url of urls) {
        const row = await this.verifyOne({
          env,
          url,
          expectedSlug: input.slug,
          corePublicUrl,
          urlMode,
          dnsRequired,
        });
        best = row;
        if (row.status === 'ok') break;
      }
      if (!best) {
        best = {
          environment: env,
          capability: FRONTEND_TO_CAPABILITY[env],
          url: urls[0] ?? '',
          host: '',
          resolves: false,
          httpsOk: false,
          httpStatus: null,
          bootstrapOk: false,
          bootstrapSlug: null,
          expectedSlug: input.slug,
          status: 'failed',
          error: 'No candidate URL configured',
        };
      }
      environments.push(best);
    }

    return {
      mode: 'shared_frontend',
      urlMode,
      corePublicUrl,
      enabledEnvironments: enabled.map((e) => FRONTEND_TO_CAPABILITY[e]),
      environments,
      ok: environments.every((e) => e.status === 'ok'),
      dnsRequired,
    };
  }

  private async verifyOne(input: {
    env: FrontendEnvironment;
    url: string;
    expectedSlug: string;
    corePublicUrl: string;
    urlMode: FrontendUrlMode;
    dnsRequired: boolean;
  }): Promise<EnvironmentReadiness> {
    let host = '';
    let origin = '';
    try {
      const parsed = new URL(input.url);
      host = parsed.host;
      origin = parsed.origin;
    } catch {
      return {
        environment: input.env,
        capability: FRONTEND_TO_CAPABILITY[input.env],
        url: input.url,
        host: '',
        resolves: false,
        httpsOk: false,
        httpStatus: null,
        bootstrapOk: false,
        bootstrapSlug: null,
        expectedSlug: input.expectedSlug,
        status: 'failed',
        error: 'Invalid URL',
      };
    }

    let resolves = !input.dnsRequired;
    if (input.dnsRequired) {
      try {
        await lookup(host);
        resolves = true;
      } catch {
        resolves = false;
      }
    } else {
      // PATH mode: only shared site DNS (already public); treat as resolved if host lookups.
      try {
        await lookup(host);
        resolves = true;
      } catch {
        resolves = false;
      }
    }

    let httpStatus: number | null = null;
    let httpsOk = false;
    let pageError: string | null = null;
    try {
      const page = await fetch(input.url, {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(12_000),
        headers: { Accept: 'text/html,application/json;q=0.9,*/*;q=0.8' },
      });
      httpStatus = page.status;
      httpsOk = page.url.startsWith('https:') && page.status >= 200 && page.status < 400;
      if (!httpsOk) {
        pageError = `Frontend HTTP ${page.status}`;
      }
    } catch (error) {
      pageError = error instanceof Error ? error.message : 'Frontend fetch failed';
      httpsOk = false;
    }

    let bootstrapSlug: string | null = null;
    let bootstrapOk = false;
    let bootstrapError: string | null = null;
    try {
      const bootUrl =
        input.urlMode === 'PATH'
          ? `${input.corePublicUrl}/public/platform/bootstrap?slug=${encodeURIComponent(input.expectedSlug)}`
          : `${input.corePublicUrl}/public/platform/bootstrap`;
      const boot = await fetch(bootUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Origin: origin,
        },
        signal: AbortSignal.timeout(12_000),
      });
      if (!boot.ok) {
        bootstrapError = `Bootstrap HTTP ${boot.status}`;
      } else {
        const json = (await boot.json()) as {
          data?: { whitelabel?: { slug?: string } };
        };
        bootstrapSlug = json?.data?.whitelabel?.slug ?? null;
        bootstrapOk = this.slugMatches(input.expectedSlug, bootstrapSlug);
        if (!bootstrapOk) {
          bootstrapError = `Bootstrap slug mismatch: got ${bootstrapSlug ?? 'null'}, expected ${input.expectedSlug}`;
        }
      }
    } catch (error) {
      bootstrapError =
        error instanceof Error ? error.message : 'Bootstrap fetch failed';
    }

    const ok = resolves && httpsOk && bootstrapOk;
    const error = ok
      ? null
      : [!resolves ? 'DNS does not resolve' : null, pageError, bootstrapError]
          .filter(Boolean)
          .join('; ');

    if (!ok) {
      this.logger.warn({
        msg: 'frontend_readiness_failed',
        env: input.env,
        url: input.url,
        urlMode: input.urlMode,
        error,
      });
    }

    return {
      environment: input.env,
      capability: FRONTEND_TO_CAPABILITY[input.env],
      url: input.url,
      host,
      resolves,
      httpsOk,
      httpStatus,
      bootstrapOk,
      bootstrapSlug,
      expectedSlug: input.expectedSlug,
      status: ok ? 'ok' : 'failed',
      error,
    };
  }
}

export { CAPABILITY_TO_FRONTEND };
