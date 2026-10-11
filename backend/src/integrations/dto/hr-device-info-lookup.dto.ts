import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Body for POST /api/hr/device-info (Company Admin only). The HR username
 * travels in the body, not the URL, so it never reaches request-URL logs.
 * The executor URL-encodes it when filling {{username}} in the company's path.
 */
export class HrDeviceInfoLookupDto {
  @ApiProperty({ example: 'Muhammad Shazil Ali', description: "The HR login/user name whose device record to look up." })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  username!: string;
}
