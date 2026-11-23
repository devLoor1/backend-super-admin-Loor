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
const ASSET_REF = '3f6c1c52-8a1e-4d0e-9f4b-0a5d2f3a9b11';
const IMAGE_BYTES = Buffer.from('FAKE-PNG-BYTES-0123456789');

function brandFile() {
  return {
    buffer: IMAGE_BYTES,
    mimetype: 'image/png',
    originalname: 'brand.png',
    size: IMAGE_BYTES.length,
  };
}

function baseDto(
  overrides: Partial<CreateProvisioningDto> = {},
): CreateProvisioningDto {
  return {
    name: 'Acme Capital',
    slug: 'acme-capital',
    baseUrl: 'https://acme-capital.wallet.loor.vc',
    // Unit tests pin HOSTNAME so local Nest .env PATH mode does not skew expectations.
    urlMode: 'HOSTNAME',
    skipDnsCheck: true,
    ...overrides,
  } as CreateProvisioningDto;
}

function feUrls(slug = 'acme-capital') {
  return {
    investor: `https://${slug}.loor.vc`,
    entrepreneur: `https://${slug}.empresa.loor.vc`,
    admin: `https://${slug}.admin.loor.vc`,
  };
}

function feComplete(note?: string) {
  return {
    checklist: { investor: true, entrepreneur: true, admin: true },
    urls: feUrls(),
    ...(note ? { note } : {}),
  };
}

function dnsComplete() {
  const urls = feUrls();
  return {
    checklist: { resolves: true, https: true },
    hosts: {
      investor: { url: urls.investor, status: 'ok' as const, https: true },
      entrepreneur: {
        url: urls.entrepreneur,
        status: 'ok' as const,
        https: true,
      },
      admin: { url: urls.admin, status: 'ok' as const, https: true },
    },
  };
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
  const platformAssets = {
    upload: jest.fn(async (..._args: unknown[]): Promise<Row> => ({
      data: { asset_ref: ASSET_REF },
    })),
    replace: jest.fn(async (..._args: unknown[]): Promise<Row> => ({
      data: { asset_ref: ASSET_REF },
    })),
  };
  const audit = {
    write: jest.fn(async (..._args: unknown[]): Promise<Row> => ({})),
  };

  const secrets = new ProvisioningSecretsStore();
  const frontendReadiness = {
    verifyProvisioning: jest.fn(async (input: { slug: string }) => {
      const slug = String(input.slug || 'acme-capital');
      const urls = feUrls(slug);
      const environments = (
        ['investor', 'entrepreneur', 'admin'] as const
      ).map((environment) => ({
        environment,
        capability:
          environment === 'investor'
            ? 'INVESTOR'
            : environment === 'entrepreneur'
              ? 'ENTREPRENEUR'
              : 'ADMIN',
        url: urls[environment],
        host: new URL(urls[environment]).host,
        resolves: true,
        httpsOk: true,
        httpStatus: 200,
        bootstrapOk: true,
        bootstrapSlug: slug,
        expectedSlug: slug,
        status: 'ok' as const,
        error: null,
      }));
      return {
        mode: 'shared_frontend' as const,
        corePublicUrl: 'https://back.loor.vc/service',
        enabledEnvironments: ['INVESTOR', 'ENTREPRENEUR', 'ADMIN'] as const,
        environments,
        ok: true,
      };
    }),
  };
  const netlifyDomains = {
    isConfigured: jest.fn(() => false),
    ensureHostnameAliases: jest.fn(),
  };
  const steps = new ProvisioningStepsService(
    fake.prisma as never,
    whitelabels as never,
    administrators as never,
    platformConfig as never,
    smtp as never,
    gateways as never,
    terms as never,
    platformAssets as never,
    secrets,
    frontendReadiness as never,
    netlifyDomains as never,
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
    netlifyDomains as never,
  );

  return {
    ...fake,
    whitelabels,
    administrators,
    platformConfig,
    smtp,
    gateways,
    terms,
    platformAssets,
    audit,
    secrets,
    frontendReadiness,
    service,
  };
}

