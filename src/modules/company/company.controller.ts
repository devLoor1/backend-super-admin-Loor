import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '../../common/constants/roles';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { CompanyService } from './company.service';

@ApiTags('Companies')
@ApiBearerAuth()
@Controller()
export class CompanyController {
  constructor(private readonly service: CompanyService) {}

  @Get('companies')
  @Roles(ROLES.SUPER_ADMIN, ROLES.SUPPORT_ADMIN, ROLES.READ_ONLY)
  @ApiOperation({
    summary: 'List Empresas (read-only projection of Entrepreneur↔Company)',
  })
  list(
    @Query() query: PaginationQueryDto,
    @Req() req: Request & { correlationId?: string },
  ) {
    return this.service.list(query, req.correlationId);
  }

  @Get('companies/:id')
  @Roles(ROLES.SUPER_ADMIN, ROLES.SUPPORT_ADMIN, ROLES.READ_ONLY)
  detail(@Param('id') id: string, @Req() req: Request & { correlationId?: string }) {
    return this.service.detail(id, req.correlationId);
  }

  @Get('entrepreneurs/:entrepreneurId/company')
  @Roles(ROLES.SUPER_ADMIN, ROLES.SUPPORT_ADMIN, ROLES.READ_ONLY)
  byEntrepreneur(
    @Param('entrepreneurId') entrepreneurId: string,
    @Req() req: Request & { correlationId?: string },
  ) {
    return this.service.byEntrepreneur(entrepreneurId, req.correlationId);
  }
}
