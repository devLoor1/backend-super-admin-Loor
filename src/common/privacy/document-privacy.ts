/**
 * Defense-in-depth for Super Admin finance payloads.
 * Core is the source of truth; Nest re-applies redaction before returning to FE.
 */

export function maskDocument(doc: string | null | undefined): string | null {
  if (!doc) return null;
  const digits = String(doc).replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length <= 2) return '***';
  return `***.***.***-${digits.slice(-2)}`;
}

export function maskCpf(digits: string): string {
  const d = digits.replace(/\D/g, '');
  if (d.length < 2) return '***';
  return `***.***.***-${d.slice(-2)}`;
}

export function maskCnpj(digits: string): string {
  const d = digits.replace(/\D/g, '');
  if (d.length < 2) return '***';
  return `**.***.***/****-${d.slice(-2)}`;
}

export function isValidCpf(value: string): boolean {
  const cpf = value.replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(cpf[i]) * (10 - i);
  let rest = (sum * 10) % 11;
  if (rest === 10) rest = 0;
  if (rest !== Number(cpf[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(cpf[i]) * (11 - i);
  rest = (sum * 10) % 11;
  if (rest === 10) rest = 0;
  return rest === Number(cpf[10]);
}

export function isValidCnpj(value: string): boolean {
  const cnpj = value.replace(/\D/g, '');
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;
  const calc = (base: string, weights: number[]) => {
    const sum = weights.reduce((acc, w, i) => acc + Number(base[i]) * w, 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const d1 = calc(cnpj.slice(0, 12), w1);
  const d2 = calc(cnpj.slice(0, 12) + String(d1), w2);
  return d1 === Number(cnpj[12]) && d2 === Number(cnpj[13]);
}

export function redactEmbeddedDocuments(text: string | null | undefined): string {
  if (text === null || text === undefined) return '';
  let out = String(text);

  out = out.replace(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g, (match) => {
    const digits = match.replace(/\D/g, '');
    return isValidCnpj(digits) ? maskCnpj(digits) : match;
  });

  out = out.replace(/\d{3}\.\d{3}\.\d{3}-\d{2}/g, (match) => {
    const digits = match.replace(/\D/g, '');
    return isValidCpf(digits) ? maskCpf(digits) : match;
  });

  out = out.replace(/(?<!\d)\d{14}(?!\d)/g, (match) =>
    isValidCnpj(match) ? maskCnpj(match) : match,
  );

  out = out.replace(/(?<!\d)\d{11}(?!\d)/g, (match) =>
    isValidCpf(match) ? maskCpf(match) : match,
  );

  return out;
}

export function redactReferenceStrings(
  reference: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!reference || typeof reference !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(reference)) {
    out[key] = typeof value === 'string' ? redactEmbeddedDocuments(value) : value;
  }
  return out;
}

type MovementRow = {
  description?: string;
  counterparty?: { type?: string; name?: string; document?: string | null };
  opportunity?: { id?: number; name?: string } | null;
  reference?: Record<string, unknown>;
  [key: string]: unknown;
};

/** Sanitize a Core wallet-movements envelope before returning to FE. */
export function sanitizeWalletMovementsPayload<T>(payload: T): T {
  if (!payload || typeof payload !== 'object') return payload;
  const body = payload as { data?: MovementRow[] };
  if (!Array.isArray(body.data)) return payload;

  body.data = body.data.map((entry) => {
    const next: MovementRow = { ...entry };
    if (typeof next.description === 'string') {
      next.description = redactEmbeddedDocuments(next.description);
    }
    if (next.counterparty && typeof next.counterparty === 'object') {
      next.counterparty = {
        ...next.counterparty,
        name: redactEmbeddedDocuments(next.counterparty.name),
        document: maskDocument(next.counterparty.document),
      };
    }
    if (next.opportunity && typeof next.opportunity === 'object') {
      next.opportunity = {
        ...next.opportunity,
        name: redactEmbeddedDocuments(next.opportunity.name),
      };
    }
    if (next.reference && typeof next.reference === 'object') {
      next.reference = redactReferenceStrings(next.reference);
    }
    return next;
  });

  return payload;
}
