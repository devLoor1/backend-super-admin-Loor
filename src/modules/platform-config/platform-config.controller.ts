import { Body, Controller, Delete, Get, Param, Put, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '../../common/constants/roles';
import { AuthenticatedOperator } from '../../common/interfaces/authenticated-operator.interface';
import { PlatformConfigService } from './platform-config.service';

@ApiTags('Platform Configuration')
@ApiBearerAuth()
@Controller('whitelabels/:whitelabelId/settings')
export class PlatformConfigController {
  constructor(private readonly service: PlatformConfigService) {}

  @Get()
  @Roles(ROLES.SUPER_ADMIN, ROLES.READ_ONLY)
  @ApiOperation({ summary: 'Settings bag + SET-01 provenance for allowlisted cells' })
  get(@Param('whitelabelId') whitelabelId: string, @Req() req: Request & { correlationId?: string }) {
    return this.service.get(whitelabelId, req.correlationId);
  }

  @Put()
  @Roles(ROLES.SUPER_ADMIN)
  @ApiOperation({ summary: 'Upsert one allowlisted page/key cell' })
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

  @Delete(':page/:key/override')
  @Roles(ROLES.SUPER_ADMIN)
  @ApiOperation({ summary: 'SET-01 reset — delete stored override (restore effective default)' })
  deleteOverride(
    @Param('whitelabelId') whitelabelId: string,
    @Param('page') page: string,
    @Param('key') key: string,
    @CurrentUser() user: AuthenticatedOperator,
    @Req() req: Request & { correlationId?: string },
  ) {
    return this.service.deleteOverride(whitelabelId, page, key, {
      operatorId: user.id,
      correlationId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
