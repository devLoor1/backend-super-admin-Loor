import { BadRequestException, Controller, Get, Param, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '../../common/constants/roles';
import {
  WalletFiltersDto,
  WalletInvestmentsQueryDto,
  WalletMovementsQueryDto,
} from './dto/wallet-filters.dto';
import { WalletService } from './wallet.service';

@ApiTags('Wallet')
@ApiBearerAuth()
@Controller('wallets')
export class WalletController {
  constructor(private readonly service: WalletService) {}

  @Get()
  @Roles(ROLES.SUPER_ADMIN, ROLES.FINANCIAL_ADMIN, ROLES.READ_ONLY)
  @ApiOperation({ summary: 'List Whitelabel ledger wallets (read-only). No balance edits.' })
  list(
    @Query() query: WalletFiltersDto,
    @Req() req: Request & { correlationId?: string },
  ) {
    return this.service.list(query, req.correlationId);
  }

  @Get(':id')
  @Roles(ROLES.SUPER_ADMIN, ROLES.FINANCIAL_ADMIN, ROLES.READ_ONLY)
  detail(@Param('id') id: string, @Req() req: Request & { correlationId?: string }) {
    this.assertId(id);
    return this.service.detail(id, req.correlationId);
  }

  @Get(':id/movements')
  @Roles(ROLES.SUPER_ADMIN, ROLES.FINANCIAL_ADMIN, ROLES.READ_ONLY)
  @ApiOperation({
    summary:
      'Ledger movements. search/sort/order not supported (400). CPF masked on counterparty.document.',
  })
  movements(
    @Param('id') id: string,
    @Query() query: WalletMovementsQueryDto,
    @Req() req: Request & { correlationId?: string },
  ) {
    this.assertId(id);
    return this.service.movements(id, query, req.correlationId);
  }

  @Get(':id/investments')
  @Roles(ROLES.SUPER_ADMIN, ROLES.FINANCIAL_ADMIN, ROLES.READ_ONLY)
  @ApiOperation({
    summary: 'Alias: GET /api/investments?whitelabelId=:id (same Investment list contract)',
  })
  investments(
    @Param('id') id: string,
    @Query() query: WalletInvestmentsQueryDto,
    @Req() req: Request & { correlationId?: string },
  ) {
    this.assertId(id);
    return this.service.investments(id, query, req.correlationId);
  }

  private assertId(id: string) {
    if (!/^\d+$/.test(id) || Number(id) <= 0) {
      throw new BadRequestException({
        code: 'E_VALIDATION',
        message: 'Wallet id must be a positive integer (whitelabelId)',
      });
    }
  }
}