const statusOf = (
  res: { data: { steps: Array<{ key: K; status: S }> } },
  key: K,
) => res.data.steps.find((s) => s.key === key)?.status;

describe('WhitelabelProvisioningService (MVP)', () => {
  it('happy path: automatic FE/DNS readiness completes without manual gates', async () => {
    const t = setup();
    const done = await t.service.create(
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

    expect(done.data.status).toBe(ProvisioningStatus.COMPLETED);
    expect(done.data.currentStep).toBeNull();
    expect(done.data.whitelabelId).toBe(42);
    expect(statusOf(done, K.CREATE_TENANT)).toBe(S.SUCCESS);
    expect(statusOf(done, K.APPLY_SETTINGS_TEMPLATE)).toBe(S.SKIPPED);
    expect(statusOf(done, K.UPLOAD_BRAND)).toBe(S.SKIPPED);
    expect(statusOf(done, K.INITIAL_ADMIN)).toBe(S.SUCCESS);
    expect(statusOf(done, K.TERMS)).toBe(S.SUCCESS);
    expect(statusOf(done, K.SMTP)).toBe(S.SKIPPED);
    expect(statusOf(done, K.GATEWAY_CONFIG)).toBe(S.SKIPPED);
    expect(statusOf(done, K.FE_DEPLOY_CHECK)).toBe(S.SUCCESS);
    expect(statusOf(done, K.CONFIGURE_FRONTEND_DOMAINS)).toBe(S.SKIPPED);
    expect(statusOf(done, K.DNS_CHECK)).toBe(S.SKIPPED);
    expect(statusOf(done, K.VALIDATE)).toBe(S.SUCCESS);
    expect(statusOf(done, K.DELIVER)).toBe(S.SUCCESS);
    expect(done.data.progress).toEqual({
      completed: 12,
      total: 12,
      percentage: 100,
    });
    expect(t.whitelabels.create).toHaveBeenCalledTimes(1);
    expect(t.administrators.create).toHaveBeenCalledWith(
      '42',
      { email: 'ana@acme.example', password: ADMIN_PASSWORD, name: 'Ana' },
      expect.anything(),
    );
    expect(t.terms.publish).toHaveBeenCalledTimes(1);
    expect(t.frontendReadiness.verifyProvisioning).toHaveBeenCalled();
    expect(t.audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE_WHITELABEL_PROVISIONING' }),
    );
    expect(done.data.delivery).toMatchObject({
      slug: 'acme-capital',
      whitelabelId: 42,
      admin: { email: 'ana@acme.example', name: 'Ana' },
      urls: {
        primary: 'https://acme-capital.wallet.loor.vc',
        investor: 'https://acme-capital.loor.vc',
        entrepreneur: 'https://acme-capital.empresa.loor.vc',
        admin: 'https://acme-capital.admin.loor.vc',
      },
      suggestedUrls: {
        investor: 'https://acme-capital.loor.vc',
        entrepreneur: 'https://acme-capital.empresa.loor.vc',
        admin: 'https://acme-capital.admin.loor.vc',
      },
    });
    expect(
      done.data.steps.find((s) => s.key === K.FE_DEPLOY_CHECK)?.result,
    ).toMatchObject({
      mode: 'shared_frontend',
      urls: {
        investor: { url: 'https://acme-capital.loor.vc', status: 'ok' },
      },
    });
    expect(t.secrets.has(done.data.id)).toBe(false);
  });

  it('runs FE then DNS readiness automatically when DNS check is enabled', async () => {
    const t = setup();
    const done = await t.service.create(
      baseDto({ skipDnsCheck: false }),
      OPERATOR,
    );
    expect(done.data.status).toBe(ProvisioningStatus.COMPLETED);
    expect(statusOf(done, K.FE_DEPLOY_CHECK)).toBe(S.SUCCESS);
    expect(statusOf(done, K.DNS_CHECK)).toBe(S.SUCCESS);
    expect(t.frontendReadiness.verifyProvisioning.mock.calls.length).toBeGreaterThanOrEqual(
      2,
    );
    expect(
      done.data.steps.find((s) => s.key === K.DNS_CHECK)?.result,
    ).toMatchObject({
      hosts: {
        investor: {
          host: 'acme-capital.loor.vc',
          status: 'ok',
          https: true,
        },
      },
    });
    expect(done.data.delivery).toMatchObject({
      urls: {
        investor: 'https://acme-capital.loor.vc',
        entrepreneur: 'https://acme-capital.empresa.loor.vc',
        admin: 'https://acme-capital.admin.loor.vc',
      },
    });
  });

  it('fails FE_DEPLOY_CHECK when shared readiness fails', async () => {
    const t = setup();
    t.frontendReadiness.verifyProvisioning.mockResolvedValueOnce({
      mode: 'shared_frontend',
      corePublicUrl: 'https://back.loor.vc/service',
      enabledEnvironments: ['INVESTOR', 'ENTREPRENEUR', 'ADMIN'],
      environments: [
        {
          environment: 'investor',
          capability: 'INVESTOR',
          url: 'https://acme-capital.loor.vc',
          host: 'acme-capital.loor.vc',
          resolves: false,
          httpsOk: false,
          httpStatus: null,
          bootstrapOk: false,
          bootstrapSlug: null,
          expectedSlug: 'acme-capital',
          status: 'failed',
          error: 'DNS does not resolve',
        },
      ],
      ok: false,
    } as never);
    const failed = await t.service.create(baseDto(), OPERATOR);
    expect(failed.data.status).toBe(ProvisioningStatus.FAILED);
    expect(failed.data.currentStep).toBe(K.FE_DEPLOY_CHECK);
    expect(failed.data.errorCode).toBe('E_FRONTEND_READINESS_FAILED');
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
    // Force an in-flight provisioning (RUNNING is active; simulate by leaving PENDING).
    const first = await t.service.create(
      baseDto({ skipFeDeployCheck: true }),
      OPERATOR,
    );
    // Flip completed → RUNNING so a concurrent create is blocked.
    t.provisionings[0].status = ProvisioningStatus.RUNNING;
    t.provisionings[0].completedAt = null;
    await expect(t.service.create(baseDto(), OPERATOR)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(first.data.status).toBe(ProvisioningStatus.COMPLETED);
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

  it('completeManual rejects all steps (manual gates retired)', async () => {
    const t = setup();
    const created = await t.service.create(
      baseDto({ skipFeDeployCheck: true }),
      OPERATOR,
    );
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
        K.FE_DEPLOY_CHECK,
        feComplete(),
        OPERATOR,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'E_STEP_NOT_MANUAL' }),
    });
    await expect(
      t.service.completeManual(
        created.data.id,
        K.DNS_CHECK,
        dnsComplete(),
        OPERATOR,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'E_STEP_NOT_MANUAL' }),
    });
  });

  it('DELIVER keeps urls null when FE/DNS gates were skipped', async () => {
    const t = setup();
    const done = await t.service.create(
      baseDto({ skipFeDeployCheck: true, skipDnsCheck: true }),
      OPERATOR,
    );
    expect(done.data.status).toBe(ProvisioningStatus.COMPLETED);
    expect(done.data.delivery).toMatchObject({
      enabledEnvironments: ['INVESTOR', 'ENTREPRENEUR', 'ADMIN'],
      urls: {
        primary: 'https://acme-capital.wallet.loor.vc',
        investor: null,
        entrepreneur: null,
        admin: null,
      },
      suggestedUrls: {
        investor: 'https://acme-capital.loor.vc',
        entrepreneur: 'https://acme-capital.empresa.loor.vc',
        admin: 'https://acme-capital.admin.loor.vc',
      },
    });
  });

  it('Finapop-style: only INVESTOR+ADMIN verified; entrepreneur omitted from delivery', async () => {
    const t = setup();
    t.frontendReadiness.verifyProvisioning.mockImplementation((async (input: {
      slug: string;
      enabledEnvironments?: unknown;
    }) => {
      const slug = String(input.slug || 'acme-capital');
      const enabled = Array.isArray(input.enabledEnvironments)
        ? input.enabledEnvironments
        : ['INVESTOR', 'ADMIN'];
      const environments: Array<Record<string, unknown>> = [];
      if (enabled.includes('INVESTOR')) {
        environments.push({
          environment: 'investor',
          capability: 'INVESTOR',
          url: `https://${slug}.loor.vc`,
          host: `${slug}.loor.vc`,
          resolves: true,
          httpsOk: true,
          httpStatus: 200,
          bootstrapOk: true,
          bootstrapSlug: slug,
          expectedSlug: slug,
          status: 'ok',
          error: null,
        });
      }
      if (enabled.includes('ADMIN')) {
        environments.push({
          environment: 'admin',
          capability: 'ADMIN',
          url: `https://${slug}.admin.loor.vc`,
          host: `${slug}.admin.loor.vc`,
          resolves: true,
          httpsOk: true,
          httpStatus: 200,
          bootstrapOk: true,
          bootstrapSlug: slug,
          expectedSlug: slug,
          status: 'ok',
          error: null,
        });
      }
      return {
        mode: 'shared_frontend',
        corePublicUrl: 'https://back.loor.vc/service',
        enabledEnvironments: enabled,
        environments,
        ok: true,
      };
    }) as never);
    const created = await t.service.create(
      baseDto({
        enabledEnvironments: ['INVESTOR', 'ADMIN'],
        skipDnsCheck: true,
      }),
      OPERATOR,
    );
    expect(created.data.status).toBe(ProvisioningStatus.COMPLETED);
    expect(created.data.delivery).toMatchObject({
      enabledEnvironments: ['INVESTOR', 'ADMIN'],
      urls: {
        investor: 'https://acme-capital.loor.vc',
        admin: 'https://acme-capital.admin.loor.vc',
      },
    });
    const delivery = (
      await t.service.get(created.data.id)
    ).data.delivery as Row;
    expect(delivery.urls).not.toHaveProperty('entrepreneur');
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

describe('UPLOAD_BRAND', () => {
  const stepRes = (
    res: { data: { steps: Array<{ key: K }> } },
    key: K,
  ): Row | undefined =>
    res.data.steps.find((s) => s.key === key) as Row | undefined;

  it('no branding → SKIPPED with reason no_branding and nothing is called', async () => {
    const t = setup();
    const res = await t.service.create(
      baseDto({ skipFeDeployCheck: true }),
      OPERATOR,
    );
    expect(statusOf(res, K.UPLOAD_BRAND)).toBe(S.SKIPPED);
    expect(stepRes(res, K.UPLOAD_BRAND)?.result).toEqual({
      reason: 'no_branding',
    });
    expect(t.platformAssets.upload).not.toHaveBeenCalled();
    expect(t.platformConfig.update).not.toHaveBeenCalled();
  });

  it('email-only branding → SUCCESS via platformConfig.update(email_branding) and secrets discarded', async () => {
    const t = setup();
    const res = await t.service.create(
      baseDto({
        skipFeDeployCheck: true,
        branding: {
          email: {
            primary_color: '#112233',
            logo_url: 'https://cdn.acme.example/logo.png',
          },
        },
      }),
      OPERATOR,
    );

    expect(res.data.status).toBe(ProvisioningStatus.COMPLETED);
    expect(statusOf(res, K.UPLOAD_BRAND)).toBe(S.SUCCESS);
    expect(t.platformConfig.update).toHaveBeenCalledTimes(1);
    expect(t.platformConfig.update).toHaveBeenCalledWith(
      '42',
      {
        page: 'email_branding',
        key: 'config',
        value: {
          primary_color: '#112233',
          logo_url: 'https://cdn.acme.example/logo.png',
        },
      },
      expect.anything(),
    );
    expect(t.platformAssets.upload).not.toHaveBeenCalled();
    const step = stepRes(res, K.UPLOAD_BRAND)!;
    expect(step.payload).toEqual({
      hasEmail: true,
      hasLoginColor: false,
      hasMainAreaFile: false,
      mainAreaPages: [],
    });
    expect(step.result).toEqual({
      emailApplied: true,
      loginColorApplied: false,
    });
    expect(res.data.delivery).toMatchObject({ branding: { email: true } });
    expect(t.secrets.has(res.data.id)).toBe(false);
  });

  it('merges only provided email keys and allows explicit null to clear', async () => {
    const t = setup();
    await t.service.create(
      baseDto({
        skipFeDeployCheck: true,
        branding: { email: { logo_url: null } },
      }),
      OPERATOR,
    );
    expect(t.platformConfig.update).toHaveBeenCalledWith(
      '42',
      { page: 'email_branding', key: 'config', value: { logo_url: null } },
      expect.anything(),
    );
  });

  it('login color + main_area file: uploads once (slot main_area) and associates the default page', async () => {
    const t = setup();
    const res = await t.service.create(
      baseDto({
        skipFeDeployCheck: true,
        branding: { loginBrandPanelTextColor: '#ffffff' },
      }),
      OPERATOR,
      brandFile(),
    );

    expect(res.data.status).toBe(ProvisioningStatus.COMPLETED);
    expect(t.platformAssets.upload).toHaveBeenCalledTimes(1);
    const [wl, file, slot] = t.platformAssets.upload.mock.calls[0] as [
      string,
      Row,
      string,
    ];
    expect(wl).toBe('42');
    expect(slot).toBe('main_area');
    expect(file).toMatchObject({
      mimetype: 'image/png',
      originalname: 'brand.png',
      size: IMAGE_BYTES.length,
    });
    expect(file.buffer).toBe(IMAGE_BYTES);
    expect(t.platformAssets.replace).not.toHaveBeenCalled();

    const puts = t.platformConfig.update.mock.calls.map((c: unknown[]) => c[1]);
    expect(puts).toEqual([
      { page: 'login', key: 'brand_panel_text_color', value: '#ffffff' },
      {
        page: 'login',
        key: 'main_area_image',
        value: {
          capabilityId: 'platform.main_area_image',
          version: 1,
          enabled: true,
          assetRef: ASSET_REF,
        },
      },
    ]);
    expect(stepRes(res, K.UPLOAD_BRAND)?.result).toEqual({
      emailApplied: false,
      loginColorApplied: true,
      mainArea: { assetRef: ASSET_REF, pages: ['login'] },
    });
    expect(res.data.delivery).toMatchObject({
      branding: { email: false, mainAreaAssetRef: ASSET_REF },
    });
  });

  it('associates every requested page', async () => {
    const t = setup();
    await t.service.create(
      baseDto({
        skipFeDeployCheck: true,
        branding: {
          mainArea: { pages: ['login', 'register', 'quick_profile'] },
        },
      }),
      OPERATOR,
      brandFile(),
    );
    const pages = t.platformConfig.update.mock.calls
      .map((c: unknown[]) => c[1] as Row)
      .filter((b) => b.key === 'main_area_image')
      .map((b) => b.page as string);
    expect(pages).toEqual(['login', 'register', 'quick_profile']);
    expect(t.platformAssets.upload).toHaveBeenCalledTimes(1);
  });

  it('retry after a failed association uses replace on the same assetRef (upload never twice)', async () => {
    const t = setup();
    // email OK, then the main_area_image association fails once
    t.platformConfig.update
      .mockResolvedValueOnce({}) // email_branding
      .mockRejectedValueOnce(
        new LoorCoreException({
          message: 'Core API unavailable',
          status: 502,
          code: 'CORE_UNAVAILABLE',
        }),
      );

    const failed = await t.service.create(
      baseDto({
        skipFeDeployCheck: true,
        branding: { email: { primary_color: '#abcdef' } },
      }),
      OPERATOR,
      brandFile(),
    );
    expect(failed.data.status).toBe(ProvisioningStatus.FAILED);
    expect(failed.data.currentStep).toBe(K.UPLOAD_BRAND);
    expect(failed.data.errorCode).toBe('CORE_UNAVAILABLE');
    expect(statusOf(failed, K.UPLOAD_BRAND)).toBe(S.FAILED);
    // assetRef persisted for the idempotent retry, bytes never
    expect(stepRes(failed, K.UPLOAD_BRAND)?.result).toMatchObject({
      emailApplied: true,
      assetRef: ASSET_REF,
      pagesApplied: [],
    });
    expect(t.platformAssets.upload).toHaveBeenCalledTimes(1);

    const retried = await t.service.retry(failed.data.id, {}, OPERATOR);

    expect(retried.data.status).toBe(ProvisioningStatus.COMPLETED);
    expect(t.platformAssets.upload).toHaveBeenCalledTimes(1);
    expect(t.platformAssets.replace).toHaveBeenCalledTimes(1);
    expect(t.platformAssets.replace.mock.calls[0][0]).toBe('42');
    expect(t.platformAssets.replace.mock.calls[0][1]).toBe(ASSET_REF);
    // email was already applied → not re-sent
    const emailPuts = t.platformConfig.update.mock.calls.filter(
      (c: unknown[]) => (c[1] as Row).page === 'email_branding',
    );
    expect(emailPuts).toHaveLength(1);
    expect(stepRes(retried, K.UPLOAD_BRAND)?.result).toEqual({
      emailApplied: true,
      loginColorApplied: false,
      mainArea: { assetRef: ASSET_REF, pages: ['login'] },
    });
    expect(stepRes(retried, K.UPLOAD_BRAND)?.attempts).toBe(2);
    expect(t.secrets.has(failed.data.id)).toBe(false);
  });

  it('Core failure → UPLOAD_BRAND FAILED, earlier steps stay SUCCESS/SKIPPED, later steps stay PENDING', async () => {
    const t = setup();
    t.platformConfig.update.mockRejectedValueOnce(
      new LoorCoreException({
        message: 'bad branding',
        status: 422,
        code: 'E_VALIDATION',
      }),
    );
    const res = await t.service.create(
      baseDto({
        skipFeDeployCheck: true,
        initialAdmin: {
          email: 'ana@acme.example',
          temporaryPassword: ADMIN_PASSWORD,
        },
        branding: { email: { primary_color: '#000000' } },
      }),
      OPERATOR,
    );
    expect(res.data.status).toBe(ProvisioningStatus.FAILED);
    expect(res.data.errorCode).toBe('E_VALIDATION');
    expect(statusOf(res, K.CREATE_TENANT)).toBe(S.SUCCESS);
    expect(statusOf(res, K.APPLY_SETTINGS_TEMPLATE)).toBe(S.SKIPPED);
    expect(statusOf(res, K.UPLOAD_BRAND)).toBe(S.FAILED);
    expect(statusOf(res, K.INITIAL_ADMIN)).toBe(S.PENDING);
    expect(t.administrators.create).not.toHaveBeenCalled();
    expect(t.whitelabels.create).toHaveBeenCalledTimes(1);
  });

  it('a failed upload (no assetRef yet) retries with upload, not replace', async () => {
    const t = setup();
    t.platformAssets.upload.mockRejectedValueOnce(
      new LoorCoreException({
        message: 'upstream down',
        status: 502,
        code: 'CORE_UNAVAILABLE',
      }),
    );
    const failed = await t.service.create(
      baseDto({ skipFeDeployCheck: true }),
      OPERATOR,
      brandFile(),
    );
    expect(statusOf(failed, K.UPLOAD_BRAND)).toBe(S.FAILED);
    const done = await t.service.retry(failed.data.id, {}, OPERATOR);
    expect(done.data.status).toBe(ProvisioningStatus.COMPLETED);
    expect(t.platformAssets.upload).toHaveBeenCalledTimes(2);
    expect(t.platformAssets.replace).not.toHaveBeenCalled();
  });

  it('after a restart the file is gone → E_SECRETS_REQUIRED until branding is re-supplied on retry', async () => {
    const t = setup();
    t.platformAssets.upload.mockRejectedValueOnce(
      new LoorCoreException({
        message: 'down',
        status: 502,
        code: 'CORE_UNAVAILABLE',
      }),
    );
    const failed = await t.service.create(
      baseDto({ skipFeDeployCheck: true }),
      OPERATOR,
      brandFile(),
    );
    t.secrets.clear(failed.data.id); // simulated restart

    const still = await t.service.retry(failed.data.id, {}, OPERATOR);
    expect(still.data.status).toBe(ProvisioningStatus.FAILED);
    expect(still.data.errorCode).toBe('E_SECRETS_REQUIRED');
    expect(t.platformAssets.upload).toHaveBeenCalledTimes(1);

    const done = await t.service.retry(
      failed.data.id,
      { branding: { mainArea: { pages: ['register'] } } },
      OPERATOR,
      brandFile(),
    );
    expect(done.data.status).toBe(ProvisioningStatus.COMPLETED);
    expect(t.platformAssets.upload).toHaveBeenCalledTimes(2);
    expect((stepRes(done, K.UPLOAD_BRAND)?.result as Row).mainArea).toEqual({
      assetRef: ASSET_REF,
      pages: ['register'],
    });
  });

  it('payload / result / responses / audit / DB never contain bytes, base64 or passwords', async () => {
    const t = setup();
    const res = await t.service.create(
      baseDto({
        skipFeDeployCheck: true,
        initialAdmin: {
          email: 'ana@acme.example',
          temporaryPassword: ADMIN_PASSWORD,
        },
        branding: {
          email: {
            primary_color: '#123456',
            logo_url: 'https://cdn.acme.example/logo.png',
          },
          loginBrandPanelTextColor: '#fafafa',
        },
      }),
      OPERATOR,
      brandFile(),
    );
    expect(res.data.status).toBe(ProvisioningStatus.COMPLETED);

    const surfaces = JSON.stringify([
      res,
      t.steps.map((s) => ({ payload: s.payload, result: s.result })),
      t.provisionings,
      t.audit.write.mock.calls,
    ]);
    expect(surfaces).not.toContain(IMAGE_BYTES.toString('utf8'));
    expect(surfaces).not.toContain(IMAGE_BYTES.toString('base64'));
    expect(surfaces).not.toContain(ADMIN_PASSWORD);
    expect(surfaces).not.toContain('"type":"Buffer"');
    // the step payload carries flags only — no urls
    const payload = stepRes(res, K.UPLOAD_BRAND)?.payload as Row;
    expect(Object.keys(payload).sort()).toEqual([
      'hasEmail',
      'hasLoginColor',
      'hasMainAreaFile',
      'mainAreaPages',
    ]);
    expect(JSON.stringify(payload)).not.toContain('cdn.acme.example');
  });
});

describe('provisioning constants', () => {
  it('STEP_ORDER covers every step once, tenant first and deliver last', () => {
    expect(new Set(STEP_ORDER).size).toBe(12);
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
