import { Injectable } from '@nestjs/common';
import {
  REDACTED,
  SECRET_KEY_PATTERN,
  SECRETS_TTL_MS,
} from './provisioning.constants';

export type ProvisioningInitialAdminSecret = {
  name?: string;
  email: string;
  temporaryPassword: string;
};

export type ProvisioningBrandingPage = 'login' | 'register' | 'quick_profile';

export type ProvisioningBrandingFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

/** Client branding for UPLOAD_BRAND. The image bytes live here only — never in Prisma. */
export type ProvisioningBrandingSecret = {
  email?: { primary_color?: string | null; logo_url?: string | null };
  loginBrandPanelTextColor?: string;
  mainAreaPages?: ProvisioningBrandingPage[];
  mainAreaFile?: ProvisioningBrandingFile;
};

export type ProvisioningSecrets = {
  initialAdmin?: ProvisioningInitialAdminSecret;
  smtp?: Record<string, unknown>;
  gateway?: { items: unknown[] };
  branding?: ProvisioningBrandingSecret;
};

type Entry = { secrets: ProvisioningSecrets; expiresAt: number };

/**
 * Ephemeral, in-process holder for credentials supplied at create/retry time
 * (SMTP password, initial admin temporary password, gateway keys).
 *
 * - Never written to the database, step payload/result or audit.
 * - Lost on process restart → a FAILED step that needs secrets must be retried with them
 *   re-supplied in the retry body.
 * - Entries are dropped per field once the owning step succeeds, on provisioning completion,
 *   and after a hard TTL.
 */
@Injectable()
export class ProvisioningSecretsStore {
  private readonly entries = new Map<string, Entry>();

  /** Merge (field-by-field) secrets for a provisioning. */
  set(provisioningId: string, secrets: ProvisioningSecrets): void {
    this.sweep();
    const current = this.entries.get(provisioningId)?.secrets ?? {};
    const merged: ProvisioningSecrets = { ...current };
    if (secrets.initialAdmin) merged.initialAdmin = secrets.initialAdmin;
    if (secrets.smtp) merged.smtp = secrets.smtp;
    if (secrets.gateway) merged.gateway = secrets.gateway;
    if (secrets.branding) {
      // Retry may re-supply only part of the branding (e.g. just the file): merge, don't drop.
      merged.branding = { ...(current.branding ?? {}), ...secrets.branding };
    }
    if (Object.keys(merged).length === 0) return;
    this.entries.set(provisioningId, {
      secrets: merged,
      expiresAt: Date.now() + SECRETS_TTL_MS,
    });
  }

  get(provisioningId: string): ProvisioningSecrets {
    const entry = this.entries.get(provisioningId);
    if (!entry) return {};
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(provisioningId);
      return {};
    }
    return entry.secrets;
  }

  /** Drop one field (after its step succeeded). */
  discard(provisioningId: string, field: keyof ProvisioningSecrets): void {
    const entry = this.entries.get(provisioningId);
    if (!entry) return;
    delete entry.secrets[field];
    if (Object.keys(entry.secrets).length === 0)
      this.entries.delete(provisioningId);
  }

  clear(provisioningId: string): void {
    this.entries.delete(provisioningId);
  }

  has(provisioningId: string): boolean {
    return this.entries.has(provisioningId);
  }

  /** Replace any known secret literal inside free text (e.g. an upstream error message). */
  redactText(provisioningId: string, text: string): string {
    const secrets = this.get(provisioningId);
    const literals: string[] = [];
    if (secrets.initialAdmin?.temporaryPassword)
      literals.push(secrets.initialAdmin.temporaryPassword);
    collectStrings(secrets.smtp, literals);
    collectStrings(secrets.gateway, literals);
    let out = text;
    for (const literal of literals) {
      if (literal.length >= 4) out = out.split(literal).join(REDACTED);
    }
    return out;
  }

  private sweep(): void {
    const now = Date.now();
    for (const [id, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(id);
    }
  }
}

/** Collect string values stored under secret-looking keys (at any depth). */
function collectStrings(
  value: unknown,
  out: string[],
  secretKey = false,
): void {
  if (typeof value === 'string') {
    if (secretKey) out.push(value);
    return;
  }
  if (Array.isArray(value))
    return value.forEach((item) => collectStrings(item, out, secretKey));
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(
      value as Record<string, unknown>,
    )) {
      collectStrings(nested, out, secretKey || SECRET_KEY_PATTERN.test(key));
    }
  }
}
