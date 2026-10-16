import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class InvestmentFiltersDto extends PaginationQueryDto {
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
    enum: [
      'expired',
      'waiting_payment',
      'paid',
      'refunded',
      'processing',
      'failed',
      'processing_refund',
    ],
  })
  @IsOptional()
  @IsIn([
    'expired',
    'waiting_payment',
    'paid',
    'refunded',
    'processing',
    'failed',
    'processing_refund',
  ])
  status?:
    | 'expired'
    | 'waiting_payment'
    | 'paid'
    | 'refunded'
    | 'processing'
    | 'failed'
    | 'processing_refund';
}
