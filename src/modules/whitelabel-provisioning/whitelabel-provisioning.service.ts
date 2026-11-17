import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  Prisma,
  ProvisioningStatus,
  ProvisioningStepKey,
  ProvisioningStepStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CompleteManualStepDto } from './dto/complete-manual-step.dto';
import { CreateProvisioningDto } from './dto/create-provisioning.dto';
import { RetryProvisioningDto } from './dto/retry-provisioning.dto';
import { ProvisioningRunnerService } from './provisioning-runner.service';
import {
  ProvisioningSecretsStore,
  ProvisioningSecrets,
} from './provisioning-secrets.store';
import {
  ProvisioningRunMeta,
  ProvisioningWithSteps,
} from './provisioning-steps.service';
import {
  ACTIVE_PROVISIONING_STATUSES,
  isManualGate,
  MANUAL_GATE_CHECKLIST,
  scrubSecrets,
  STEP_ORDER,
} from './provisioning.constants';

type RequestMeta = ProvisioningRunMeta;

@Injectable()
export class WhitelabelProvisioningService {
  private readonly logger = new Logger(WhitelabelProvisioningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly runner: ProvisioningRunnerService,
    private readonly secrets: ProvisioningSecretsStore,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------------------
  // create
  // ---------------------------------------------------------------------------

  async create(dto: CreateProvisioningDto, meta: RequestMeta) {
    const slug = dto.slug.trim().toLowerCase();

    const inFlight = await this.prisma.whitelabelProvisioning.findFirst({
      where: { slug, status: { in: [...ACTIVE_PROVISIONING_STATUSES] } },
      select: { id: true, status: true },
    });
    if (inFlight) {
      throw new ConflictException({
        code: 'E_PROVISIONING_IN_PROGRESS',
        message: `A provisioning for slug "${slug}" is already ${inFlight.status}`,
        provisioningId: inFlight.id,
      });
    }

    const skipFe = dto.skipFeDeployCheck === true;
    const skipDns = dto.skipDnsCheck === true;
    const now = new Date();

    const plan = this.planSteps(dto, { skipFe, skipDns });

    const created = await this.prisma.whitelabelProvisioning.create({
      data: {
        name: dto.name.trim(),
        slug,
        baseUrl: dto.baseUrl.trim(),
        status: ProvisioningStatus.PENDING,
        requestedBy: meta.operatorId,
        correlationId: meta.correlationId ?? null,
        templateFromWhitelabelId: dto.templateFromWhitelabelId ?? null,
        steps: {
          create: STEP_ORDER.map((key) => {
            const step = plan[key];
            return {
              key,
              status: step.skipReason
                ? ProvisioningStepStatus.SKIPPED
                : ProvisioningStepStatus.PENDING,
              payload: step.payload as Prisma.InputJsonValue | undefined,
              result: step.skipReason ? { reason: step.skipReason } : undefined,
              completedAt: step.skipReason ? now : undefined,
            };
          }),
        },
      },
      include: { steps: true },
    });

    // Secrets stay in memory only (see ProvisioningSecretsStore).
    const secrets: ProvisioningSecrets = {};
    if (dto.initialAdmin) {
      secrets.initialAdmin = {
        email: dto.initialAdmin.email.trim(),
        name: dto.initialAdmin.name,
        temporaryPassword: dto.initialAdmin.temporaryPassword,
      };
    }
    if (dto.smtp) secrets.smtp = dto.smtp;
    if (dto.gateway) secrets.gateway = { items: dto.gateway.items };
    this.secrets.set(created.id, secrets);

    await this.safeAudit({
      action: 'CREATE_WHITELABEL_PROVISIONING',
      superAdminId: meta.operatorId,
      resourceType: 'whitelabel_provisioning',
      resourceId: created.id,
      afterData: {
        name: created.name,
        slug: created.slug,
        baseUrl: created.baseUrl,
        templateFromWhitelabelId: created.templateFromWhitelabelId,
        options: {
          initialAdmin: Boolean(dto.initialAdmin),
          terms: Boolean(dto.terms),
          smtp: Boolean(dto.smtp),
          gateway: Boolean(dto.gateway),
          skipFeDeployCheck: skipFe,
          skipDnsCheck: skipDns,
        },
      },
      result: 'success',
      correlationId: meta.correlationId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    // Run until the first pause (manual gate / failure / completion) so the 201 reflects progress.
    await this.runner.run(created.id, meta);
    return this.get(created.id);
  }

  // ---------------------------------------------------------------------------
  // read
  // ---------------------------------------------------------------------------

  async get(id: string) {
    const row = await this.prisma.whitelabelProvisioning.findUnique({
      where: { id },
      include: { steps: true },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'E_PROVISIONING_NOT_FOUND',
        message: 'Provisioning not found',
      });
    }
    return { data: this.present(row) };
  }

  /** Latest provisioning bound to a Core Whitelabel id. */
  async getByWl(whitelabelId: string) {
    if (!/^\d+$/.test(whitelabelId)) {
      throw new BadRequestException({
        code: 'INVALID_WHITELABEL_ID',
        message: 'Whitelabel id must be a Core numeric id',
      });
    }
    const row = await this.prisma.whitelabelProvisioning.findFirst({
      where: { whitelabelId: Number(whitelabelId) },
      orderBy: { createdAt: 'desc' },
      include: { steps: true },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'E_PROVISIONING_NOT_FOUND',
        message: 'No provisioning found for this Whitelabel',
      });
    }
    return { data: this.present(row) };
  }

  // ---------------------------------------------------------------------------
  // retry
  // ---------------------------------------------------------------------------

  async retry(
    id: string,
    dto: RetryProvisioningDto | undefined,
    meta: RequestMeta,
  ) {
    const body = dto ?? {};
    const provisioning = await this.requireProvisioning(id);

    if (provisioning.status !== ProvisioningStatus.FAILED) {
      throw new ConflictException({
        code: 'E_PROVISIONING_NOT_FAILED',
        message: `Only FAILED provisionings can be retried (current: ${provisioning.status})`,
      });
    }

    const target = body.stepKey
      ? provisioning.steps.find((s) => s.key === body.stepKey)
      : STEP_ORDER.map((key) =>
          provisioning.steps.find((s) => s.key === key),
        ).find((s) => s?.status === ProvisioningStepStatus.FAILED);

    if (!target) {
      throw new ConflictException({
        code: 'E_NO_FAILED_STEP',
        message: 'There is no FAILED step to retry',
      });
    }
    if (
      target.key === ProvisioningStepKey.CREATE_TENANT &&
      target.status === ProvisioningStepStatus.SUCCESS
    ) {
      throw new ConflictException({
        code: 'E_STEP_NOT_RETRYABLE',
        message: 'CREATE_TENANT already succeeded and is never re-run',
      });
    }
    if (target.status !== ProvisioningStepStatus.FAILED) {
      throw new ConflictException({
        code: 'E_STEP_NOT_RETRYABLE',
        message: `Only FAILED steps can be retried (${target.key} is ${target.status})`,
      });
    }

    // Re-supplied secrets (after restart/expiry) — merged in memory, never persisted.
    const resupplied: ProvisioningSecrets = {};
    if (body.smtp) resupplied.smtp = body.smtp;
    if (body.initialAdmin) {
      resupplied.initialAdmin = {
        email: body.initialAdmin.email.trim(),
        name: body.initialAdmin.name,
        temporaryPassword: body.initialAdmin.temporaryPassword,
      };
    }
    if (body.gateway) resupplied.gateway = { items: body.gateway.items };
    this.secrets.set(id, resupplied);

    // Guard against concurrent retries: only one caller can flip FAILED → PENDING.
    const reset = await this.prisma.whitelabelProvisioningStep.updateMany({
      where: { id: target.id, status: ProvisioningStepStatus.FAILED },
      data: {
        status: ProvisioningStepStatus.PENDING,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });
    if (reset.count !== 1) {
      throw new ConflictException({
        code: 'E_RETRY_IN_PROGRESS',
        message: 'Step is no longer FAILED (another retry may be running)',
      });
    }

    await this.safeAudit({
      action: 'RETRY_WHITELABEL_PROVISIONING',
      superAdminId: meta.operatorId,
      resourceType: 'whitelabel_provisioning',
      resourceId: id,
      whitelabelId: provisioning.whitelabelId,
      afterData: {
        stepKey: target.key,
        attempts: target.attempts,
        secretsResupplied: Object.keys(resupplied),
      },
      result: 'success',
      correlationId: meta.correlationId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    // Runner flips FAILED → RUNNING under its own optimistic lock.
    await this.runner.run(id, meta);
    return this.get(id);
  }

  // ---------------------------------------------------------------------------
  // manual completion
  // ---------------------------------------------------------------------------

  async completeManual(
    id: string,
    stepKey: ProvisioningStepKey,
    dto: CompleteManualStepDto,
    meta: RequestMeta,
  ) {
    if (!isManualGate(stepKey)) {
      throw new BadRequestException({
        code: 'E_STEP_NOT_MANUAL',
        message: `${stepKey} is not a manual step. Allowed: FE_DEPLOY_CHECK, DNS_CHECK`,
      });
    }

    const provisioning = await this.requireProvisioning(id);
    const step = provisioning.steps.find((s) => s.key === stepKey);
    if (!step) {
      throw new NotFoundException({
        code: 'E_STEP_NOT_FOUND',
        message: 'Step not found',
      });
    }
    if (step.status !== ProvisioningStepStatus.WAITING_MANUAL_ACTION) {
      throw new ConflictException({
        code: 'E_STEP_NOT_WAITING',
        message: `${stepKey} is ${step.status}; only a step WAITING_MANUAL_ACTION can be completed`,
      });
    }

    const required = MANUAL_GATE_CHECKLIST[stepKey] ?? [];
    const checklist = (dto.checklist ?? {}) as Record<
      string,
      boolean | undefined
    >;
    const missing = required.filter((field) => checklist[field] !== true);
    if (missing.length > 0) {
      throw new UnprocessableEntityException({
        code: 'E_CHECKLIST_INCOMPLETE',
        message: `All checklist items must be true for ${stepKey}`,
        missing,
      });
    }

    const completedAt = new Date();
    const updated = await this.prisma.whitelabelProvisioningStep.updateMany({
      where: {
        id: step.id,
        status: ProvisioningStepStatus.WAITING_MANUAL_ACTION,
      },
      data: {
        status: ProvisioningStepStatus.SUCCESS,
        completedAt,
        result: scrubSecrets({
          checklist: Object.fromEntries(required.map((field) => [field, true])),
          note: dto.note?.trim() || null,
          completedBy: meta.operatorId,
          completedAt: completedAt.toISOString(),
        }),
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });
    if (updated.count !== 1) {
      throw new ConflictException({
        code: 'E_STEP_NOT_WAITING',
        message: `${stepKey} was already completed`,
      });
    }

    await this.safeAudit({
      action: 'COMPLETE_PROVISIONING_MANUAL_STEP',
      superAdminId: meta.operatorId,
      resourceType: 'whitelabel_provisioning',
      resourceId: id,
      whitelabelId: provisioning.whitelabelId,
      afterData: {
        stepKey,
        checklist: Object.fromEntries(required.map((f) => [f, true])),
      },
      result: 'success',
      correlationId: meta.correlationId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    await this.runner.run(id, meta);
    return this.get(id);
  }

  // ---------------------------------------------------------------------------
  // helpers
  // ---------------------------------------------------------------------------

  private async requireProvisioning(id: string) {
    const row = await this.prisma.whitelabelProvisioning.findUnique({
      where: { id },
      include: { steps: true },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'E_PROVISIONING_NOT_FOUND',
        message: 'Provisioning not found',
      });
    }
    return row;
  }

  /** Decides per step: payload (non-secret) and optional skip reason. */
  private planSteps(
    dto: CreateProvisioningDto,
    flags: { skipFe: boolean; skipDns: boolean },
  ): Record<
    ProvisioningStepKey,
    { payload?: Record<string, unknown>; skipReason?: string }
  > {
    const tenantPayload = {
      name: dto.name.trim(),
      slug: dto.slug,
      baseUrl: dto.baseUrl.trim(),
    };
    return {
      [ProvisioningStepKey.CREATE_TENANT]: { payload: tenantPayload },
      [ProvisioningStepKey.APPLY_SETTINGS_TEMPLATE]:
        dto.templateFromWhitelabelId == null
          ? { skipReason: 'no_template' }
          : {
              payload: {
                templateFromWhitelabelId: dto.templateFromWhitelabelId,
              },
            },
      // MVP: no brand bytes in the create payload → always skipped.
      [ProvisioningStepKey.UPLOAD_BRAND]: {
        skipReason: 'brand_upload_not_supported_in_mvp',
      },
      [ProvisioningStepKey.INITIAL_ADMIN]: dto.initialAdmin
        ? {
            // Never the password.
            payload: {
              email: dto.initialAdmin.email.trim(),
              name: dto.initialAdmin.name ?? null,
            },
          }
        : { skipReason: 'no_initial_admin' },
      [ProvisioningStepKey.TERMS]: dto.terms
        ? {
            payload: {
              title: dto.terms.title,
              contentMarkdown: dto.terms.contentMarkdown,
            },
          }
        : { skipReason: 'no_terms' },
      [ProvisioningStepKey.SMTP]: dto.smtp
        ? { payload: { config: scrubSecrets(dto.smtp) } }
        : { skipReason: 'no_smtp' },
      [ProvisioningStepKey.GATEWAY_CONFIG]: dto.gateway
        ? { payload: { itemsCount: dto.gateway.items.length } }
        : { skipReason: 'no_gateway' },
      [ProvisioningStepKey.FE_DEPLOY_CHECK]: flags.skipFe
        ? { skipReason: 'skip_requested' }
        : { payload: { manual: true } },
      [ProvisioningStepKey.DNS_CHECK]: flags.skipDns
        ? { skipReason: 'skip_requested' }
        : { payload: { manual: true } },
      [ProvisioningStepKey.VALIDATE]: {},
      [ProvisioningStepKey.DELIVER]: {},
    };
  }

  /** HTTP shape. Step payload/result are scrubbed again as defence in depth. */
  private present(row: ProvisioningWithSteps) {
    const ordered = STEP_ORDER.map((key) =>
      row.steps.find((s) => s.key === key),
    ).filter((s): s is ProvisioningWithSteps['steps'][number] => Boolean(s));
    const total = ordered.length;
    const completed = ordered.filter(
      (s) =>
        s.status === ProvisioningStepStatus.SUCCESS ||
        s.status === ProvisioningStepStatus.SKIPPED,
    ).length;

    return {
      id: row.id,
      whitelabelId: row.whitelabelId,
      name: row.name,
      slug: row.slug,
      baseUrl: row.baseUrl,
      status: row.status,
      currentStep: row.currentStep,
      requestedBy: row.requestedBy,
      correlationId: row.correlationId,
      templateFromWhitelabelId: row.templateFromWhitelabelId,
      errorCode: row.errorCode,
      errorMessage: row.errorMessage,
      progress: {
        completed,
        total,
        percentage: total === 0 ? 0 : Math.round((completed / total) * 100),
      },
      steps: ordered.map((s) => ({
        key: s.key,
        status: s.status,
        attempts: s.attempts,
        payload: s.payload == null ? null : scrubSecrets(s.payload),
        result: s.result == null ? null : scrubSecrets(s.result),
        lastErrorCode: s.lastErrorCode,
        lastErrorMessage: s.lastErrorMessage,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
      })),
      delivery: row.delivery ?? null,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private async safeAudit(input: Parameters<AuditService['write']>[0]) {
    try {
      await this.audit.write(input);
    } catch (error) {
      this.logger.error({
        msg: 'whitelabel_provisioning_audit_failed',
        action: input.action,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
