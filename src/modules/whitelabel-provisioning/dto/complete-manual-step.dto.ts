import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/**
 * Boolean checklist (only relevant keys are required per gate):
 * - FE_DEPLOY_CHECK: investor + entrepreneur + admin
 * - DNS_CHECK: resolves + https
 *
 * Structured URLs/hosts are required in addition to the booleans
 * (see CompleteManualStepDto.urls / .hosts).
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

export class ManualFrontendUrlsDto {
  @ApiProperty({ example: 'https://acme.investor.loor.vc' })
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  @MaxLength(512)
  investor!: string;

  @ApiProperty({ example: 'https://acme.empresa.loor.vc' })
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  @MaxLength(512)
  entrepreneur!: string;

  @ApiProperty({ example: 'https://acme.admin.loor.vc' })
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  @MaxLength(512)
  admin!: string;
}

export class ManualDnsHostDto {
  @ApiProperty({ example: 'https://acme.investor.loor.vc' })
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  @MaxLength(512)
  url!: string;

  @ApiProperty({ enum: ['ok'] })
  @IsIn(['ok'])
  status!: 'ok';

  @ApiProperty({ description: 'Must be true (operator attestation).' })
  @IsBoolean()
  https!: boolean;
}

export class ManualDnsHostsDto {
  @ApiProperty({ type: ManualDnsHostDto })
  @ValidateNested()
  @Type(() => ManualDnsHostDto)
  investor!: ManualDnsHostDto;

  @ApiProperty({ type: ManualDnsHostDto })
  @ValidateNested()
  @Type(() => ManualDnsHostDto)
  entrepreneur!: ManualDnsHostDto;

  @ApiProperty({ type: ManualDnsHostDto })
  @ValidateNested()
  @Type(() => ManualDnsHostDto)
  admin!: ManualDnsHostDto;
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

  @ApiPropertyOptional({
    type: ManualFrontendUrlsDto,
    description:
      'Required for FE_DEPLOY_CHECK: real https origins for investor, entrepreneur and admin.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ManualFrontendUrlsDto)
  urls?: ManualFrontendUrlsDto;

  @ApiPropertyOptional({
    type: ManualDnsHostsDto,
    description:
      'Required for DNS_CHECK: per-environment host attestation (url + status=ok + https=true). Nest does not probe DNS.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ManualDnsHostsDto)
  hosts?: ManualDnsHostsDto;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
