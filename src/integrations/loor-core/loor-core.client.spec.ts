import { of } from 'rxjs';
import { LoorCoreClient } from './loor-core.client';
import { LoorCoreException } from './loor-core.exception';

describe('LoorCoreClient', () => {
  const http = {
    request: jest.fn(),
  };
  const config = {
    get: jest.fn((key: string) => {
      const map: Record<string, unknown> = {
        'loorCore.baseUrl': 'http://core.test',
        'loorCore.timeoutMs': 1000,
        'loorCore.clientId': 'loor-super-admin',
      };
      return map[key];
    }),
  };
  const auth = {
    mintServiceToken: jest.fn(() => 'service-token'),
  };

  const client = new LoorCoreClient(http as never, config as never, auth as never);

  it('injects service auth and correlation headers', async () => {
    http.request.mockReturnValue(
      of({ status: 200, data: { ok: true } }),
    );

    const result = await client.request({
      method: 'GET',
      path: '/internal/super-admin/v1/health',
      correlationId: 'corr-1',
    });

    expect(result.data).toEqual({ ok: true });
    expect(http.request).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer service-token',
          'X-Service-Name': 'loor-super-admin',
          'X-Correlation-ID': 'corr-1',
        }),
      }),
    );
  });

  it('maps core failures to LoorCoreException', async () => {
    http.request.mockReturnValue(
      of({ status: 500, data: { message: 'boom' } }),
    );

    await expect(
      client.request({ method: 'GET', path: '/internal/super-admin/v1/health' }),
    ).rejects.toBeInstanceOf(LoorCoreException);
  });
});
