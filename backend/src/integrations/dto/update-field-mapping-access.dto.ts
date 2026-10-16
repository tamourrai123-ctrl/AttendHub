import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateFieldMappingAccessDto {
  @ApiProperty({ description: 'true lets the Company Admin edit this endpoint\'s field mappings; false locks them.' })
  @IsBoolean()
  enabled!: boolean;
}
