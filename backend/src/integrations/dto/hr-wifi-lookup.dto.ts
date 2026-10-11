import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Body for POST /api/hr/wifi. The WiFi name travels in the body, not the URL,
 * so it never reaches request-URL logs. It may contain spaces; the executor
 * URL-encodes it when filling {{wifiName}} in the company's configured path.
 */
export class HrWifiLookupDto {
  @ApiProperty({ example: 'Ovacsol Ptcl', description: 'The WiFi network name to look up in the HR system.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  wifiName!: string;
}
