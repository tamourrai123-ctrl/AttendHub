import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsNumberString, IsOptional, IsString, Length } from 'class-validator';

/**
 * Deliberately has no companyId field — a Company Admin can only ever
 * create employees under their own company, taken from their session
 * (see EmployeesController), never from the request body.
 *
 * Maps directly onto usm_users columns (see the Employees migration
 * report, sections A/K/L). employeeCode/department/designation/status/
 * joinedAt are NOT accepted here because usm_users has no corresponding
 * columns — see the Employee interface's doc comment.
 *
 * NO password field, by design. Employees are HR-system records, not
 * AttendHub portal accounts: employee credentials originate in the
 * connected external HR software, never in this application. This DTO
 * cannot be used to create or set an employee's login credential — there
 * is nothing here for the Company Admin to submit, and any `password` or
 * `c_password` field sent in the request body is REJECTED with 400 Bad
 * Request by Nest's global `forbidNonWhitelisted: true` ValidationPipe
 * (see main.ts), the same as any other unrecognized field.
 *
 * (usm_users.c_password is still NOT NULL with no default at the database
 * level — see PrismaEmployeesRepository.create() for how that constraint
 * is satisfied without this DTO ever accepting or generating a real
 * password.)
 *
 * integrationId/externalEmployeeId (Phase A.2): the minimal HR identity
 * key, both optional here (independently — each is validated on its own).
 * Neither is profile data — this is purely "which HR integration, and what
 * id does that HR system use for this person", nothing about who they are.
 * EmployeesService.create()/update() separately enforce that either both
 * are supplied or neither is: a half-set identity (an integration with no
 * external id, or vice versa) is never a meaningful state. That check is
 * deliberately done in the service, not with class-validator's
 * `@ValidateIf` here — `UpdateEmployeeDto` wraps every field in
 * `PartialType`'s own implicit `@IsOptional()`, which would otherwise
 * short-circuit a cross-field `@ValidateIf` on a partial update and let a
 * half-set identity slip through.
 * Supplying a non-existent integrationId for this company is rejected at
 * the database level (a foreign key to integration_master) and surfaced as
 * a 409, not a 400, since it's a valid-shaped id that just doesn't refer to
 * anything real yet.
 */
export class CreateEmployeeDto {
  // Definite-assignment assertions (!) on required fields: these DTOs are
  // populated by Nest's ValidationPipe via class-transformer, never by
  // `new CreateEmployeeDto()`, so strictPropertyInitialization can't see
  // that the fields are actually assigned.
  @ApiProperty({ example: 'Jane Doe', description: 'usm_users.user_name' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 'jane.doe@company.test', description: 'usm_users.email_address' })
  @IsEmail()
  email!: string;

  @ApiProperty({ required: false, example: '+92 300 1234567', description: 'usm_users.phone' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ required: false, example: '+92 300 7654321', description: 'usm_users.mobile' })
  @IsOptional()
  @IsString()
  mobile?: string;

  @ApiProperty({
    required: false,
    example: '7',
    description:
      'usm_users.integration_id — the HR integration (integration_master.id, scoped to this company) this employee is linked to. Must be supplied together with externalEmployeeId, or not at all.',
  })
  @IsOptional()
  @IsNumberString()
  integrationId?: string;

  @ApiProperty({
    required: false,
    example: 'HR-00042',
    description:
      "usm_users.external_employee_id — the connected HR system's own id for this employee (opaque string, no assumed format). Must be supplied together with integrationId, or not at all.",
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  externalEmployeeId?: string;
}
