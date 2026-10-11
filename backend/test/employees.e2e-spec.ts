import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';
import { PrismaService } from './../src/prisma/prisma.service';
import { SystemLogsService } from './../src/system-logs/system-logs.service';
import { SystemLogEntry } from './../src/system-logs/interfaces/system-log-entry.interface';
import { PrismaSessionsRepository } from './../src/auth/repositories/prisma-sessions.repository';
import { Session } from './../src/auth/interfaces/session.interface';
import { Role } from './../src/common/constants/roles.enum';

/**
 * SystemLogsService.record() is fire-and-forget by design as of the System
 * Logs database migration (Phase A.1) — it doesn't block the HTTP response
 * a test just awaited while the corresponding row is still being written to
 * Postgres (see SystemLogsService's class doc comment). In practice that
 * write — a single local-Postgres INSERT — settles well before the next
 * line of a test runs, but polling briefly for the expected entry keeps
 * this assertion deterministic rather than dependent on timing.
 */
async function waitForSystemLogEntry(
  systemLogsService: SystemLogsService,
  predicate: (entry: SystemLogEntry) => boolean,
  timeoutMs = 2000,
): Promise<SystemLogEntry | undefined> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const { items } = await systemLogsService.findAll(1, 500);
    const match = items.find(predicate);
    if (match) return match;
    if (Date.now() >= deadline) return undefined;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/**
 * Covers the Employees migration's test list: create validation,
 * read/derivation, composite-key tenant isolation, the Employee self
 * endpoint, update, delete, and — as of the Prisma repository-pattern
 * fixes — database-level pagination/search and the is_admin/super_admin
 * exclusion now expressed as a WHERE clause instead of a post-fetch JS
 * filter (see the Prisma repository audit report).
 *
 * Employee Credential Handling phase: Employees are HR-system records,
 * not AttendHub portal accounts. CreateEmployeeDto/UpdateEmployeeDto have
 * no `password` field at all, so this suite verifies the new contract:
 * a password cannot be supplied on create or update (rejected with 400 by
 * the global ValidationPipe's forbidNonWhitelisted rule), and
 * usm_users.c_password is set only to an unpredictable bcrypt-hashed
 * placeholder at creation time — purely to satisfy the NOT NULL column —
 * which is never returned, never logged, and never touched again by an
 * update.
 *
 * Same constraint as the Integrations e2e suite: usm_company has no
 * seeded rows the app can reuse, and the existing mock COMPANY_ADMIN/
 * EMPLOYEE login accounts carry a companyId of 'cmp_001', which cannot
 * fit usm_users.company_id's real VARCHAR(2) column. Those mock accounts
 * are shared with the Attendance/Leave in-memory modules and are out of
 * scope to change here, so they cannot be used to log in as a
 * company-scoped user against real usm_users rows.
 *
 * Instead, this file overrides InMemorySessionsRepository (not AuthGuard
 * itself, so AuthGuard's real Bearer-token logic still runs) with a stub
 * resolving a small, mutable set of test tokens to test sessions — one
 * SUPER_ADMIN, two COMPANY_ADMINs scoped to two real, disposable test
 * companies this file creates directly via Prisma, and one EMPLOYEE
 * session registered dynamically once a fixture employee exists (so its
 * companyId/employeeId can point at a real usm_users row). This override
 * only applies within this spec file's own TestingModule instance.
 */
