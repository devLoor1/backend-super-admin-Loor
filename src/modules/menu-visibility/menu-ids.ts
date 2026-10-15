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

export function defaultVisibilityMap(): Record<MenuId, boolean> {
  return Object.fromEntries(KNOWN_MENU_IDS.map((id) => [id, true])) as Record<MenuId, boolean>;
}
