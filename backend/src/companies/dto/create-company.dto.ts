import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsInt, IsNotEmpty, IsString, Length } from 'class-validator';
import { CompanyStatus } from '../interfaces/company.interface';

export class CreateCompanyDto {
  // Definite-assignment assertions (!) on required fields: these DTOs are
  // populated by Nest's ValidationPipe via class-transformer, never by
  // `new CreateCompanyDto()`, so strictPropertyInitialization can't see
  // that the fields are actually assigned.

  // usm_company.id is a 2-character primary key with no database-side
  // generation (no sequence/identity) — the Super Admin supplies it
  // directly rather than the server generating one.
  @ApiProperty({ example: 'AB', description: 'Company code — becomes the primary key (usm_company.id). 1-2 characters, chosen by the caller.' })
  @IsString()
  @Length(1, 2)
  id!: string;

  @ApiProperty({ example: 'Acme Pvt Ltd' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  // usm_company.shortname is required + unique in Postgres with no
  // corresponding source elsewhere, so it's collected explicitly too.
  @ApiProperty({ example: 'ACME', description: 'Short unique name (usm_company.shortname, max 10 characters).' })
  @IsString()
  @IsNotEmpty()
  @Length(1, 10)
  shortname!: string;

  @ApiProperty({ example: 'ops@acme.test' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Jane Doe' })
  @IsString()
  @IsNotEmpty()
  contactPerson!: string;

  @ApiProperty({ example: '+92 300 1234567' })
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'] })
  @IsEnum(['ACTIVE', 'INACTIVE', 'SUSPENDED'])
  status!: CompanyStatus;

  // usm_company.country is a required integer with no default. It is
  // intended to eventually reference a Country entry under
  // app_lov_master/app_lov_detail, but that LOV is empty right now and no
  // foreign key exists at the database level — so this is stored exactly
  // as supplied, with no validation against the LOV table yet.
  @ApiProperty({
    example: 1,
    description:
      'Country lookup id (usm_company.country). Not yet validated against app_lov_detail — that Country LOV is not populated yet.',
  })
  @IsInt()
  country!: number;
}
