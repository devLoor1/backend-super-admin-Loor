/**
 * Maps Core Whitelabel payloads into the Control Plane contract for the FE.
 *
 * FE prototype uses visual statuses (setup/draft) and wl_proto_* ids — those are
 * NOT part of this contract. Authoritative status is only active | inactive
 * (Q-WL-02). Domain is derived from baseUrl for list UI; applications /
 * integrations stay null until Core exposes real aggregates.
 */

export type CoreWhitelabelSummary = {
  id: number;
  slug: string;
  name: string;
  baseUrl: string;
  isActive: boolean;
  status?: string;
  counts?: {
    admins?: number;
    investors?: number;
    entrepreneurs?: number;
  };
  createdAt?: string | null;
  updatedAt?: string | null;
  overview?: unknown;
};

/** Stable CP → FE list/detail shape (aligned to Whitelabels V1 integration). */
export type ControlPlaneWhitelabel = {
  id: number;
  /** String form of Core id — FE must stop using wl_proto_* after wiring. */
  idKey: string;
  slug: string;
  name: string;
  baseUrl: string;
  /** Hostname derived from baseUrl for the FE "domain" column. */
  domain: string | null;
  isActive: boolean;
  status: 'active' | 'inactive';
  counts: {
    admins: number;
    investors: number;
    entrepreneurs: number;
  };
  /** Flat FE-friendly count (same as counts.admins). */
  admins: number | null;
  /** Not available from Core registry yet. */
  applications: number | null;
  /** Not available from Core registry yet. */
  integrations: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  overview?: unknown;
};

export function domainFromBaseUrl(baseUrl: string | null | undefined): string | null {
  if (!baseUrl) return null;
  try {
    const host = new URL(baseUrl.includes('://') ? baseUrl : `https://${baseUrl}`).hostname;
    return host || null;
  } catch {
    return baseUrl.replace(/^https?:\/\//i, '').split('/')[0] || null;
  }
}

export function mapWhitelabel(row: CoreWhitelabelSummary): ControlPlaneWhitelabel {
  const admins = Number(row.counts?.admins ?? 0);
  return {
    id: row.id,
    idKey: String(row.id),
    slug: row.slug,
    name: row.name,
    baseUrl: row.baseUrl,
    domain: domainFromBaseUrl(row.baseUrl),
    isActive: Boolean(row.isActive),
    status: row.isActive ? 'active' : 'inactive',
    counts: {
      admins,
      investors: Number(row.counts?.investors ?? 0),
      entrepreneurs: Number(row.counts?.entrepreneurs ?? 0),
    },
    admins,
    applications: null,
    integrations: null,
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
    ...(row.overview !== undefined ? { overview: row.overview } : {}),
  };
}
