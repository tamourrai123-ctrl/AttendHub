import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ description: "The authenticated user's current password, re-verified server-side before any change." })
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @ApiProperty({ example: 'Str0ngNewPassword', description: 'At least 8 characters, containing at least one letter and one digit.' })
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, { message: 'newPassword must contain at least one letter and one digit' })
  newPassword!: string;
}
