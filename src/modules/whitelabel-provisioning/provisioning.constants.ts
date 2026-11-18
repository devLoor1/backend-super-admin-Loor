import { ProvisioningStatus, ProvisioningStepKey } from '@prisma/client';

/** Execution order of the provisioning pipeline. The runner always walks this list top-down. */
export const STEP_ORDER: readonly ProvisioningStepKey[] = [
  ProvisioningStepKey.CREATE_TENANT,
  ProvisioningStepKey.APPLY_SETTINGS_TEMPLATE,
  ProvisioningStepKey.UPLOAD_BRAND,
  ProvisioningStepKey.INITIAL_ADMIN,
  ProvisioningStepKey.TERMS,
  ProvisioningStepKey.SMTP,
  ProvisioningStepKey.GATEWAY_CONFIG,
  ProvisioningStepKey.FE_DEPLOY_CHECK,
  ProvisioningStepKey.DNS_CHECK,
  ProvisioningStepKey.VALIDATE,
  ProvisioningStepKey.DELIVER,
];

/**
 * Legacy manual gates. Shared-frontend homolog runs FE_DEPLOY_CHECK / DNS_CHECK
 * automatically via FrontendReadinessService — keep this empty.
 * `completeManual` remains for emergency attestation only if a key is re-listed here.
 */
export const MANUAL_GATES: readonly ProvisioningStepKey[] = [];

export function isManualGate(key: ProvisioningStepKey): boolean {
  return MANUAL_GATES.includes(key);
}

/** Checklist fields that must all be `true` to complete each manual gate (unused while MANUAL_GATES is empty). */
export const MANUAL_GATE_CHECKLIST: Readonly<
  Partial<Record<ProvisioningStepKey, readonly string[]>>
> = {
  [ProvisioningStepKey.FE_DEPLOY_CHECK]: ['investor', 'entrepreneur', 'admin'],
  [ProvisioningStepKey.DNS_CHECK]: ['resolves', 'https'],
};

/**
 * Settings cells copied from a template Whitelabel (`page` → allowed `key`s, `'*'` = every key).
 * Only cells that are *stored* (own override) on the template are copied — defaults are not.
 * `main_area_image` is intentionally absent: assets are tenant-owned and never cloned.
 */
export const SETTINGS_COPY_ALLOWLIST: Readonly<
  Record<string, readonly string[] | '*'>
> = {
  login: [
    'title',
    'subtitle',
    'bullets',
    'layout_preset',
    'brand_panel_text_color',
    'entry_presentation',
  ],
  register: ['content', 'entry_presentation'],
  quick_profile: ['theme', 'entry_presentation'],
  features: '*',
  terminology: ['config'],
  dashboard: ['components'],
  offers: ['presentation'],
  app_entry: ['content'],
  app_authenticated: ['content'],
  email_branding: ['config'],
};

/** Keys that must never be copied or persisted regardless of allowlist. */
export const SETTINGS_NEVER_COPY_KEYS: readonly string[] = ['main_area_image'];

export const SECRET_KEY_PATTERN =
  /(password|passwd|secret|token|api[_-]?key|authorization|credential|private[_-]?key|username|user[_-]?name)/i;

export function isSettingsCellCopyable(page: string, key: string): boolean {
  if (SETTINGS_NEVER_COPY_KEYS.includes(key)) return false;
  if (SECRET_KEY_PATTERN.test(page) || SECRET_KEY_PATTERN.test(key))
    return false;
  const allowed = SETTINGS_COPY_ALLOWLIST[page];
  if (!allowed) return false;
  return allowed === '*' || allowed.includes(key);
}

/** True when any object key (at any depth) looks like a secret. */
export function containsSecretLikeKey(value: unknown): boolean {
  if (Array.isArray(value))
    return value.some((item) => containsSecretLikeKey(item));
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value as Record<string, unknown>).some(
    ([key, nested]) =>
      SECRET_KEY_PATTERN.test(key) || containsSecretLikeKey(nested),
  );
}

export const REDACTED = '[REDACTED]';

/** Deep copy replacing every value whose key looks like a secret. Safe for JSON persistence. */
export function scrubSecrets<T>(value: T): T {
  return walk(value) as T;
}

function walk(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => walk(item));
  if (!value || typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(
    value as Record<string, unknown>,
  )) {
    out[key] = SECRET_KEY_PATTERN.test(key) ? REDACTED : walk(nested);
  }
  return out;
}

export function truncate(text: string, max = 1000): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Hard cap on the lifetime of ephemeral secrets kept in memory. */
export const SECRETS_TTL_MS = 6 * 60 * 60 * 1000;

/** Statuses for which another provisioning with the same slug is rejected (409). */
export const ACTIVE_PROVISIONING_STATUSES: readonly ProvisioningStatus[] = [
  ProvisioningStatus.PENDING,
  ProvisioningStatus.RUNNING,
  ProvisioningStatus.WAITING_MANUAL_ACTION,
];
