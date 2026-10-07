import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '../../common/constants/roles';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { WalletService } from './wallet.service';

@ApiTags('Wallet')
@ApiBearerAuth()
@Controller('wallets')
export class WalletController {
  constructor(private readonly service: WalletService) {}

  @Get()
  @Roles(ROLES.SUPER_ADMIN, ROLES.FINANCIAL_ADMIN, ROLES.READ_ONLY)
  @ApiOperation({ summary: 'List wallets (Core). No balance edits.' })
  list(@Query() query: PaginationQueryDto, @Req() req: Request & { correlationId?: string }) {
    return this.service.list(query, req.correlationId);
  }

  @Get(':id')
  @Roles(ROLES.SUPER_ADMIN, ROLES.FINANCIAL_ADMIN, ROLES.READ_ONLY)
  detail(@Param('id') id: string, @Req() req: Request & { correlationId?: string }) {
    return this.service.detail(id, req.correlationId);
  }

  @Get(':id/movements')
  @Roles(ROLES.SUPER_ADMIN, ROLES.FINANCIAL_ADMIN, ROLES.READ_ONLY)
  movements(
    @Param('id') id: string,
    @Query() query: PaginationQueryDto,
    @Req() req: Request & { correlationId?: string },
  ) {
    return this.service.movements(id, query, req.correlationId);
  }

  @Get(':id/investments')
  @Roles(ROLES.SUPER_ADMIN, ROLES.FINANCIAL_ADMIN, ROLES.READ_ONLY)
  investments(
    @Param('id') id: string,
    @Query() query: PaginationQueryDto,
    @Req() req: Request & { correlationId?: string },
  ) {
    return this.service.investments(id, query, req.correlationId);
  }
}
