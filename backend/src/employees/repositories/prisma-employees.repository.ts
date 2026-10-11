import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, usm_users } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { hashPassword } from '../../auth/utils/password.util';
import { generateRawToken } from '../../auth/utils/token.util';
import { Employee } from '../interfaces/employee.interface';
import { CreateEmployeeDto } from '../dto/create-employee.dto';
import { UpdateEmployeeDto } from '../dto/update-employee.dto';

/**
 * usm_users mixes multiple user types under one table (Company Admins,
 * possibly Super Admins, and plain Employees), all sharing the same
 * company_id relationship — see the Employees migration report, section F.
 * There is no CHECK constraint on is_admin/super_admin and no real data to
 * confirm the exact values (the table was empty as of the last check), so
 * this is the ONE place that assumption is made, and it deliberately
 * mirrors the existing application's role model rather than inventing a
 * new one: a row counts as a plain "Employee" for this API's purposes only
 * when it is not flagged as a Company Admin and not flagged as a Super
 * Admin. If real data or a documented convention later proves this wrong,
 * this is the only place that needs to change.
 */
const ADMIN_FLAG_VALUE = 'Y';
const SUPER_ADMIN_FLAG_VALUE = 'Y';

function isPlainEmployeeRow(row: Pick<usm_users, 'is_admin' | 'super_admin'>): boolean {
  return row.is_admin !== ADMIN_FLAG_VALUE && row.super_admin !== SUPER_ADMIN_FLAG_VALUE;
}

/**
 * Same is_admin/super_admin exclusion as isPlainEmployeeRow(), expressed as
 * Prisma WHERE fragments so list queries filter in PostgreSQL instead of
 * fetching every row and filtering in JS (see the Prisma repository audit
 * report, "N+1 queries" / pagination sections).
 *
 * Written as an explicit "IS NULL OR != 'Y'" OR-branch for super_admin
 * rather than relying on `{ not: 'Y' }` alone: super_admin is nullable, and
 * this way the result is correct regardless of exactly how Prisma/Postgres
 * treat NULL under `not` — a row with super_admin IS NULL must count as
 * "not a super admin", exactly like isPlainEmployeeRow() treats it in JS
 * (`null !== 'Y'` is true).
 */
function plainEmployeeWhereConditions(): Prisma.usm_usersWhereInput[] {
  return [
    { is_admin: { not: ADMIN_FLAG_VALUE } },
    { OR: [{ super_admin: null }, { super_admin: { not: SUPER_ADMIN_FLAG_VALUE } }] },
  ];
}

/** Returns null (never throws) on a malformed id — callers treat that as "not found", the same way a genuinely missing or cross-tenant id is handled. */
function toBigIntUserId(id: string): bigint | null {
  try {
    return BigInt(id);
  } catch {
    return null;
  }
}

