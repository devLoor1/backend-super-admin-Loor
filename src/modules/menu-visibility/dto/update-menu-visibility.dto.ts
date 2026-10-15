import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';

export class UpdateMenuVisibilityDto {
  @ApiProperty({
    description: 'Full visibility map for known menu IDs (PUT replaces entire config)',
    example: { dashboard: true, whitelabels: true, contas: false },
  })
  @IsObject()
  visibility!: Record<string, boolean>;
}

/** Runtime check — class-validator alone cannot enforce known keys + booleans tightly enough. */
export function assertVisibilityMap(
  visibility: Record<string, unknown>,
  knownIds: readonly string[],
): { ok: true; map: Record<string, boolean> } | { ok: false; message: string } {
  if (!visibility || typeof visibility !== 'object' || Array.isArray(visibility)) {
    return { ok: false, message: 'visibility must be an object' };
  }

  const known = new Set(knownIds);
  const map: Record<string, boolean> = {};

  for (const [key, value] of Object.entries(visibility)) {
    if (!known.has(key)) {
      return { ok: false, message: `Unknown menu id: ${key}` };
    }
    if (typeof value !== 'boolean') {
      return { ok: false, message: `visibility.${key} must be boolean` };
    }
    map[key] = value;
  }

  for (const id of knownIds) {
    if (!(id in map)) {
      return { ok: false, message: `Missing menu id in visibility map: ${id}` };
    }
  }

  return { ok: true, map };
}
