import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Body for POST /api/hr/login-session. Only the device facts the HR system's login_sessions API takes from the
 * app. company_id and add_by are never taken from the request: they come from the caller's session.
 */
export class HrLoginSessionDto {
  @ApiPropertyOptional({ example: '1108', description: "The HR system's own user id, if the app has it." })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  userId?: string;

  @ApiProperty({ example: 'a1b2c3d4e5f6' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  deviceId!: string;

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
