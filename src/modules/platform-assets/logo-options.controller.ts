import { Controller, Get, Param, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '../../common/constants/roles';
import { PlatformAssetsService } from './platform-assets.service';

@ApiTags('Platform Assets')
@ApiBearerAuth()
@Controller('whitelabels/:whitelabelId/logo-options')
export class LogoOptionsController {
  constructor(private readonly service: PlatformAssetsService) {}

  @Get()
  @Roles(ROLES.SUPER_ADMIN, ROLES.READ_ONLY)
  @ApiOperation({ summary: 'Reusable main_area logo options of a source whitelabel' })
  get(
    @Param('whitelabelId') whitelabelId: string,
    @Req() req: Request & { correlationId?: string },
  ) {
    return this.service.logoOptions(whitelabelId, req.correlationId);
  }
}
