import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  // Definite-assignment assertions (!) on required DTO fields: these
  // classes are never constructed with `new` — Nest's ValidationPipe
  // populates them via class-transformer from the incoming request body —
  // so TypeScript's strictPropertyInitialization has no way to see that,
  // and would otherwise flag every required field as never assigned.
  @ApiProperty({ example: 'admin@tamotam.test' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'admin123' })
  @IsString()
  @IsNotEmpty()
  password!: string;
}
