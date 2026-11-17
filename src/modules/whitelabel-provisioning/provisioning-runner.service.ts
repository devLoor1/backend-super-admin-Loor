import { HttpException, Injectable, Logger } from '@nestjs/common';
import {
  Prisma,
  ProvisioningStatus,
  ProvisioningStepStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { LoorCoreException } from '../../integrations/loor-core/loor-core.exception';
import { ProvisioningSecretsStore } from './provisioning-secrets.store';
import {
  ProvisioningRunMeta,
  ProvisioningStepError,
  ProvisioningStepsService,
  ProvisioningWithSteps,
} from './provisioning-steps.service';
import {
  isManualGate,
  scrubSecrets,
  STEP_ORDER,
  truncate,
} from './provisioning.constants';

const RUNNABLE_PROVISIONING: ProvisioningStatus[] = [
  ProvisioningStatus.PENDING,
  ProvisioningStatus.FAILED,
  ProvisioningStatus.WAITING_MANUAL_ACTION,
];

export type RunOutcome = {
  status: ProvisioningStatus;
  /** False when another worker already owns the run (or the provisioning is not runnable). */
  acquired: boolean;
};

/**
 * Walks STEP_ORDER from the first step that is not SUCCESS/SKIPPED until the provisioning
 * pauses (WAITING_MANUAL_ACTION), fails (FAILED) or completes (COMPLETED). Never throws for
 * step errors — they are persisted on the step and provisioning.
 */
@Injectable()
export class ProvisioningRunnerService {
  private readonly logger = new Logger(ProvisioningRunnerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly steps: ProvisioningStepsService,
    private readonly secrets: ProvisioningSecretsStore,
  ) {}

  async run(
    provisioningId: string,
    meta: ProvisioningRunMeta,
  ): Promise<RunOutcome> {
    // Optimistic lock: only one runner may flip the provisioning to RUNNING.
    const locked = await this.prisma.whitelabelProvisioning.updateMany({
      where: { id: provisioningId, status: { in: RUNNABLE_PROVISIONING } },
      data: {
        status: ProvisioningStatus.RUNNING,
        errorCode: null,
        errorMessage: null,
      },
    });
    if (locked.count !== 1) {
      const current = await this.prisma.whitelabelProvisioning.findUnique({
        where: { id: provisioningId },
      });
      return {
        status: current?.status ?? ProvisioningStatus.FAILED,
        acquired: false,
      };
    }

    try {
      return { status: await this.loop(provisioningId, meta), acquired: true };
    } catch (error) {
      // Infrastructure error (e.g. DB) outside a step: park as FAILED so it can be retried.
      const { code, message } = this.describe(provisioningId, error);
      this.logger.error({
        msg: 'provisioning_runner_crashed',
        provisioningId,
        code,
        message,
      });
      await this.prisma.whitelabelProvisioning
        .update({
          where: { id: provisioningId },
          data: {
            status: ProvisioningStatus.FAILED,
            errorCode: code,
            errorMessage: message,
          },
        })
        .catch(() => undefined);
      return { status: ProvisioningStatus.FAILED, acquired: true };
    }
  }

  private async loop(
    provisioningId: string,
    meta: ProvisioningRunMeta,
  ): Promise<ProvisioningStatus> {
    for (;;) {
      const provisioning = await this.load(provisioningId);
      if (!provisioning.startedAt) {
        await this.prisma.whitelabelProvisioning.update({
          where: { id: provisioningId },
          data: { startedAt: new Date() },
        });
      }

      const next = STEP_ORDER.map((key) =>
        provisioning.steps.find((s) => s.key === key),
      ).find(
        (step) =>
          step &&
          step.status !== ProvisioningStepStatus.SUCCESS &&
          step.status !== ProvisioningStepStatus.SKIPPED,
      );

      if (!next) {
        await this.prisma.whitelabelProvisioning.update({
          where: { id: provisioningId },
          data: {
            status: ProvisioningStatus.COMPLETED,
            currentStep: null,
            completedAt: new Date(),
            errorCode: null,
            errorMessage: null,
          },
        });
        this.secrets.clear(provisioningId);
        return ProvisioningStatus.COMPLETED;
      }

      // Manual gate: park and wait for Ops.
      if (
        isManualGate(next.key) ||
        next.status === ProvisioningStepStatus.WAITING_MANUAL_ACTION
      ) {
        if (next.status === ProvisioningStepStatus.PENDING) {
          await this.prisma.whitelabelProvisioningStep.updateMany({
            where: { id: next.id, status: ProvisioningStepStatus.PENDING },
            data: {
              status: ProvisioningStepStatus.WAITING_MANUAL_ACTION,
              startedAt: new Date(),
            },
          });
        }
        await this.prisma.whitelabelProvisioning.update({
          where: { id: provisioningId },
          data: {
            status: ProvisioningStatus.WAITING_MANUAL_ACTION,
            currentStep: next.key,
          },
        });
        return ProvisioningStatus.WAITING_MANUAL_ACTION;
      }

      const claimed = await this.prisma.whitelabelProvisioningStep.updateMany({
        where: {
          id: next.id,
          status: {
            in: [ProvisioningStepStatus.PENDING, ProvisioningStepStatus.FAILED],
          },
        },
        data: {
          status: ProvisioningStepStatus.RUNNING,
          attempts: { increment: 1 },
          startedAt: new Date(),
          completedAt: null,
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      });
      if (claimed.count !== 1) {
        // Step is RUNNING elsewhere (stale/crashed worker) — do not double execute.
        await this.prisma.whitelabelProvisioning.update({
          where: { id: provisioningId },
          data: {
            status: ProvisioningStatus.FAILED,
            currentStep: next.key,
            errorCode: 'E_STEP_NOT_CLAIMABLE',
            errorMessage: `Step ${next.key} is in status ${next.status} and cannot be claimed`,
          },
        });
        return ProvisioningStatus.FAILED;
      }

      await this.prisma.whitelabelProvisioning.update({
        where: { id: provisioningId },
        data: { currentStep: next.key },
      });

      try {
        const outcome = await this.steps.execute({
          provisioning,
          step: { ...next, status: ProvisioningStepStatus.RUNNING },
          meta,
        });
        await this.prisma.whitelabelProvisioningStep.update({
          where: { id: next.id },
          data: {
            status:
              outcome.status === 'SKIPPED'
                ? ProvisioningStepStatus.SKIPPED
                : ProvisioningStepStatus.SUCCESS,
            result: this.json(outcome.result),
            completedAt: new Date(),
            lastErrorCode: null,
            lastErrorMessage: null,
          },
        });
      } catch (error) {
        const { code, message } = this.describe(provisioningId, error);
        this.logger.warn({
          msg: 'provisioning_step_failed',
          provisioningId,
          step: next.key,
          code,
        });
        await this.prisma.whitelabelProvisioningStep.update({
          where: { id: next.id },
          data: {
            status: ProvisioningStepStatus.FAILED,
            lastErrorCode: code,
            lastErrorMessage: message,
            ...(error instanceof ProvisioningStepError && error.result
              ? { result: this.json(error.result) }
              : {}),
          },
        });
        await this.prisma.whitelabelProvisioning.update({
          where: { id: provisioningId },
          data: {
            status: ProvisioningStatus.FAILED,
            currentStep: next.key,
            errorCode: code,
            errorMessage: message,
          },
        });
        return ProvisioningStatus.FAILED;
      }
    }
  }

  private async load(provisioningId: string): Promise<ProvisioningWithSteps> {
    const row = await this.prisma.whitelabelProvisioning.findUnique({
      where: { id: provisioningId },
      include: { steps: true },
    });
    if (!row)
      throw new ProvisioningStepError(
        'E_PROVISIONING_NOT_FOUND',
        'Provisioning vanished',
      );
    return row;
  }

  private json(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    if (value === undefined || value === null) return Prisma.JsonNull;
    return scrubSecrets(value);
  }

  /** Never leaks secrets: known literals are redacted and the text is capped to the column size. */
  private describe(
    provisioningId: string,
    error: unknown,
  ): { code: string; message: string } {
    let code = 'STEP_ERROR';
    let message = error instanceof Error ? error.message : String(error);

    if (error instanceof ProvisioningStepError) {
      code = error.code;
    } else if (error instanceof LoorCoreException) {
      code = error.code || 'CORE_ERROR';
    } else if (error instanceof HttpException) {
      const response = error.getResponse();
      if (response && typeof response === 'object') {
        const body = response as { code?: unknown; message?: unknown };
        if (typeof body.code === 'string') code = body.code;
        if (typeof body.message === 'string') message = body.message;
        else if (Array.isArray(body.message)) message = body.message.join('; ');
      }
      if (code === 'STEP_ERROR') code = `HTTP_${error.getStatus()}`;
    }

    return {
      code: truncate(code, 64),
      message: truncate(this.secrets.redactText(provisioningId, message), 1000),
    };
  }
}
