import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Operational V1 — name-only update.
 * slug / baseUrl / isActive are rejected by ValidationPipe (forbidNonWhitelisted).
 * Slug is permanently read-only here: changing it requires a future dedicated
 * migration/rename operation (hostnames, Netlify aliases, bootstrap).
 * Activate / deactivate / DELETE (soft) stay on dedicated lifecycle endpoints.
 */
export class UpdateWhitelabelDto {
  @ApiProperty({ description: 'Display name only (Operational V1)' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;
}
