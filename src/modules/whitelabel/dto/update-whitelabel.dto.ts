import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Operational V1 — name-only update.
 * slug / baseUrl / isActive are rejected by ValidationPipe (forbidNonWhitelisted).
 * Activate / deactivate / DELETE stay on dedicated endpoints (FE must keep them OFF).
 */
export class UpdateWhitelabelDto {
  @ApiProperty({ description: 'Display name only (Operational V1)' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;
}
