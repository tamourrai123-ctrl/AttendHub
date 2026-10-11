import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';
import { PrismaService } from './../src/prisma/prisma.service';
import { EmailService } from './../src/auth/email/email.service';

/**
 * E2E coverage for Phase 4G — Real Authentication & SaaS Signup: signup
 * (valid, duplicate email, duplicate shortname, invalid fields, weak
 * password, transaction atomicity), login against real usm_users accounts
 * (wrong password, nonexistent email, locked account, correct role/
 * companyId, token actually authenticating a request), /auth/me, tenant
 * isolation between two independently signed-up companies, password reset
 * (request/invalid-token/single-use/session revocation), password change,
 * and email verification (valid/invalid/single-use).
 *
 * EmailService is overridden with a stub that captures the raw
 * verification/reset tokens this module would otherwise only ever email —
 * see EmailService's own doc comment on why the real class deliberately
 * never logs them. Every other real-auth wiring (AuthGuard, PrismaUsers/
 * SessionsRepository, JwtModule) runs completely unmodified — only the
 * email transport is stubbed.
 *
 * Every account this file creates goes through the real POST /api/auth/signup
 * endpoint, so usm_company.id values are whatever AuthService actually
 * generated (a random 2-character id — see generateCompanyId()), not a
 * fixed pool like the other e2e files use. Created company ids are tracked
 * as they're returned and cleaned up in afterAll by exact id, so this file
 * can never collide with (or need to avoid) any other suite's fixed pool.
 */
