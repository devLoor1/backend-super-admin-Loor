import { Body, Controller, Get, Param, Patch, Post, Put, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '../../common/constants/roles';
import { AuthenticatedOperator } from '../../common/interfaces/authenticated-operator.interface';
import { SmtpService } from './smtp.service';

@ApiTags('SMTP')
@ApiBearerAuth()
@Controller([
  'whitelabels/:whitelabelId/emails/smtp',
  'whitelabels/:whitelabelId/smtp',
])
export class SmtpController {
  constructor(private readonly service: SmtpService) {}

  @Get()
  @Roles(ROLES.SUPER_ADMIN, ROLES.READ_ONLY)
  @ApiOperation({ summary: 'Safe SMTP read (no username/password)' })
  get(@Param('whitelabelId') whitelabelId: string, @Req() req: Request & { correlationId?: string }) {
    return this.service.get(whitelabelId, req.correlationId);
  }

  @Put()
  @Roles(ROLES.SUPER_ADMIN)
  @ApiOperation({ summary: 'Full SMTP upsert (create requires password)' })
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

  @Patch()
  @Roles(ROLES.SUPER_ADMIN)
  @ApiOperation({
    summary: 'SMTP-01 metadata PATCH — credentials only via replaceUsername/replacePassword',
  })
  patch(
    @Param('whitelabelId') whitelabelId: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedOperator,
    @Req() req: Request & { correlationId?: string },
  ) {
    return this.service.patch(whitelabelId, body, {
      operatorId: user.id,
      correlationId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('test')
  @Roles(ROLES.SUPER_ADMIN)
  test(
    @Param('whitelabelId') whitelabelId: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedOperator,
    @Req() req: Request & { correlationId?: string },
  ) {
    return this.service.test(whitelabelId, body, {
      operatorId: user.id,
      correlationId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
