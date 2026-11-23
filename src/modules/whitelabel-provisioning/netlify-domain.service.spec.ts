import { NetlifyDomainService } from './netlify-domain.service';

describe('NetlifyDomainService.mergeDomainAliases', () => {
  const service = new NetlifyDomainService(
    { get: () => undefined } as never,
    {} as never,
  );

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
    readinessOk?: boolean;
    existingAliases?: string[];
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
    const frontendReadiness = {
      verifyProvisioning: jest.fn(async () => ({
        mode: 'shared_frontend',
        urlMode: 'HOSTNAME',
        corePublicUrl: 'https://back.loor.vc/service',
        enabledEnvironments: ['ADMIN'],
        environments: [
          {
            environment: 'admin',
            capability: 'ADMIN',
            url: 'https://cliente-x.admin.loor.vc',
            host: 'cliente-x.admin.loor.vc',
            resolves: true,
            httpsOk: opts?.readinessOk !== false,
            httpStatus: 200,
            bootstrapOk: opts?.readinessOk !== false,
            bootstrapSlug: 'cliente-x',
            expectedSlug: 'cliente-x',
            status: opts?.readinessOk === false ? 'failed' : 'ok',
            error: opts?.readinessOk === false ? 'bootstrap mismatch' : null,
          },
        ],
        ok: opts?.readinessOk !== false,
        dnsRequired: true,
      })),
    };
    const service = new NetlifyDomainService(
      config as never,
      frontendReadiness as never,
    );
    jest
      .spyOn(service as unknown as { verifyHost: (...args: unknown[]) => unknown }, 'verifyHost')
      .mockImplementation(async () => ({
        resolves: true,
        httpsOk: opts?.readinessOk !== false,
        bootstrapOk: opts?.readinessOk !== false,
        bootstrapSlug: 'cliente-x',
        status: opts?.readinessOk === false ? 'failed' : 'ok',
        error: opts?.readinessOk === false ? 'bootstrap mismatch' : null,
      }));

    const aliases = opts?.existingAliases ?? ['finapop.admin.loor.vc'];
    let currentAliases = [...aliases];
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method || 'GET').toUpperCase();
      if (url.includes('/ssl') && method === 'POST') {
        return {
          ok: true,
          status: 200,
          text: async () => '{}',
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
