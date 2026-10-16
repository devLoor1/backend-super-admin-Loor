import { BadRequestException, ConflictException } from '@nestjs/common';
import { defaultVisibilityMap, LOCKED_VISIBLE_MENU_IDS } from './menu-ids';
import { MenuVisibilityService } from './menu-visibility.service';

describe('MenuVisibilityService (Stage B)', () => {
  const audit = { write: jest.fn(async () => ({})) };
  let store: {
    id: string;
    scope: string;
    visibility: Record<string, boolean>;
    version: number;
    updatedBy: string | null;
    updatedAt: Date;
  } | null;

  const prisma = {
    menuVisibilityConfig: {
      findUnique: jest.fn(async () => store),
      upsert: jest.fn(async ({ create, update }: { create: typeof store; update: Record<string, unknown> }) => {
        if (!store) {
          store = {
            id: 'global',
            scope: 'global',
            visibility: create!.visibility as Record<string, boolean>,
            version: create!.version as number,
            updatedBy: create!.updatedBy as string,
            updatedAt: new Date(),
          };
          return store;
        }
        const nextVersion =
          typeof update.version === 'object' && update.version && 'increment' in (update.version as object)
            ? store.version + 1
            : store.version;
        store = {
          ...store,
          visibility: (update.visibility as Record<string, boolean>) ?? store.visibility,
          version: nextVersion,
          updatedBy: (update.updatedBy as string) ?? store.updatedBy,
          updatedAt: new Date(),
        };
        return store;
      }),
    },
  };

  const service = new MenuVisibilityService(prisma as never, audit as never);

  beforeEach(() => {
    store = null;
    jest.clearAllMocks();
  });

  it('GET forces locked ids to true and exposes version 0 when empty', async () => {
    const res = await service.get();
    expect(res.data.version).toBe(0);
    for (const id of LOCKED_VISIBLE_MENU_IDS) {
      expect(res.data.visibility[id]).toBe(true);
    }
  });

  it('PUT rejects hiding dashboard', async () => {
    const visibility = { ...defaultVisibilityMap(), dashboard: false };
    await expect(
      service.put(visibility, { operatorId: 'op-1', version: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('PUT rejects hiding configuracoes', async () => {
    const visibility = { ...defaultVisibilityMap(), configuracoes: false };
    await expect(
      service.put(visibility, { operatorId: 'op-1', version: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('PUT creates row and returns version 1', async () => {
    const visibility = { ...defaultVisibilityMap(), contas: false };
    const res = await service.put(visibility, { operatorId: 'op-1', version: 0 });
    expect(res.data.version).toBe(1);
    expect(res.data.visibility.contas).toBe(false);
    expect(res.data.visibility.dashboard).toBe(true);
    expect(audit.write).toHaveBeenCalled();
  });

  it('PUT conflicts when version mismatches', async () => {
    store = {
      id: 'global',
      scope: 'global',
      visibility: defaultVisibilityMap(),
      version: 2,
      updatedBy: 'op-1',
      updatedAt: new Date(),
    };
    await expect(
      service.put(defaultVisibilityMap(), { operatorId: 'op-2', version: 1 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not fail HTTP when audit throws after successful write', async () => {
    audit.write.mockRejectedValueOnce(new Error('audit down'));
    const res = await service.put(defaultVisibilityMap(), { operatorId: 'op-1', version: 0 });
    expect(res.data.version).toBe(1);
  });
});
