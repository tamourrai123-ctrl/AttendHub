import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Body for PATCH /companies/mine. Deliberately its OWN class rather than a
 * PartialType of CreateCompanyDto/UpdateCompanyDto — those carry fields
 * (id, shortname, email, status, country) that make no sense for a Company
 * Admin's self-service form and whose validation (e.g. platform-wide unique
 * shortname) has nothing to do with this save. Every field here maps to a
 * real, directly-editable `usm_company` scalar column.
 */
export class UpdateCompanySettingsDto {
  @ApiPropertyOptional({ example: 'Acme Pvt Ltd', description: 'usm_company.title (max 200 characters, must stay unique platform-wide).' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  companyName?: string;

  @ApiPropertyOptional({ example: '12 Industrial Avenue, Karachi, Pakistan' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  address?: string;

  @ApiPropertyOptional({ example: '+92 300 1234567' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ example: '+92 21 1234567' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  fax?: string;

  @ApiPropertyOptional({ example: 'https://acme.test' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  website?: string;

  @ApiPropertyOptional({ example: 'GST-1234567', description: 'usm_company."GST#".' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  gstNumber?: string;

  @ApiPropertyOptional({ example: 'NTN-1234567', description: 'usm_company."NTN#".' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  ntnNumber?: string;
}
