import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class OpportunityFiltersDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by Core Whitelabel id' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  whitelabelId?: number;

  @ApiPropertyOptional({
    enum: ['review', 'active', 'finished', 'archived'],
    description: 'Official Opportunity status vocabulary',
  })
  @IsOptional()
  @IsIn(['review', 'active', 'finished', 'archived'])
  status?: 'review' | 'active' | 'finished' | 'archived';

  @ApiPropertyOptional({
    enum: ['equity', 'debt'],
    description: 'Modality only — Capital de Giro is never a modality',
  })
  @IsOptional()
  @IsIn(['equity', 'debt'])
  modality?: 'equity' | 'debt';
}
