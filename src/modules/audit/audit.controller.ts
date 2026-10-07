import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '../../common/constants/roles';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { AuditService } from './audit.service';

@ApiTags('Audit')
@ApiBearerAuth()
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Roles(ROLES.SUPER_ADMIN, ROLES.COMPLIANCE_ADMIN, ROLES.READ_ONLY)
  @ApiOperation({ summary: 'List Control Plane audit events' })
  list(@Query() query: PaginationQueryDto) {
    return this.auditService.list(query);
  }
}
