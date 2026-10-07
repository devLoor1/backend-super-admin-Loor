import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBooleanString, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class WhitelabelFiltersDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by active flag' })
  @IsOptional()
  @IsBooleanString()
  active?: string;
}
