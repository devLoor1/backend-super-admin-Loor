import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '../../common/constants/roles';
import type { AuthenticatedOperator } from '../../common/interfaces/authenticated-operator.interface';
import { EmailTemplatesService } from './email-templates.service';
import {
  EmailTemplateCreateDto,
  EmailTemplatePreviewDto,
  EmailTemplateUpdateDto,
} from './dto/email-template.dto';

type ScopedRequest = Request & { correlationId?: string };

@ApiTags('Email templates')
@ApiBearerAuth()
@Controller('whitelabels/:whitelabelId/emails/templates')
export class EmailTemplatesController {
  constructor(private readonly service: EmailTemplatesService) {}

  @Get('types')
  @Roles(ROLES.SUPER_ADMIN, ROLES.READ_ONLY)
  types(@Param('whitelabelId') tenant: string, @Req() req: ScopedRequest) {
    return this.service.types(tenant, req.correlationId);
  }

  @Get()
  @Roles(ROLES.SUPER_ADMIN, ROLES.READ_ONLY)
  list(
    @Param('whitelabelId') tenant: string,
    @Query('type') type: string | undefined,
    @Req() req: ScopedRequest,
  ) {
    return this.service.list(tenant, type, req.correlationId);
  }

  @Get(':id')
  @Roles(ROLES.SUPER_ADMIN, ROLES.READ_ONLY)
  show(
    @Param('whitelabelId') tenant: string,
    @Param('id') id: string,
    @Req() req: ScopedRequest,
  ) {
    return this.service.show(tenant, id, req.correlationId);
  }

  @Post('preview')
  @HttpCode(200)
  @Roles(ROLES.SUPER_ADMIN, ROLES.READ_ONLY)
  @ApiOperation({
    summary: 'Render an isolated synthetic preview; never saves or sends mail',
  })
  preview(
    @Param('whitelabelId') tenant: string,
    @Body() body: EmailTemplatePreviewDto,
    @Req() req: ScopedRequest,
  ) {
    return this.service.preview(tenant, body, req.correlationId);
  }

  @Post()
  @Roles(ROLES.SUPER_ADMIN)
  create(
    @Param('whitelabelId') tenant: string,
    @Body() body: EmailTemplateCreateDto,
    @CurrentUser() user: AuthenticatedOperator,
    @Req() req: ScopedRequest,
  ) {
    return this.service.mutate(tenant, 'POST', body, {
      operatorId: user.id,
      correlationId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Patch(':id')
  @Roles(ROLES.SUPER_ADMIN)
  update(
    @Param('whitelabelId') tenant: string,
    @Param('id') id: string,
    @Body() body: EmailTemplateUpdateDto,
    @CurrentUser() user: AuthenticatedOperator,
    @Req() req: ScopedRequest,
  ) {
    return this.service.mutate(
      tenant,
      'PATCH',
      body,
      {
        operatorId: user.id,
        correlationId: req.correlationId,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      },
      id,
    );
  }

  @Delete(':id')
  @Roles(ROLES.SUPER_ADMIN)
  remove(
    @Param('whitelabelId') tenant: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedOperator,
    @Req() req: ScopedRequest,
  ) {
    return this.service.mutate(
      tenant,
      'DELETE',
      {},
      {
        operatorId: user.id,
        correlationId: req.correlationId,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      },
      id,
    );
  }
}
