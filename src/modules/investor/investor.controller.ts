import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '../../common/constants/roles';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { InvestorService } from './investor.service';

@ApiTags('Investors')
@ApiBearerAuth()
@Controller('investors')
export class InvestorController {
  constructor(private readonly service: InvestorService) {}

  @Get()
  @Roles(ROLES.SUPER_ADMIN, ROLES.SUPPORT_ADMIN, ROLES.COMPLIANCE_ADMIN, ROLES.READ_ONLY)
  list(@Query() query: PaginationQueryDto, @Req() req: Request & { correlationId?: string }) {
    return this.service.list(query, req.correlationId);
  }

  @Get(':id')
  @Roles(ROLES.SUPER_ADMIN, ROLES.SUPPORT_ADMIN, ROLES.COMPLIANCE_ADMIN, ROLES.READ_ONLY)
  detail(@Param('id') id: string, @Req() req: Request & { correlationId?: string }) {
    return this.service.detail(id, req.correlationId);
  }
}
