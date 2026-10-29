import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateEntrepreneurDto {
  @ApiProperty({ example: 'João Santos' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(256)
  fullName: string;

  @ApiProperty({ example: 'joao@empresa.com' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ example: '11988888888' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(30)
  phone: string;
}
