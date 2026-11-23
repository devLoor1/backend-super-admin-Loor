import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { ProvisioningStepKey } from '@prisma/client';
import { Request } from 'express';
import { ROLES } from '../../common/constants/roles';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthenticatedOperator } from '../../common/interfaces/authenticated-operator.interface';
import { CompleteManualStepDto } from './dto/complete-manual-step.dto';
import { CreateProvisioningDto } from './dto/create-provisioning.dto';
import { RetryProvisioningDto } from './dto/retry-provisioning.dto';
import { ProvisioningPayloadPipe } from './provisioning-payload.pipe';
import { ProvisioningBrandingFile } from './provisioning-secrets.store';
import { WhitelabelProvisioningService } from './whitelabel-provisioning.service';

type Req_ = Request & { correlationId?: string };

const BRAND_IMAGE_FIELD = 'mainAreaImage';
const BRAND_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
const BRAND_IMAGE_MIMES = ['image/jpeg', 'image/jpg', 'image/png'];

/** Optional multipart file (JSON requests pass through untouched). Memory only, like platform-assets. */
function brandImageInterceptor() {
  return FileInterceptor(BRAND_IMAGE_FIELD, {
    storage: memoryStorage(),
    limits: { fileSize: BRAND_IMAGE_MAX_BYTES },
  });
}

function toBrandingFile(
  file: Express.Multer.File | undefined,
): ProvisioningBrandingFile | undefined {
  if (!file) return undefined;
  if (!file.buffer?.length || !BRAND_IMAGE_MIMES.includes(file.mimetype)) {
    throw new BadRequestException({
      code: 'E_VALIDATION',
      message: `${BRAND_IMAGE_FIELD} must be a non-empty jpg/png/jpeg image (≤20MiB)`,
    });
  }
  return {
    buffer: file.buffer,
    mimetype: file.mimetype,
    originalname: file.originalname,
    size: file.size,
  };
}

function metaOf(user: AuthenticatedOperator, req: Req_) {
  return {
    operatorId: user.id,
    correlationId: req.correlationId,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  };
}

@ApiTags('Whitelabel Provisioning')
@ApiBearerAuth()
@Controller('whitelabel-provisionings')
export class WhitelabelProvisioningController {
  constructor(private readonly service: WhitelabelProvisioningService) {}

  @Get('config')
  @Roles(ROLES.SUPER_ADMIN, ROLES.SUPPORT_ADMIN, ROLES.READ_ONLY)
  @ApiOperation({
    summary: 'Provisioning frontend URL mode + templates (Nest source of truth)',
    description:
      'Returns `PROVISIONING_FRONTEND_URL_MODE` and per-environment URL templates ' +
      'with a `{slug}` placeholder. Optional `?slug=` also returns concrete suggestedUrls. ' +
      'Super Admin must use this instead of a Vite URL-mode env.',
  })
  @ApiOkResponse()
  frontendUrlConfig(@Query('slug') slug?: string) {
    return this.service.frontendUrlConfig(slug);
  }

