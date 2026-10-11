import { PartialType } from '@nestjs/swagger';
import { CreateEmployeeDto } from './create-employee.dto';

/**
 * All of CreateEmployeeDto's fields, made optional. companyId is still
 * absent (inherited from CreateEmployeeDto) — identity is immutable after
 * creation.
 *
 * There is no `password` field to inherit (see CreateEmployeeDto's doc
 * comment) — this endpoint cannot be used to set or change an employee's
 * login credential. A `password`/`c_password` field submitted in the
 * request body is REJECTED with 400 Bad Request by Nest's global
 * `forbidNonWhitelisted: true` ValidationPipe (see main.ts), the same as
 * any other unrecognized field — it is not silently stripped.
 */
export class UpdateEmployeeDto extends PartialType(CreateEmployeeDto) {}
