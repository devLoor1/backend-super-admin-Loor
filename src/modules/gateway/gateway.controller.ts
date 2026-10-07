import { Body, Controller, Get, Param, Put, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '../../common/constants/roles';
import { AuthenticatedOperator } from '../../common/interfaces/authenticated-operator.interface';
import { GatewayService } from './gateway.service';

@ApiTags('Gateways')
@ApiBearerAuth()
@Controller('whitelabels/:whitelabelId/gateways')
export class GatewayController {
  constructor(private readonly service: GatewayService) {}

  @Get()
  @Roles(ROLES.SUPER_ADMIN, ROLES.FINANCIAL_ADMIN, ROLES.READ_ONLY)
  list(@Param('whitelabelId') whitelabelId: string, @Req() req: Request & { correlationId?: string }) {
    return this.service.list(whitelabelId, req.correlationId);
  }

  @Put()
  @Roles(ROLES.SUPER_ADMIN, ROLES.FINANCIAL_ADMIN)
  upsert(
    @Param('whitelabelId') whitelabelId: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedOperator,
    @Req() req: Request & { correlationId?: string },
  ) {
    return this.service.upsert(whitelabelId, body, {
      operatorId: user.id,
      correlationId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
