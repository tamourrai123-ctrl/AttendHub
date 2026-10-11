import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyEmailDto {
  @ApiProperty({ description: 'The raw token emailed to the user at signup.' })
  @IsString()
  @IsNotEmpty()
  token!: string;
}
