import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateInvestorDto {
  @ApiProperty({ example: 'Maria Silva' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(256)
  fullName: string;

  @ApiProperty({ example: 'maria@example.com' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ example: '11999999999' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(30)
  phone: string;

  @ApiProperty({ enum: ['pessoa_fisica', 'pessoa_juridica'] })
  @IsIn(['pessoa_fisica', 'pessoa_juridica'])
  type: 'pessoa_fisica' | 'pessoa_juridica';
}
