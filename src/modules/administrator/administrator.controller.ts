import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '../../common/constants/roles';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { AuthenticatedOperator } from '../../common/interfaces/authenticated-operator.interface';
import { AdministratorService } from './administrator.service';

@ApiTags('Administrators')
@ApiBearerAuth()
@Controller('whitelabels/:whitelabelId/admins')
export class AdministratorController {
  constructor(private readonly service: AdministratorService) {}

  @Get()
  @Roles(ROLES.SUPER_ADMIN, ROLES.SUPPORT_ADMIN, ROLES.READ_ONLY)
  list(
    @Param('whitelabelId') whitelabelId: string,
    @Query() query: PaginationQueryDto,
    @Req() req: Request & { correlationId?: string },
  ) {
    return this.service.list(whitelabelId, query, req.correlationId);
  }

  @Get(':id')
  @Roles(ROLES.SUPER_ADMIN, ROLES.SUPPORT_ADMIN, ROLES.READ_ONLY)
  detail(
    @Param('whitelabelId') whitelabelId: string,
    @Param('id') id: string,
    @Req() req: Request & { correlationId?: string },
  ) {
    return this.service.detail(whitelabelId, id, req.correlationId);
  }

  @Post()
  @Roles(ROLES.SUPER_ADMIN)
  create(
    @Param('whitelabelId') whitelabelId: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedOperator,
    @Req() req: Request & { correlationId?: string },
  ) {
    return this.service.create(whitelabelId, body, {
      operatorId: user.id,
      correlationId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Patch(':id/deactivate')
  @Roles(ROLES.SUPER_ADMIN)
  deactivate(
    @Param('whitelabelId') whitelabelId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedOperator,
    @Req() req: Request & { correlationId?: string },
  ) {
    return this.service.setActive(whitelabelId, id, false, {
      operatorId: user.id,
      correlationId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
