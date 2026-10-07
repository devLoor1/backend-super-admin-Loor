import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '../../common/constants/roles';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { InvestmentService } from './investment.service';

@ApiTags('Investments')
@ApiBearerAuth()
@Controller('investments')
export class InvestmentController {
  constructor(private readonly service: InvestmentService) {}

  @Get()
  @Roles(ROLES.SUPER_ADMIN, ROLES.FINANCIAL_ADMIN, ROLES.READ_ONLY)
  list(@Query() query: PaginationQueryDto, @Req() req: Request & { correlationId?: string }) {
    return this.service.list(query, req.correlationId);
  }

  @Get(':id')
  @Roles(ROLES.SUPER_ADMIN, ROLES.FINANCIAL_ADMIN, ROLES.READ_ONLY)
  detail(@Param('id') id: string, @Req() req: Request & { correlationId?: string }) {
    return this.service.detail(id, req.correlationId);
  }
}
