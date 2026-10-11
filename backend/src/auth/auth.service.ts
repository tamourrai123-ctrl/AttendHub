import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { Role } from '../common/constants/roles.enum';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { SettingsService } from '../settings/settings.service';
import { InMemoryUsersRepository } from './repositories/in-memory-users.repository';
import { PrismaUsersRepository } from './repositories/prisma-users.repository';
import { PrismaSessionsRepository } from './repositories/prisma-sessions.repository';
import { EmailService } from './email/email.service';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { hashPassword, verifyPassword } from './utils/password.util';
import { generateRawToken, generateSessionId, hashToken } from './utils/token.util';
import {
  COMPANY_ID_ALPHABET,
  COMPANY_ID_MAX_ATTEMPTS,
  EMAIL_VERIFY_TTL_MS,
  PASSWORD_RESET_TTL_MS,
} from './constants/auth.constants';

export interface PublicAuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  companyId?: string;
  companyName?: string;
  employeeId?: string;
}

export interface LoginResult {
  token: string;
  user: PublicAuthUser;
}

interface SessionSubject {
  userId: string;
  role: Role;
  companyId?: string;
  employeeId?: string;
  name: string;
  email: string;
  companyName?: string;
}

/**
 * AuthService — Phase 4G.
 *
 * Real authentication is backed by usm_users via PrismaUsersRepository:
 * bcrypt-verified passwords, real signed JWTs (via @nestjs/jwt), and a
 * DB-backed, revocable session (PrismaSessionsRepository).
 *
 * DECISION REQUIRING APPROVAL (flagged again in the final report — this is
 * not a silent permanent design): login() ALSO accepts the three
 * pre-existing hardcoded demo accounts from InMemoryUsersRepository
 * (admin@tamotam.test / company@tamotam.test / employee@tamotam.test) as a
 * fallback when no real usm_users row matches the supplied email. This
 * exists solely because the still-mock Attendance/Leave/Pricing/Monitoring
 * modules and the pre-existing auth-rbac.e2e-spec.ts suite are built
 * entirely around those three accounts' fake companyId ('cmp_001' — 7
 * characters, which can never fit usm_users.company_id's real VARCHAR(2)
 * column, so a real company can never stand in for it). Real accounts are
 * always checked FIRST; the legacy fallback only ever applies to an email
 * that doesn't match any real usm_users row at all.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersRepository: PrismaUsersRepository,
    private readonly legacyUsersRepository: InMemoryUsersRepository,
    private readonly sessionsRepository: PrismaSessionsRepository,
    private readonly systemLogsService: SystemLogsService,
    private readonly settingsService: SettingsService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
  ) {}

  async login(dto: LoginDto): Promise<LoginResult> {
    const realUser = await this.usersRepository.findByEmail(dto.email);

    if (realUser) {
      const passwordMatches = await verifyPassword(dto.password, realUser.passwordHash);
      if (!passwordMatches) {
        throw new UnauthorizedException('Invalid email or password.');
      }
      // Locked/inactive checks run only AFTER the password is confirmed
      // correct — checking them first would let an attacker who does NOT
      // know the password learn whether an account is locked, which is
      // exactly the kind of account-existence signal a login endpoint must
      // not leak.
      if (realUser.accountLocked) {
        throw new ForbiddenException('This account is locked. Please contact your administrator.');
      }
      if (realUser.companyId && realUser.companyStatus && realUser.companyStatus !== 'Y') {
        throw new ForbiddenException('This company account is not currently active.');
      }

      return this.issueSession({
        userId: realUser.userId,
        role: realUser.role,
        companyId: realUser.companyId,
        employeeId: realUser.employeeId,
        name: realUser.name,
        email: realUser.email,
        companyName: realUser.companyName,
      });
    }

    // Legacy bridge — see class doc comment.
    const legacyRecord = this.legacyUsersRepository.findByEmail(dto.email);
    if (!legacyRecord || legacyRecord.password !== dto.password) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    return this.issueSession({
      userId: legacyRecord.id,
      role: legacyRecord.role,
      companyId: legacyRecord.companyId,
      employeeId: legacyRecord.employeeId,
      name: legacyRecord.name,
      email: legacyRecord.email,
      companyName: legacyRecord.companyName,
    });
  }

  /**
   * Public self-signup: creates a brand-new usm_company plus its first
   * admin usm_users row (is_admin='Y') in one atomic transaction, then logs
   * the new admin straight in (matching how most SaaS signup flows behave —
   * email verification is tracked, not gating, in this phase; see the
   * final report's "decisions requiring approval").
   */
  async signup(dto: SignupDto): Promise<LoginResult> {
    const existing = await this.usersRepository.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('An account with this email already exists.');
    }

    const passwordHash = await hashPassword(dto.password);
    const rawVerifyToken = generateRawToken();
    const verifyTokenHash = hashToken(rawVerifyToken);
    const verifyExpires = new Date(Date.now() + EMAIL_VERIFY_TTL_MS);
    const now = new Date();

    for (let attempt = 0; attempt < COMPANY_ID_MAX_ATTEMPTS; attempt += 1) {
      const companyId = generateCompanyId();
      try {
        const { company, user } = await this.prisma.$transaction(async (tx) => {
          const createdCompany = await tx.usm_company.create({
            data: {
              id: companyId,
              title: dto.companyName,
              shortname: dto.companyShortname,
              phone: dto.phone,
              status: 'Y',
              country: dto.country ?? 1,
              add_date: now,
              edit_date: now,
            },
          });
          const createdUser = await tx.usm_users.create({
            data: {
              company_id: createdCompany.id,
              user_name: dto.adminName,
              email_address: dto.email,
              c_password: passwordHash,
              is_admin: 'Y',
              account_locked: 'N',
              email_verified: 'N',
              email_verify_token_hash: verifyTokenHash,
              email_verify_expires: verifyExpires,
            },
          });
          return { company: createdCompany, user: createdUser };
        });

        await this.emailService.sendVerificationEmail(dto.email, rawVerifyToken);

        this.systemLogsService.record({
          user: dto.adminName,
          action: 'SIGNUP',
          resource: 'Auth',
          resourceId: `${company.id}:${user.user_id}`,
          description: `${dto.adminName} signed up and created ${company.title}.`,
          metadata: { companyId: company.id },
        });

        return this.issueSession({
          userId: `${company.id}:${user.user_id}`,
          role: Role.COMPANY_ADMIN,
          companyId: company.id,
          employeeId: undefined,
          name: user.user_name,
          email: user.email_address,
          companyName: company.title,
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const target = constraintTarget(error);
          if (target.includes('shortname')) {
            throw new ConflictException('A company with this short name already exists.');
          }
          // usm_company.title also carries a UNIQUE constraint
          // (un_title_company) — a duplicate company NAME must be reported
          // clearly, not misclassified as a retryable id collision (which
          // would silently exhaust every retry attempt and then fail with a
          // confusing "could not allocate a company id" error instead).
          if (target.includes('title')) {
            throw new ConflictException('A company with this name already exists.');
          }
          if (target.includes('email_address')) {
            throw new ConflictException('An account with this email already exists.');
          }
          // Otherwise treat it as an id collision (usm_company.id has no
          // database-side generation — see CreateCompanyDto/SignupDto) and
          // retry with a freshly generated id.
          continue;
        }
        throw error;
      }
    }

    throw new ConflictException(
      `Could not allocate a unique company id after ${COMPANY_ID_MAX_ATTEMPTS} attempts — please try again.`,
    );
  }

  async logout(token: string, currentUser: AuthenticatedUser): Promise<void> {
    await this.sessionsRepository.revoke(token);

    const name = await this.resolveActorName(currentUser);
    this.systemLogsService.record({
      user: name,
      action: 'LOGOUT',
      resource: 'Auth',
      resourceId: currentUser.userId,
      description: `${name} logged out.`,
    });
  }

  async me(currentUser: AuthenticatedUser): Promise<PublicAuthUser> {
    const real = await this.findRealProfile(currentUser.userId);
    if (real) {
      return {
        id: real.userId,
        name: real.name,
        email: real.email,
        role: real.role,
        companyId: real.companyId,
        companyName: real.companyName,
        employeeId: real.employeeId,
      };
    }

    const legacy = this.legacyUsersRepository.findById(currentUser.userId);
    if (!legacy) {
      throw new UnauthorizedException('Session refers to a user that no longer exists.');
    }
    return {
      id: legacy.id,
      name: legacy.name,
      email: legacy.email,
      role: legacy.role,
      companyId: legacy.companyId,
      companyName: legacy.companyName,
      employeeId: legacy.employeeId,
    };
  }

  /**
   * Always resolves — never reveals whether the email matched a real
   * account. The controller returns the same generic message either way;
   * this method only decides whether to actually send anything.
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const profile = await this.usersRepository.findByEmail(dto.email);
    if (!profile) {
      return;
    }

    const rawToken = generateRawToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
    const [companyId, userId] = splitUserId(profile.userId);

    await this.usersRepository.setResetToken(companyId, userId, tokenHash, expiresAt);
    await this.emailService.sendPasswordResetEmail(profile.email, rawToken);

    this.systemLogsService.record({
      user: profile.name,
      action: 'PASSWORD_RESET_REQUESTED',
      resource: 'Auth',
      resourceId: profile.userId,
      description: `${profile.name} requested a password reset.`,
    });
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const tokenHash = hashToken(dto.token);
    const profile = await this.usersRepository.findByResetTokenHash(tokenHash);
    if (!profile) {
      throw new BadRequestException('This reset link is invalid or has expired.');
    }

    const [companyId, userId] = splitUserId(profile.userId);
    const newHash = await hashPassword(dto.newPassword);

    await this.usersRepository.updatePasswordHash(companyId, userId, newHash);
    // Single-use: the token is cleared the moment it's consumed, successful or not reachable again.
    await this.usersRepository.clearResetToken(companyId, userId);
    // A password reset invalidates every existing session — a session
    // issued before the compromise (or before the user forgot their
    // password for an unrelated reason) should not go on working after it.
    await this.sessionsRepository.revokeAllForUser(profile.userId);

    this.systemLogsService.record({
      user: profile.name,
      action: 'PASSWORD_RESET_COMPLETED',
      resource: 'Auth',
      resourceId: profile.userId,
      description: `${profile.name} reset their password.`,
    });
  }

  async changePassword(currentUser: AuthenticatedUser, dto: ChangePasswordDto): Promise<void> {
    const profile = await this.findRealProfile(currentUser.userId);
    if (!profile) {
      throw new BadRequestException('Password change is not available for this account.');
    }

    const matches = await verifyPassword(dto.currentPassword, profile.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Current password is incorrect.');
    }

    const [companyId, userId] = splitUserId(profile.userId);
    const newHash = await hashPassword(dto.newPassword);
    await this.usersRepository.updatePasswordHash(companyId, userId, newHash);
    await this.sessionsRepository.revokeAllForUser(profile.userId);

    this.systemLogsService.record({
      user: profile.name,
      action: 'PASSWORD_CHANGED',
      resource: 'Auth',
      resourceId: profile.userId,
      description: `${profile.name} changed their password.`,
    });
  }

  async verifyEmail(dto: VerifyEmailDto): Promise<void> {
    const tokenHash = hashToken(dto.token);
    const profile = await this.usersRepository.findByVerifyTokenHash(tokenHash);
    if (!profile) {
      throw new BadRequestException('This verification link is invalid or has expired.');
    }

    const [companyId, userId] = splitUserId(profile.userId);
    await this.usersRepository.markEmailVerified(companyId, userId);

    this.systemLogsService.record({
      user: profile.name,
      action: 'EMAIL_VERIFIED',
      resource: 'Auth',
      resourceId: profile.userId,
      description: `${profile.name} verified their email address.`,
    });
  }

  private async issueSession(subject: SessionSubject): Promise<LoginResult> {
    const jti = generateSessionId();
    // Session Timeout (Settings module): this used to be a hardcoded
    // SESSION_TTL_SECONDS constant. It now comes from SettingsService, so a
    // Super Admin's change on the Settings screen takes effect on the very
    // next login — both the signed JWT's expiry and the DB session row's
    // expiresAt are derived from this SAME value, so they can't drift.
    const ttlSeconds = await this.settingsService.getSessionTimeoutSeconds();
    const token = await this.jwtService.signAsync(
      {
        sub: subject.userId,
        role: subject.role,
        companyId: subject.companyId,
        employeeId: subject.employeeId,
        jti,
      },
      { expiresIn: `${ttlSeconds}s` },
    );

    await this.sessionsRepository.create(
      {
        token,
        userId: subject.userId,
        role: subject.role,
        companyId: subject.companyId,
        employeeId: subject.employeeId,
      },
      ttlSeconds,
    );

    this.systemLogsService.record({
      user: subject.name,
      action: 'LOGIN',
      resource: 'Auth',
      resourceId: subject.userId,
      description: `${subject.name} logged in.`,
    });

    return {
      token,
      user: {
        id: subject.userId,
        name: subject.name,
        email: subject.email,
        role: subject.role,
        companyId: subject.companyId,
        companyName: subject.companyName,
        employeeId: subject.employeeId,
      },
    };
  }

  /** A real DB user's AuthenticatedUser.userId is always "{company_id}:{user_id}" (see PrismaUsersRepository.toProfile) — a legacy demo account's id never contains ':'. */
  private async findRealProfile(userId: string) {
    if (!userId.includes(':')) return undefined;
    const [companyId, dbUserId] = splitUserId(userId);
    return this.usersRepository.findByCompanyAndUserId(companyId, dbUserId);
  }

  private async resolveActorName(user: AuthenticatedUser): Promise<string> {
    const real = await this.findRealProfile(user.userId);
    if (real) return real.name;
    const legacy = this.legacyUsersRepository.findById(user.userId);
    return legacy?.name ?? user.userId;
  }
}

function splitUserId(userId: string): [string, string] {
  const [companyId, dbUserId] = userId.split(':');
  return [companyId, dbUserId];
}

/** usm_company.id has no database-side generation (see CreateCompanyDto/SignupDto) — signup generates one itself and retries on collision. */
function generateCompanyId(): string {
  let id = '';
  for (let i = 0; i < 2; i += 1) {
    id += COMPANY_ID_ALPHABET[Math.floor(Math.random() * COMPANY_ID_ALPHABET.length)];
  }
  return id;
}

function constraintTarget(error: Prisma.PrismaClientKnownRequestError): string {
  const target = error.meta?.target;
  if (Array.isArray(target)) return target.join(',');
  return String(target ?? '');
}