describe('Auth signup, real login, password reset, email verification (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const createdCompanyIds: string[] = [];
  let signupCounter = 0;

  type CapturedEmail = { kind: 'verify' | 'reset'; email: string; token: string };
  const capturedEmails: CapturedEmail[] = [];

  function latestToken(kind: CapturedEmail['kind'], email: string): string {
    const match = [...capturedEmails].reverse().find((entry) => entry.kind === kind && entry.email === email);
    if (!match) {
      throw new Error(`No captured ${kind} email found for ${email}`);
    }
    return match.token;
  }

  // usm_company.title (companyName) AND usm_company.shortname both carry
  // real UNIQUE constraints — every signup in this file must get a fresh
  // value for both, not just the shortname (a bug caught during Phase 4G's
  // own test run: reusing one companyName across calls made every signup
  // after the first fail on usm_company's un_title_company constraint).
  function nextEmail(): string {
    signupCounter += 1;
    return `auth-e2e-${signupCounter}-${Date.now()}@example.test`;
  }

  function validSignupBody(overrides: Record<string, unknown> = {}) {
    signupCounter += 1;
    const n = signupCounter;
    return {
      companyName: `Auth Signup E2E Co ${n}`,
      companyShortname: `SE2E${n}`,
      adminName: 'Signup Admin',
      email: `auth-e2e-${n}-${Date.now()}@example.test`,
      password: 'Str0ngPassword1',
      ...overrides,
    };
  }

  async function signup(overrides: Record<string, unknown> = {}) {
    const body = validSignupBody(overrides);
    const response = await request(app.getHttpServer()).post('/api/auth/signup').send(body).expect(201);
    createdCompanyIds.push(response.body.data.user.companyId);
    return { body, response: response.body.data };
  }

  async function cleanupTestData(): Promise<void> {
    if (createdCompanyIds.length === 0) return;
    await prisma.usm_users.deleteMany({ where: { company_id: { in: createdCompanyIds } } });
    await prisma.usm_company.deleteMany({ where: { id: { in: createdCompanyIds } } });
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EmailService)
      .useValue({
        sendVerificationEmail: async (email: string, token: string) => {
          capturedEmails.push({ kind: 'verify', email, token });
        },
        sendPasswordResetEmail: async (email: string, token: string) => {
          capturedEmails.push({ kind: 'reset', email, token });
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await cleanupTestData();
    await app.close();
  });

  describe('Signup', () => {
    it('creates a new company + admin account, returns a working session, and never exposes the password', async () => {
      const { response, body } = await signup();

      expect(response.token).toEqual(expect.any(String));
      expect(response.user.role).toBe('COMPANY_ADMIN');
      expect(response.user.companyId).toHaveLength(2);
      expect(response.user.email).toBe(body.email);
      expect(Object.keys(response.user)).not.toContain('password');
      expect(Object.keys(response.user)).not.toContain('c_password');

      const row = await prisma.usm_users.findFirst({ where: { email_address: body.email } });
      expect(row?.is_admin).toBe('Y');
      expect(row?.email_verified).toBe('N');
      expect(row?.c_password).not.toBe(body.password);
      expect(row?.c_password).toMatch(/^\$2[aby]?\$/);

      const company = await prisma.usm_company.findUnique({ where: { id: response.user.companyId } });
      expect(company?.shortname).toBe(body.companyShortname);
    });

    it('rejects a duplicate email with 409', async () => {
      const { body: first } = await signup();

      const response = await request(app.getHttpServer())
        .post('/api/auth/signup')
        .send(validSignupBody({ email: first.email }))
        .expect(409);

      expect(response.body.success).toBe(false);
    });

    it('rejects a duplicate company shortname with 409, and leaves no partial company/user rows behind', async () => {
      const { body: first } = await signup();
      const secondEmail = nextEmail();

      await request(app.getHttpServer())
        .post('/api/auth/signup')
        .send(validSignupBody({ companyShortname: first.companyShortname, email: secondEmail }))
        .expect(409);

      // Atomicity check: the rejected attempt's own email must never have
      // been persisted — proving the transaction didn't partially apply
      // (a usm_users row without its usm_company, or vice versa).
      const orphanUser = await prisma.usm_users.findFirst({ where: { email_address: secondEmail } });
      expect(orphanUser).toBeNull();

      const shortnameCount = await prisma.usm_company.count({ where: { shortname: first.companyShortname } });
      expect(shortnameCount).toBe(1);
    });

    it('rejects an invalid email with 400', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/signup')
        .send(validSignupBody({ email: 'not-an-email' }))
        .expect(400);
    });

    it('rejects a password shorter than 8 characters with 400', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/signup')
        .send(validSignupBody({ password: 'Ab1' }))
        .expect(400);
    });

    it('rejects a password with no digit with 400', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/signup')
        .send(validSignupBody({ password: 'NoDigitsHere' }))
        .expect(400);
    });

    it('rejects a signup missing required company fields with 400', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/signup')
        .send({ email: nextEmail(), password: 'Str0ngPassword1' }) // missing companyName/companyShortname/adminName
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it("the token returned by signup actually authenticates a follow-up request", async () => {
      const { response } = await signup();

      const meResponse = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${response.token}`)
        .expect(200);

      expect(meResponse.body.data.email).toBe(response.user.email);
      expect(meResponse.body.data.role).toBe('COMPANY_ADMIN');
    });
  });

  describe('Login (real accounts)', () => {
    it('rejects a nonexistent email with a generic 401', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'nobody-real@example.test', password: 'whatever123' })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Invalid email or password.');
    });

    it('rejects an incorrect password for a real account with the same generic 401', async () => {
      const { body } = await signup();

      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: body.email, password: 'wrong-password-entirely' })
        .expect(401);

      expect(response.body.message).toBe('Invalid email or password.');
    });

    it('rejects a locked account with 403 (only after the password is confirmed correct)', async () => {
      const { body, response } = await signup();
      await prisma.usm_users.updateMany({ where: { company_id: response.user.companyId }, data: { account_locked: 'Y' } });

      const loginResponse = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: body.email, password: body.password })
        .expect(403);

      expect(loginResponse.body.success).toBe(false);
    });

    it('logs in successfully with the correct role and a real (non-mock) companyId', async () => {
      const { body } = await signup();

      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: body.email, password: body.password })
        .expect(200);

      expect(response.body.data.user.role).toBe('COMPANY_ADMIN');
      expect(response.body.data.user.companyId).toHaveLength(2);
      expect(response.body.data.user.companyId).not.toBe('cmp_001');
    });
  });

  describe('Tenant isolation between two real signed-up companies', () => {
    it("company A's admin cannot see company B's employees, and vice versa", async () => {
      const { response: adminA } = await signup();
      const { response: adminB } = await signup();

      await request(app.getHttpServer())
        .post('/api/employees')
        .set('Authorization', `Bearer ${adminA.token}`)
        .send({ name: 'A Employee', email: nextEmail(), password: 'Str0ngPassword1' })
        .expect(201);

      const listAsB = await request(app.getHttpServer())
        .get('/api/employees')
        .set('Authorization', `Bearer ${adminB.token}`)
        .expect(200);

      const companyIds = new Set(listAsB.body.data.items.map((employee: { companyId: string }) => employee.companyId));
      expect(companyIds.has(adminA.user.companyId)).toBe(false);
    });
  });

  describe('Password reset', () => {
    it('always returns the same generic message, whether or not the email exists', async () => {
      const { body } = await signup();

      const forExisting = await request(app.getHttpServer())
        .post('/api/auth/forgot-password')
        .send({ email: body.email })
        .expect(200);

      const forMissing = await request(app.getHttpServer())
        .post('/api/auth/forgot-password')
        .send({ email: 'definitely-not-registered@example.test' })
        .expect(200);

      expect(forExisting.body.message).toBe(forMissing.body.message);
    });

    it('rejects an invalid/garbage reset token with 400', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/reset-password')
        .send({ token: 'not-a-real-token', newPassword: 'NewStr0ngPassword1' })
        .expect(400);
    });

    it('completes a reset with a valid token: the new password works and the old one no longer does', async () => {
      const { body } = await signup();
      await request(app.getHttpServer()).post('/api/auth/forgot-password').send({ email: body.email }).expect(200);
      const rawToken = latestToken('reset', body.email);

      await request(app.getHttpServer())
        .post('/api/auth/reset-password')
        .send({ token: rawToken, newPassword: 'NewStr0ngPassword1' })
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: body.email, password: body.password })
        .expect(401);

      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: body.email, password: 'NewStr0ngPassword1' })
        .expect(200);
    });

    it('rejects reusing an already-consumed reset token a second time', async () => {
      const { body } = await signup();
      await request(app.getHttpServer()).post('/api/auth/forgot-password').send({ email: body.email }).expect(200);
      const rawToken = latestToken('reset', body.email);

      await request(app.getHttpServer())
        .post('/api/auth/reset-password')
        .send({ token: rawToken, newPassword: 'FirstNewPassword1' })
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/auth/reset-password')
        .send({ token: rawToken, newPassword: 'SecondNewPassword1' })
        .expect(400);
    });

    it('revokes existing sessions once a reset completes', async () => {
      const { body, response } = await signup();
      const tokenBeforeReset = response.token;

      await request(app.getHttpServer()).post('/api/auth/forgot-password').send({ email: body.email }).expect(200);
      const rawToken = latestToken('reset', body.email);
      await request(app.getHttpServer())
        .post('/api/auth/reset-password')
        .send({ token: rawToken, newPassword: 'AnotherStr0ngPassword1' })
        .expect(200);

      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${tokenBeforeReset}`)
        .expect(401);
    });
  });

  describe('Change password (authenticated)', () => {
    it('changes the password with the correct current password', async () => {
      const { body, response } = await signup();

      await request(app.getHttpServer())
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${response.token}`)
        .send({ currentPassword: body.password, newPassword: 'ChangedStr0ngPassword1' })
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: body.email, password: 'ChangedStr0ngPassword1' })
        .expect(200);
    });

    it('rejects an incorrect current password with 401 and does not change anything', async () => {
      const { body, response } = await signup();

      await request(app.getHttpServer())
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${response.token}`)
        .send({ currentPassword: 'totally-wrong', newPassword: 'ChangedStr0ngPassword1' })
        .expect(401);

      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: body.email, password: body.password })
        .expect(200);
    });
  });

  describe('Email verification', () => {
    it('verifies an email address with the valid token issued at signup', async () => {
      const { body } = await signup();
      const rawToken = latestToken('verify', body.email);

      await request(app.getHttpServer()).post('/api/auth/verify-email').send({ token: rawToken }).expect(200);

      const row = await prisma.usm_users.findFirst({ where: { email_address: body.email } });
      expect(row?.email_verified).toBe('Y');
    });

    it('rejects an invalid/garbage verification token with 400', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/verify-email')
        .send({ token: 'not-a-real-token' })
        .expect(400);
    });

    it('rejects reusing an already-consumed verification token a second time', async () => {
      const { body } = await signup();
      const rawToken = latestToken('verify', body.email);

      await request(app.getHttpServer()).post('/api/auth/verify-email').send({ token: rawToken }).expect(200);
      await request(app.getHttpServer()).post('/api/auth/verify-email').send({ token: rawToken }).expect(400);
    });
  });
});
