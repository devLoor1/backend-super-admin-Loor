import {
  normalizeFrontendUrlMode,
  sharedFrontendPathOrigins,
  suggestedFrontendUrls,
} from './frontend-urls';

describe('frontend-urls PATH infrastructure', () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
  });

  it('defaults PATH bases to homolog.*.loor.vc', () => {
    delete process.env.INVESTOR_BASE_URL;
    delete process.env.ENTREPRENEUR_BASE_URL;
    delete process.env.ADMIN_BASE_URL;
    expect(sharedFrontendPathOrigins()).toEqual({
      investor: 'https://homolog.loor.vc',
      entrepreneur: 'https://homolog.empresa.loor.vc',
      admin: 'https://homolog.admin.loor.vc',
    });
  });

  it('honours INVESTOR/ENTREPRENEUR/ADMIN_BASE_URL env', () => {
    process.env.INVESTOR_BASE_URL = 'https://homolog.loor.vc/';
    process.env.ENTREPRENEUR_BASE_URL = 'https://homolog.empresa.loor.vc';
    process.env.ADMIN_BASE_URL = 'https://homolog.admin.loor.vc';
    const urls = suggestedFrontendUrls('shared-fe-demo-a', ['investor', 'admin'], 'PATH');
    expect(urls.investor).toBe('https://homolog.loor.vc/w/shared-fe-demo-a');
    expect(urls.admin).toBe('https://homolog.admin.loor.vc/w/shared-fe-demo-a');
    expect(urls).not.toHaveProperty('entrepreneur');
  });

  it('urlMode PATH from env', () => {
    process.env.PROVISIONING_FRONTEND_URL_MODE = 'PATH';
    expect(normalizeFrontendUrlMode(undefined)).toBe('PATH');
  });
});
