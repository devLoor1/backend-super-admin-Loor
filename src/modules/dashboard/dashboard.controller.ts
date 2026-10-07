import { Controller, Get, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '../../common/constants/roles';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get()
  @Roles(ROLES.SUPER_ADMIN, ROLES.READ_ONLY, ROLES.FINANCIAL_ADMIN, ROLES.COMPLIANCE_ADMIN)
  @ApiOperation({ summary: 'Global LOOR indicators (Core aggregate)' })
  overview(
    @Query() query: Record<string, string>,
    @Req() req: Request & { correlationId?: string },
  ) {
    return this.service.overview(query, req.correlationId);
  }
}
