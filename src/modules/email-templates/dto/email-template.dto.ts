import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsObject,
  IsString,
  Length,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class EmailTemplateCreateDto {
  [key: string]: unknown;

  @IsString()
  @Length(1, 256)
  name!: string;

  @IsString()
  @Length(1, 64)
  type!: string;

  @IsString()
  @Length(1, 512)
  subject!: string;

  @IsString()
  @Length(1, 150000)
  body_html!: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  active?: boolean;
}

export class EmailTemplateUpdateDto {
  [key: string]: unknown;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Length(1, 256)
  name?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Length(1, 512)
  subject?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Length(1, 150000)
  body_html?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  active?: boolean;
}

export class EmailBrandingDraftDto {
  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsString()
  @Length(1, 32)
  primary_color?: string | null;

  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsString()
  @Length(1, 2048)
  logo_url?: string | null;
}

export class EmailTemplatePreviewDto {
  [key: string]: unknown;

  @IsString()
  @Length(1, 64)
  type!: string;

  @IsString()
  @Length(1, 512)
  subject!: string;

  @IsString()
  @Length(1, 150000)
  body_html!: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => EmailBrandingDraftDto)
  brandingDraft?: EmailBrandingDraftDto;
}
