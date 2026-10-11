import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { Role } from '../../common/constants/roles.enum';

/**
 * PrismaUsersRepository — the auth-scoped view onto the real `usm_users`
 * table. Deliberately separate from employees/repositories/
 * prisma-employees.repository.ts: that repository is scoped to PLAIN
 * employee rows only (excludes is_admin/super_admin — see its
 * isPlainEmployeeRow()), while authentication must see every row
 * regardless of role, since Company Admins and Super Admins log in too.
 *
 * Role derivation reuses the exact same is_admin/super_admin='Y' convention
 * already established (and already load-bearing) in
 * prisma-companies.repository.ts and prisma-employees.repository.ts — not
 * duplicated with a different guess, the same ADMIN_FLAG_VALUE/
 * SUPER_ADMIN_FLAG_VALUE constants. SUPER_ADMIN's companyId is always
 * undefined here regardless of the row's own (mandatory, non-nullable)
 * company_id column — matching AuthenticatedUser's documented contract.
 */
const ADMIN_FLAG_VALUE = 'Y';
const SUPER_ADMIN_FLAG_VALUE = 'Y';
const LOCKED_FLAG_VALUE = 'Y';
const EMAIL_VERIFIED_FLAG_VALUE = 'Y';

export interface AuthUserProfile {
  /** Stable id for this row: "{company_id}:{user_id}". Not the same format as Employee.id (which is user_id alone). */
  userId: string;
  companyId?: string;
  employeeId?: string;
  role: Role;
  name: string;
  email: string;
  passwordHash: string;
  accountLocked: boolean;
  emailVerified: boolean;
  /** Raw usm_company.status code ('Y'/'N'/'S'). Undefined only if the join somehow failed to resolve (should not happen — company_id is NOT NULL with a FK). */
  companyStatus?: string;
  companyName?: string;
}

const USER_INCLUDE = { usm_company: { select: { status: true, title: true } } } as const;

type UserWithCompany = Prisma.usm_usersGetPayload<{ include: typeof USER_INCLUDE }>;

@Injectable()
export class PrismaUsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Case-insensitive, cross-company lookup by email — the same convention
   * PrismaCompaniesRepository.findByEmail() already uses. email_address now
   * carries a real UNIQUE constraint (see
   * scripts/add-real-authentication-columns.ts), so at most one row can
   * ever match; findFirst (rather than the stricter findUnique, which would
   * require an exact-case match) keeps login tolerant of case the way a
   * real login form should be.
   */
  async findByEmail(email: string): Promise<AuthUserProfile | undefined> {
    const row = await this.prisma.usm_users.findFirst({
      where: { email_address: { equals: email.trim(), mode: 'insensitive' } },
      include: USER_INCLUDE,
    });
    return row ? this.toProfile(row) : undefined;
  }

  async findByCompanyAndUserId(companyId: string, userId: string): Promise<AuthUserProfile | undefined> {
    const numericUserId = toBigIntUserId(userId);
    if (numericUserId === null) return undefined;

    const row = await this.prisma.usm_users.findUnique({
      where: { company_id_user_id: { company_id: companyId, user_id: numericUserId } },
      include: USER_INCLUDE,
    });
    return row ? this.toProfile(row) : undefined;
  }

  async findByResetTokenHash(tokenHash: string): Promise<AuthUserProfile | undefined> {
    const row = await this.prisma.usm_users.findFirst({
      where: { reset_token_hash: tokenHash, reset_token_expires: { gt: new Date() } },
      include: USER_INCLUDE,
    });
    return row ? this.toProfile(row) : undefined;
  }

  async findByVerifyTokenHash(tokenHash: string): Promise<AuthUserProfile | undefined> {
    const row = await this.prisma.usm_users.findFirst({
      where: { email_verify_token_hash: tokenHash, email_verify_expires: { gt: new Date() } },
      include: USER_INCLUDE,
    });
    return row ? this.toProfile(row) : undefined;
  }

  async setResetToken(companyId: string, userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.prisma.usm_users.update({
      where: { company_id_user_id: { company_id: companyId, user_id: BigInt(userId) } },
      data: { reset_token_hash: tokenHash, reset_token_expires: expiresAt },
    });
  }

  /** Single-use: called immediately after a reset/verify token is consumed, so it can never be replayed. */
  async clearResetToken(companyId: string, userId: string): Promise<void> {
    await this.prisma.usm_users.update({
      where: { company_id_user_id: { company_id: companyId, user_id: BigInt(userId) } },
      data: { reset_token_hash: null, reset_token_expires: null },
    });
  }

  async setVerifyToken(companyId: string, userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.prisma.usm_users.update({
      where: { company_id_user_id: { company_id: companyId, user_id: BigInt(userId) } },
      data: { email_verify_token_hash: tokenHash, email_verify_expires: expiresAt },
    });
  }

  async updatePasswordHash(companyId: string, userId: string, passwordHash: string): Promise<void> {
    await this.prisma.usm_users.update({
      where: { company_id_user_id: { company_id: companyId, user_id: BigInt(userId) } },
      data: { c_password: passwordHash },
    });
  }

  async markEmailVerified(companyId: string, userId: string): Promise<void> {
    await this.prisma.usm_users.update({
      where: { company_id_user_id: { company_id: companyId, user_id: BigInt(userId) } },
      data: { email_verified: EMAIL_VERIFIED_FLAG_VALUE, email_verify_token_hash: null, email_verify_expires: null },
    });
  }

  private toProfile(row: UserWithCompany): AuthUserProfile {
    const isSuperAdmin = row.super_admin === SUPER_ADMIN_FLAG_VALUE;
    const isCompanyAdmin = !isSuperAdmin && row.is_admin === ADMIN_FLAG_VALUE;
    const role = isSuperAdmin ? Role.SUPER_ADMIN : isCompanyAdmin ? Role.COMPANY_ADMIN : Role.EMPLOYEE;

    return {
      userId: `${row.company_id}:${row.user_id.toString()}`,
      companyId: isSuperAdmin ? undefined : row.company_id,
      employeeId: role === Role.EMPLOYEE ? row.user_id.toString() : undefined,
      role,
      name: row.user_name,
      email: row.email_address,
      passwordHash: row.c_password,
      accountLocked: row.account_locked === LOCKED_FLAG_VALUE,
      emailVerified: row.email_verified === EMAIL_VERIFIED_FLAG_VALUE,
      companyStatus: row.usm_company?.status,
      companyName: row.usm_company?.title,
    };
  }
}

/** Returns null (never throws) on a malformed id — same defensive shape as PrismaEmployeesRepository's toBigIntUserId(). */
function toBigIntUserId(id: string): bigint | null {
  try {
    return BigInt(id);
  } catch {
    return null;
  }
}
