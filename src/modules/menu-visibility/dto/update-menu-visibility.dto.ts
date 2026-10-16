import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsObject, IsOptional, Min } from 'class-validator';

export class UpdateMenuVisibilityDto {
  @ApiProperty({
    description: 'Full visibility map for known menu IDs (PUT replaces entire config)',
    example: { dashboard: true, whitelabels: true, contas: false },
  })
  @IsObject()
  visibility!: Record<string, boolean>;

  @ApiPropertyOptional({
    description: 'Optimistic concurrency token from last GET.data.version. Required when a row already exists.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  version?: number;
}

/** Runtime check — class-validator alone cannot enforce known keys + booleans tightly enough. */
export function assertVisibilityMap(
  visibility: Record<string, unknown>,
  knownIds: readonly string[],
  lockedIds: readonly string[] = [],
): { ok: true; map: Record<string, boolean> } | { ok: false; message: string; code?: string } {
  if (!visibility || typeof visibility !== 'object' || Array.isArray(visibility)) {
    return { ok: false, message: 'visibility must be an object' };
  }

  const known = new Set(knownIds);
  const locked = new Set(lockedIds);
  const map: Record<string, boolean> = {};

  for (const [key, value] of Object.entries(visibility)) {
    if (!known.has(key)) {
      return { ok: false, message: `Unknown menu id: ${key}` };
    }
    if (typeof value !== 'boolean') {
      return { ok: false, message: `visibility.${key} must be boolean` };
    }
    if (locked.has(key) && value === false) {
      return {
        ok: false,
        code: 'E_MENU_LOCKED',
        message: `Menu id "${key}" cannot be hidden`,
      };
    }
    map[key] = value;
  }

  for (const id of knownIds) {
    if (!(id in map)) {
      return { ok: false, message: `Missing menu id in visibility map: ${id}` };
    }
  }

  for (const id of locked) {
    map[id] = true;
  }

  return { ok: true, map };
}
