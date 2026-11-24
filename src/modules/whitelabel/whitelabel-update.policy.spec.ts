import { UpdateWhitelabelDto } from './dto/update-whitelabel.dto';
import { WhitelabelService } from './whitelabel.service';

/**
 * Operational V1 — slug/baseUrl must never be forwarded on name update.
 * Rename/migration is a future dedicated operation.
 */
describe('Whitelabel update policy (Operational V1)', () => {
  it('UpdateWhitelabelDto only declares name', () => {
    const dto = new UpdateWhitelabelDto();
    dto.name = 'Acme';
    expect(Object.keys(dto).sort()).toEqual(['name']);
  });

  it('service update body is name-only even if extra keys appear on dto', async () => {
    const patchBodies: unknown[] = [];
    const row = {
      id: 1,
      name: 'Acme',
      slug: 'acme',
      baseUrl: 'https://acme.example',
      isActive: true,
      createdAt: null,
      updatedAt: null,
    };
    const core = {
      request: jest.fn(async (input: { method: string; body?: unknown }) => {
        if (input.method === 'PATCH') {
          patchBodies.push(input.body);
          return { data: { data: { ...row, name: 'Acme Renamed' } } };
        }
        return { data: { data: row } };
      }),
    };
    const audit = { write: jest.fn(async () => undefined) };
    const service = new WhitelabelService(core as never, audit as never);

    await service.update(
      '1',
      { name: '  Acme Renamed  ', slug: 'should-not-forward', baseUrl: 'https://evil' } as never,
      { operatorId: 'op-1' },
    );

    expect(patchBodies).toEqual([{ name: 'Acme Renamed' }]);
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE_WHITELABEL',
        result: 'success',
        afterData: { name: 'Acme Renamed' },
      }),
    );
  });
});
