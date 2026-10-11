import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';
import { PrismaService } from './../src/prisma/prisma.service';

/**
 * Covers Phase 4B's minimum test list (section 37): authentication,
 * authorization, tenant isolation, employee attendance self-scoping, the
 * "attendance is read-only" rule, and the max-5-plans rule.
 */
describe('Auth, RBAC, tenant isolation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const SUPER_ADMIN = { email: 'admin@tamotam.test', password: 'admin123' };
  const COMPANY_ADMIN = { email: 'company@tamotam.test', password: 'company123' };
  const EMPLOYEE = { email: 'employee@tamotam.test', password: 'employee123' };

  // Phase 4G fixture, used ONLY by the "can list their own employees" test
  // below (see that test's comment for why): real companies this file
  // signs up via POST /api/auth/signup, tracked so they can be cleaned up.
  const createdCompanyIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    // main.ts applies this filter manually (it's not registered via
    // APP_FILTER), so a test bootstrapping its own app instance from
    // AppModule directly must re-apply it to see production error shapes.
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (createdCompanyIds.length > 0) {
      await prisma.usm_users.deleteMany({ where: { company_id: { in: createdCompanyIds } } });
      await prisma.usm_company.deleteMany({ where: { id: { in: createdCompanyIds } } });
    }
    await app.close();
  });

  async function loginAs(credentials: { email: string; password: string }): Promise<string> {
    const response = await request(app.getHttpServer()).post('/api/auth/login').send(credentials).expect(200);
    return response.body.data.token as string;
  }

  describe('Authentication', () => {
    it('logs in with valid credentials and returns a token + user', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send(SUPER_ADMIN)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.token).toEqual(expect.any(String));
      expect(response.body.data.user.role).toBe('SUPER_ADMIN');
    });

    it('rejects an invalid password with 401', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: SUPER_ADMIN.email, password: 'wrong-password' })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('GET /api/auth/me returns the authenticated user context', async () => {
      const token = await loginAs(COMPANY_ADMIN);

      const response = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.data.role).toBe('COMPANY_ADMIN');
      expect(response.body.data.companyId).toBe('cmp_001');
    });

    it('rejects a request with no token at all with 401', () => {
      return request(app.getHttpServer()).get('/api/auth/me').expect(401);
    });
  });

  describe('Authorization', () => {
    it('SUPER_ADMIN can list companies', async () => {
      const token = await loginAs(SUPER_ADMIN);
      await request(app.getHttpServer())
        .get('/api/companies')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });

    it('COMPANY_ADMIN is rejected from /api/companies with 403', async () => {
      const token = await loginAs(COMPANY_ADMIN);
      await request(app.getHttpServer())
        .get('/api/companies')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('EMPLOYEE is rejected from /api/employees with 403', async () => {
      const token = await loginAs(EMPLOYEE);
      await request(app.getHttpServer())
        .get('/api/employees')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });

  describe('Tenant isolation', () => {
    // NOTE (Phase 4G): this test originally logged in as the legacy
    // COMPANY_ADMIN demo account (companyId 'cmp_001') and asserted that
    // GET /api/employees returned that company's roster. That stopped being
    // possible once Employees moved to the real usm_users table (an earlier
    // phase, before Phase 4G): usm_users.company_id is VARCHAR(2), so the
    // 7-character legacy id 'cmp_001' can never match a real row — the
    // assertion was structurally unsatisfiable, just masked until Phase 4G
    // fixed an unrelated bug that had every login in this file crashing
    // with a 500 before this test ever got to run against real data.
    //
    // This test still verifies the exact same behavior (a Company Admin's
    // employee list is scoped to their own company), but does so against a
    // real company + admin created through POST /api/auth/signup (the same
    // established fixture pattern auth-signup-security.e2e-spec.ts already
    // uses), rather than the fake legacy id. No production code changed.
    it('COMPANY_ADMIN can list their own employees (real signed-up company)', async () => {
      const n = Date.now();
      const signupResponse = await request(app.getHttpServer())
        .post('/api/auth/signup')
        .send({
          companyName: `RBAC E2E Co ${n}`,
          companyShortname: `RBE2E${n}`.slice(0, 10),
          adminName: 'RBAC Admin',
          email: `rbac-e2e-${n}@example.test`,
          password: 'Str0ngPassword1',
        })
        .expect(201);

      const { token, user } = signupResponse.body.data;
      createdCompanyIds.push(user.companyId);

      // Employee Credential Handling phase: CreateEmployeeDto has no
      // `password` field, so this fixture no longer sends one.
      await request(app.getHttpServer())
        .post('/api/employees')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'RBAC E2E Employee', email: `rbac-e2e-employee-${n}@example.test` })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get('/api/employees')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const companyIds = new Set(response.body.data.items.map((employee: { companyId: string }) => employee.companyId));
      expect(companyIds.size).toBe(1);
      expect(companyIds.has(user.companyId)).toBe(true);
    });

    it('COMPANY_ADMIN (cmp_001) cannot fetch a cmp_002 employee by id', async () => {
      const token = await loginAs(COMPANY_ADMIN);
      const response = await request(app.getHttpServer())
        .get('/api/employees/emp_101') // belongs to cmp_002
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    it('COMPANY_ADMIN attendance list never includes another company\'s records', async () => {
      const token = await loginAs(COMPANY_ADMIN);
      const response = await request(app.getHttpServer())
        .get('/api/attendance')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const companyIds = new Set(response.body.data.items.map((record: { companyId: string }) => record.companyId));
      expect(companyIds.has('cmp_002')).toBe(false);
    });
  });

  describe('Employee attendance self-scoping', () => {
    it('GET /api/attendance/me returns only the authenticated employee\'s own records', async () => {
      const token = await loginAs(EMPLOYEE); // maps to emp_001

      const response = await request(app.getHttpServer())
        .get('/api/attendance/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.data.items.length).toBeGreaterThan(0);
      for (const record of response.body.data.items) {
        expect(record.employeeId).toBe('emp_001');
      }
    });

    it('a client-supplied employeeId query param cannot be used to see another employee\'s records', async () => {
      const token = await loginAs(EMPLOYEE); // emp_001

      const response = await request(app.getHttpServer())
        .get('/api/attendance/me?employeeId=emp_002')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Still only emp_001's own records — the query param is ignored, not honored.
      for (const record of response.body.data.items) {
        expect(record.employeeId).toBe('emp_001');
      }
    });
  });

  describe('Attendance is read-only', () => {
    it('there is no check-in endpoint', async () => {
      const token = await loginAs(EMPLOYEE);
      await request(app.getHttpServer())
        .post('/api/attendance/check-in')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('there is no attendance edit endpoint', async () => {
      const token = await loginAs(COMPANY_ADMIN);
      await request(app.getHttpServer())
        .patch('/api/attendance/att_001')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  describe('Pricing plans', () => {
    it('enforces a maximum of 5 plans', async () => {
      const token = await loginAs(SUPER_ADMIN);
      const newPlan = {
        name: 'Extra Plan',
        description: 'A fourth plan to test the limit.',
        monthlyPrice: 19,
        yearlyPrice: 190,
        currency: 'USD',
        features: ['Something'],
        recommended: false,
        active: true,
      };

      // Seed data already has 3 plans; add a 4th and 5th successfully...
      await request(app.getHttpServer())
        .post('/api/plans')
        .set('Authorization', `Bearer ${token}`)
        .send(newPlan)
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/plans')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...newPlan, name: 'Fifth Plan' })
        .expect(201);

      // ...then a 6th must be rejected.
      const response = await request(app.getHttpServer())
        .post('/api/plans')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...newPlan, name: 'Sixth Plan' })
        .expect(409);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Validation', () => {
    it('rejects creating a company with missing required fields', async () => {
      const token = await loginAs(SUPER_ADMIN);
      const response = await request(app.getHttpServer())
        .post('/api/companies')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Incomplete Co' }) // missing email/contactPerson/phone/status
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('rejects an unknown extra field on a whitelisted DTO', async () => {
      const token = await loginAs(SUPER_ADMIN);
      await request(app.getHttpServer())
        .post('/api/companies')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Acme',
          email: 'ops@acme.test',
          contactPerson: 'Jane',
          phone: '+1 555 0100',
          status: 'ACTIVE',
          notAField: 'should be rejected',
        })
        .expect(400);
    });
  });
});
