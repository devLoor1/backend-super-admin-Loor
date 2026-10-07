import { Body, Controller, Get, Param, Put, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '../../common/constants/roles';
import { AuthenticatedOperator } from '../../common/interfaces/authenticated-operator.interface';
import { PlatformConfigService } from './platform-config.service';

@ApiTags('Platform Configuration')
@ApiBearerAuth()
@Controller('whitelabels/:whitelabelId/platform-config')
export class PlatformConfigController {
  constructor(private readonly service: PlatformConfigService) {}

  @Get()
  @Roles(ROLES.SUPER_ADMIN, ROLES.READ_ONLY)
  get(@Param('whitelabelId') whitelabelId: string, @Req() req: Request & { correlationId?: string }) {
    return this.service.get(whitelabelId, req.correlationId);
  }

  @Put()
  @Roles(ROLES.SUPER_ADMIN)
  update(
    @Param('whitelabelId') whitelabelId: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedOperator,
    @Req() req: Request & { correlationId?: string },
  ) {
    return this.service.update(whitelabelId, body, {
      operatorId: user.id,
      correlationId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
