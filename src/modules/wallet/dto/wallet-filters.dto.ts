import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/** Official wallet list filters — only these are applied. */
export class WalletFiltersDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  perPage?: number = 20;

  @ApiPropertyOptional({ description: 'Search Whitelabel name / slug' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ['createdAt', 'name'], default: 'createdAt' })
  @IsOptional()
  @IsIn(['createdAt', 'name'])
  sort?: 'createdAt' | 'name';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';

  @ApiPropertyOptional({ description: 'Restrict list to one Whitelabel wallet' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  whitelabelId?: number;
}

/**
 * Movements: page/perPage + optional ledger filters only.
 * search / sort / order are NOT supported → Nest returns 400 if sent.
 */
export class WalletMovementsQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  perPage?: number = 20;

  @ApiPropertyOptional({ enum: ['in', 'out'] })
  @IsOptional()
  @IsIn(['in', 'out'])
  kind?: 'in' | 'out';

  @ApiPropertyOptional({
    enum: [
      'investment_paid',
      'installment_paid',
      'refund',
      'entrepreneur_cashout',
      'investor_payout',
    ],
  })
  @IsOptional()
  @IsIn([
    'investment_paid',
    'installment_paid',
    'refund',
    'entrepreneur_cashout',
    'investor_payout',
  ])
  category?:
    | 'investment_paid'
    | 'installment_paid'
    | 'refund'
    | 'entrepreneur_cashout'
    | 'investor_payout';

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  opportunityId?: number;
}

/** Nested investments under a wallet = Investments filtered by whitelabelId=:id */
export class WalletInvestmentsQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  perPage?: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sort?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';

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
