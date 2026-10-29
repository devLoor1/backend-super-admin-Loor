import { Body, Controller, Headers, HttpCode, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '../../common/constants/roles';
import { AuthenticatedOperator } from '../../common/interfaces/authenticated-operator.interface';
import { AccountsService } from './accounts.service';
import { CreateInvestorDto } from './dto/create-investor.dto';
import { CreateEntrepreneurDto } from './dto/create-entrepreneur.dto';

@ApiTags('Accounts')
@ApiBearerAuth()
@Controller('whitelabels/:whitelabelId')
export class AccountCreationController {
  constructor(private readonly service: AccountsService) {}

  @Post('investors')
  @Roles(ROLES.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create Investor in Whitelabel (SUPER_ADMIN only)' })
  @ApiHeader({ name: 'Idempotency-Key', description: '24 h idempotency window', required: false })
  createInvestor(
    @Param('whitelabelId') whitelabelId: string,
    @Body() body: CreateInvestorDto,
    @CurrentUser() user: AuthenticatedOperator,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: Request & { correlationId?: string },
  ) {
    return this.service.createInvestor(whitelabelId, body, {
      operatorId: user.id,
      correlationId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
      idempotencyKey,
    });
  }

  @Post('entrepreneurs')
  @Roles(ROLES.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create Entrepreneur in Whitelabel (SUPER_ADMIN only)' })
  @ApiHeader({ name: 'Idempotency-Key', description: '24 h idempotency window', required: false })
  createEntrepreneur(
    @Param('whitelabelId') whitelabelId: string,
    @Body() body: CreateEntrepreneurDto,
    @CurrentUser() user: AuthenticatedOperator,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: Request & { correlationId?: string },
  ) {
    return this.service.createEntrepreneur(whitelabelId, body, {
      operatorId: user.id,
      correlationId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
      idempotencyKey,
    });
  }

  @Post('investors/:investorId/resend-access')
  @HttpCode(200)
  @Roles(ROLES.SUPER_ADMIN)
  @ApiOperation({ summary: 'Resend access link to Investor (SUPER_ADMIN only)' })
  resendInvestorAccess(
    @Param('whitelabelId') whitelabelId: string,
    @Param('investorId') investorId: string,
    @CurrentUser() user: AuthenticatedOperator,
    @Req() req: Request & { correlationId?: string },
  ) {
    return this.service.resendInvestorAccess(whitelabelId, investorId, {
      operatorId: user.id,
      correlationId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }

  @Post('entrepreneurs/:entrepreneurId/resend-access')
  @HttpCode(200)
  @Roles(ROLES.SUPER_ADMIN)
  @ApiOperation({ summary: 'Resend access link to Entrepreneur (SUPER_ADMIN only)' })
  resendEntrepreneurAccess(
    @Param('whitelabelId') whitelabelId: string,
    @Param('entrepreneurId') entrepreneurId: string,
    @CurrentUser() user: AuthenticatedOperator,
    @Req() req: Request & { correlationId?: string },
  ) {
    return this.service.resendEntrepreneurAccess(whitelabelId, entrepreneurId, {
      operatorId: user.id,
      correlationId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }
}
