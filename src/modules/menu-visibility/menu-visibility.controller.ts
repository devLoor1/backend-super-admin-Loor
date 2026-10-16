import { Body, Controller, Get, Put, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '../../common/constants/roles';
import { AuthenticatedOperator } from '../../common/interfaces/authenticated-operator.interface';
import { UpdateMenuVisibilityDto } from './dto/update-menu-visibility.dto';
import { MenuVisibilityService } from './menu-visibility.service';

@ApiTags('Homolog — Menu Visibility')
@ApiBearerAuth()
@Controller('homolog/menu-visibility')
export class MenuVisibilityController {
  constructor(private readonly service: MenuVisibilityService) {}

  @Get()
  @Roles(ROLES.SUPER_ADMIN, ROLES.SUPPORT_ADMIN, ROLES.READ_ONLY)
  @ApiOperation({
    summary:
      'Global Super Admin menu visibility (sidebar only; not URL/RBAC). FINANCIAL/COMPLIANCE: no access.',
  })
  get() {
    return this.service.get();
  }

  @Put()
  @Roles(ROLES.SUPER_ADMIN)
  @ApiOperation({
    summary:
      'Replace full map (idempotent). Requires version when row exists. dashboard/configuracoes locked true.',
  })
  put(
    @Body() body: UpdateMenuVisibilityDto,
    @CurrentUser() user: AuthenticatedOperator,
    @Req() req: Request & { correlationId?: string },
  ) {
    return this.service.put(body.visibility, {
      operatorId: user.id,
      operatorEmail: user.email,
      correlationId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      version: body.version,
    });
  }
}
