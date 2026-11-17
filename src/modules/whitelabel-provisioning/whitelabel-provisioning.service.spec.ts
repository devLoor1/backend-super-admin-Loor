/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unused-vars, @typescript-eslint/no-unnecessary-type-assertion -- in-memory test doubles */
import {
  BadRequestException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  ProvisioningStatus,
  ProvisioningStepKey as K,
  ProvisioningStepStatus as S,
} from '@prisma/client';
import { LoorCoreException } from '../../integrations/loor-core/loor-core.exception';
import { CreateProvisioningDto } from './dto/create-provisioning.dto';
import { ProvisioningRunnerService } from './provisioning-runner.service';
import { ProvisioningSecretsStore } from './provisioning-secrets.store';
import { ProvisioningStepsService } from './provisioning-steps.service';
import {
  containsSecretLikeKey,
  isSettingsCellCopyable,
  scrubSecrets,
  STEP_ORDER,
} from './provisioning.constants';
import { WhitelabelProvisioningService } from './whitelabel-provisioning.service';

type Row = Record<string, any>;

/** Minimal in-memory Prisma double covering exactly what the provisioning module uses. */
function createFakePrisma() {
  const provisionings: Row[] = [];
  const steps: Row[] = [];
  let seq = 0;

  const matches = (row: Row, where: Row = {}) =>
    Object.entries(where).every(([field, cond]) => {
      if (cond && typeof cond === 'object' && 'in' in cond)
        return cond.in.includes(row[field]);
      return row[field] === cond;
    });

  const apply = (row: Row, data: Row) => {
    for (const [field, value] of Object.entries(data)) {
      if (value && typeof value === 'object' && 'increment' in value) {
        row[field] = (row[field] ?? 0) + value.increment;
      } else if (value !== undefined) {
        // Prisma.JsonNull / DbNull sentinels → null
        row[field] =
          value &&
          typeof value === 'object' &&
          (value as object).constructor?.name?.endsWith('JsonNull')
            ? null
            : value;
      }
    }
    row.updatedAt = new Date();
  };

  const withSteps = (row: Row | undefined, include?: Row) =>
    row
      ? {
          ...row,
          ...(include?.steps
            ? {
                steps: steps
                  .filter((s) => s.provisioningId === row.id)
                  .map((s) => ({ ...s })),
              }
            : {}),
        }
      : null;

  const prisma = {
    whitelabelProvisioning: {
      findFirst: jest.fn(async ({ where, orderBy, include }: Row) => {
        let rows = provisionings.filter((r) => matches(r, where));
        if (orderBy?.createdAt === 'desc') rows = [...rows].reverse();
        return withSteps(rows[0], include);
      }),
      findUnique: jest.fn(async ({ where, include }: Row) =>
        withSteps(
          provisionings.find((r) => r.id === where.id),
          include,
        ),
      ),
      create: jest.fn(async ({ data, include }: Row) => {
        const id = `prov-${(seq += 1)}`;
        const now = new Date();
        const { steps: nested, ...rest } = data;
        const row: Row = {
          id,
          whitelabelId: null,
          currentStep: null,
          errorCode: null,
          errorMessage: null,
          delivery: null,
          startedAt: null,
          completedAt: null,
          createdAt: now,
          updatedAt: now,
          ...rest,
        };
        provisionings.push(row);
        for (const s of nested.create) {
          steps.push({
            id: `step-${(seq += 1)}`,
            provisioningId: id,
            attempts: 0,
            payload: null,
            result: null,
            lastErrorCode: null,
            lastErrorMessage: null,
            startedAt: null,
            completedAt: null,
            createdAt: now,
            updatedAt: now,
            ...Object.fromEntries(
              Object.entries(s).filter(([, v]) => v !== undefined),
            ),
          });
        }
        return withSteps(row, include);
      }),
      update: jest.fn(async ({ where, data }: Row) => {
        const row = provisionings.find((r) => r.id === where.id)!;
        apply(row, data);
        return { ...row };
      }),
      updateMany: jest.fn(async ({ where, data }: Row) => {
        const rows = provisionings.filter((r) => matches(r, where));
        rows.forEach((r) => apply(r, data));
        return { count: rows.length };
      }),
    },
    whitelabelProvisioningStep: {
      update: jest.fn(async ({ where, data }: Row) => {
        const row = steps.find((r) => r.id === where.id)!;
        apply(row, data);
        return { ...row };
      }),
      updateMany: jest.fn(async ({ where, data }: Row) => {
        const rows = steps.filter((r) => matches(r, where));
        rows.forEach((r) => apply(r, data));
        return { count: rows.length };
      }),
    },
  };

  const stepOf = (provisioningId: string, key: K) =>
    steps.find((s) => s.provisioningId === provisioningId && s.key === key)!;

  return { prisma, provisionings, steps, stepOf };
}

