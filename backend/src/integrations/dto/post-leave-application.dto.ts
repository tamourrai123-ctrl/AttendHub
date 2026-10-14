import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * Body of POST /api/hr/leave — a leave application from the mobile app.
 *
 * companyId / employeeCode / employeeName / source / appliedOn are deliberately NOT part of this DTO: they are set
 * by the hub (from the caller's session and the server clock), never taken from the request body — same rule as
 * PostAttendancePunchDto. The global ValidationPipe uses forbidNonWhitelisted, so a client that sends any of them
 * gets a 400.
 */
export class PostLeaveApplicationDto {
  @ApiProperty({ example: 'Annual Leave', description: 'Leave type, as the HR system names it (see GET /api/hr/leave for the types).' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  leaveType!: string;

  @ApiProperty({ example: '2026-11-03', description: 'First day of leave (ISO 8601 date).' })
  @IsISO8601()
  fromDate!: string;

  @ApiProperty({ example: '2026-11-05', description: 'Last day of leave (ISO 8601 date), on or after fromDate.' })
  @IsISO8601()
  toDate!: string;

  @ApiPropertyOptional({ example: 3, description: 'Number of leave days (half days allowed, e.g. 0.5). Optional: sent to HR only if the admin mapped "Total Days".' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0.5)
  @Max(366)
  totalDays?: number;

  @ApiPropertyOptional({ example: 'Family event', description: 'Reason for the leave.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
