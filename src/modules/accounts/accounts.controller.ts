import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '../../common/constants/roles';
import { AuthenticatedOperator } from '../../common/interfaces/authenticated-operator.interface';
import { AccountsService } from './accounts.service';
import { AccountFiltersDto } from './dto/account-filters.dto';

@ApiTags('Accounts')
@ApiBearerAuth()
@Controller('whitelabels/:whitelabelId/accounts')
export class AccountsController {
  constructor(private readonly service: AccountsService) {}

  @Get()
  @Roles(ROLES.SUPER_ADMIN, ROLES.SUPPORT_ADMIN, ROLES.COMPLIANCE_ADMIN, ROLES.READ_ONLY)
  @ApiOperation({
    summary: 'List tenant accounts (FE Account Control)',
    description:
      'Use `tipo=investidores|empreendedores|administradores` to match the FE hash route query.',
  })
  list(
    @Param('whitelabelId') whitelabelId: string,
    @Query() query: AccountFiltersDto,
    @Req() req: Request & { correlationId?: string },
  ) {
    return this.service.list(whitelabelId, query, req.correlationId);
  }

  @Get(':accountId')
  @Roles(ROLES.SUPER_ADMIN, ROLES.SUPPORT_ADMIN, ROLES.COMPLIANCE_ADMIN, ROLES.READ_ONLY)
  @ApiOperation({ summary: 'Account detail within a Whitelabel' })
  detail(
    @Param('whitelabelId') whitelabelId: string,
    @Param('accountId') accountId: string,
    @Query() query: AccountFiltersDto,
    @Req() req: Request & { correlationId?: string },
  ) {
    return this.service.detail(whitelabelId, accountId, query, req.correlationId);
  }

  @Post(':accountId/pause')
  @Roles(ROLES.SUPER_ADMIN, ROLES.SUPPORT_ADMIN)
  @ApiOperation({ summary: 'Pause account access (requires reason)' })
  pause(
    @Param('whitelabelId') whitelabelId: string,
    @Param('accountId') accountId: string,
    @Query() query: AccountFiltersDto,
    @Body() body: { reason?: string },
    @CurrentUser() user: AuthenticatedOperator,
    @Req() req: Request & { correlationId?: string },
  ) {
    return this.service.pause(whitelabelId, accountId, query, body, {
      operatorId: user.id,
      correlationId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post(':accountId/reactivate')
  @Roles(ROLES.SUPER_ADMIN, ROLES.SUPPORT_ADMIN)
  @ApiOperation({ summary: 'Reactivate account access' })
  reactivate(
    @Param('whitelabelId') whitelabelId: string,
    @Param('accountId') accountId: string,
    @Query() query: AccountFiltersDto,
    @CurrentUser() user: AuthenticatedOperator,
    @Req() req: Request & { correlationId?: string },
  ) {
    return this.service.reactivate(whitelabelId, accountId, query, {
      operatorId: user.id,
      correlationId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