const OPERATOR = { operatorId: 'op-1', correlationId: 'corr-1' };
const ADMIN_PASSWORD = 'S3cr3t-Admin-Pass!';
const SMTP_PASSWORD = 'smtp-pass-9999';

function baseDto(
  overrides: Partial<CreateProvisioningDto> = {},
): CreateProvisioningDto {
  return {
    name: 'Acme Capital',
    slug: 'acme-capital',
    baseUrl: 'https://acme-capital.wallet.loor.vc',
    skipDnsCheck: true,
    ...overrides,
  } as CreateProvisioningDto;
}

function setup() {
  const fake = createFakePrisma();

  const whitelabels = {
    findExactBySlug: jest.fn(
      async (..._args: unknown[]): Promise<Row | null> => null,
    ),
    create: jest.fn(async (..._args: unknown[]): Promise<Row> => ({
      data: { id: 42, slug: 'acme-capital' },
    })),
    detail: jest.fn(async (..._args: unknown[]): Promise<Row> => ({ id: 42 })),
  };
  const administrators = {
    list: jest.fn(async (..._args: unknown[]): Promise<Row> => ({
      data: { data: [], meta: { lastPage: 1 } },
    })),
    create: jest.fn(async (..._args: unknown[]): Promise<Row> => ({
      data: { id: 7 },
    })),
  };
  const platformConfig = {
    get: jest.fn(async (..._args: unknown[]): Promise<Row> => ({
      data: { provenance: [] },
    })),
    update: jest.fn(async (..._args: unknown[]): Promise<Row> => ({})),
  };
  const smtp = {
    update: jest.fn(async (..._args: unknown[]): Promise<Row> => ({})),
  };
  const gateways = {
    upsert: jest.fn(async (..._args: unknown[]): Promise<Row> => ({})),
  };
  const terms = {
    get: jest.fn(async (..._args: unknown[]): Promise<Row> => ({
      data: { current: null, history: [] },
    })),
    publish: jest.fn(async (..._args: unknown[]): Promise<Row> => ({
      data: { revision_id: 3 },
    })),
  };
  const audit = {
    write: jest.fn(async (..._args: unknown[]): Promise<Row> => ({})),
  };

  const secrets = new ProvisioningSecretsStore();
  const steps = new ProvisioningStepsService(
    fake.prisma as never,
    whitelabels as never,
    administrators as never,
    platformConfig as never,
    smtp as never,
    gateways as never,
    terms as never,
    secrets,
  );
  const runner = new ProvisioningRunnerService(
    fake.prisma as never,
    steps,
    secrets,
  );
  const service = new WhitelabelProvisioningService(
    fake.prisma as never,
    runner,
    secrets,
    audit as never,
  );

  return {
    ...fake,
    whitelabels,
    administrators,
    platformConfig,
    smtp,
    gateways,
    terms,
    audit,
    secrets,
    service,
  };
}

