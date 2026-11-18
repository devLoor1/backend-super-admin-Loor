/**
 * Homolog URL convention for shared FE + optional environments.
 *
 * Gate / delivery keys stay lowercase (`investor` | `entrepreneur` | `admin`).
 * Create DTO uses uppercase capability enums (`INVESTOR` | `ENTREPRENEUR` | `ADMIN`).
 */
export const FRONTEND_ENVIRONMENTS = [
  'investor',
  'entrepreneur',
  'admin',
] as const;

export type FrontendEnvironment = (typeof FRONTEND_ENVIRONMENTS)[number];

export const PROVISIONING_ENVIRONMENT_CAPABILITIES = [
  'INVESTOR',
  'ENTREPRENEUR',
  'ADMIN',
] as const;

export type ProvisioningEnvironmentCapability =
  (typeof PROVISIONING_ENVIRONMENT_CAPABILITIES)[number];

export const CAPABILITY_TO_FRONTEND: Record<
  ProvisioningEnvironmentCapability,
  FrontendEnvironment
> = {
  INVESTOR: 'investor',
  ENTREPRENEUR: 'entrepreneur',
  ADMIN: 'admin',
};

export const FRONTEND_TO_CAPABILITY: Record<
  FrontendEnvironment,
  ProvisioningEnvironmentCapability
> = {
  investor: 'INVESTOR',
  entrepreneur: 'ENTREPRENEUR',
  admin: 'ADMIN',
};

export type FrontendUrls = Partial<Record<FrontendEnvironment, string>> &
  Record<string, string | undefined>;

export type DnsHostEntry = {
  environment: FrontendEnvironment;
  host: string;
  url: string;
  status: 'ok';
  https: true;
};

export function normalizeEnabledEnvironments(
  raw: unknown,
): FrontendEnvironment[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [...FRONTEND_ENVIRONMENTS];
  }
  const out: FrontendEnvironment[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const upper = item.trim().toUpperCase();
    if (
      (PROVISIONING_ENVIRONMENT_CAPABILITIES as readonly string[]).includes(
        upper,
      )
    ) {
      const fe = CAPABILITY_TO_FRONTEND[upper as ProvisioningEnvironmentCapability];
      if (!out.includes(fe)) out.push(fe);
      continue;
    }
    const lower = item.trim().toLowerCase();
    if ((FRONTEND_ENVIRONMENTS as readonly string[]).includes(lower)) {
      const fe = lower as FrontendEnvironment;
      if (!out.includes(fe)) out.push(fe);
    }
  }
  return out.length ? out : [...FRONTEND_ENVIRONMENTS];
}

export function suggestedFrontendUrls(
  slug: string,
  enabled: readonly FrontendEnvironment[] = FRONTEND_ENVIRONMENTS,
): Record<FrontendEnvironment, string> {
  const safe = String(slug).trim().toLowerCase();
  const all = {
    investor: `https://${safe}.investor.loor.vc`,
    entrepreneur: `https://${safe}.empresa.loor.vc`,
    admin: `https://${safe}.admin.loor.vc`,
  } as const;
  const out = {} as Record<FrontendEnvironment, string>;
  for (const env of enabled) {
    out[env] = all[env];
  }
  return out;
}

const HTTPS_URL_MAX = 512;

export function normalizeHttpsOrigin(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > HTTPS_URL_MAX) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (!url.hostname || url.hostname.includes(' ')) return null;
  return `${url.protocol}//${url.host}`.toLowerCase();
}

export function parseFrontendUrls(
  raw: unknown,
  enabled: readonly FrontendEnvironment[] = FRONTEND_ENVIRONMENTS,
):
  | { ok: true; urls: Partial<Record<FrontendEnvironment, string>> }
  | { ok: false; missing: string[] } {
  const row =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const missing: string[] = [];
  const urls: Partial<Record<FrontendEnvironment, string>> = {};
  for (const env of enabled) {
    const normalized = normalizeHttpsOrigin(row[env]);
    if (!normalized) missing.push(env);
    else urls[env] = normalized;
  }
  if (missing.length) return { ok: false, missing };
  return { ok: true, urls };
}

export function parseDnsHosts(
  raw: unknown,
  enabled: readonly FrontendEnvironment[] = FRONTEND_ENVIRONMENTS,
): { ok: true; hosts: DnsHostEntry[] } | { ok: false; missing: string[] } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, missing: [...enabled] };
  }
  const row = raw as Record<string, unknown>;
  const missing: string[] = [];
  const hosts: DnsHostEntry[] = [];
  for (const env of enabled) {
    const entry = row[env];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      missing.push(env);
      continue;
    }
    const cell = entry as Record<string, unknown>;
    const url = normalizeHttpsOrigin(cell.url);
    const status = cell.status;
    const https = cell.https;
    if (!url || status !== 'ok' || https !== true) {
      missing.push(env);
      continue;
    }
    hosts.push({
      environment: env,
      host: new URL(url).host,
      url,
      status: 'ok',
      https: true,
    });
  }
  if (missing.length) return { ok: false, missing };
  return { ok: true, hosts };
}

export function urlsFromDnsHosts(
  hosts: DnsHostEntry[],
): Partial<Record<FrontendEnvironment, string>> {
  const urls: Partial<Record<FrontendEnvironment, string>> = {};
  for (const host of hosts) {
    urls[host.environment] = host.url;
  }
  return urls;
}
