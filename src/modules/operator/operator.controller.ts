import { Body, Controller, Get, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '../../common/constants/roles';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { AuthenticatedOperator } from '../../common/interfaces/authenticated-operator.interface';
import { CreateOperatorDto } from './dto/create-operator.dto';
import { UpdateOperatorDto } from './dto/update-operator.dto';
import { UpdateOperatorRolesDto } from './dto/update-operator-roles.dto';
import { OperatorService } from './operator.service';

@ApiTags('Operators')
@ApiBearerAuth()
@Controller('operators')
export class OperatorController {
  constructor(private readonly service: OperatorService) {}

  @Get()
  @Roles(ROLES.SUPER_ADMIN)
  @ApiOperation({ summary: 'List Control Plane operators (SA-BE-007)' })
  list(@Query() query: PaginationQueryDto) {
    return this.service.list(query);
  }

  @Post()
  @Roles(ROLES.SUPER_ADMIN)
  create(
    @Body() dto: CreateOperatorDto,
    @CurrentUser() user: AuthenticatedOperator,
    @Req() req: Request & { correlationId?: string },
  ) {
    return this.service.create(dto, {
      operatorId: user.id,
      correlationId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Get(':id')
  @Roles(ROLES.SUPER_ADMIN)
  detail(@Param('id') id: string) {
    return this.service.detail(id);
  }

  @Patch(':id')
  @Roles(ROLES.SUPER_ADMIN)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateOperatorDto,
    @CurrentUser() user: AuthenticatedOperator,
    @Req() req: Request & { correlationId?: string },
  ) {
    return this.service.update(id, dto, {
      operatorId: user.id,
      correlationId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Patch(':id/activate')
  @Roles(ROLES.SUPER_ADMIN)
  activate(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedOperator,
    @Req() req: Request & { correlationId?: string },
  ) {
    return this.service.setActive(id, true, {
      operatorId: user.id,
      correlationId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Patch(':id/deactivate')
  @Roles(ROLES.SUPER_ADMIN)
  deactivate(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedOperator,
    @Req() req: Request & { correlationId?: string },
  ) {
    return this.service.setActive(id, false, {
      operatorId: user.id,
      correlationId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Put(':id/roles')
  @Roles(ROLES.SUPER_ADMIN)
  updateRoles(
    @Param('id') id: string,
    @Body() dto: UpdateOperatorRolesDto,
    @CurrentUser() user: AuthenticatedOperator,
    @Req() req: Request & { correlationId?: string },
  ) {
    return this.service.updateRoles(id, dto, {
      operatorId: user.id,
      correlationId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