/** Same as toBigIntUserId, for the (also-string, also-BigInt-backed) integrationId identity field. CreateEmployeeDto/UpdateEmployeeDto already validate this is numeric-shaped via @IsNumberString, so this should never actually fail in practice — the try/catch is defense in depth, not the primary validation. */
function toBigIntOrNull(value: string): bigint | null {
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

/**
 * Included on every usm_users read so companyName is derived from a single
 * query (a JOIN) instead of a separate per-row usm_company lookup.
 * findAllByCompany() already knows the single companyId every row in its
 * result shares, so the old per-row lookup was re-fetching the exact same
 * company row once per employee — this eliminates that entirely, for both
 * the list method and every single-row method.
 */
const EMPLOYEE_INCLUDE = { usm_company: true };

type EmployeeRow = Prisma.usm_usersGetPayload<{ include: { usm_company: true } }>;

/**
 * PrismaEmployeesRepository — reads/writes the real `usm_users` table.
 * Replaces InMemoryEmployeesRepository for this module only (see
 * employees.module.ts); that file is left on disk, unused, the same way
 * InMemoryCompaniesRepository/InMemoryIntegrationsRepository were left
 * after their migrations.
 *
 * usm_users' primary key is composite: (company_id, user_id) — every
 * lookup, update, and delete here goes through both, never user_id alone.
 * Every method also filters to isPlainEmployeeRow BEFORE any mutation
 * (not just on the way out), so this repository can never edit or delete a
 * Company Admin's or Super Admin's own login row through the Employees API
 * surface, even if a caller within the same company guesses its id.
 *
 * findAllByCompany() paginates AND searches at the database level
 * (WHERE + ORDER BY + skip/take, plus a separate count()) — see the Prisma
 * repository audit report. It no longer fetches the whole company roster
 * and filters/paginates it in JavaScript.
 *
 * Phase A.2 added two optional identity columns (integration_id,
 * external_employee_id) alongside the existing profile columns — see
 * scripts/add-employee-identity-columns.ts and the Employee interface's
 * doc comment for what they are and why name/email/phone/mobile were
 * deliberately left untouched this phase.
 */
@Injectable()
export class PrismaEmployeesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * company scope + plain-employee exclusion + optional search all happen
   * in the WHERE clause; ordering, skip, and take are pushed to Postgres
   * too. `total` comes from a separate count() using the exact same WHERE,
   * so it reflects the filtered result set, not the whole table.
   */
  async findAllByCompany(
    companyId: string,
    params: { search?: string; skip: number; take: number },
  ): Promise<{ employees: Employee[]; total: number }> {
    const searchTerm = params.search?.trim();
    const conditions: Prisma.usm_usersWhereInput[] = [{ company_id: companyId }, ...plainEmployeeWhereConditions()];

    if (searchTerm) {
      conditions.push({
        OR: [
          { user_name: { contains: searchTerm, mode: 'insensitive' } },
          { email_address: { contains: searchTerm, mode: 'insensitive' } },
        ],
      });
    }

    const where: Prisma.usm_usersWhereInput = { AND: conditions };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.usm_users.findMany({
        where,
        include: EMPLOYEE_INCLUDE,
        orderBy: { user_id: 'asc' },
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.usm_users.count({ where }),
    ]);

    return { employees: rows.map((row) => this.toEmployee(row)), total };
  }

  /** Returns undefined for a genuinely missing id, an id belonging to another company, AND an id that belongs to a non-Employee row (a Company Admin/Super Admin) — callers can't tell these apart, which is the point. */
  async findByIdInCompany(id: string, companyId: string): Promise<Employee | undefined> {
    const userId = toBigIntUserId(id);
    if (userId === null) return undefined;

    const row = await this.prisma.usm_users.findUnique({
      where: { company_id_user_id: { company_id: companyId, user_id: userId } },
      include: EMPLOYEE_INCLUDE,
    });
    if (!row || !isPlainEmployeeRow(row)) return undefined;
    return this.toEmployee(row);
  }

  /**
   * Duplicate-email check used by EmployeesService.create(). There is no
   * unique constraint on email_address in Postgres, so this is a
   * first-match lookup (mirrors PrismaCompaniesRepository.findByEmail),
   * not a guarantee that only one such row can ever exist.
   */
  async findByEmailInCompany(email: string, companyId: string): Promise<Employee | undefined> {
    const row = await this.prisma.usm_users.findFirst({
      where: { company_id: companyId, email_address: { equals: email.trim(), mode: 'insensitive' } },
      include: EMPLOYEE_INCLUDE,
    });
    if (!row || !isPlainEmployeeRow(row)) return undefined;
    return this.toEmployee(row);
  }

  /**
   * Duplicate-identity check used by EmployeesService.create() — mirrors
   * findByEmailInCompany() above. The real, authoritative guarantee is the
   * partial unique index on (company_id, integration_id,
   * external_employee_id) created by
   * scripts/add-employee-identity-columns.ts (see handleWriteError()'s
   * P2002 branch for what happens if this check is raced); this lookup
   * only exists to turn that into a friendlier error on create().
   */
  async findByExternalIdentityInCompany(
    companyId: string,
    integrationId: string,
    externalEmployeeId: string,
  ): Promise<Employee | undefined> {
    const numericIntegrationId = toBigIntOrNull(integrationId);
    if (numericIntegrationId === null) return undefined;

    const row = await this.prisma.usm_users.findFirst({
      where: { company_id: companyId, integration_id: numericIntegrationId, external_employee_id: externalEmployeeId },
      include: EMPLOYEE_INCLUDE,
    });
    if (!row || !isPlainEmployeeRow(row)) return undefined;
    return this.toEmployee(row);
  }

  /**
   * IMPORTANT — credential architecture:
   * Employees are HR-system records, not AttendHub portal accounts.
   * Employee credentials originate in the connected external HR software,
   * never here. This method does NOT accept, generate, or derive a
   * meaningful password for the employee, and CreateEmployeeDto has no
   * `password` field at all.
   *
   * However, `usm_users.c_password` is a NOT NULL column with no database
   * default, and this phase deliberately does not change the schema (see
   * the Employee Credential Handling task's explicit constraints). To
   * satisfy that constraint without creating a usable credential, a
   * cryptographically random, unrelated value (32 bytes from
   * `generateRawToken()` — the same primitive used for password-reset/
   * email-verification tokens) is bcrypt-hashed and stored. This value:
   *   - is never derived from the employee's name, email, id, or company;
   *   - is never returned by any endpoint, logged, or shown to the
   *     Company Admin — toEmployee() below never reads c_password at all;
   *   - cannot be used to log in: nobody knows it (it's discarded
   *     immediately after hashing) and it is never emailed or displayed
   *     anywhere, so the bcrypt comparison in AuthService.login() can
   *     never succeed against it in practice.
   *
   * This is a temporary database-compatibility mechanism only, not a
   * second credential authority. AttendHub must not become the source of
   * truth for employee passwords. Future direction: employee/mobile
   * authentication should ultimately be validated against the connected
   * HR software through the Integration Gateway, not against this column
   * — usm_users.c_password is retained only because the existing database
   * schema requires a non-null value. That future flow is not implemented
   * here.
   */
  async create(dto: CreateEmployeeDto, companyId: string): Promise<Employee> {
    try {
      const compatibilityPasswordHash = await hashPassword(generateRawToken());
      const row = await this.prisma.usm_users.create({
        data: {
          company_id: companyId,
          user_name: dto.name,
          email_address: dto.email,
          c_password: compatibilityPasswordHash,
          phone: dto.phone,
          mobile: dto.mobile,
          // Phase A.2 minimal employee identity — both undefined (and so
          // both left null by Prisma) unless the Company Admin explicitly
          // linked this employee to an HR integration at create time.
          // EmployeesService.create() already guarantees these are either
          // both present or both absent by this point.
          integration_id: dto.integrationId !== undefined ? BigInt(dto.integrationId) : undefined,
          external_employee_id: dto.externalEmployeeId,
          // Created only through EmployeesController (Company Admin
          // creating a member of their own team), so these flags are
          // fixed to "plain employee, not locked" — never invented beyond
          // that, and never settable from the request body.
          is_admin: 'N',
          account_locked: 'N',
        },
        include: EMPLOYEE_INCLUDE,
      });
      return this.toEmployee(row);
    } catch (error) {
      this.handleWriteError(error);
    }
  }

  async updateInCompany(id: string, companyId: string, dto: UpdateEmployeeDto): Promise<Employee | undefined> {
    const userId = toBigIntUserId(id);
    if (userId === null) return undefined;

    // Checked BEFORE mutating, not just on the way out — otherwise a
    // request could edit a Company Admin's own row before this repository
    // ever notices it isn't a plain Employee.
    const existing = await this.prisma.usm_users.findUnique({
      where: { company_id_user_id: { company_id: companyId, user_id: userId } },
    });
    if (!existing || !isPlainEmployeeRow(existing)) return undefined;

    // No credential handling here, by design: UpdateEmployeeDto has no
    // `password` field (see its doc comment), so this method can only ever
    // touch HR data (name/email/phone/mobile). c_password's compatibility
    // placeholder value, written once at create() time, is never read,
    // rotated, or otherwise touched by an update — it is treated as an
    // internal compatibility value until the employee storage model is
    // redesigned.
    try {
      const row = await this.prisma.usm_users.update({
        where: { company_id_user_id: { company_id: companyId, user_id: userId } },
        data: {
          ...(dto.name !== undefined && { user_name: dto.name }),
          ...(dto.email !== undefined && { email_address: dto.email }),
          ...(dto.phone !== undefined && { phone: dto.phone }),
          ...(dto.mobile !== undefined && { mobile: dto.mobile }),
          // Phase A.2 — EmployeesService.update() already guarantees these
          // two are either both present or both absent in dto by this
          // point, so it's safe to spread them independently here.
          ...(dto.integrationId !== undefined && { integration_id: BigInt(dto.integrationId) }),
          ...(dto.externalEmployeeId !== undefined && { external_employee_id: dto.externalEmployeeId }),
        },
        include: EMPLOYEE_INCLUDE,
      });
      return this.toEmployee(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        // Matches InMemoryEmployeesRepository's old contract: not found -> undefined,
        // letting EmployeesService throw its own NotFoundException.
        return undefined;
      }
      this.handleWriteError(error);
    }
  }

  async removeInCompany(id: string, companyId: string): Promise<boolean> {
    const userId = toBigIntUserId(id);
    if (userId === null) return false;

    const existing = await this.prisma.usm_users.findUnique({
      where: { company_id_user_id: { company_id: companyId, user_id: userId } },
    });
    if (!existing || !isPlainEmployeeRow(existing)) return false;

    try {
      await this.prisma.usm_users.delete({
        where: { company_id_user_id: { company_id: companyId, user_id: userId } },
      });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return false;
      }
      this.handleWriteError(error);
    }
  }

  private toEmployee(row: EmployeeRow): Employee {
    return {
      id: row.user_id.toString(),
      companyId: row.company_id,
      companyName: row.usm_company.title,
      name: row.user_name,
      email: row.email_address,
      phone: row.phone ?? null,
      mobile: row.mobile ?? null,
      integrationId: row.integration_id?.toString() ?? null,
      externalEmployeeId: row.external_employee_id ?? null,
      // c_password is never read into this object — see the Employees
      // migration report's security section.
    };
  }

  /** Translates Postgres constraint violations into the app's clean {success:false,message} shape instead of leaking a raw Prisma error (or a password value) to the client. */
  private handleWriteError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        const target = Array.isArray(error.meta?.target) ? error.meta.target.join(', ') : String(error.meta?.target ?? 'field');
        // The partial unique index from scripts/add-employee-identity-columns.ts
        // isn't declared as a Prisma @@unique (it can't be — see
        // schema.prisma's comment on this table), so Prisma can't resolve it
        // to column names the way it does for a real @@unique; it reports the
        // raw index name instead. Recognized here purely for a friendlier
        // message — the constraint itself is what actually enforces this.
        if (target.includes('un_usm_users_company_integration_external_employee_id')) {
          throw new ConflictException('An employee with this integrationId/externalEmployeeId is already linked in your company.');
        }
        throw new ConflictException(`An employee with this ${target} already exists.`);
      }
      if (error.code === 'P2003') {
        const field = Array.isArray(error.meta?.field_name) ? error.meta.field_name.join(', ') : String(error.meta?.field_name ?? '');
        if (field.includes('integration')) {
          throw new ConflictException('integrationId does not refer to an existing integration for this company.');
        }
        throw new ConflictException('companyId does not refer to an existing company.');
      }
      if (error.code === 'P2025') {
        throw new NotFoundException('Employee not found.');
      }
    }
    throw error;
  }
}
