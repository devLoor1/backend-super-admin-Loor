import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '../../common/constants/roles';
import { AuthenticatedOperator } from '../../common/interfaces/authenticated-operator.interface';
import { CreateWhitelabelDto } from './dto/create-whitelabel.dto';
import { UpdateWhitelabelDto } from './dto/update-whitelabel.dto';
import { WhitelabelFiltersDto } from './dto/whitelabel-filters.dto';
import { WhitelabelService } from './whitelabel.service';

@ApiTags('Whitelabels')
@ApiBearerAuth()
@Controller('whitelabels')
export class WhitelabelController {
  constructor(private readonly service: WhitelabelService) {}

  @Get()
  @Roles(ROLES.SUPER_ADMIN, ROLES.READ_ONLY, ROLES.SUPPORT_ADMIN)
  @ApiOperation({ summary: 'List whitelabels via Core' })
  list(@Query() query: WhitelabelFiltersDto, @Req() req: Request & { correlationId?: string }) {
    return this.service.list(query, req.correlationId);
  }

  @Get(':id')
  @Roles(ROLES.SUPER_ADMIN, ROLES.READ_ONLY, ROLES.SUPPORT_ADMIN)
  detail(@Param('id') id: string, @Req() req: Request & { correlationId?: string }) {
    return this.service.detail(id, req.correlationId);
  }

  @Post()
  @Roles(ROLES.SUPER_ADMIN)
  create(
    @Body() dto: CreateWhitelabelDto,
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

  @Patch(':id')
  @Roles(ROLES.SUPER_ADMIN)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateWhitelabelDto,
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
    return this.service.setStatus(id, true, {
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
    return this.service.setStatus(id, false, {
      operatorId: user.id,
      correlationId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
