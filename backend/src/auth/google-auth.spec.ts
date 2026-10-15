import { BadRequestException, ConflictException, ForbiddenException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Role } from '../common/constants/roles.enum';
import { AuthService } from './auth.service';
import { GoogleAuthService } from './google/google-auth.service';
import { GOOGLE_SIGNUP_PURPOSE } from './constants/auth.constants';
import { AuthUserProfile } from './repositories/prisma-users.repository';

function profile(overrides: Partial<AuthUserProfile> = {}): AuthUserProfile {
  return {
    userId: 'AB:7',
    companyId: 'AB',
    role: Role.COMPANY_ADMIN,
    name: 'Jane',
    email: 'jane@acme.test',
    passwordHash: 'x',
    accountLocked: false,
    emailVerified: false,
    companyStatus: 'Y',
    companyName: 'Acme',
    ...overrides,
  };
}

function build(opts: { user?: AuthUserProfile; superAdmins?: number; legacy?: unknown } = {}) {
  const usersRepository = {
    findByEmail: jest.fn(async () => opts.user),
    markEmailVerified: jest.fn(async () => undefined),
    countSuperAdmins: jest.fn(async () => opts.superAdmins ?? 0),
  };
  const legacyUsersRepository = { findByEmail: jest.fn(() => opts.legacy), findById: jest.fn(() => undefined) };
  const sessionsRepository = { create: jest.fn(async () => undefined) };
  const systemLogs = { record: jest.fn() };
  const settings = { getSessionTimeoutSeconds: jest.fn(async () => 3600) };
  const jwt = {
    signAsync: jest.fn(async () => 'signed-token'),
    verifyAsync: jest.fn(async () => ({ purpose: GOOGLE_SIGNUP_PURPOSE, email: 'new@acme.test', name: 'New Person' })),
  };
  const subscriptions = { buildSignupAssignment: jest.fn(async () => ({})) };
  const google = { verifyIdToken: jest.fn(async () => ({ email: 'jane@acme.test', name: 'Jane' })) };

  const created: { company?: Record<string, unknown>; user?: Record<string, unknown> } = {};
  const tx = {
    usm_company: { create: jest.fn(async (args: { data: Record<string, unknown> }) => { created.company = args.data; return { id: 'ZZ', title: String(args.data.title) }; }) },
    usm_users: { create: jest.fn(async (args: { data: Record<string, unknown> }) => { created.user = args.data; return { user_id: 1, user_name: String(args.data.user_name), email_address: String(args.data.email_address) }; }) },
  };
  const prisma = { $transaction: jest.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)) };
  const email = { sendVerificationEmail: jest.fn(async () => undefined) };

  const service = new AuthService(
    prisma as never,
    usersRepository as never,
    legacyUsersRepository as never,
    sessionsRepository as never,
    systemLogs as never,
    settings as never,
    jwt as never,
    email as never,
    subscriptions as never,
    google as never,
  );
  return { service, usersRepository, jwt, google, subscriptions, created, email, prisma };
}

const OLD_ENV = { ...process.env };
afterEach(() => {
  process.env = { ...OLD_ENV };
});

