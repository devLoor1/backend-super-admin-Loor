import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
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

export const MAIN_AREA_PAGES = ['login', 'register', 'quick_profile'] as const;
export type MainAreaPage = (typeof MAIN_AREA_PAGES)[number];

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
/** Absolute http(s) URL without embedded credentials. */
const HTTP_URL_NO_CREDS = /^https?:\/\/[^/\s@]+(?:[/?#]\S*)?$/i;

export class BrandingEmailDto {
  @ApiPropertyOptional({
    example: '#1a2b3c',
    nullable: true,
    description: 'Hex #rrggbb. Explicit null clears the value in Core.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Matches(HEX_COLOR, { message: 'primary_color must be #rrggbb' })
  primary_color?: string | null;

  @ApiPropertyOptional({
    example: 'https://cdn.cliente.example/logo.png',
    nullable: true,
    description:
      'Public http(s) URL without credentials. Explicit null clears the value in Core.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(2048)
  @Matches(HTTP_URL_NO_CREDS, {
    message: 'logo_url must be an absolute http(s) URL without credentials',
  })
  logo_url?: string | null;
}

export class BrandingMainAreaDto {
  @ApiPropertyOptional({
    enum: MAIN_AREA_PAGES,
    isArray: true,
    default: ['login'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @ArrayUnique()
  @IsIn(MAIN_AREA_PAGES, { each: true })
  pages?: MainAreaPage[];
}

export class ProvisioningBrandingDto {
  @ApiPropertyOptional({ type: BrandingEmailDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BrandingEmailDto)
  email?: BrandingEmailDto;

  @ApiPropertyOptional({ example: '#ffffff' })
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR, {
    message: 'loginBrandPanelTextColor must be #rrggbb',
  })
  loginBrandPanelTextColor?: string;

  @ApiPropertyOptional({ type: BrandingMainAreaDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BrandingMainAreaDto)
  mainArea?: BrandingMainAreaDto;
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
    isArray: true,
    enum: ['INVESTOR', 'ENTREPRENEUR', 'ADMIN'],
    description:
      'Contracted FE environments. At least one required when sent. Omitted → all three (legacy). ' +
      'Gates and DELIVER only require/return URLs for enabled environments.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @ArrayMaxSize(3)
  @IsIn(['INVESTOR', 'ENTREPRENEUR', 'ADMIN'], { each: true })
  enabledEnvironments?: Array<'INVESTOR' | 'ENTREPRENEUR' | 'ADMIN'>;

  @ApiPropertyOptional({
    enum: ['HOSTNAME', 'PATH'],
    description:
      'HOSTNAME = {slug}.investor|empresa|admin.loor.vc (future). ' +
      'PATH = shared Netlify /w/{slug} demo links (homolog without wildcard DNS). ' +
      'Omitted → PROVISIONING_FRONTEND_URL_MODE env, else HOSTNAME.',
  })
  @IsOptional()
  @IsIn(['HOSTNAME', 'PATH'])
  urlMode?: 'HOSTNAME' | 'PATH';

  @ApiPropertyOptional({
    default: false,
    description:
      'When true, skips automatic shared-frontend readiness (FE_DEPLOY_CHECK). ' +
      'When false (default), Nest verifies DNS+HTTPS+bootstrap for enabled environments.',
  })
  @IsOptional()
  @IsBoolean()
  skipFeDeployCheck?: boolean;

  @ApiPropertyOptional({
    type: ProvisioningBrandingDto,
    description:
      'Client branding applied by UPLOAD_BRAND (email_branding, login panel text color, main_area image). ' +
      'The image itself travels as multipart field `mainAreaImage`. Institutional logo / favicon / PWA icons are build-time and NOT handled here.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ProvisioningBrandingDto)
  branding?: ProvisioningBrandingDto;

  @ApiPropertyOptional({
    default: false,
    description:
      'When true, skips automatic DNS/HTTPS/tenant readiness (DNS_CHECK). ' +
      'Default false runs the same public readiness checks as FE_DEPLOY_CHECK.',
  })
  @IsOptional()
  @IsBoolean()
  skipDnsCheck?: boolean;
}
