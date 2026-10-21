import {
  BadRequestException,
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
import { OpportunityFiltersDto } from './dto/opportunity-filters.dto';
import { OpportunityService } from './opportunity.service';

@ApiTags('Opportunities')
@ApiBearerAuth()
@Controller('opportunities')
export class OpportunityController {
  constructor(private readonly service: OpportunityService) {}

  @Get('helpers/entrepreneurs')
  @Roles(ROLES.SUPER_ADMIN, ROLES.SUPPORT_ADMIN, ROLES.READ_ONLY)
  @ApiOperation({ summary: 'Entrepreneurs for a Whitelabel (create campaign helper)' })
  helperEntrepreneurs(
    @Query('whitelabelId') whitelabelId: string,
    @Req() req: Request & { correlationId?: string },
  ) {
    this.assertWhitelabelId(whitelabelId);
    return this.service.helperEntrepreneurs(whitelabelId, req.correlationId);
  }

  @Get('helpers/contracts')
  @Roles(ROLES.SUPER_ADMIN, ROLES.SUPPORT_ADMIN, ROLES.READ_ONLY)
  helperContracts(
    @Query('whitelabelId') whitelabelId: string,
    @Req() req: Request & { correlationId?: string },
  ) {
    this.assertWhitelabelId(whitelabelId);
    return this.service.helperContracts(whitelabelId, req.correlationId);
  }

  @Get('helpers/investor-profiles')
  @Roles(ROLES.SUPER_ADMIN, ROLES.SUPPORT_ADMIN, ROLES.READ_ONLY)
  helperInvestorProfiles(
    @Query('whitelabelId') whitelabelId: string,
    @Req() req: Request & { correlationId?: string },
  ) {
    this.assertWhitelabelId(whitelabelId);
    return this.service.helperInvestorProfiles(whitelabelId, req.correlationId);
  }

  @Get()
  @Roles(ROLES.SUPER_ADMIN, ROLES.SUPPORT_ADMIN, ROLES.READ_ONLY)
  list(
    @Query() query: OpportunityFiltersDto,
    @Req() req: Request & { correlationId?: string },
  ) {
    return this.service.list(query, req.correlationId);
  }

  @Post()
  @Roles(ROLES.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Create opportunity on behalf of entrepreneur (Admin parity)',
    description: 'Requires whitelabelId + entrepreneurId + Admin create payload fields.',
  })
  create(
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedOperator,
    @Req() req: Request & { correlationId?: string },
  ) {
    if (!body?.whitelabelId || !body?.entrepreneurId) {
      throw new BadRequestException({
        code: 'E_VALIDATION',
        message: 'whitelabelId and entrepreneurId are required',
      });
    }
    return this.service.create(body, {
      operatorId: user.id,
      correlationId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Get(':id')
  @Roles(ROLES.SUPER_ADMIN, ROLES.SUPPORT_ADMIN, ROLES.READ_ONLY)
  detail(@Param('id') id: string, @Req() req: Request & { correlationId?: string }) {
    this.assertOpportunityId(id);
    return this.service.detail(id, req.correlationId);
  }

  @Patch(':id')
  @Roles(ROLES.SUPER_ADMIN)
  @ApiOperation({ summary: 'Patch editable campaign fields (Admin matrix)' })
  update(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedOperator,
    @Req() req: Request & { correlationId?: string },
  ) {
    this.assertOpportunityId(id);
    return this.service.update(id, body, {
      operatorId: user.id,
      correlationId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post(':id/approve')
  @Roles(ROLES.SUPER_ADMIN)
  approve(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedOperator,
    @Req() req: Request & { correlationId?: string },
  ) {
    this.assertOpportunityId(id);
    return this.service.approve(id, body ?? {}, {
      operatorId: user.id,
      correlationId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post(':id/deny')
  @Roles(ROLES.SUPER_ADMIN)
  @ApiOperation({ summary: 'Deny review campaign (archives with reason)' })
  deny(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedOperator,
    @Req() req: Request & { correlationId?: string },
  ) {
    this.assertOpportunityId(id);
    return this.service.deny(id, body ?? {}, {
      operatorId: user.id,
      correlationId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post(':id/archive')
  @Roles(ROLES.SUPER_ADMIN)
  archive(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedOperator,
    @Req() req: Request & { correlationId?: string },
  ) {
    this.assertOpportunityId(id);
    return this.service.archive(id, body ?? {}, {
      operatorId: user.id,
      correlationId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  private assertOpportunityId(id: string) {
    if (!/^\d+$/.test(id) || Number(id) <= 0) {
      throw new BadRequestException({
        code: 'E_VALIDATION',
        message: 'Opportunity id must be a positive integer',
      });
    }
  }

  private assertWhitelabelId(id: string) {
    if (!id || !/^\d+$/.test(id) || Number(id) <= 0) {
      throw new BadRequestException({
        code: 'E_VALIDATION',
        message: 'whitelabelId must be a positive integer',
      });
    }
  }
}
