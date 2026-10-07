import { domainFromBaseUrl, mapWhitelabel } from './whitelabel.mapper';

describe('mapWhitelabel', () => {
  it('maps Core boolean active to status vocabulary without inventing draft/setup', () => {
    const mapped = mapWhitelabel({
      id: 3,
      slug: 'finapop',
      name: 'Finapop',
      baseUrl: 'https://finapop.com.br',
      isActive: true,
      counts: { admins: 2, investors: 10, entrepreneurs: 4 },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });

    expect(mapped.status).toBe('active');
    expect(mapped.isActive).toBe(true);
    expect(mapped.idKey).toBe('3');
    expect(mapped.domain).toBe('finapop.com.br');
    expect(mapped.admins).toBe(2);
    expect(mapped.applications).toBeNull();
    expect(mapped.integrations).toBeNull();
    expect(mapped.counts.investors).toBe(10);
  });

  it('defaults missing counts to zero and domain from baseUrl', () => {
    const mapped = mapWhitelabel({
      id: 1,
      slug: 'loor',
      name: 'LOOR',
      baseUrl: 'https://loor.com.br/path',
      isActive: false,
    });

    expect(mapped.status).toBe('inactive');
    expect(mapped.domain).toBe('loor.com.br');
    expect(mapped.counts).toEqual({
      admins: 0,
      investors: 0,
      entrepreneurs: 0,
    });
  });
});

describe('domainFromBaseUrl', () => {
  it('parses host without scheme', () => {
    expect(domainFromBaseUrl('finapop.com.br')).toBe('finapop.com.br');
  });
});
