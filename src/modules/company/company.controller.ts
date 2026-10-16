import { BadRequestException, Controller, Get, Param, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '../../common/constants/roles';
import { CompanyByEntrepreneurQueryDto } from './dto/company-by-entrepreneur-query.dto';
import { CompanyFiltersDto } from './dto/company-filters.dto';
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
    @Query() query: CompanyFiltersDto,
    @Req() req: Request & { correlationId?: string },
  ) {
    return this.service.list(query, req.correlationId);
  }

  @Get('companies/:id')
  @Roles(ROLES.SUPER_ADMIN, ROLES.SUPPORT_ADMIN, ROLES.READ_ONLY)
  detail(@Param('id') id: string, @Req() req: Request & { correlationId?: string }) {
    if (!/^\d+$/.test(id) || Number(id) <= 0) {
      throw new BadRequestException({
        code: 'E_VALIDATION',
        message: 'Company id must be a positive integer',
      });
    }
    return this.service.detail(id, req.correlationId);
  }

  @Get('entrepreneurs/:entrepreneurId/company')
  @Roles(ROLES.SUPER_ADMIN, ROLES.SUPPORT_ADMIN, ROLES.READ_ONLY)
  @ApiOperation({
    summary:
      'Company for entrepreneur — 200 { data: null } when entrepreneur exists without company',
  })
  byEntrepreneur(
    @Param('entrepreneurId') entrepreneurId: string,
    @Query() query: CompanyByEntrepreneurQueryDto,
    @Req() req: Request & { correlationId?: string },
  ) {
    if (!/^\d+$/.test(entrepreneurId) || Number(entrepreneurId) <= 0) {
      throw new BadRequestException({
        code: 'E_VALIDATION',
        message: 'entrepreneurId must be a positive integer',
      });
    }
    return this.service.byEntrepreneur(entrepreneurId, query, req.correlationId);
  }
}