const statusOf = (
  res: { data: { steps: Array<{ key: K; status: S }> } },
  key: K,
) => res.data.steps.find((s) => s.key === key)?.status;

describe('WhitelabelProvisioningService (MVP)', () => {
  it('happy path: skips optional steps, pauses on manual gate, completes after manual confirm', async () => {
    const t = setup();
    const created = await t.service.create(
      baseDto({
        initialAdmin: {
          email: 'ana@acme.example',
          name: 'Ana',
          temporaryPassword: ADMIN_PASSWORD,
        },
        terms: { title: 'Termos', contentMarkdown: '# Termos' },
      }),
      OPERATOR,
    );

    expect(created.data.status).toBe(ProvisioningStatus.WAITING_MANUAL_ACTION);
    expect(created.data.currentStep).toBe(K.FE_DEPLOY_CHECK);
    expect(created.data.whitelabelId).toBe(42);
    expect(statusOf(created, K.CREATE_TENANT)).toBe(S.SUCCESS);
    expect(statusOf(created, K.APPLY_SETTINGS_TEMPLATE)).toBe(S.SKIPPED);
    expect(statusOf(created, K.UPLOAD_BRAND)).toBe(S.SKIPPED);
    expect(statusOf(created, K.INITIAL_ADMIN)).toBe(S.SUCCESS);
    expect(statusOf(created, K.TERMS)).toBe(S.SUCCESS);
    expect(statusOf(created, K.SMTP)).toBe(S.SKIPPED);
    expect(statusOf(created, K.GATEWAY_CONFIG)).toBe(S.SKIPPED);
    expect(statusOf(created, K.FE_DEPLOY_CHECK)).toBe(S.WAITING_MANUAL_ACTION);
    expect(statusOf(created, K.DNS_CHECK)).toBe(S.SKIPPED);
    expect(statusOf(created, K.VALIDATE)).toBe(S.PENDING);
    expect(created.data.progress).toEqual({
      completed: 8,
      total: 11,
      percentage: 73,
    });
    expect(t.whitelabels.create).toHaveBeenCalledTimes(1);
    expect(t.administrators.create).toHaveBeenCalledWith(
      '42',
      { email: 'ana@acme.example', password: ADMIN_PASSWORD, name: 'Ana' },
      expect.anything(),
    );
    expect(t.terms.publish).toHaveBeenCalledTimes(1);
    expect(t.audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE_WHITELABEL_PROVISIONING' }),
    );

    const done = await t.service.completeManual(
      created.data.id,
      K.FE_DEPLOY_CHECK,
      {
        checklist: { investor: true, entrepreneur: true, admin: true },
        note: 'ok',
      },
      OPERATOR,
    );

    expect(done.data.status).toBe(ProvisioningStatus.COMPLETED);
    expect(done.data.currentStep).toBeNull();
    expect(done.data.progress).toEqual({
      completed: 11,
      total: 11,
      percentage: 100,
    });
    expect(statusOf(done, K.VALIDATE)).toBe(S.SUCCESS);
    expect(statusOf(done, K.DELIVER)).toBe(S.SUCCESS);
    expect(done.data.delivery).toMatchObject({
      slug: 'acme-capital',
      whitelabelId: 42,
      admin: { email: 'ana@acme.example', name: 'Ana' },
      urls: { primary: 'https://acme-capital.wallet.loor.vc' },
      suggestedUrls: {
        entrepreneur: 'https://acme-capital.empresa.loor.vc',
        admin: 'https://acme-capital.admin.loor.vc',
      },
    });
    expect(t.secrets.has(created.data.id)).toBe(false);
  });

  it('parks on both manual gates in order (FE then DNS)', async () => {
    const t = setup();
    const created = await t.service.create(
      baseDto({ skipDnsCheck: false }),
      OPERATOR,
    );
    expect(created.data.currentStep).toBe(K.FE_DEPLOY_CHECK);

    const afterFe = await t.service.completeManual(
      created.data.id,
      K.FE_DEPLOY_CHECK,
      { checklist: { investor: true, entrepreneur: true, admin: true } },
      OPERATOR,
    );
    expect(afterFe.data.status).toBe(ProvisioningStatus.WAITING_MANUAL_ACTION);
    expect(afterFe.data.currentStep).toBe(K.DNS_CHECK);

    const afterDns = await t.service.completeManual(
      created.data.id,
      K.DNS_CHECK,
      { checklist: { resolves: true, https: true } },
      OPERATOR,
    );
    expect(afterDns.data.status).toBe(ProvisioningStatus.COMPLETED);
  });

  it('completes without pausing when both manual checks are skipped', async () => {
    const t = setup();
    const res = await t.service.create(
      baseDto({ skipFeDeployCheck: true }),
      OPERATOR,
    );
    expect(res.data.status).toBe(ProvisioningStatus.COMPLETED);
    expect(res.data.delivery).toMatchObject({ admin: null });
  });

  it('slug already exists in Core → binds it and never calls create', async () => {
    const t = setup();
    t.whitelabels.findExactBySlug.mockResolvedValueOnce({
      id: 99,
      slug: 'acme-capital',
    });

    const res = await t.service.create(
      baseDto({ skipFeDeployCheck: true }),
      OPERATOR,
    );

    expect(t.whitelabels.create).not.toHaveBeenCalled();
    expect(res.data.whitelabelId).toBe(99);
    expect(res.data.status).toBe(ProvisioningStatus.COMPLETED);
    expect(
      res.data.steps.find((s) => s.key === K.CREATE_TENANT)?.result,
    ).toMatchObject({
      whitelabelId: 99,
      source: 'existing',
    });
  });

  it('E_SLUG_TAKEN on create → re-finds by slug and binds', async () => {
    const t = setup();
    t.whitelabels.findExactBySlug
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 55, slug: 'acme-capital' });
    t.whitelabels.create.mockRejectedValueOnce(
      new ConflictException({ code: 'E_SLUG_TAKEN', message: 'taken' }),
    );

    const res = await t.service.create(
      baseDto({ skipFeDeployCheck: true }),
      OPERATOR,
    );

    expect(t.whitelabels.create).toHaveBeenCalledTimes(1);
    expect(res.data.whitelabelId).toBe(55);
    expect(res.data.status).toBe(ProvisioningStatus.COMPLETED);
  });

  it('rejects a second provisioning for the same slug while one is active (409)', async () => {
    const t = setup();
    await t.service.create(baseDto(), OPERATOR); // parks on FE_DEPLOY_CHECK
    await expect(t.service.create(baseDto(), OPERATOR)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(t.whitelabels.create).toHaveBeenCalledTimes(1);
  });

  it('retry only re-runs the failed step (CREATE_TENANT and earlier steps are not repeated)', async () => {
    const t = setup();
    t.terms.publish.mockRejectedValueOnce(
      new LoorCoreException({
        message: 'Core API unavailable',
        status: 502,
        code: 'CORE_UNAVAILABLE',
      }),
    );

    const failed = await t.service.create(
      baseDto({
        skipFeDeployCheck: true,
        initialAdmin: {
          email: 'ana@acme.example',
          temporaryPassword: ADMIN_PASSWORD,
        },
        terms: { title: 'Termos', contentMarkdown: '# Termos' },
      }),
      OPERATOR,
    );

    expect(failed.data.status).toBe(ProvisioningStatus.FAILED);
    expect(failed.data.currentStep).toBe(K.TERMS);
    expect(failed.data.errorCode).toBe('CORE_UNAVAILABLE');
    expect(statusOf(failed, K.TERMS)).toBe(S.FAILED);
    expect(statusOf(failed, K.INITIAL_ADMIN)).toBe(S.SUCCESS);
    expect(statusOf(failed, K.SMTP)).toBe(S.SKIPPED);
    expect(failed.data.steps.find((s) => s.key === K.TERMS)?.attempts).toBe(1);

    // CREATE_TENANT already SUCCESS → explicitly not retryable
    await expect(
      t.service.retry(failed.data.id, { stepKey: K.CREATE_TENANT }, OPERATOR),
    ).rejects.toBeInstanceOf(ConflictException);
    // non-failed step → not retryable either
    await expect(
      t.service.retry(failed.data.id, { stepKey: K.INITIAL_ADMIN }, OPERATOR),
    ).rejects.toBeInstanceOf(ConflictException);

    const retried = await t.service.retry(failed.data.id, {}, OPERATOR);

    expect(retried.data.status).toBe(ProvisioningStatus.COMPLETED);
    expect(retried.data.errorCode).toBeNull();
    expect(t.terms.publish).toHaveBeenCalledTimes(2);
    expect(t.whitelabels.create).toHaveBeenCalledTimes(1);
    expect(t.whitelabels.findExactBySlug).toHaveBeenCalledTimes(1);
    expect(t.administrators.create).toHaveBeenCalledTimes(1);
    expect(retried.data.steps.find((s) => s.key === K.TERMS)?.attempts).toBe(2);
    expect(
      retried.data.steps.find((s) => s.key === K.CREATE_TENANT)?.attempts,
    ).toBe(1);
  });

  it('retry is rejected unless the provisioning is FAILED', async () => {
    const t = setup();
    const waiting = await t.service.create(baseDto(), OPERATOR);
    await expect(
      t.service.retry(waiting.data.id, {}, OPERATOR),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('initial admin that already exists on the tenant → SUCCESS without creating', async () => {
    const t = setup();
    t.administrators.list.mockResolvedValueOnce({
      data: {
        data: [{ id: 5, email: 'ANA@acme.example' }],
        meta: { lastPage: 1 },
      },
    } as never);

    const res = await t.service.create(
      baseDto({
        skipFeDeployCheck: true,
        initialAdmin: {
          email: 'ana@acme.example',
          temporaryPassword: ADMIN_PASSWORD,
        },
      }),
      OPERATOR,
    );

    expect(t.administrators.create).not.toHaveBeenCalled();
    expect(statusOf(res, K.INITIAL_ADMIN)).toBe(S.SUCCESS);
    expect(
      res.data.steps.find((s) => s.key === K.INITIAL_ADMIN)?.result,
    ).toMatchObject({
      source: 'existing',
      adminId: 5,
    });
    expect(res.data.status).toBe(ProvisioningStatus.COMPLETED);
  });

  it('E_EMAIL_TAKEN: succeeds only when the admin is on this tenant, otherwise fails', async () => {
    const t = setup();
    t.administrators.create.mockRejectedValueOnce(
      new LoorCoreException({
        message: 'email taken',
        status: 409,
        code: 'E_EMAIL_TAKEN',
      }),
    );
    // 1st list (pre-check): empty (default); 2nd list (after conflict): present
    t.administrators.list
      .mockResolvedValueOnce({ data: { data: [], meta: { lastPage: 1 } } })
      .mockResolvedValueOnce({
        data: {
          data: [{ id: 8, email: 'ana@acme.example' }],
          meta: { lastPage: 1 },
        },
      } as never);
    const ok = await t.service.create(
      baseDto({
        skipFeDeployCheck: true,
        initialAdmin: {
          email: 'ana@acme.example',
          temporaryPassword: ADMIN_PASSWORD,
        },
      }),
      OPERATOR,
    );
    expect(statusOf(ok, K.INITIAL_ADMIN)).toBe(S.SUCCESS);

    const t2 = setup();
    t2.administrators.create.mockRejectedValueOnce(
      new LoorCoreException({
        message: 'email taken',
        status: 409,
        code: 'E_EMAIL_TAKEN',
      }),
    );
    const bad = await t2.service.create(
      baseDto({
        skipFeDeployCheck: true,
        initialAdmin: {
          email: 'ana@acme.example',
          temporaryPassword: ADMIN_PASSWORD,
        },
      }),
      OPERATOR,
    );
    expect(bad.data.status).toBe(ProvisioningStatus.FAILED);
    expect(bad.data.errorCode).toBe('E_EMAIL_TAKEN');
  });

  it('completeManual rejects non-manual steps such as CREATE_TENANT', async () => {
    const t = setup();
    const created = await t.service.create(baseDto(), OPERATOR);
    await expect(
      t.service.completeManual(
        created.data.id,
        K.CREATE_TENANT,
        { checklist: {} },
        OPERATOR,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      t.service.completeManual(
        created.data.id,
        K.VALIDATE,
        { checklist: {} },
        OPERATOR,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('completeManual requires every relevant checklist item to be true', async () => {
    const t = setup();
    const created = await t.service.create(baseDto(), OPERATOR);
    await expect(
      t.service.completeManual(
        created.data.id,
        K.FE_DEPLOY_CHECK,
        { checklist: { investor: true, entrepreneur: true, admin: false } },
        OPERATOR,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    // wrong checklist family for the gate
    await expect(
      t.service.completeManual(
        created.data.id,
        K.FE_DEPLOY_CHECK,
        { checklist: { resolves: true, https: true } },
        OPERATOR,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    const still = await t.service.get(created.data.id);
    expect(still.data.status).toBe(ProvisioningStatus.WAITING_MANUAL_ACTION);
  });

  it('completeManual cannot complete a gate that is not waiting', async () => {
    const t = setup();
    const created = await t.service.create(
      baseDto({ skipDnsCheck: false }),
      OPERATOR,
    );
    // DNS_CHECK is still PENDING (runner has not reached it)
    await expect(
      t.service.completeManual(
        created.data.id,
        K.DNS_CHECK,
        { checklist: { resolves: true, https: true } },
        OPERATOR,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('copies only stored + allowlisted settings cells from the template', async () => {
    const t = setup();
    t.platformConfig.get.mockResolvedValueOnce({
      data: {
        provenance: [
          {
            page: 'login',
            key: 'title',
            stored: true,
            storedValue: 'Bem-vindo',
          },
          {
            page: 'login',
            key: 'main_area_image',
            stored: true,
            storedValue: 'asset-1',
          },
          {
            page: 'features',
            key: 'wallet_visible',
            stored: true,
            storedValue: false,
          },
          {
            page: 'features',
            key: 'other_flag',
            stored: false,
            storedValue: null,
          },
          {
            page: 'email_branding',
            key: 'config',
            stored: true,
            storedValue: { apiKey: 'x' },
          },
          { page: 'gateways', key: 'items', stored: true, storedValue: [] },
          {
            page: 'terminology',
            key: 'config',
            stored: true,
            storedValue: { a: 'b' },
          },
        ],
      },
    } as never);

    const res = await t.service.create(
      baseDto({ skipFeDeployCheck: true, templateFromWhitelabelId: 8 }),
      OPERATOR,
    );

    expect(res.data.status).toBe(ProvisioningStatus.COMPLETED);
    const puts = t.platformConfig.update.mock.calls.map((c: unknown[]) => c[1]);
    expect(puts).toEqual([
      { page: 'login', key: 'title', value: 'Bem-vindo' },
      { page: 'features', key: 'wallet_visible', value: false },
      { page: 'terminology', key: 'config', value: { a: 'b' } },
    ]);
    expect(t.platformConfig.update.mock.calls[0][0]).toBe('42');
    const result = res.data.steps.find(
      (s) => s.key === K.APPLY_SETTINGS_TEMPLATE,
    )?.result as Row;
    expect(result.copied).toEqual([
      'login.title',
      'features.wallet_visible',
      'terminology.config',
    ]);
    expect(result.skipped).toEqual(
      expect.arrayContaining([
        { cell: 'login.main_area_image', reason: 'not_allowlisted' },
        { cell: 'email_branding.config', reason: 'secret_like_content' },
        { cell: 'gateways.items', reason: 'not_allowlisted' },
      ]),
    );
  });

  it('SMTP / gateway / terms use the dedicated services with the stored secrets', async () => {
    const t = setup();
    const res = await t.service.create(
      baseDto({
        skipFeDeployCheck: true,
        smtp: {
          host: 'smtp.acme.example',
          port: 587,
          username: 'u',
          password: SMTP_PASSWORD,
        },
        gateway: { items: [{ provider: 'x', apiKey: 'k-123456' }] },
      }),
      OPERATOR,
    );
    expect(res.data.status).toBe(ProvisioningStatus.COMPLETED);
    expect(t.smtp.update).toHaveBeenCalledWith(
      '42',
      expect.objectContaining({ password: SMTP_PASSWORD }),
      expect.anything(),
    );
    expect(t.gateways.upsert).toHaveBeenCalledWith(
      '42',
      { items: [{ provider: 'x', apiKey: 'k-123456' }] },
      expect.anything(),
    );
  });

  it('secrets never reach step payload/result, responses, error messages or audit', async () => {
    const t = setup();
    t.smtp.update.mockRejectedValueOnce(
      new LoorCoreException({
        message: `auth failed for password ${SMTP_PASSWORD}`,
        status: 422,
        code: 'E_VALIDATION',
      }),
    );

    const created = await t.service.create(
      baseDto({
        skipFeDeployCheck: true,
        initialAdmin: {
          email: 'ana@acme.example',
          name: 'Ana',
          temporaryPassword: ADMIN_PASSWORD,
        },
        smtp: {
          host: 'smtp.acme.example',
          port: 587,
          username: 'smtp-user-x',
          password: SMTP_PASSWORD,
        },
        gateway: { items: [{ provider: 'x', apiKey: 'key-abcdef-123' }] },
      }),
      OPERATOR,
    );
    expect(created.data.status).toBe(ProvisioningStatus.FAILED);
    expect(created.data.errorMessage).not.toContain(SMTP_PASSWORD);

    // fix and finish
    const done = await t.service.retry(created.data.id, {}, OPERATOR);
    expect(done.data.status).toBe(ProvisioningStatus.COMPLETED);

    const forbidden = [
      ADMIN_PASSWORD,
      SMTP_PASSWORD,
      'smtp-user-x',
      'key-abcdef-123',
    ];
    const surfaces = JSON.stringify([
      created,
      done,
      t.steps.map((s) => ({
        payload: s.payload,
        result: s.result,
        e: s.lastErrorMessage,
      })),
      t.provisionings,
      t.audit.write.mock.calls,
    ]);
    for (const secret of forbidden) {
      expect(surfaces).not.toContain(secret);
    }

    // payload keeps a scrubbed SMTP snapshot and never the admin password
    const smtpPayload = done.data.steps.find((s) => s.key === K.SMTP)
      ?.payload as Row;
    expect(smtpPayload.config).toMatchObject({
      host: 'smtp.acme.example',
      password: '[REDACTED]',
      username: '[REDACTED]',
    });
    const adminStep = done.data.steps.find((s) => s.key === K.INITIAL_ADMIN);
    expect(adminStep?.payload).toEqual({
      email: 'ana@acme.example',
      name: 'Ana',
    });
  });

  it('after a restart (secrets lost) a secret-bearing step fails with E_SECRETS_REQUIRED until re-supplied on retry', async () => {
    const t = setup();
    const created = await t.service.create(
      baseDto({
        skipFeDeployCheck: true,
        smtp: { host: 'smtp.acme.example', port: 587, password: SMTP_PASSWORD },
      }),
      OPERATOR,
    );
    // Simulate: SMTP step failed, then the process restarted.
    t.smtp.update.mockClear();
    // Rewind SMTP → FAILED, provisioning → FAILED, secrets lost
    t.stepOf(created.data.id, K.SMTP).status = S.FAILED;
    t.stepOf(created.data.id, K.VALIDATE).status = S.PENDING;
    t.stepOf(created.data.id, K.DELIVER).status = S.PENDING;
    t.provisionings[0].status = ProvisioningStatus.FAILED;
    t.secrets.clear(created.data.id);

    const stillFailing = await t.service.retry(created.data.id, {}, OPERATOR);
    expect(stillFailing.data.status).toBe(ProvisioningStatus.FAILED);
    expect(stillFailing.data.errorCode).toBe('E_SECRETS_REQUIRED');
    expect(t.smtp.update).not.toHaveBeenCalled();

    const fixed = await t.service.retry(
      created.data.id,
      {
        smtp: { host: 'smtp.acme.example', port: 587, password: SMTP_PASSWORD },
      },
      OPERATOR,
    );
    expect(fixed.data.status).toBe(ProvisioningStatus.COMPLETED);
    expect(t.smtp.update).toHaveBeenCalledTimes(1);
  });

  it('getByWl returns the latest provisioning for a tenant; invalid ids are rejected', async () => {
    const t = setup();
    const created = await t.service.create(baseDto(), OPERATOR);
    const res = await t.service.getByWl('42');
    expect(res.data.id).toBe(created.data.id);
    await expect(t.service.getByWl('wl_proto_1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(t.service.getByWl('777')).rejects.toMatchObject({
      status: 404,
    });
    await expect(t.service.get('nope')).rejects.toMatchObject({ status: 404 });
  });

  it('does not block the pipeline when audit fails', async () => {
    const t = setup();
    t.audit.write.mockRejectedValue(new Error('audit down'));
    const res = await t.service.create(
      baseDto({ skipFeDeployCheck: true }),
      OPERATOR,
    );
    expect(res.data.status).toBe(ProvisioningStatus.COMPLETED);
  });
});

describe('provisioning constants', () => {
  it('STEP_ORDER covers every step once, tenant first and deliver last', () => {
    expect(new Set(STEP_ORDER).size).toBe(11);
    expect(STEP_ORDER[0]).toBe(K.CREATE_TENANT);
    expect(STEP_ORDER[STEP_ORDER.length - 1]).toBe(K.DELIVER);
  });

  it('settings allowlist excludes assets and secret-like cells', () => {
    expect(isSettingsCellCopyable('login', 'title')).toBe(true);
    expect(isSettingsCellCopyable('features', 'anything_flag')).toBe(true);
    expect(isSettingsCellCopyable('login', 'main_area_image')).toBe(false);
    expect(isSettingsCellCopyable('register', 'main_area_image')).toBe(false);
    expect(isSettingsCellCopyable('quick_profile', 'main_area_image')).toBe(
      false,
    );
    expect(isSettingsCellCopyable('smtp', 'password')).toBe(false);
    expect(isSettingsCellCopyable('features', 'api_token')).toBe(false);
  });

  it('scrubSecrets redacts nested secret-like keys and keeps the rest', () => {
    expect(
      scrubSecrets({
        host: 'h',
        password: 'p',
        nested: [{ apiKey: 'k', ok: 1 }],
        username: 'u',
      }),
    ).toEqual({
      host: 'h',
      password: '[REDACTED]',
      nested: [{ apiKey: '[REDACTED]', ok: 1 }],
      username: '[REDACTED]',
    });
    expect(containsSecretLikeKey({ a: { clientSecret: 'x' } })).toBe(true);
    expect(containsSecretLikeKey({ a: { color: 'x' } })).toBe(false);
  });
});