describe('Employees (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let systemLogsService: SystemLogsService;

  const COMPANY_A = 'ZC';
  const COMPANY_B = 'ZD';

  const SUPER_ADMIN_TOKEN = 'test-super-admin-token';
  const COMPANY_A_TOKEN = 'test-company-a-token';
  const COMPANY_B_TOKEN = 'test-company-b-token';
  const EMPLOYEE_SELF_TOKEN = 'test-employee-self-token';

  // Mutable so the EMPLOYEE_SELF_TOKEN session can be registered once a
  // real fixture employee exists (see beforeAll).
  const testSessions: Record<string, Session> = {
    [SUPER_ADMIN_TOKEN]: {
      token: SUPER_ADMIN_TOKEN,
      userId: 'usr_super_admin',
      role: Role.SUPER_ADMIN,
      issuedAt: new Date().toISOString(),
    },
    [COMPANY_A_TOKEN]: {
      token: COMPANY_A_TOKEN,
      userId: 'usr_company_admin',
      role: Role.COMPANY_ADMIN,
      companyId: COMPANY_A,
      issuedAt: new Date().toISOString(),
    },
    [COMPANY_B_TOKEN]: {
      token: COMPANY_B_TOKEN,
      userId: 'usr_company_admin',
      role: Role.COMPANY_ADMIN,
      companyId: COMPANY_B,
      issuedAt: new Date().toISOString(),
    },
  };

  async function cleanupTestData(): Promise<void> {
    // Order matters: usm_users can reference integration_master (Phase A.2
    // identity FK), and integration_master references usm_company, so
    // usm_users must be cleared first and usm_company last.
    await prisma.usm_users.deleteMany({ where: { company_id: { in: [COMPANY_A, COMPANY_B] } } });
    await prisma.integration_master.deleteMany({ where: { company_id: { in: [COMPANY_A, COMPANY_B] } } });
    await prisma.usm_company.deleteMany({ where: { id: { in: [COMPANY_A, COMPANY_B] } } });
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaSessionsRepository)
      .useValue({
        findByToken: (token: string) => testSessions[token],
        create: () => {
          throw new Error('not used in this test override');
        },
        revoke: () => undefined,
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    prisma = app.get(PrismaService);
    systemLogsService = app.get(SystemLogsService);

    // Idempotent: clears out anything left behind by a prior interrupted run.
    await cleanupTestData();

    await prisma.usm_company.create({
      data: { id: COMPANY_A, title: 'Employees E2E Test Co A', shortname: 'EETCOA', country: 1, status: 'Y' },
    });
    await prisma.usm_company.create({
      data: { id: COMPANY_B, title: 'Employees E2E Test Co B', shortname: 'EETCOB', country: 1, status: 'Y' },
    });

    // Fixture employee for the self-profile test, created directly via
    // Prisma (not the API) so its user_id is known up front.
    const selfEmployee = await prisma.usm_users.create({
      data: {
        company_id: COMPANY_A,
        user_name: 'Self Test Employee',
        email_address: 'self-test-employee@example.test',
        c_password: 'irrelevant-for-this-test',
        is_admin: 'N',
        account_locked: 'N',
      },
    });
    testSessions[EMPLOYEE_SELF_TOKEN] = {
      token: EMPLOYEE_SELF_TOKEN,
      userId: 'usr_employee',
      role: Role.EMPLOYEE,
      companyId: COMPANY_A,
      employeeId: selfEmployee.user_id.toString(),
      issuedAt: new Date().toISOString(),
    };
  });

  afterAll(async () => {
    await cleanupTestData();
    await app.close();
  });

  function validCreateBody(overrides: Record<string, unknown> = {}) {
    return {
      name: 'Jane Doe',
      email: 'jane.doe@example.test',
      phone: '+92 300 1111111',
      mobile: '+92 300 2222222',
      ...overrides,
    };
  }

  async function createEmployee(token: string, overrides: Record<string, unknown> = {}) {
    const response = await request(app.getHttpServer())
      .post('/api/employees')
      .set('Authorization', `Bearer ${token}`)
      .send(validCreateBody(overrides))
      .expect(201);
    return response.body.data;
  }

  describe('Create', () => {
    it('a valid employee can be created (Company Admin)', async () => {
      const employee = await createEmployee(COMPANY_A_TOKEN, { email: 'create-valid@example.test' });

      expect(employee.companyId).toBe(COMPANY_A);
      expect(employee.companyName).toBe('Employees E2E Test Co A');
      expect(employee.name).toBe('Jane Doe');
      expect(employee.email).toBe('create-valid@example.test');
      expect(employee.phone).toBe('+92 300 1111111');
      expect(employee.mobile).toBe('+92 300 2222222');
    });

    it('required fields are enforced', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/employees')
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send({ name: 'Missing Fields' }) // missing email
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('does not require, and does not accept, a password — Company Admin creates HR data only', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/employees')
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send(validCreateBody({ email: 'no-password-field@example.test', password: 'whatever-value' }))
        .expect(400);

      expect(response.body.success).toBe(false);

      // Confirm no row was created despite the extra field being present.
      const search = await request(app.getHttpServer())
        .get('/api/employees?search=no-password-field@example.test')
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .expect(200);
      expect(search.body.data.meta.total).toBe(0);
    });

    it('creates an employee with no password field, and c_password is set to an unpredictable bcrypt hash purely to satisfy the NOT NULL column', async () => {
      const employee = await createEmployee(COMPANY_A_TOKEN, { email: 'create-no-password@example.test' });

      expect(Object.keys(employee)).not.toContain('password');
      expect(Object.keys(employee)).not.toContain('c_password');

      const row = await prisma.usm_users.findUnique({
        where: { company_id_user_id: { company_id: COMPANY_A, user_id: BigInt(employee.id) } },
      });
      // A placeholder value must exist (NOT NULL column) and must look like
      // a bcrypt hash — but must not be predictable or derived from any
      // employee-identifying data.
      expect(row?.c_password).toBeTruthy();
      expect(row?.c_password).toMatch(/^\$2[aby]?\$/);
      expect(row?.c_password.toLowerCase()).not.toContain(employee.id.toLowerCase());
      expect(row?.c_password.toLowerCase()).not.toContain('jane');
      expect(row?.c_password.toLowerCase()).not.toContain(COMPANY_A.toLowerCase());

      // Two different employees must get two different, unrelated placeholder hashes.
      const second = await createEmployee(COMPANY_A_TOKEN, { email: 'create-no-password-2@example.test' });
      const secondRow = await prisma.usm_users.findUnique({
        where: { company_id_user_id: { company_id: COMPANY_A, user_id: BigInt(second.id) } },
      });
      expect(secondRow?.c_password).not.toBe(row?.c_password);
    });
  });

  describe('Read', () => {
    it('lists employees for the caller\'s own company only', async () => {
      const created = await createEmployee(COMPANY_A_TOKEN, { email: 'list-me@example.test' });

      const response = await request(app.getHttpServer())
        .get('/api/employees')
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .expect(200);

      const ids = response.body.data.items.map((employee: { id: string }) => employee.id);
      expect(ids).toContain(created.id);
      for (const employee of response.body.data.items) {
        expect(employee.companyId).toBe(COMPANY_A);
      }
    });

    it('companyName is derived from usm_company.title', async () => {
      const created = await createEmployee(COMPANY_B_TOKEN, { email: 'derive-name@example.test' });
      expect(created.companyName).toBe('Employees E2E Test Co B');
    });

    it('gets one employee by id', async () => {
      const created = await createEmployee(COMPANY_A_TOKEN, { email: 'get-one@example.test' });

      const response = await request(app.getHttpServer())
        .get(`/api/employees/${created.id}`)
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .expect(200);

      expect(response.body.data.id).toBe(created.id);
      expect(response.body.data.email).toBe('get-one@example.test');
    });
  });

  describe('Pagination and search (database-level)', () => {
    it('respects limit and reports the correct total across more rows than fit on one page', async () => {
      const beforeResponse = await request(app.getHttpServer())
        .get('/api/employees?page=1&limit=1')
        .set('Authorization', `Bearer ${COMPANY_B_TOKEN}`)
        .expect(200);
      const totalBefore = beforeResponse.body.data.meta.total;

      await createEmployee(COMPANY_B_TOKEN, { email: 'page-1@example.test' });
      await createEmployee(COMPANY_B_TOKEN, { email: 'page-2@example.test' });
      await createEmployee(COMPANY_B_TOKEN, { email: 'page-3@example.test' });

      const response = await request(app.getHttpServer())
        .get('/api/employees?page=1&limit=1')
        .set('Authorization', `Bearer ${COMPANY_B_TOKEN}`)
        .expect(200);

      expect(response.body.data.items.length).toBe(1);
      expect(response.body.data.meta.page).toBe(1);
      expect(response.body.data.meta.limit).toBe(1);
      expect(response.body.data.meta.total).toBe(totalBefore + 3);
    });

    it('a search term filters results in the database, and the total reflects only matching rows', async () => {
      const uniqueTerm = `search-marker-${Date.now()}`;
      await createEmployee(COMPANY_A_TOKEN, { name: `Findable ${uniqueTerm}`, email: `unrelated-${uniqueTerm}@example.test` });
      await createEmployee(COMPANY_A_TOKEN, { name: 'Someone Else', email: 'someone-else-control@example.test' });

      const response = await request(app.getHttpServer())
        .get(`/api/employees?search=${uniqueTerm}`)
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .expect(200);

      expect(response.body.data.meta.total).toBe(1);
      expect(response.body.data.items).toHaveLength(1);
      expect(response.body.data.items[0].name).toContain(uniqueTerm);
    });

    it('search matches case-insensitively against name and email', async () => {
      const uniqueTerm = `CaseMarker${Date.now()}`;
      await createEmployee(COMPANY_A_TOKEN, { name: `Someone ${uniqueTerm}`, email: `case-test-${Date.now()}@example.test` });

      const response = await request(app.getHttpServer())
        .get(`/api/employees?search=${uniqueTerm.toLowerCase()}`)
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .expect(200);

      expect(response.body.data.meta.total).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Admin/Super Admin exclusion (database-level)', () => {
    it("a Company Admin's own usm_users row (is_admin='Y') never appears in the Employees list", async () => {
      const adminRow = await prisma.usm_users.create({
        data: {
          company_id: COMPANY_A,
          user_name: 'Company A Admin Login',
          email_address: 'company-a-admin-login@example.test',
          c_password: 'irrelevant-for-this-test',
          is_admin: 'Y',
          account_locked: 'N',
        },
      });

      const response = await request(app.getHttpServer())
        .get('/api/employees')
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .expect(200);

      const ids = response.body.data.items.map((employee: { id: string }) => employee.id);
      expect(ids).not.toContain(adminRow.user_id.toString());

      // And it can't be reached by id either, the same as any other
      // non-Employee row (see isPlainEmployeeRow).
      await request(app.getHttpServer())
        .get(`/api/employees/${adminRow.user_id.toString()}`)
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .expect(404);
    });

    it('a row with super_admin IS NULL is correctly treated as a plain employee (not excluded)', async () => {
      // usm_users.super_admin is nullable; every employee created through
      // the API leaves it NULL (never set). This locks in that the
      // WHERE-clause translation of isPlainEmployeeRow() treats NULL the
      // same way the original JS check did (`null !== 'Y'` is true), not
      // the opposite — a naive `{ super_admin: { not: 'Y' } }` alone can
      // behave differently against NULL depending on how it's translated
      // to SQL, which is exactly why the repository writes this as an
      // explicit "IS NULL OR != 'Y'" condition instead.
      const created = await createEmployee(COMPANY_A_TOKEN, { email: 'null-super-admin@example.test' });

      const row = await prisma.usm_users.findUnique({
        where: { company_id_user_id: { company_id: COMPANY_A, user_id: BigInt(created.id) } },
      });
      expect(row?.super_admin).toBeNull();

      const response = await request(app.getHttpServer())
        .get('/api/employees')
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .expect(200);
      const ids = response.body.data.items.map((employee: { id: string }) => employee.id);
      expect(ids).toContain(created.id);
    });
  });

  describe('Tenant isolation (composite key)', () => {
    it('a Company Admin cannot fetch another company\'s employee by id (404)', async () => {
      const created = await createEmployee(COMPANY_B_TOKEN, { email: 'cross-company-get@example.test' });

      const response = await request(app.getHttpServer())
        .get(`/api/employees/${created.id}`)
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    it('composite-key lookup uses both company_id and user_id — the same id under a different company is not found', async () => {
      const createdInB = await createEmployee(COMPANY_B_TOKEN, { email: 'composite-check@example.test' });

      // Company A never sees company B's row, even though the numeric id
      // (user_id) alone might coincidentally exist for company A too —
      // this proves the lookup is scoped by both fields, not id alone.
      await request(app.getHttpServer())
        .get(`/api/employees/${createdInB.id}`)
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .expect(404);

      // But it's still there for company B.
      await request(app.getHttpServer())
        .get(`/api/employees/${createdInB.id}`)
        .set('Authorization', `Bearer ${COMPANY_B_TOKEN}`)
        .expect(200);
    });

    it('SUPER_ADMIN is rejected from /api/employees (no Super Admin routes were added by this migration)', async () => {
      await request(app.getHttpServer())
        .get('/api/employees')
        .set('Authorization', `Bearer ${SUPER_ADMIN_TOKEN}`)
        .expect(403);
    });
  });

  describe('Employee self endpoint', () => {
    it('GET /api/me resolves entirely from the session, never a client-supplied id', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/me')
        .set('Authorization', `Bearer ${EMPLOYEE_SELF_TOKEN}`)
        .expect(200);

      expect(response.body.data.name).toBe('Self Test Employee');
      expect(response.body.data.email).toBe('self-test-employee@example.test');
      expect(response.body.data.companyId).toBe(COMPANY_A);
      expect(Object.keys(response.body.data)).not.toContain('password');
      expect(Object.keys(response.body.data)).not.toContain('c_password');
    });
  });

  describe('Update', () => {
    it('updates normal fields', async () => {
      const created = await createEmployee(COMPANY_A_TOKEN, { email: 'update-normal@example.test' });

      await request(app.getHttpServer())
        .patch(`/api/employees/${created.id}`)
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send({ name: 'Updated Name', phone: '+92 300 9999999' })
        .expect(200);

      const response = await request(app.getHttpServer())
        .get(`/api/employees/${created.id}`)
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .expect(200);

      expect(response.body.data.name).toBe('Updated Name');
      expect(response.body.data.phone).toBe('+92 300 9999999');
    });

    it('rejects a password field on update, and leaves c_password completely untouched', async () => {
      const created = await createEmployee(COMPANY_A_TOKEN, { email: 'rotate-password@example.test' });

      const before = await prisma.usm_users.findUnique({
        where: { company_id_user_id: { company_id: COMPANY_A, user_id: BigInt(created.id) } },
      });

      await request(app.getHttpServer())
        .patch(`/api/employees/${created.id}`)
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send({ password: 'rotated-password-value' })
        .expect(400);

      const after = await prisma.usm_users.findUnique({
        where: { company_id_user_id: { company_id: COMPANY_A, user_id: BigInt(created.id) } },
      });
      expect(after?.c_password).toBe(before?.c_password);
    });

    it('an ordinary HR-data update never writes any password-related key into system logs', async () => {
      const created = await createEmployee(COMPANY_A_TOKEN, { email: 'log-check@example.test' });

      await request(app.getHttpServer())
        .patch(`/api/employees/${created.id}`)
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send({ name: 'Log Check Updated', phone: '+92 300 5555555' })
        .expect(200);

      const entry = await waitForSystemLogEntry(
        systemLogsService,
        (candidate) => candidate.action === 'EMPLOYEE_UPDATED' && candidate.resourceId === created.id,
      );

      expect(entry).toBeDefined();
      const serialized = JSON.stringify(entry);
      // Checked as JSON key patterns, not bare substrings, to be precise
      // about what's being excluded.
      expect(serialized).not.toContain('"password":');
      expect(serialized).not.toContain('"c_password":');
      expect(serialized).not.toContain('"passwordChanged":');
    });
  });

  describe('Delete', () => {
    it('a Company Admin can delete their own employee', async () => {
      const created = await createEmployee(COMPANY_A_TOKEN, { email: 'delete-own@example.test' });

      await request(app.getHttpServer())
        .delete(`/api/employees/${created.id}`)
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/api/employees/${created.id}`)
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .expect(404);
    });

    it('deleting with a mismatched company cannot affect another company\'s record', async () => {
      const created = await createEmployee(COMPANY_B_TOKEN, { email: 'delete-cross-company@example.test' });

      await request(app.getHttpServer())
        .delete(`/api/employees/${created.id}`)
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`) // company A trying to delete company B's row
        .expect(404);

      await request(app.getHttpServer())
        .get(`/api/employees/${created.id}`)
        .set('Authorization', `Bearer ${COMPANY_B_TOKEN}`)
        .expect(200); // still there
    });
  });

  describe('HR identity (Phase A.2)', () => {
    async function createIntegrationForCompany(companyId: string): Promise<string> {
      const integration = await prisma.integration_master.create({
        data: {
          company_id: companyId,
          base_url: 'https://api.example-hr.test',
          api_key: 'irrelevant-for-this-test',
          api_secret: 'irrelevant-for-this-test',
        },
      });
      return integration.id.toString();
    }

    it('an employee can be created with no HR identity at all (both fields null)', async () => {
      const employee = await createEmployee(COMPANY_A_TOKEN, { email: 'identity-none@example.test' });
      expect(employee.integrationId).toBeNull();
      expect(employee.externalEmployeeId).toBeNull();
    });

    it('an employee can be created already linked to an HR integration', async () => {
      const integrationId = await createIntegrationForCompany(COMPANY_A);
      const employee = await createEmployee(COMPANY_A_TOKEN, {
        email: 'identity-create@example.test',
        integrationId,
        externalEmployeeId: 'HR-001',
      });

      expect(employee.integrationId).toBe(integrationId);
      expect(employee.externalEmployeeId).toBe('HR-001');
    });

    it('rejects a half-set identity on create (integrationId without externalEmployeeId)', async () => {
      const integrationId = await createIntegrationForCompany(COMPANY_A);
      const response = await request(app.getHttpServer())
        .post('/api/employees')
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send(validCreateBody({ email: 'identity-half-1@example.test', integrationId }))
        .expect(400);
      expect(response.body.success).toBe(false);
    });

    it('rejects a half-set identity on create (externalEmployeeId without integrationId)', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/employees')
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send(validCreateBody({ email: 'identity-half-2@example.test', externalEmployeeId: 'HR-002' }))
        .expect(400);
      expect(response.body.success).toBe(false);
    });

    it('rejects an integrationId that belongs to a different company (composite FK / cross-tenant safety)', async () => {
      const integrationIdForB = await createIntegrationForCompany(COMPANY_B);

      const response = await request(app.getHttpServer())
        .post('/api/employees')
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`) // Company A trying to use Company B's integration
        .send(
          validCreateBody({
            email: 'identity-cross-tenant@example.test',
            integrationId: integrationIdForB,
            externalEmployeeId: 'HR-003',
          }),
        )
        .expect(409);
      expect(response.body.success).toBe(false);
    });

    it('rejects a duplicate (integrationId, externalEmployeeId) pair within the same company', async () => {
      const integrationId = await createIntegrationForCompany(COMPANY_A);
      await createEmployee(COMPANY_A_TOKEN, {
        email: 'identity-dup-1@example.test',
        integrationId,
        externalEmployeeId: 'HR-DUP',
      });

      const response = await request(app.getHttpServer())
        .post('/api/employees')
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send(validCreateBody({ email: 'identity-dup-2@example.test', integrationId, externalEmployeeId: 'HR-DUP' }))
        .expect(409);
      expect(response.body.success).toBe(false);
    });

    it('allows the same externalEmployeeId under two different integrations in the same company', async () => {
      const integrationId1 = await createIntegrationForCompany(COMPANY_A);
      const integrationId2 = await createIntegrationForCompany(COMPANY_A);

      await createEmployee(COMPANY_A_TOKEN, {
        email: 'identity-multi-1@example.test',
        integrationId: integrationId1,
        externalEmployeeId: 'HR-SAME',
      });
      const second = await createEmployee(COMPANY_A_TOKEN, {
        email: 'identity-multi-2@example.test',
        integrationId: integrationId2,
        externalEmployeeId: 'HR-SAME',
      });

      expect(second.externalEmployeeId).toBe('HR-SAME');
    });

    it('allows the same externalEmployeeId in a different company, under that company\'s own integration', async () => {
      const integrationIdA = await createIntegrationForCompany(COMPANY_A);
      const integrationIdB = await createIntegrationForCompany(COMPANY_B);

      await createEmployee(COMPANY_A_TOKEN, {
        email: 'identity-tenant-a@example.test',
        integrationId: integrationIdA,
        externalEmployeeId: 'HR-SHARED',
      });
      const employeeB = await createEmployee(COMPANY_B_TOKEN, {
        email: 'identity-tenant-b@example.test',
        integrationId: integrationIdB,
        externalEmployeeId: 'HR-SHARED',
      });

      expect(employeeB.externalEmployeeId).toBe('HR-SHARED');
    });

    it('an employee created with no identity can be linked to an HR integration later, via update', async () => {
      const integrationId = await createIntegrationForCompany(COMPANY_A);
      const created = await createEmployee(COMPANY_A_TOKEN, { email: 'identity-link-later@example.test' });
      expect(created.integrationId).toBeNull();

      const response = await request(app.getHttpServer())
        .patch(`/api/employees/${created.id}`)
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send({ integrationId, externalEmployeeId: 'HR-LINK-LATER' })
        .expect(200);

      expect(response.body.data.integrationId).toBe(integrationId);
      expect(response.body.data.externalEmployeeId).toBe('HR-LINK-LATER');
    });

    it('rejects a half-set identity on update', async () => {
      const created = await createEmployee(COMPANY_A_TOKEN, { email: 'identity-update-half@example.test' });

      const response = await request(app.getHttpServer())
        .patch(`/api/employees/${created.id}`)
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send({ integrationId: '999999' }) // no externalEmployeeId
        .expect(400);
      expect(response.body.success).toBe(false);
    });

    it('never introduces any HR profile field beyond the existing name/email/phone/mobile', async () => {
      const employee = await createEmployee(COMPANY_A_TOKEN, { email: 'identity-shape@example.test' });
      expect(Object.keys(employee).sort()).toEqual(
        ['id', 'companyId', 'companyName', 'name', 'email', 'phone', 'mobile', 'integrationId', 'externalEmployeeId'].sort(),
      );
    });
  });
});
