import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ description: 'The raw token emailed to the user by POST /auth/forgot-password.' })
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiProperty({ example: 'Str0ngNewPassword', description: 'At least 8 characters, containing at least one letter and one digit.' })
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, { message: 'newPassword must contain at least one letter and one digit' })
  newPassword!: string;
}
