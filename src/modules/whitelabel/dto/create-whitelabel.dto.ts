import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUrl, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateWhitelabelDto {
  @ApiProperty({ example: 'Smoke Test WL' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'sa-smoke-wl' })
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase alphanumeric with optional hyphens',
  })
  @MaxLength(80)
  slug!: string;

  @ApiProperty({
    example: 'https://sa-smoke-wl.example.invalid',
    description: 'Absolute http(s) URL; localhost allowed (require_tld=false). No credentials.',
  })
  @IsUrl({
    require_tld: false,
    require_protocol: true,
    protocols: ['http', 'https'],
    allow_underscores: false,
  })
  @Matches(/^https?:\/\/[^/\s]+/i, {
    message: 'baseUrl must be an absolute http(s) URL without credentials',
  })
  baseUrl!: string;
}
