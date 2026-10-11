import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * Public, unauthenticated self-signup: creates a brand-new tenant
 * (usm_company) plus its first admin user (usm_users, is_admin='Y') in one
 * atomic transaction — see AuthService.signup(). Unlike CreateCompanyDto
 * (a Super Admin action), the caller never supplies usm_company.id here: a
 * real, DB-side-unmanaged 2-character id is generated server-side (with
 * retry-on-collision), exactly like CreateCompanyDto documents usm_company.id
 * has no database sequence/identity of its own.
 */
export class SignupDto {
  @ApiProperty({ example: 'Acme Pvt Ltd', description: 'usm_company.title' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  companyName!: string;

  // usm_company.shortname is required + globally unique in Postgres (see
  // CreateCompanyDto) — collected explicitly here too, same as the Super
  // Admin "create company" flow.
  @ApiProperty({ example: 'ACME', description: 'Short unique company name (usm_company.shortname, max 10 characters).' })
  @IsString()
  @IsNotEmpty()
  @Length(1, 10)
  companyShortname!: string;

  @ApiProperty({ example: 'Jane Doe', description: "The signing-up admin's name (usm_users.user_name)." })
  @IsString()
  @IsNotEmpty()
  adminName!: string;

  @ApiProperty({ example: 'jane.doe@acme.test' })
  @IsEmail()
  email!: string;

  // Minimum practical password policy for this phase — not configurable,
  // not over-engineered (no character-class zoo, no breached-password
  // check): at least 8 characters, containing at least one letter and one
  // digit. Hashed with bcryptjs before ever reaching the database — see
  // password.util.ts.
  @ApiProperty({
    example: 'Str0ngPassword',
    description: 'At least 8 characters, containing at least one letter and one digit.',
  })
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, { message: 'password must contain at least one letter and one digit' })
  password!: string;

  @ApiProperty({ required: false, example: '+92 300 1234567', description: 'usm_company.phone' })
  @IsOptional()
  @IsString()
  phone?: string;

  // Same documented limitation as CreateCompanyDto.country: usm_company.country
  // is a required integer with no default and no populated LOV yet.
  // Defaults to 1 (this project's established placeholder — see
  // CreateCompanyDto) when the signup form doesn't collect it yet.
  @ApiProperty({
    required: false,
    example: 1,
    description: 'Country lookup id (usm_company.country). Defaults to 1 — see CreateCompanyDto for why.',
  })
  @IsOptional()
  @IsInt()
  country?: number;
}
