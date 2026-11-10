import { Body, Controller, Get, Param, Put, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '../../common/constants/roles';
import { AuthenticatedOperator } from '../../common/interfaces/authenticated-operator.interface';
import { ShowcaseService } from './showcase.service';

@ApiTags('Whitelabel Showcase')
@ApiBearerAuth()
@Controller('whitelabels/:whitelabelId/showcase')
export class ShowcaseController {
  constructor(private readonly service: ShowcaseService) {}

  @Get()
  @Roles(ROLES.SUPER_ADMIN, ROLES.READ_ONLY)
  @ApiOperation({ summary: 'V1 showcase document for owner WL (homolog gate on Core)' })
  get(
    @Param('whitelabelId') whitelabelId: string,
    @Req() req: Request & { correlationId?: string },
  ) {
    return this.service.get(whitelabelId, req.correlationId);
  }

  @Put()
  @Roles(ROLES.SUPER_ADMIN)
  @ApiOperation({
    summary: 'V1 put full showcase document with expectedRevision (CAS)',
  })
  put(
    @Param('whitelabelId') whitelabelId: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedOperator,
    @Req() req: Request & { correlationId?: string },
  ) {
    return this.service.put(whitelabelId, body, {
      operatorId: user.id,
      correlationId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
