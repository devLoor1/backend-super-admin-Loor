jest.mock('node:dns/promises', () => ({
  lookup: jest.fn().mockResolvedValue({ address: '1.2.3.4', family: 4 }),
}));

import { ConfigService } from '@nestjs/config';
import { FrontendReadinessService } from './frontend-readiness.service';

describe('FrontendReadinessService', () => {
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'loorCore.baseUrl') return 'https://back.loor.vc/service';
      if (key === 'PROVISIONING_FRONTEND_URL_MODE') return 'HOSTNAME';
      return undefined;
    }),
  } as unknown as ConfigService;

  const service = new FrontendReadinessService(config);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('slugMatches accepts root prefix variants', () => {
    expect(service.slugMatches('finapop', 'finapop-homologacao')).toBe(true);
    expect(service.slugMatches('finapop-homologacao', 'finapop')).toBe(true);
    expect(service.slugMatches('laguna', 'finapop')).toBe(false);
  });

  it('candidateUrls HOSTNAME prefer convention then legacy aliases', () => {
    const map = service.candidateUrls('finapop', ['investor', 'admin'], 'HOSTNAME');
    expect(map.investor[0]).toBe('https://finapop.loor.vc');
    expect(map.investor).toContain('https://finapop.investor.loor.vc');
    expect(map.investor).toContain('https://finapop.investidor.loor.vc');
    expect(map.admin[0]).toBe('https://finapop.admin.loor.vc');
  });

  it('candidateUrls PATH use homolog.* infrastructure bases + /w/{slug}', () => {
    const map = service.candidateUrls(
      'shared-fe-demo',
      ['investor', 'entrepreneur', 'admin'],
      'PATH',
    );
    expect(map.investor[0]).toBe('https://homolog.loor.vc/w/shared-fe-demo');
    expect(map.entrepreneur[0]).toBe(
      'https://homolog.empresa.loor.vc/w/shared-fe-demo',
    );
    expect(map.admin[0]).toBe('https://homolog.admin.loor.vc/w/shared-fe-demo');
  });

  it('verifyProvisioning marks env ok when DNS+HTTPS+bootstrap pass', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/public/platform/bootstrap')) {
        const origin =
          (init?.headers as Record<string, string> | undefined)?.Origin ?? '';
        const slug = origin.includes('laguna') ? 'laguna' : 'finapop';
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: { whitelabel: { slug } } }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        url: url.startsWith('https') ? url : `https://${url}`,
      } as Response;
    });

    const report = await service.verifyProvisioning({
      slug: 'finapop',
      enabledEnvironments: ['INVESTOR', 'ADMIN'],
      urlMode: 'HOSTNAME',
    });

    expect(report.ok).toBe(true);
    expect(report.urlMode).toBe('HOSTNAME');
    expect(report.environments).toHaveLength(2);
    expect(report.environments.every((e) => e.status === 'ok')).toBe(true);
  });

  it('verifyProvisioningWithRetry backs off then succeeds without infinite loop', async () => {
    let attempts = 0;
    jest
      .spyOn(service, 'verifyProvisioning')
      .mockImplementation(async () => {
        attempts += 1;
        const ok = attempts >= 3;
        return {
          mode: 'shared_frontend',
          urlMode: 'HOSTNAME',
          corePublicUrl: 'https://back.loor.vc/service',
          enabledEnvironments: ['INVESTOR'],
          environments: [
            {
              environment: 'investor',
              capability: 'INVESTOR',
              url: 'https://finapop.loor.vc',
              host: 'finapop.loor.vc',
              resolves: ok,
              httpsOk: ok,
              httpStatus: ok ? 200 : null,
              bootstrapOk: ok,
              bootstrapSlug: ok ? 'finapop' : null,
              expectedSlug: 'finapop',
              status: ok ? 'ok' : 'failed',
              error: ok ? null : 'DNS does not resolve; fetch failed',
            },
          ],
          ok,
          dnsRequired: true,
        };
      });

    const report = await service.verifyProvisioningWithRetry(
      {
        slug: 'finapop',
        enabledEnvironments: ['INVESTOR'],
        urlMode: 'HOSTNAME',
      },
      {
        maxAttempts: 5,
        initialDelayMs: 1,
        maxDelayMs: 5,
        maxTotalMs: 5_000,
      },
    );

    expect(report.ok).toBe(true);
    expect(report.attempts).toBe(3);
    expect(attempts).toBe(3);
  });
});
