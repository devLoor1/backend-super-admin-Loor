import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
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
import { WhitelabelProvisioningService } from './whitelabel-provisioning.service';

type Req_ = Request & { correlationId?: string };

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
  create(
    @Body() dto: CreateProvisioningDto,
    @CurrentUser() user: AuthenticatedOperator,
    @Req() req: Req_,
  ) {
    return this.service.create(dto, metaOf(user, req));
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
  retry(
    @Param('id') id: string,
    @Body() dto: RetryProvisioningDto,
    @CurrentUser() user: AuthenticatedOperator,
    @Req() req: Req_,
  ) {
    return this.service.retry(id, dto, metaOf(user, req));
  }

  @Post(':id/steps/:stepKey/complete')
  @HttpCode(HttpStatus.OK)
  @Roles(ROLES.SUPER_ADMIN)
  @ApiOperation({
    summary:
      'Complete a manual gate (FE_DEPLOY_CHECK | DNS_CHECK) and continue the pipeline',
    description:
      'FE_DEPLOY_CHECK requires checklist { investor, entrepreneur, admin } all true; ' +
      'DNS_CHECK requires { resolves, https } all true. Any other step key → 400.',
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
