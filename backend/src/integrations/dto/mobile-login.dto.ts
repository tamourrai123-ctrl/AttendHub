import { ApiProperty } from '@nestjs/swagger';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Body for POST /auth/mobile/login. Deliberately separate from
 * auth/dto/login.dto.ts (the web admin login, email + password) — a mobile
 * employee has no account in AttendHub's own database at all (see
 * MobileAuthService's class doc comment), so there is nothing here for a
 * bcrypt check to run against; every field is forwarded to the company's
 * connected HR system instead.
 *
 * `companyShortName` (usm_company.shortname, unique, max 10 chars) is
 * required because this route runs before any session exists — there is no
 * companyId to resolve from a token yet, unlike every other authenticated
 * route in this app. `username`/`password` are intentionally generic names:
 * a real HR system might call the first one an employee code, a login id,
 * or something else entirely — whatever it is, the Company Admin maps it to
 * the HR API's own field name via the "Employee Login" endpoint's field
 * mappings (see endpoint-purposes.constant.ts's EMPLOYEE_LOGIN purpose).
 */
export class MobileLoginDto {
  @ApiProperty({ example: 'ACME', description: "usm_company.shortname — identifies which company's HR system to check against." })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  companyShortName!: string;

  @ApiProperty({ example: 'EMP-0042', description: "Whatever identifier the employee logs in with on the mobile app — forwarded to HR, never checked locally." })
  @IsString()
  @IsNotEmpty()
  username!: string;

  @ApiProperty({ example: 'hunter2', description: 'Forwarded to the HR system as-is — never stored, hashed, or compared against AttendHub\'s own database.' })
  @IsString()
  @IsNotEmpty()
  password!: string;

  @ApiPropertyOptional({ example: 'a1b2c3d4e5f6', description: 'Device id. Every successful login is also recorded as a session with the HR system (needs a "Login Session" endpoint); send the device details so HR gets them.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  deviceId?: string;

  @ApiPropertyOptional({ example: 'TECNO TECNO CLA5' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  deviceName?: string;

  @ApiPropertyOptional({ example: '1.0.0' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  appVersion?: string;

  @ApiPropertyOptional({ example: '192.168.1.100' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  ipAddress?: string;
}
