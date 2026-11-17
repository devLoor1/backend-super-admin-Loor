import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/**
 * Union of both gate checklists (only relevant keys are required per gate):
 * - FE_DEPLOY_CHECK: investor + entrepreneur + admin
 * - DNS_CHECK: resolves + https
 */
export class ManualChecklistDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  investor?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  entrepreneur?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  admin?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  resolves?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  https?: boolean;
}

export class CompleteManualStepDto {
  @ApiProperty({
    type: ManualChecklistDto,
    description:
      'FE_DEPLOY_CHECK → { investor, entrepreneur, admin }; DNS_CHECK → { resolves, https }. All relevant flags must be true.',
  })
  @ValidateNested()
  @Type(() => ManualChecklistDto)
  checklist!: ManualChecklistDto;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
