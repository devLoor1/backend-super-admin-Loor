import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsEnum } from 'class-validator';
import { RoleSlug } from '@prisma/client';

export class UpdateOperatorRolesDto {
  @ApiProperty({ enum: RoleSlug, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(RoleSlug, { each: true })
  roles!: RoleSlug[];
}
