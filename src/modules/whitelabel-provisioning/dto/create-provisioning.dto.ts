import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class InitialAdminDto {
  @ApiPropertyOptional({ example: 'Ana Admin' })
  @IsOptional()
  @IsString()
  @MaxLength(191)
  name?: string;

  @ApiProperty({ example: 'ana@cliente.example' })
  @IsEmail()
  @MaxLength(191)
  email!: string;

  @ApiProperty({
    minLength: 8,
    description:
      'Required by Core today. Held only in process memory — never stored in step payload/result, audit or responses.',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  temporaryPassword!: string;
}

export class ProvisioningTermsDto {
  @ApiProperty({ example: 'Termos de uso' })
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  title!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200000)
  contentMarkdown!: string;
}

export class ProvisioningGatewayDto {
  @ApiProperty({
    type: 'array',
    items: { type: 'object' },
    description:
      'Forwarded as PUT gateways `{ items }` (full replace). May contain API keys → kept in memory only.',
  })
  @IsArray()
  @ArrayMaxSize(50)
  items!: unknown[];
}

export class CreateProvisioningDto {
  @ApiProperty({ example: 'Acme Capital', minLength: 2, maxLength: 120 })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'acme-capital' })
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase alphanumeric with optional hyphens',
  })
  @MaxLength(80)
  slug!: string;

  @ApiProperty({ example: 'https://acme-capital.wallet.loor.vc' })
  @IsUrl({
    require_tld: false,
    require_protocol: true,
    protocols: ['http', 'https'],
    allow_underscores: false,
  })
  @Matches(/^https?:\/\/[^/\s@]+(?:[/?#]|$)/i, {
    message: 'baseUrl must be an absolute http(s) URL without credentials',
  })
  @MaxLength(512)
  baseUrl!: string;

  @ApiPropertyOptional({
    description:
      'Core Whitelabel id whose stored (allowlisted) settings cells are copied.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  templateFromWhitelabelId?: number;

  @ApiPropertyOptional({ type: InitialAdminDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => InitialAdminDto)
  initialAdmin?: InitialAdminDto;

  @ApiPropertyOptional({ type: ProvisioningTermsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ProvisioningTermsDto)
  terms?: ProvisioningTermsDto;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description:
      'SMTP PUT body (host, port, secure, username, password, fromEmail, fromName, …).',
  })
  @IsOptional()
  @IsObject()
  smtp?: Record<string, unknown>;

  @ApiPropertyOptional({ type: ProvisioningGatewayDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ProvisioningGatewayDto)
  gateway?: ProvisioningGatewayDto;

  @ApiPropertyOptional({
    default: false,
    description: 'When false (default) FE_DEPLOY_CHECK becomes a manual gate.',
  })
  @IsOptional()
  @IsBoolean()
  skipFeDeployCheck?: boolean;

  @ApiPropertyOptional({
    default: false,
    description: 'When false (default) DNS_CHECK becomes a manual gate.',
  })
  @IsOptional()
  @IsBoolean()
  skipDnsCheck?: boolean;
}
