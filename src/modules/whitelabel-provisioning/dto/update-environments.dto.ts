import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
} from 'class-validator';

export const ENVIRONMENT_CAPABILITIES = [
  'INVESTOR',
  'ENTREPRENEUR',
  'ADMIN',
] as const;

export type EnvironmentCapability =
  (typeof ENVIRONMENT_CAPABILITIES)[number];

export class UpdateEnvironmentsDto {
  @ApiPropertyOptional({
    enum: ENVIRONMENT_CAPABILITIES,
    isArray: true,
    description:
      'Environments to contract. Existing environments are idempotent no-ops.',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(3)
  @IsIn(ENVIRONMENT_CAPABILITIES, { each: true })
  enable?: EnvironmentCapability[];

  @ApiPropertyOptional({
    enum: ENVIRONMENT_CAPABILITIES,
    isArray: true,
    description:
      'Environments to mark inactive. Netlify aliases, DNS, SSL and tenant data are deliberately retained.',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(3)
  @IsIn(ENVIRONMENT_CAPABILITIES, { each: true })
  disable?: EnvironmentCapability[];
}
