import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '../../common/constants/roles';
import { AuditFiltersDto } from './dto/audit-filters.dto';
import { AuditService } from './audit.service';

@ApiTags('Audit')
@ApiBearerAuth()
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Roles(ROLES.SUPER_ADMIN, ROLES.COMPLIANCE_ADMIN, ROLES.READ_ONLY)
  @ApiOperation({
    summary: 'List Control Plane audit events',
    description:
      'Filters: operatorId, action, resourceType, resourceId, whitelabelId, result, from, to, search',
  })
  list(@Query() query: AuditFiltersDto) {
    return this.auditService.list(query);
  }
}
