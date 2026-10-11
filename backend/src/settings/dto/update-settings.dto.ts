import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Both nested groups are optional on the PATCH body, and every field within
 * each group is optional too — a Super Admin can update just one setting
 * (e.g. only sessionTimeoutMinutes) without resending the rest. See
 * SettingsService.update() for how a partial body is merged onto the
 * stored settings.
 */
export class SecuritySettingsDto {
  @ApiProperty({ required: false, minimum: 5, maximum: 10080, description: 'Session lifetime in minutes. 10080 = 7 days, the practical ceiling.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(10080)
  sessionTimeoutMinutes?: number;

  @ApiProperty({ required: false, description: 'Stored preference only — not enforced anywhere yet.' })
  @IsOptional()
  @IsBoolean()
  requireTwoStepLogin?: boolean;
}

export class NotificationSettingsDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  systemErrorAlerts?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  apiFailureAlerts?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  integrationWarnings?: boolean;
}

export class UpdateSettingsDto {
  @ApiProperty({ required: false, type: SecuritySettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SecuritySettingsDto)
  security?: SecuritySettingsDto;

  @ApiProperty({ required: false, type: NotificationSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationSettingsDto)
  notifications?: NotificationSettingsDto;
}
