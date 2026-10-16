import { BadRequestException, Controller, Get, Param, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '../../common/constants/roles';
import { PaymentFiltersDto } from './dto/payment-filters.dto';
import { PaymentService } from './payment.service';

@ApiTags('Payments')
@ApiBearerAuth()
@Controller('payments')
export class PaymentController {
  constructor(private readonly service: PaymentService) {}

  @Get()
  @Roles(ROLES.SUPER_ADMIN, ROLES.FINANCIAL_ADMIN, ROLES.READ_ONLY)
  list(
    @Query() query: PaymentFiltersDto,
    @Req() req: Request & { correlationId?: string },
  ) {
    return this.service.list(query, req.correlationId);
  }

  @Get(':id')
  @Roles(ROLES.SUPER_ADMIN, ROLES.FINANCIAL_ADMIN, ROLES.READ_ONLY)
  detail(@Param('id') id: string, @Req() req: Request & { correlationId?: string }) {
    if (!/^\d+$/.test(id) || Number(id) <= 0) {
      throw new BadRequestException({
        code: 'E_VALIDATION',
        message: 'Payment id must be a positive integer',
      });
    }
    return this.service.detail(id, req.correlationId);
  }
}
