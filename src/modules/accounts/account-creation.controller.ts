import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '../../common/constants/roles';
import { AuthenticatedOperator } from '../../common/interfaces/authenticated-operator.interface';
import { AccountsService } from './accounts.service';
import { CreateInvestorDto } from './dto/create-investor.dto';
import { CreateEntrepreneurDto } from './dto/create-entrepreneur.dto';

@ApiTags('Accounts')
@ApiBearerAuth()
@Controller('whitelabels/:whitelabelId')
export class AccountCreationController {
  constructor(private readonly service: AccountsService) {}

  @Post('investors')
  @Roles(ROLES.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create Investor in Whitelabel (SUPER_ADMIN only)' })
  createInvestor(
    @Param('whitelabelId') whitelabelId: string,
    @Body() body: CreateInvestorDto,
    @CurrentUser() user: AuthenticatedOperator,
    @Req() req: Request & { correlationId?: string },
  ) {
    return this.service.createInvestor(whitelabelId, body, {
      operatorId: user.id,
      correlationId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }

  @Post('entrepreneurs')
  @Roles(ROLES.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create Entrepreneur in Whitelabel (SUPER_ADMIN only)' })
  createEntrepreneur(
    @Param('whitelabelId') whitelabelId: string,
    @Body() body: CreateEntrepreneurDto,
    @CurrentUser() user: AuthenticatedOperator,
    @Req() req: Request & { correlationId?: string },
  ) {
    return this.service.createEntrepreneur(whitelabelId, body, {
      operatorId: user.id,
      correlationId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }
}
