import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class GoogleLoginDto {
  @ApiProperty({ description: 'The Google ID token (credential) returned by "Continue with Google" on the frontend.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  idToken!: string;
}
