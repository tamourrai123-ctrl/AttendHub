import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsLatitude, IsLongitude, IsOptional, IsString, MaxLength } from 'class-validator';

const PUNCH_STATES = ['IN', 'OUT'] as const;
export type PunchState = (typeof PUNCH_STATES)[number];

/**
 * Body the mobile app sends to POST /attendance/punch (Phase 2/Part B).
 * Deliberately does NOT include companyId, employeeCode, source, or
 * addedBy — those are never trusted from the client, exactly like every
 * other DTO in this codebase that has a tenant/identity field
 * (CreateIntegrationDto, CreateEndpointDto, ...):
 *   - companyId/employeeCode come from the caller's own JWT
 *     (AuthenticatedUser.companyId/employeeId), resolved to the linked HR
 *     employeeCode (Employee.externalEmployeeId) server-side.
 *   - source/addedBy are fixed, system-set labels identifying this as a
 *     mobile-app-originated punch — not something the caller picks — see
 *     AttendancePunchService.
 *
 * Only punchTime, state, latitude and longitude are always required.
 * wifi, qrCode, filename, fileMimetype and employeeImage are OPTIONAL
 * because not every company turns on every check (WiFi validation, QR scan,
 * selfie). When the app leaves one out, the field mapping engine sends the
 * mapping's default value, or null if no default is configured.
 */
export class PostAttendancePunchDto {
  @ApiProperty({ example: '2026-09-17T09:03:21.000Z', description: 'ISO 8601 timestamp of the punch.' })
  @IsISO8601()
  punchTime!: string;

  @ApiProperty({ enum: PUNCH_STATES, example: 'IN' })
  @IsIn(PUNCH_STATES)
  state!: PunchState;

  @ApiProperty({ example: 33.6844 })
  @IsLatitude()
  latitude!: number;

  @ApiProperty({ example: 73.0479 })
  @IsLongitude()
  longitude!: number;

  @ApiPropertyOptional({ example: 'Office-WiFi-5G', description: 'The WiFi network name the device was connected to at punch time. Omit when WiFi validation is off.' })
  @IsOptional()
  @IsString()
  wifi?: string;

  @ApiPropertyOptional({ example: 'QR-GATE-2', description: 'The QR code scanned at punch time. Omit when QR scanning is off.' })
  @IsOptional()
  @IsString()
  qrCode?: string;

  @ApiPropertyOptional({ example: 'selfie_20260917.jpg', description: 'Selfie file name. Omit when selfie is off.' })
  @IsOptional()
  @IsString()
  filename?: string;

  @ApiPropertyOptional({ example: 'image/jpeg', description: 'Selfie file type. Omit when selfie is off.' })
  @IsOptional()
  @IsString()
  fileMimetype?: string;

  @ApiPropertyOptional({ description: 'Base64-encoded selfie image data. Omit when selfie is off.' })
  @IsOptional()
  @IsString()
  employeeImage?: string;

  // Optional additions (company post_attendance API fields). Absent => behaves exactly as before.
  @ApiPropertyOptional({ example: 'UTF-8' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  fileCharset?: string;

  @ApiPropertyOptional({ example: 'CONNECTED', description: 'WiFi check status reported by the app (e.g. CONNECTED / OFFLINE).' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  wifiCheckStatus?: string;

  @ApiPropertyOptional({ example: '1.0.1' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  appVersion?: string;

  @ApiPropertyOptional({ example: '898', description: 'Document file id, if the app has one.' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  docFileId?: string;

  @ApiPropertyOptional({ description: 'Push notification token of the device.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  pushToken?: string;

  @ApiPropertyOptional({ example: 'N', enum: ['Y', 'N'], description: 'Y when the user logged out manually.' })
  @IsOptional()
  @IsIn(['Y', 'N'])
  manualLogoutFlag?: 'Y' | 'N';
}
