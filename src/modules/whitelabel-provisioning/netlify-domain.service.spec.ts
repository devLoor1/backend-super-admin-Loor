import { NetlifyDomainService } from './netlify-domain.service';

describe('NetlifyDomainService.mergeDomainAliases', () => {
  const service = new NetlifyDomainService({ get: () => undefined } as never);

  it('adds a new alias without dropping existing ones', () => {
    const merged = service.mergeDomainAliases(
      ['finapop.admin.loor.vc', 'laguna.admin.loor.vc'],
      'homolog.admin.loor.vc',
      'cliente-x.admin.loor.vc',
    );
    expect(merged.alreadyPresent).toBe(false);
    expect(merged.aliases).toEqual([
      'cliente-x.admin.loor.vc',
      'finapop.admin.loor.vc',
      'laguna.admin.loor.vc',
    ]);
  });

  it('is idempotent when alias already exists', () => {
    const merged = service.mergeDomainAliases(
      ['cliente-x.admin.loor.vc', 'finapop.admin.loor.vc'],
      null,
      'cliente-x.admin.loor.vc',
    );
    expect(merged.alreadyPresent).toBe(true);
    expect(merged.aliases).toEqual([
      'cliente-x.admin.loor.vc',
      'finapop.admin.loor.vc',
    ]);
  });

  it('treats custom_domain as already present', () => {
    const merged = service.mergeDomainAliases(
      ['finapop.admin.loor.vc'],
      'homolog.admin.loor.vc',
      'homolog.admin.loor.vc',
    );
    expect(merged.alreadyPresent).toBe(true);
    expect(merged.aliases).toEqual(['finapop.admin.loor.vc']);
  });
});

describe('NetlifyDomainService.ensureHostnameAliases', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function buildService(opts?: {
    existingAliases?: string[];
    sslStatus?: number;
    sslBody?: string;
  }) {
    const config = {
      get: (key: string) => {
        const map: Record<string, string> = {
          'netlify.accessToken': 'test-token-not-real',
          'netlify.siteIds.investor': 'site-investor',
          'netlify.siteIds.entrepreneur': 'site-entrepreneur',
          'netlify.siteIds.admin': 'site-admin',
        };
        return map[key];
      },
    };
    const service = new NetlifyDomainService(config as never);

    const aliases = opts?.existingAliases ?? ['finapop.admin.loor.vc'];
    let currentAliases = [...aliases];
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method || 'GET').toUpperCase();
      if (url.includes('/ssl') && method === 'POST') {
        const status = opts?.sslStatus ?? 422;
        return {
          ok: status >= 200 && status < 300,
          status,
          text: async () =>
            opts?.sslBody ??
            JSON.stringify({
              error: 'certificate parameter is required when updating an existing certificate',
            }),
        } as Response;
      }
      if (method === 'PATCH') {
        const body = JSON.parse(String(init?.body || '{}')) as {
          domain_aliases?: string[];
        };
        currentAliases = [...(body.domain_aliases ?? [])];
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              id: 'site-admin',
              name: 'homologadmin',
              domain_aliases: currentAliases,
              custom_domain: 'homolog.admin.loor.vc',
            }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id: 'site-admin',
            name: 'homologadmin',
            domain_aliases: currentAliases,
            custom_domain: 'homolog.admin.loor.vc',
          }),
      } as Response;
    }) as unknown as typeof fetch;

    return { service, fetchMock: global.fetch as unknown as jest.Mock };
  }

  it('PATCHes merged aliases and does not drop Finapop', async () => {
    const { service, fetchMock } = buildService();
    const report = await service.ensureHostnameAliases({
      slug: 'cliente-x',
      enabledEnvironments: ['ADMIN'],
    });
    expect(report.ok).toBe(true);
    expect(report.environments[0].action).toBe('created');
    expect(report.environments[0].ssl.skipped).toBe(true);
    const patch = fetchMock.mock.calls.find(
      (call) => String(call[1]?.method || 'GET').toUpperCase() === 'PATCH',
    );
    expect(patch).toBeTruthy();
    const body = JSON.parse(String(patch![1].body));
    expect(body.domain_aliases).toEqual(
      expect.arrayContaining([
        'cliente-x.admin.loor.vc',
        'finapop.admin.loor.vc',
      ]),
    );
  });

  it('skips PATCH when alias already exists (idempotent retry)', async () => {
    const { service, fetchMock } = buildService({
      existingAliases: ['cliente-x.admin.loor.vc', 'finapop.admin.loor.vc'],
    });
    const report = await service.ensureHostnameAliases({
      slug: 'cliente-x',
      enabledEnvironments: ['ADMIN'],
    });
    expect(report.ok).toBe(true);
    expect(report.environments[0].action).toBe('already_present');
    const patch = fetchMock.mock.calls.find(
      (call) => String(call[1]?.method || 'GET').toUpperCase() === 'PATCH',
    );
    expect(patch).toBeUndefined();
  });

  it('does not fail CONFIGURE when readiness would be pending (alias-only success)', async () => {
    const { service } = buildService();
    const report = await service.ensureHostnameAliases({
      slug: 'cliente-x',
      enabledEnvironments: ['ADMIN'],
    });
    expect(report.ok).toBe(true);
    expect(report.environments[0].error).toBeNull();
    expect(report.environments[0].readinessProbe.attempted).toBe(false);
  });

  it('never logs or returns the bearer token on failure', async () => {
    const { service } = buildService();
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 401,
      text: async () =>
        JSON.stringify({ message: 'Bearer test-token-not-real denied' }),
    })) as unknown as typeof fetch;

    const report = await service.ensureHostnameAliases({
      slug: 'cliente-x',
      enabledEnvironments: ['ADMIN'],
    });
    expect(report.ok).toBe(false);
    expect(JSON.stringify(report)).not.toContain('test-token-not-real');
    expect(JSON.stringify(report)).toContain('[REDACTED]');
  });
});
