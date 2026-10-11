import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';
import { PrismaService } from './../src/prisma/prisma.service';

/**
 * Companies e2e coverage — added as part of the Prisma repository-pattern
 * fixes (see the Prisma repository audit report, which flagged Companies
 * as the one already-migrated module with no dedicated e2e suite of its
 * own, only incidental coverage from auth-rbac.e2e-spec.ts).
 *
 * Unlike the Employees/Integrations suites, this file does NOT need to
 * override InMemorySessionsRepository: every route here only checks for
 * SUPER_ADMIN, and the mock SUPER_ADMIN login account
 * (admin@tamotam.test — see auth/repositories/in-memory-users.repository.ts)
 * has no companyId at all, so the VARCHAR(2) company-id mismatch that
 * forced a session override in the other two suites doesn't apply here.
 * The real POST /api/auth/login flow is used instead, exactly like
 * auth-rbac.e2e-spec.ts already does.
 *
 * Test companies use their own 2-character id pool (ZE-ZN) so they never
 * collide with the ZA/ZB (Integrations) or ZC/ZD (Employees) test
 * companies, in case Jest runs e2e spec files in parallel against the same
 * real Postgres database.
 */
describe('Companies (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let superAdminToken: string;

  // 'Z' + each letter E..Z (22 ids: ZE, ZF, ... ZZ) — comfortably more than
  // the ~13 this file's tests actually consume, with room for later tests
  // to be added without hitting the pool limit again. Starts at 'E' so it
  // never collides with the ZA/ZB (Integrations) or ZC/ZD (Employees) test
  // companies, in case Jest runs e2e spec files in parallel against the
  // same real Postgres database.
  const COMPANY_ID_POOL = Array.from({ length: 22 }, (_, i) => `Z${String.fromCharCode('E'.charCodeAt(0) + i)}`);
  let nextIdIndex = 0;

  function nextCompanyId(): string {
    const id = COMPANY_ID_POOL[nextIdIndex];
    nextIdIndex += 1;
    if (!id) {
      throw new Error('Ran out of test company ids — widen COMPANY_ID_POOL.');
    }
    return id;
  }

  async function cleanupTestData(): Promise<void> {
    await prisma.usm_users.deleteMany({ where: { company_id: { in: COMPANY_ID_POOL } } });
    await prisma.integration_master.deleteMany({ where: { company_id: { in: COMPANY_ID_POOL } } });
    await prisma.usm_company.deleteMany({ where: { id: { in: COMPANY_ID_POOL } } });
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    prisma = app.get(PrismaService);

    // Idempotent: clears out anything left behind by a prior interrupted run.
    await cleanupTestData();

    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@tamotam.test', password: 'admin123' })
      .expect(200);
    superAdminToken = loginResponse.body.data.token;
  });

  afterAll(async () => {
    await cleanupTestData();
    await app.close();
  });

  function validCreateBody(id: string, overrides: Record<string, unknown> = {}) {
    return {
      id,
      name: `Companies E2E Test ${id}`,
      shortname: `CE2E${id}`,
      email: `admin-${id}@example.test`,
      contactPerson: 'Jane Doe',
      phone: '+92 300 1111111',
      status: 'ACTIVE',
      country: 1,
      ...overrides,
    };
  }

  async function createCompany(overrides: Record<string, unknown> = {}) {
    const id = nextCompanyId();
    const response = await request(app.getHttpServer())
      .post('/api/companies')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send(validCreateBody(id, overrides))
      .expect(201);
    return response.body.data;
  }

  describe('List', () => {
    it('lists companies with the paginated { items, meta } shape', async () => {
      await createCompany();

      const response = await request(app.getHttpServer())
        .get('/api/companies')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(Array.isArray(response.body.data.items)).toBe(true);
      expect(response.body.data.meta).toEqual(
        expect.objectContaining({ page: expect.any(Number), limit: expect.any(Number), total: expect.any(Number) }),
      );
    });
  });

  describe('Pagination (database-level)', () => {
    it('respects limit, reports the correct total, and echoes the requested page size', async () => {
      const beforeResponse = await request(app.getHttpServer())
        .get('/api/companies?page=1&limit=1')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);
      const totalBefore = beforeResponse.body.data.meta.total;

      await createCompany();
      await createCompany();
      await createCompany();

      const response = await request(app.getHttpServer())
        .get('/api/companies?page=1&limit=1')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(response.body.data.items.length).toBe(1);
      expect(response.body.data.meta.page).toBe(1);
      expect(response.body.data.meta.limit).toBe(1);
      expect(response.body.data.meta.total).toBe(totalBefore + 3);
    });

    it('defaults to page 1 / limit 20 when no query params are supplied', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/companies')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(response.body.data.meta.page).toBe(1);
      expect(response.body.data.meta.limit).toBe(20);
      expect(response.body.data.items.length).toBeLessThanOrEqual(20);
    });
  });

  describe('Create', () => {
    it('a valid company can be created', async () => {
      const id = nextCompanyId();
      const response = await request(app.getHttpServer())
        .post('/api/companies')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send(validCreateBody(id))
        .expect(201);

      expect(response.body.data.id).toBe(id);
      expect(response.body.data.name).toBe(`Companies E2E Test ${id}`);
      expect(response.body.data.shortname).toBe(`CE2E${id}`);
      expect(response.body.data.status).toBe('ACTIVE');
      expect(response.body.data.country).toBe(1);
    });
  });

  describe('Update', () => {
    it('updates company fields', async () => {
      const created = await createCompany();

      await request(app.getHttpServer())
        .patch(`/api/companies/${created.id}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ name: 'Renamed Co', phone: '+92 300 5555555', status: 'SUSPENDED' })
        .expect(200);

      const response = await request(app.getHttpServer())
        .get(`/api/companies/${created.id}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(response.body.data.name).toBe('Renamed Co');
      expect(response.body.data.phone).toBe('+92 300 5555555');
      expect(response.body.data.status).toBe('SUSPENDED');
    });

    it('returns 404 when updating a company that does not exist', async () => {
      await request(app.getHttpServer())
        .patch('/api/companies/Q9')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ name: 'Ghost Company' })
        .expect(404);
    });
  });

  describe('Delete', () => {
    it('deletes a company with no references', async () => {
      const created = await createCompany();

      await request(app.getHttpServer())
        .delete(`/api/companies/${created.id}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/api/companies/${created.id}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(404);
    });

    it('refuses to delete a company that still has an employee referencing it (409 Conflict)', async () => {
      const created = await createCompany();
      await prisma.usm_users.create({
        data: {
          company_id: created.id,
          user_name: 'Blocking Employee',
          email_address: `blocking-${created.id}@example.test`,
          c_password: 'irrelevant-for-this-test',
          is_admin: 'N',
          account_locked: 'N',
        },
      });

      const response = await request(app.getHttpServer())
        .delete(`/api/companies/${created.id}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(409);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Validation', () => {
    it('rejects a company missing required fields', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/companies')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ id: nextCompanyId(), name: 'Incomplete Co' }) // missing shortname/email/contactPerson/phone/status/country
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('rejects an invalid status value', async () => {
      const id = nextCompanyId();
      await request(app.getHttpServer())
        .post('/api/companies')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send(validCreateBody(id, { status: 'NOT_A_REAL_STATUS' }))
        .expect(400);
    });

    it('rejects a duplicate shortname (P2002 -> 409 Conflict)', async () => {
      const first = await createCompany();
      const secondId = nextCompanyId();

      const response = await request(app.getHttpServer())
        .post('/api/companies')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send(validCreateBody(secondId, { shortname: first.shortname }))
        .expect(409);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Derived fields', () => {
    it('employeeCount/activeEmployeeCount/integrationStatus/email/contactPerson are derived from usm_users/integration_master, not stored on usm_company', async () => {
      const created = await createCompany();

      // The admin user backs email/contactPerson and counts toward
      // employeeCount + activeEmployeeCount (not locked).
      await prisma.usm_users.create({
        data: {
          company_id: created.id,
          user_name: 'Derived Admin',
          email_address: `derived-admin-${created.id}@example.test`,
          c_password: 'irrelevant-for-this-test',
          is_admin: 'Y',
          account_locked: 'N',
        },
      });
      // A locked user counts toward employeeCount but NOT activeEmployeeCount.
      await prisma.usm_users.create({
        data: {
          company_id: created.id,
          user_name: 'Locked User',
          email_address: `locked-${created.id}@example.test`,
          c_password: 'irrelevant-for-this-test',
          is_admin: 'N',
          account_locked: 'Y',
        },
      });
      await prisma.integration_master.create({
        data: {
          company_id: created.id,
          base_url: 'https://api.example-hr.test',
          api_key: 'irrelevant-for-this-test',
          api_secret: 'irrelevant-for-this-test',
        },
      });

      const response = await request(app.getHttpServer())
        .get(`/api/companies/${created.id}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(response.body.data.email).toBe(`derived-admin-${created.id}@example.test`);
      expect(response.body.data.contactPerson).toBe('Derived Admin');
      expect(response.body.data.employeeCount).toBe(2);
      expect(response.body.data.activeEmployeeCount).toBe(1);
      expect(response.body.data.integrationStatus).toBe('CONNECTED');
    });
  });

  describe('Field exposure', () => {
    it('never exposes internal columns (logo bytes, employee credentials, audit columns) on the company response', async () => {
      const created = await createCompany();

      const response = await request(app.getHttpServer())
        .get(`/api/companies/${created.id}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      const keys = Object.keys(response.body.data);
      expect(keys).not.toContain('logo');
      expect(keys).not.toContain('c_password');
      expect(keys).not.toContain('add_by');
      expect(keys).not.toContain('edit_by');
      expect(keys.sort()).toEqual(
        [
          'id',
          'name',
          'email',
          'contactPerson',
          'phone',
          'status',
          'employeeCount',
          'activeEmployeeCount',
          'integrationStatus',
          'createdAt',
          'lastActivityAt',
          'shortname',
          'country',
        ].sort(),
      );
    });
  });
});
