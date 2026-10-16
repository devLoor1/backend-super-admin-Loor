import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class CompanyFiltersDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by Core Whitelabel id' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  whitelabelId?: number;

  @ApiPropertyOptional({
    enum: ['pending', 'validated', 'invalid', 'not_found', 'unavailable'],
    description: 'Official EntrepreneurCompany validationStatus vocabulary',
  })
  @IsOptional()
  @IsIn(['pending', 'validated', 'invalid', 'not_found', 'unavailable'])
  status?: 'pending' | 'validated' | 'invalid' | 'not_found' | 'unavailable';
}
