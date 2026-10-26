import { Body, Controller, Get, Param, Put, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '../../common/constants/roles';
import { AuthenticatedOperator } from '../../common/interfaces/authenticated-operator.interface';
import { TermsService } from './terms.service';

@ApiTags('Terms of Use')
@ApiBearerAuth()
@Controller('whitelabels/:whitelabelId/terms-of-use')
export class TermsController {
  constructor(private readonly service: TermsService) {}

  @Get()
  @Roles(ROLES.SUPER_ADMIN, ROLES.READ_ONLY)
  @ApiOperation({ summary: 'LEG-01 current + history (also embedded in Settings GET)' })
  get(@Param('whitelabelId') whitelabelId: string, @Req() req: Request & { correlationId?: string }) {
    return this.service.get(whitelabelId, req.correlationId);
  }

  @Put()
  @Roles(ROLES.SUPER_ADMIN)
  @ApiOperation({
    summary: 'LEG-01 publish new immutable Terms revision (immediate publication)',
  })
  publish(
    @Param('whitelabelId') whitelabelId: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedOperator,
    @Req() req: Request & { correlationId?: string },
  ) {
    return this.service.publish(whitelabelId, body, {
      operatorId: user.id,
      correlationId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
