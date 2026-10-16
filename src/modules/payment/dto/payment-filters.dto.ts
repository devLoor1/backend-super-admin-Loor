import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class PaymentFiltersDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  whitelabelId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  investorId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  opportunityId?: number;

  @ApiPropertyOptional({
    enum: ['paid', 'waiting_payment', 'expired', 'refunded'],
  })
  @IsOptional()
  @IsIn(['paid', 'waiting_payment', 'expired', 'refunded'])
  status?: 'paid' | 'waiting_payment' | 'expired' | 'refunded';
}
