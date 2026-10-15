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
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { InMemoryUsersRepository } from './repositories/in-memory-users.repository';
import { PrismaUsersRepository } from './repositories/prisma-users.repository';
import { PrismaSessionsRepository } from './repositories/prisma-sessions.repository';
import { EmailService } from './email/email.service';
import { GoogleAuthService } from './google/google-auth.service';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { GoogleSignupDto } from './dto/google-signup.dto';
import { hashPassword, verifyPassword } from './utils/password.util';
import { randomBytes } from 'crypto';
import { generateRawToken, generateSessionId, hashToken } from './utils/token.util';
import {
  COMPANY_ID_ALPHABET,
  COMPANY_ID_MAX_ATTEMPTS,
  EMAIL_VERIFY_TTL_MS,
  GOOGLE_SIGNUP_PURPOSE,
  GOOGLE_SIGNUP_TTL_SECONDS,
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

/** POST /auth/google: either the user is signed in, or must finish signing up (new email). */
export type GoogleLoginResult =
  | ({ status: 'LOGGED_IN' } & LoginResult)
  | { status: 'SIGNUP_REQUIRED'; signupToken: string; email: string; name: string };

interface NewTenantInput {
  companyName: string;
  companyShortname: string;
  adminName: string;
  email: string;
  passwordHash: string;
  phone?: string;
  country?: number;
  planId?: string;
  /** true for Google sign-ups (Google already verified the email); false sends the usual verification email. */
  emailVerified: boolean;
  signedUpVia: 'password' | 'google';
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
    private readonly subscriptionsService: SubscriptionsService,
    private readonly googleAuthService: GoogleAuthService,
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

    // Legacy bridge — see class doc comment. In production the hardcoded demo accounts are retired as soon as a
    // real Super Admin exists (or never offered when ALLOW_DEMO_ACCOUNTS is not 'true' — see demoAccountsEnabled()).
    if (!(await this.demoAccountsEnabled())) {
      throw new UnauthorizedException('Invalid email or password.');
    }
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
   * email verification is tracked, not gating, in this phase). When the
   * signup names a plan, the company is put on it (starting its free trial
   * if the plan has one).
   */
  async signup(dto: SignupDto): Promise<LoginResult> {
    const existing = await this.usersRepository.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('An account with this email already exists.');
    }

    return this.createTenant({
      companyName: dto.companyName,
      companyShortname: dto.companyShortname,
      adminName: dto.adminName,
      email: dto.email,
      passwordHash: await hashPassword(dto.password),
      phone: dto.phone,
      country: dto.country,
      planId: dto.planId,
      emailVerified: false,
      signedUpVia: 'password',
    });
  }

  /**
   * "Continue with Google", step 1. A verified Google email that already has
   * an account signs in; a new email gets a short-lived signupToken and the
   * frontend then collects the company details + plan (step 2).
   *
   * Only Company Admins may use it, plus the Super Admin whose email equals
   * the SUPER_ADMIN_EMAIL environment variable. Plain employee rows
   * (synced from HR, which can carry real email addresses) are refused —
   * employees sign in through the mobile app, and a matching Google account
   * must never be a way into the portal.
   */
  async googleLogin(dto: GoogleLoginDto): Promise<GoogleLoginResult> {
    const google = await this.googleAuthService.verifyIdToken(dto.idToken);
    const user = await this.usersRepository.findByEmail(google.email);

    if (!user) {
      const signupToken = await this.jwtService.signAsync(
        { purpose: GOOGLE_SIGNUP_PURPOSE, email: google.email, name: google.name },
        { expiresIn: `${GOOGLE_SIGNUP_TTL_SECONDS}s` },
      );
      return { status: 'SIGNUP_REQUIRED', signupToken, email: google.email, name: google.name };
    }

    if (user.role === Role.SUPER_ADMIN) {
      const allowedEmail = (process.env.SUPER_ADMIN_EMAIL ?? '').trim().toLowerCase();
      if (!allowedEmail || allowedEmail !== user.email.trim().toLowerCase()) {
        throw new ForbiddenException('Google sign-in is not enabled for this account.');
      }
    } else if (user.role !== Role.COMPANY_ADMIN) {
      throw new ForbiddenException('Employees sign in through the mobile app, not the portal.');
    }

    if (user.accountLocked) {
      throw new ForbiddenException('This account is locked. Please contact your administrator.');
    }
    if (user.companyId && user.companyStatus && user.companyStatus !== 'Y') {
      throw new ForbiddenException('This company account is not currently active.');
    }

    if (!user.emailVerified) {
      const [companyId, userId] = splitUserId(user.userId);
      await this.usersRepository.markEmailVerified(companyId, userId);
    }

    const session = await this.issueSession({
      userId: user.userId,
      role: user.role,
      companyId: user.companyId,
      employeeId: user.employeeId,
      name: user.name,
      email: user.email,
      companyName: user.companyName,
    });
    return { status: 'LOGGED_IN', ...session };
  }

  /**
   * "Continue with Google", step 2 (new users only): creates the company and
   * its first Company Admin exactly like POST /auth/signup — but with the
   * email already verified by Google and no password the user knows (they
   * can set one later with "forgot password" if they want one).
   */
  async googleSignup(dto: GoogleSignupDto): Promise<LoginResult> {
    let payload: { purpose?: string; email?: string; name?: string };
    try {
      payload = await this.jwtService.verifyAsync(dto.signupToken);
    } catch {
      throw new BadRequestException('Your Google sign-up session has expired. Please continue with Google again.');
    }
    if (payload.purpose !== GOOGLE_SIGNUP_PURPOSE || !payload.email) {
      throw new BadRequestException('Your Google sign-up session is not valid. Please continue with Google again.');
    }

    // Covers a double-submit / a second tab finishing the same signup.
    if (await this.usersRepository.findByEmail(payload.email)) {
      throw new ConflictException('An account with this email already exists. Please continue with Google to sign in.');
    }

    const adminName = (dto.adminName?.trim() || payload.name?.trim() || payload.email.split('@')[0]).slice(0, 50);
    return this.createTenant({
      companyName: dto.companyName,
      companyShortname: dto.companyShortname,
      adminName,
      email: payload.email,
      passwordHash: await hashPassword(randomBytes(32).toString('hex')),
      phone: dto.phone,
      country: dto.country,
      planId: dto.planId,
      emailVerified: true,
      signedUpVia: 'google',
    });
  }

  /** Shared by POST /auth/signup and the Google sign-up: one transaction creating usm_company + its first admin. */
  private async createTenant(input: NewTenantInput): Promise<LoginResult> {
    // Validates the plan (exists + active) BEFORE anything is written, and works out the trial dates.
    const planFields = await this.subscriptionsService.buildSignupAssignment(input.planId);

    const rawVerifyToken = input.emailVerified ? undefined : generateRawToken();
    const verifyTokenHash = rawVerifyToken ? hashToken(rawVerifyToken) : null;
    const verifyExpires = rawVerifyToken ? new Date(Date.now() + EMAIL_VERIFY_TTL_MS) : null;
    const now = new Date();

    for (let attempt = 0; attempt < COMPANY_ID_MAX_ATTEMPTS; attempt += 1) {
      const companyId = generateCompanyId();
      try {
        const { company, user } = await this.prisma.$transaction(async (tx) => {
          const createdCompany = await tx.usm_company.create({
            data: {
              id: companyId,
              title: input.companyName,
              shortname: input.companyShortname,
              phone: input.phone,
              status: 'Y',
              country: input.country ?? 1,
              add_date: now,
              edit_date: now,
              ...planFields,
            },
          });
          const createdUser = await tx.usm_users.create({
            data: {
              company_id: createdCompany.id,
              user_name: input.adminName,
              email_address: input.email,
              c_password: input.passwordHash,
              is_admin: 'Y',
              account_locked: 'N',
              email_verified: input.emailVerified ? 'Y' : 'N',
              email_verify_token_hash: verifyTokenHash,
              email_verify_expires: verifyExpires,
            },
          });
          return { company: createdCompany, user: createdUser };
        });

        if (rawVerifyToken) {
          await this.emailService.sendVerificationEmail(input.email, rawVerifyToken);
        }

        this.systemLogsService.record({
          user: input.adminName,
          action: 'SIGNUP',
          resource: 'Auth',
          resourceId: `${company.id}:${user.user_id}`,
          description: `${input.adminName} signed up${input.signedUpVia === 'google' ? ' with Google' : ''} and created ${company.title}.`,
          metadata: { companyId: company.id, planId: input.planId ?? null },
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

  /**
   * The three hardcoded demo accounts (see class doc comment) are always on
   * outside production. In production they are off unless
   * ALLOW_DEMO_ACCOUNTS=true — except that, to avoid ever locking the owner
   * out, they stay available while the database holds no real Super Admin.
   */
  private async demoAccountsEnabled(): Promise<boolean> {
    if (process.env.NODE_ENV !== 'production') return true;
    if (process.env.ALLOW_DEMO_ACCOUNTS === 'true') return true;
    return (await this.usersRepository.countSuperAdmins()) === 0;
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
