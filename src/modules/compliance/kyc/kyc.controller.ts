import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ROLES } from '../../../common/constants/roles';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { KycService } from './kyc.service';

@ApiTags('Compliance')
@ApiBearerAuth()
@Controller('compliance/kyc')
export class KycController {
  constructor(private readonly service: KycService) {}

  @Get()
  @Roles(ROLES.SUPER_ADMIN, ROLES.COMPLIANCE_ADMIN, ROLES.READ_ONLY)
  @ApiOperation({ summary: 'List KYC cases (Face Match is inside detail)' })
  list(@Query() query: PaginationQueryDto, @Req() req: Request & { correlationId?: string }) {
    return this.service.list(query, req.correlationId);
  }

  @Get(':id')
  @Roles(ROLES.SUPER_ADMIN, ROLES.COMPLIANCE_ADMIN, ROLES.READ_ONLY)
  @ApiOperation({
    summary: 'KYC detail including document/OCR/Face Match/bureau/status/history',
  })
  detail(@Param('id') id: string, @Req() req: Request & { correlationId?: string }) {
    return this.service.detail(id, req.correlationId);
  }
}
