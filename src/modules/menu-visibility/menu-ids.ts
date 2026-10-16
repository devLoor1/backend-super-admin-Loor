/** Stable Super Admin sidebar IDs (Arthur demand). Unknown IDs must be rejected. */
export const KNOWN_MENU_IDS = [
  'dashboard',
  'plataformas',
  'whitelabels',
  'contas',
  'whitelabel-settings',
  'whitelabel-emails',
  'operacao',
  'operation-opportunities',
  'operation-investors',
  'operation-entrepreneurs',
  'financeiro',
  'finance-gateways',
  'finance-modalities',
  'finance-catalogs',
  'finance-investments',
  'finance-payments',
  'finance-wallets',
  'compliance',
  'compliance-kyc',
  'auditoria',
  'sistema',
  'configuracoes',
  'ajuda',
] as const;

export type MenuId = (typeof KNOWN_MENU_IDS)[number];

/** Stage B — cannot be hidden (PUT false → 400; GET always forces true). */
export const LOCKED_VISIBLE_MENU_IDS = ['dashboard', 'configuracoes'] as const;

export type LockedMenuId = (typeof LOCKED_VISIBLE_MENU_IDS)[number];

export function defaultVisibilityMap(): Record<MenuId, boolean> {
  return Object.fromEntries(KNOWN_MENU_IDS.map((id) => [id, true])) as Record<MenuId, boolean>;
}

export function applyLockedVisibility(map: Record<string, boolean>): Record<MenuId, boolean> {
  const next = { ...map } as Record<MenuId, boolean>;
  for (const id of LOCKED_VISIBLE_MENU_IDS) {
    next[id] = true;
  }
  return next;
}
