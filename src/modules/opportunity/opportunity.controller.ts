import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '../../common/constants/roles';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { AuthenticatedOperator } from '../../common/interfaces/authenticated-operator.interface';
import { OpportunityService } from './opportunity.service';

@ApiTags('Opportunities')
@ApiBearerAuth()
@Controller('opportunities')
export class OpportunityController {
  constructor(private readonly service: OpportunityService) {}

  @Get()
  @Roles(ROLES.SUPER_ADMIN, ROLES.SUPPORT_ADMIN, ROLES.READ_ONLY)
  list(@Query() query: PaginationQueryDto, @Req() req: Request & { correlationId?: string }) {
    return this.service.list(query, req.correlationId);
  }

  @Get(':id')
  @Roles(ROLES.SUPER_ADMIN, ROLES.SUPPORT_ADMIN, ROLES.READ_ONLY)
  detail(@Param('id') id: string, @Req() req: Request & { correlationId?: string }) {
    return this.service.detail(id, req.correlationId);
  }

  @Post(':id/approve')
  @Roles(ROLES.SUPER_ADMIN)
  approve(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedOperator,
    @Req() req: Request & { correlationId?: string },
  ) {
    return this.service.approve(id, {
      operatorId: user.id,
      correlationId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post(':id/deny')
  @Roles(ROLES.SUPER_ADMIN)
  deny(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedOperator,
    @Req() req: Request & { correlationId?: string },
  ) {
    return this.service.deny(id, body, {
      operatorId: user.id,
      correlationId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
