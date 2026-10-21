import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { RoleSlug } from '@prisma/client';

export class CreateOperatorDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty({ description: 'Strong password (min 10, upper, lower, digit, special)' })
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/, {
    message: 'password must include upper, lower, digit and special character',
  })
  password!: string;

  @ApiProperty({ enum: RoleSlug, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(RoleSlug, { each: true })
  roles!: RoleSlug[];
}
