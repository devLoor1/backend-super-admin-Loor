import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUrl, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateWhitelabelDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'finapop' })
  @IsString()
  @Matches(/^[a-z0-9-]+$/)
  @MaxLength(80)
  slug!: string;

  @ApiProperty({ example: 'https://finapop.loor.vc' })
  @IsUrl({ require_tld: false })
  baseUrl!: string;
}
