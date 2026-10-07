import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

/** Matches FE `?tipo=` on `#/whitelabels/:id/accounts`. */
export const ACCOUNT_TIPO_VALUES = [
  'investidores',
  'empreendedores',
  'administradores',
] as const;

export type AccountTipo = (typeof ACCOUNT_TIPO_VALUES)[number];

export class AccountFiltersDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: ACCOUNT_TIPO_VALUES,
    description: 'FE route query `tipo` (investidores | empreendedores | administradores)',
  })
  @IsOptional()
  @IsIn(ACCOUNT_TIPO_VALUES)
  tipo?: AccountTipo;

  @ApiPropertyOptional({
    enum: ['investor', 'entrepreneur', 'admin'],
    description: 'Internal type alias (same as FE AccountType)',
  })
  @IsOptional()
  @IsIn(['investor', 'entrepreneur', 'admin'])
  type?: 'investor' | 'entrepreneur' | 'admin';

  @ApiPropertyOptional({ description: 'Access filter: active | paused (when Core supports it)' })
  @IsOptional()
  @IsString()
  access?: string;
}
