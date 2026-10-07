import { mapWhitelabel } from './whitelabel.mapper';

describe('mapWhitelabel', () => {
  it('maps Core boolean active to status vocabulary without inventing draft/setup', () => {
    const mapped = mapWhitelabel({
      id: 3,
      slug: 'finapop',
      name: 'Finapop',
      baseUrl: 'https://finapop.example',
      isActive: true,
      counts: { admins: 2, investors: 10, entrepreneurs: 4 },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });

    expect(mapped.status).toBe('active');
    expect(mapped.isActive).toBe(true);
    expect(mapped.counts.investors).toBe(10);
  });

  it('defaults missing counts to zero', () => {
    const mapped = mapWhitelabel({
      id: 1,
      slug: 'loor',
      name: 'LOOR',
      baseUrl: 'https://loor.example',
      isActive: false,
    });

    expect(mapped.status).toBe('inactive');
    expect(mapped.counts).toEqual({
      admins: 0,
      investors: 0,
      entrepreneurs: 0,
    });
  });
});