  @Post()
  @Roles(ROLES.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Start a Whitelabel provisioning (MVP)',
    description:
      'Creates the provisioning + steps and runs the pipeline synchronously until the first pause: ' +
      'WAITING_MANUAL_ACTION (FE_DEPLOY_CHECK / DNS_CHECK), FAILED or COMPLETED. ' +
      'Secrets (SMTP, initial admin password, gateway keys) are kept in process memory only. ' +
      '409 if the slug already has a PENDING/RUNNING/WAITING_MANUAL_ACTION provisioning.',
  })
  @ApiCreatedResponse({
    description: 'Provisioning with progress after the first run pause',
  })
  @ApiConflictResponse({ description: 'E_PROVISIONING_IN_PROGRESS' })
  @ApiConsumes('application/json', 'multipart/form-data')
  @UseInterceptors(brandImageInterceptor())
  create(
    // Typed `unknown` so the global ValidationPipe skips it; ProvisioningPayloadPipe validates.
    @Body(new ProvisioningPayloadPipe(CreateProvisioningDto)) body: unknown,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedOperator,
    @Req() req: Req_,
  ) {
    return this.service.create(
      body as CreateProvisioningDto,
      metaOf(user, req),
      toBrandingFile(file),
    );
  }

  @Get(':id')
  @Roles(ROLES.SUPER_ADMIN, ROLES.SUPPORT_ADMIN, ROLES.READ_ONLY)
  @ApiOperation({
    summary: 'Provisioning status, progress, steps (no secrets) and delivery',
  })
  @ApiOkResponse()
  @ApiNotFoundResponse({ description: 'E_PROVISIONING_NOT_FOUND' })
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.OK)
  @Roles(ROLES.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Retry the FAILED step (or `stepKey`) and continue the pipeline',
    description:
      'Only FAILED provisionings/steps. CREATE_TENANT is never re-run once SUCCESS. ' +
      'After a process restart the in-memory secrets are gone: re-supply `smtp`, `initialAdmin` and/or ' +
      '`gateway` in the body when retrying those steps.',
  })
  @ApiOkResponse()
  @ApiConflictResponse({
    description:
      'E_PROVISIONING_NOT_FAILED / E_NO_FAILED_STEP / E_STEP_NOT_RETRYABLE',
  })
  @ApiConsumes('application/json', 'multipart/form-data')
  @UseInterceptors(brandImageInterceptor())
  retry(
    @Param('id') id: string,
    @Body(new ProvisioningPayloadPipe(RetryProvisioningDto)) body: unknown,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedOperator,
    @Req() req: Req_,
  ) {
    return this.service.retry(
      id,
      body as RetryProvisioningDto,
      metaOf(user, req),
      toBrandingFile(file),
    );
  }

  @Post(':id/steps/:stepKey/complete')
  @HttpCode(HttpStatus.OK)
  @Roles(ROLES.SUPER_ADMIN)
  @ApiOperation({
    summary:
      'Legacy manual-gate complete (unused while MANUAL_GATES is empty)',
    description:
      'Shared-frontend homolog completes FE_DEPLOY_CHECK / DNS_CHECK automatically ' +
      '(DNS resolve + HTTPS + Core bootstrap slug match). This endpoint returns 400 ' +
      'unless a step is re-listed in MANUAL_GATES. Prefer POST …/retry on failure.',
  })
  @ApiParam({ name: 'stepKey', enum: ProvisioningStepKey })
  @ApiOkResponse()
  @ApiConflictResponse({ description: 'E_STEP_NOT_WAITING' })
  @ApiUnprocessableEntityResponse({ description: 'E_CHECKLIST_INCOMPLETE' })
  complete(
    @Param('id') id: string,
    @Param('stepKey', new ParseEnumPipe(ProvisioningStepKey))
    stepKey: ProvisioningStepKey,
    @Body() dto: CompleteManualStepDto,
    @CurrentUser() user: AuthenticatedOperator,
    @Req() req: Req_,
  ) {
    return this.service.completeManual(id, stepKey, dto, metaOf(user, req));
  }
}

@ApiTags('Whitelabel Provisioning')
@ApiBearerAuth()
@Controller('whitelabels/:whitelabelId/provisioning')
export class WhitelabelProvisioningByTenantController {
  constructor(private readonly service: WhitelabelProvisioningService) {}

  @Get()
  @Roles(ROLES.SUPER_ADMIN, ROLES.SUPPORT_ADMIN, ROLES.READ_ONLY)
  @ApiOperation({
    summary: 'Latest provisioning bound to a Core Whitelabel id',
  })
  @ApiOkResponse()
  @ApiNotFoundResponse({ description: 'E_PROVISIONING_NOT_FOUND' })
  getByTenant(@Param('whitelabelId') whitelabelId: string) {
    return this.service.getByWl(whitelabelId);
  }
}
