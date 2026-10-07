/**
 * Maps Core Whitelabel payloads into the Control Plane contract for the FE.
 * Does not invent setup/draft/archive states (Q-WL-02 still open).
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

export type ControlPlaneWhitelabel = {
  id: number;
  slug: string;
  name: string;
  baseUrl: string;
  isActive: boolean;
  status: 'active' | 'inactive';
  counts: {
    admins: number;
    investors: number;
    entrepreneurs: number;
  };
  createdAt: string | null;
  updatedAt: string | null;
  overview?: unknown;
};

export function mapWhitelabel(row: CoreWhitelabelSummary): ControlPlaneWhitelabel {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    baseUrl: row.baseUrl,
    isActive: Boolean(row.isActive),
    status: row.isActive ? 'active' : 'inactive',
    counts: {
      admins: Number(row.counts?.admins ?? 0),
      investors: Number(row.counts?.investors ?? 0),
      entrepreneurs: Number(row.counts?.entrepreneurs ?? 0),
    },
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
    ...(row.overview !== undefined ? { overview: row.overview } : {}),
  };
}