describe('AuthService.googleLogin', () => {
  it('hands a brand-new Google email a signupToken instead of creating anything', async () => {
    const { service, jwt, prisma } = build({ user: undefined });
    const result = await service.googleLogin({ idToken: 't' });
    expect(result).toEqual({ status: 'SIGNUP_REQUIRED', signupToken: 'signed-token', email: 'jane@acme.test', name: 'Jane' });
    expect((jwt.signAsync.mock.calls[0] as unknown[])[0]).toEqual({ purpose: GOOGLE_SIGNUP_PURPOSE, email: 'jane@acme.test', name: 'Jane' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('signs in an existing Company Admin and marks the email verified', async () => {
    const { service, usersRepository } = build({ user: profile() });
    const result = await service.googleLogin({ idToken: 't' });
    expect(result.status).toBe('LOGGED_IN');
    expect(usersRepository.markEmailVerified).toHaveBeenCalledWith('AB', '7');
  });

  it('refuses plain employee rows (employees use the mobile app)', async () => {
    const { service } = build({ user: profile({ role: Role.EMPLOYEE, employeeId: '7' }) });
    await expect(service.googleLogin({ idToken: 't' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses a locked account and an inactive company', async () => {
    await expect(build({ user: profile({ accountLocked: true }) }).service.googleLogin({ idToken: 't' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(build({ user: profile({ companyStatus: 'N' }) }).service.googleLogin({ idToken: 't' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets the Super Admin in with Google only when the email equals SUPER_ADMIN_EMAIL', async () => {
    const superAdmin = profile({ role: Role.SUPER_ADMIN, companyId: undefined, email: 'jane@acme.test' });

    delete process.env.SUPER_ADMIN_EMAIL;
    await expect(build({ user: superAdmin }).service.googleLogin({ idToken: 't' })).rejects.toBeInstanceOf(ForbiddenException);

    process.env.SUPER_ADMIN_EMAIL = 'someone.else@acme.test';
    await expect(build({ user: superAdmin }).service.googleLogin({ idToken: 't' })).rejects.toBeInstanceOf(ForbiddenException);

    process.env.SUPER_ADMIN_EMAIL = ' Jane@Acme.test ';
    const result = await build({ user: superAdmin }).service.googleLogin({ idToken: 't' });
    expect(result.status).toBe('LOGGED_IN');
  });
});

describe('AuthService.googleSignup', () => {
  const body = { signupToken: 'st', companyName: 'Acme Pvt Ltd', companyShortname: 'ACME', planId: '2' };

  it('creates the company and a verified admin on the chosen plan', async () => {
    const { service, subscriptions, created, email } = build({ user: undefined });
    const result = await service.googleSignup(body);
    expect(subscriptions.buildSignupAssignment).toHaveBeenCalledWith('2');
    expect(created.company?.title).toBe('Acme Pvt Ltd');
    expect(created.user?.email_address).toBe('new@acme.test');
    expect(created.user?.user_name).toBe('New Person');
    expect(created.user?.is_admin).toBe('Y');
    expect(created.user?.email_verified).toBe('Y');
    expect(created.user?.email_verify_token_hash).toBeNull();
    expect(email.sendVerificationEmail).not.toHaveBeenCalled();
    expect(result.token).toBe('signed-token');
  });

  it('rejects an expired or invalid signup token', async () => {
    const expired = build({ user: undefined });
    expired.jwt.verifyAsync.mockRejectedValueOnce(new Error('jwt expired'));
    await expect(expired.service.googleSignup(body)).rejects.toBeInstanceOf(BadRequestException);

    // e.g. a normal login/session JWT replayed here: wrong purpose
    const wrong = build({ user: undefined });
    wrong.jwt.verifyAsync.mockResolvedValueOnce({ email: 'x@y.test' } as never);
    await expect(wrong.service.googleSignup(body)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects when the email already has an account', async () => {
    await expect(build({ user: profile() }).service.googleSignup(body)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('AuthService demo accounts in production', () => {
  const legacy = { id: 'u1', role: Role.SUPER_ADMIN, name: 'Demo', email: 'admin@tamotam.test', password: 'pw', companyName: undefined };
  const dto = { email: 'admin@tamotam.test', password: 'pw' };

  it('works outside production', async () => {
    process.env.NODE_ENV = 'test';
    const result = await build({ legacy }).service.login(dto);
    expect(result.token).toBe('signed-token');
  });

  it('is switched off in production once a real Super Admin exists', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.ALLOW_DEMO_ACCOUNTS;
    await expect(build({ legacy, superAdmins: 1 }).service.login(dto)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('stays available in production while there is no real Super Admin (so the owner is never locked out)', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.ALLOW_DEMO_ACCOUNTS;
    const result = await build({ legacy, superAdmins: 0 }).service.login(dto);
    expect(result.token).toBe('signed-token');
  });

  it('can be forced on with ALLOW_DEMO_ACCOUNTS=true', async () => {
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_DEMO_ACCOUNTS = 'true';
    const result = await build({ legacy, superAdmins: 1 }).service.login(dto);
    expect(result.token).toBe('signed-token');
  });
});

describe('GoogleAuthService.verifyIdToken', () => {
  const realFetch = (global as { fetch?: unknown }).fetch;
  afterEach(() => {
    (global as { fetch?: unknown }).fetch = realFetch;
  });

  function mockTokeninfo(payload: Record<string, unknown>, ok = true) {
    (global as { fetch?: unknown }).fetch = jest.fn(async () => ({ ok, json: async () => payload }));
  }
  const good = { aud: 'client-1', iss: 'https://accounts.google.com', email: 'Jane@Acme.test', email_verified: 'true', name: 'Jane Doe' };

  it('is unavailable (503) when GOOGLE_CLIENT_ID is not set', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    await expect(new GoogleAuthService().verifyIdToken('t')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('returns the lower-cased verified email and name', async () => {
    process.env.GOOGLE_CLIENT_ID = 'client-0, client-1';
    mockTokeninfo(good);
    expect(await new GoogleAuthService().verifyIdToken('t')).toEqual({ email: 'jane@acme.test', name: 'Jane Doe' });
  });

  it('rejects a token issued for another app, an unverified email, a bad issuer, and a Google error', async () => {
    process.env.GOOGLE_CLIENT_ID = 'client-1';
    const service = new GoogleAuthService();
    mockTokeninfo({ ...good, aud: 'someone-else' });
    await expect(service.verifyIdToken('t')).rejects.toBeInstanceOf(UnauthorizedException);
    mockTokeninfo({ ...good, email_verified: 'false' });
    await expect(service.verifyIdToken('t')).rejects.toBeInstanceOf(UnauthorizedException);
    mockTokeninfo({ ...good, iss: 'https://evil.test' });
    await expect(service.verifyIdToken('t')).rejects.toBeInstanceOf(UnauthorizedException);
    mockTokeninfo({ error: 'invalid_token' }, false);
    await expect(service.verifyIdToken('t')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
