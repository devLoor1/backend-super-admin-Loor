import {
  maskDocument,
  redactEmbeddedDocuments,
  sanitizeWalletMovementsPayload,
} from './document-privacy';

describe('document-privacy', () => {
  it('masks dedicated document fields', () => {
    expect(maskDocument('529.982.247-25')).toBe('***.***.***-25');
    expect(maskDocument(null)).toBeNull();
  });

  it('redacts CNPJ inside opportunity.name (refund/out scenario)', () => {
    expect(redactEmbeddedDocuments('11.222.333/0001-81')).toBe('**.***.***/****-81');
    expect(redactEmbeddedDocuments('11222333000181')).toBe('**.***.***/****-81');
  });

  it('sanitizes wallet movements envelope', () => {
    const payload = sanitizeWalletMovementsPayload({
      data: [
        {
          id: 'refund:1',
          description: 'Estorno — CNPJ 11.222.333/0001-81',
          counterparty: { type: 'investor', name: 'João', document: '52998224725' },
          opportunity: { id: 9, name: '11.222.333/0001-81' },
          reference: { reason: 'doc 11222333000181' },
        },
      ],
    });

    const row = payload.data[0];
    expect(row.opportunity?.name).toBe('**.***.***/****-81');
    expect(row.counterparty.document).toBe('***.***.***-25');
    expect(row.description).not.toContain('11.222.333/0001-81');
    expect(String(row.reference?.reason)).toContain('**.***.***/****-81');
  });
});
