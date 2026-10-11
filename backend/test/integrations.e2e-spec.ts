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
 * Covers the Integrations migration's test list: create validation,
 * read/derivation, composite-key tenant isolation, update (including
 * credential rotation + log redaction), delete, and — as of the Prisma
 * repository-pattern fixes — database-level pagination on the list
 * endpoint (see the Prisma repository audit report; GET /api/integrations
 * previously had no pagination at all).
 *
 * usm_company has no seeded rows the app can reuse (see the Companies
 * migration report — usm_company/usm_users are both empty in the real
 * database), and the existing mock COMPANY_ADMIN login account
 * (auth/repositories/in-memory-users.repository.ts) carries a companyId of
 * 'cmp_001', which cannot fit integration_master.company_id's real
 * VARCHAR(2) column. That mock account is shared with the Employees/
 * Attendance in-memory modules and is out of scope to change here, so it
 * cannot be used to log in as a company-scoped user against a real
 * integration row.
 *
 * Instead, this file overrides InMemorySessionsRepository (not AuthGuard
 * itself, so AuthGuard's real Bearer-token logic still runs) with a stub
 * that resolves a small set of fixed test tokens to fixed sessions — one
 * SUPER_ADMIN and two COMPANY_ADMINs scoped to two real, disposable test
 * companies this file creates directly via Prisma and cleans up
 * afterwards. This override only applies within this spec file's own
 * TestingModule instance; it does not affect any other test file or the
 * running application.
 */
describe('Integrations (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let systemLogsService: SystemLogsService;

  const COMPANY_A = 'ZA';
  const COMPANY_B = 'ZB';

  const SUPER_ADMIN_TOKEN = 'test-super-admin-token';
  const COMPANY_A_TOKEN = 'test-company-a-token';
  const COMPANY_B_TOKEN = 'test-company-b-token';

  const testSessions = new Map<string, Session>([
    [
      SUPER_ADMIN_TOKEN,
      { token: SUPER_ADMIN_TOKEN, userId: 'usr_super_admin', role: Role.SUPER_ADMIN, issuedAt: new Date().toISOString() },
    ],
    [
      COMPANY_A_TOKEN,
      {
        token: COMPANY_A_TOKEN,
        userId: 'usr_company_admin',
        role: Role.COMPANY_ADMIN,
        companyId: COMPANY_A,
        issuedAt: new Date().toISOString(),
      },
    ],
    [
      COMPANY_B_TOKEN,
      {
        token: COMPANY_B_TOKEN,
        userId: 'usr_company_admin',
        role: Role.COMPANY_ADMIN,
        companyId: COMPANY_B,
        issuedAt: new Date().toISOString(),
      },
    ],
  ]);

  async function cleanupTestData(): Promise<void> {
    await prisma.integration_master.deleteMany({ where: { company_id: { in: [COMPANY_A, COMPANY_B] } } });
    await prisma.usm_company.deleteMany({ where: { id: { in: [COMPANY_A, COMPANY_B] } } });
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaSessionsRepository)
      .useValue({
        findByToken: (token: string) => testSessions.get(token),
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

    // Idempotent: clears out anything left behind by a prior interrupted run
    // before creating fresh fixtures.
    await cleanupTestData();

    await prisma.usm_company.create({
      data: { id: COMPANY_A, title: 'Integrations E2E Test Co A', shortname: 'IETCOA', country: 1, status: 'Y' },
    });
    await prisma.usm_company.create({
      data: { id: COMPANY_B, title: 'Integrations E2E Test Co B', shortname: 'IETCOB', country: 1, status: 'Y' },
    });
  });

  afterAll(async () => {
    await cleanupTestData();
    await app.close();
  });

  function validCreateBody(companyId: string, overrides: Record<string, unknown> = {}) {
    return {
      companyId,
      integrationType: 'HRS',
      authType: 'KEY',
      baseUrl: 'https://api.example-hr.test',
      apiKey: 'test-api-key-123',
      apiSecret: 'test-api-secret-456',
      ...overrides,
    };
  }

  async function createIntegration(companyId: string, overrides: Record<string, unknown> = {}) {
    const response = await request(app.getHttpServer())
      .post('/api/integrations')
      .set('Authorization', `Bearer ${SUPER_ADMIN_TOKEN}`)
      .send(validCreateBody(companyId, overrides))
      .expect(201);
    return response.body.data;
  }

  describe('Create', () => {
    it('a valid integration can be created (Super Admin)', async () => {
      const integration = await createIntegration(COMPANY_A);

      expect(integration.companyId).toBe(COMPANY_A);
      expect(integration.companyName).toBe('Integrations E2E Test Co A');
      expect(integration.integrationType).toBe('HRS');
      expect(integration.authType).toBe('KEY');
      expect(integration.baseUrl).toBe('https://api.example-hr.test');
      expect(integration.status).toBe('CONNECTED');
      expect(integration.credentialsConfigured).toBe(true);
    });

    it('required fields are enforced', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/integrations')
        .set('Authorization', `Bearer ${SUPER_ADMIN_TOKEN}`)
        .send({ companyId: COMPANY_A }) // missing integrationType/authType/baseUrl/apiKey/apiSecret
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('rejects an integrationType longer than 3 characters', async () => {
      await request(app.getHttpServer())
        .post('/api/integrations')
        .set('Authorization', `Bearer ${SUPER_ADMIN_TOKEN}`)
        .send(validCreateBody(COMPANY_A, { integrationType: 'TOOLONG' }))
        .expect(400);
    });

    it('rejects an authType longer than 3 characters', async () => {
      await request(app.getHttpServer())
        .post('/api/integrations')
        .set('Authorization', `Bearer ${SUPER_ADMIN_TOKEN}`)
        .send(validCreateBody(COMPANY_A, { authType: 'ALSOTOOLONG' }))
        .expect(400);
    });

    it('stores the supplied credentials (verified directly in the database, never via the API)', async () => {
      const integration = await createIntegration(COMPANY_A);

      const row = await prisma.integration_master.findUnique({
        where: { company_id_id: { company_id: COMPANY_A, id: BigInt(integration.id) } },
      });

      expect(row?.api_key).toBe('test-api-key-123');
      expect(row?.api_secret).toBe('test-api-secret-456');
    });
  });

  describe('Read', () => {
    it('integrations can be listed', async () => {
      const created = await createIntegration(COMPANY_A);

      const response = await request(app.getHttpServer())
        .get('/api/integrations')
        .set('Authorization', `Bearer ${SUPER_ADMIN_TOKEN}`)
        .expect(200);

      // findAll() now returns the same { items, meta } paginated shape as
      // Companies/Employees, not a bare array — see the Prisma repository
      // audit report's pagination fixes.
      const ids = response.body.data.items.map((integration: { id: string }) => integration.id);
      expect(ids).toContain(created.id);
      expect(response.body.data.meta).toEqual(
        expect.objectContaining({ page: expect.any(Number), limit: expect.any(Number), total: expect.any(Number) }),
      );
    });

    it('companyName is derived from usm_company.title', async () => {
      const created = await createIntegration(COMPANY_B);
      expect(created.companyName).toBe('Integrations E2E Test Co B');
    });

    it('status Y maps to CONNECTED on a freshly created integration', async () => {
      const created = await createIntegration(COMPANY_A);
      expect(created.status).toBe('CONNECTED');
    });

    it('status N maps to DISCONNECTED', async () => {
      const created = await createIntegration(COMPANY_A);
      await prisma.integration_master.update({
        where: { company_id_id: { company_id: COMPANY_A, id: BigInt(created.id) } },
        data: { status: 'N' },
      });

      const response = await request(app.getHttpServer())
        .get(`/api/integrations/${created.id}?companyId=${COMPANY_A}`)
        .set('Authorization', `Bearer ${SUPER_ADMIN_TOKEN}`)
        .expect(200);

      expect(response.body.data.status).toBe('DISCONNECTED');
    });

    it('never includes credentials, provider, or the obsolete sync/test/mapping fields', async () => {
      const created = await createIntegration(COMPANY_A);

      const response = await request(app.getHttpServer())
        .get(`/api/integrations/${created.id}?companyId=${COMPANY_A}`)
        .set('Authorization', `Bearer ${SUPER_ADMIN_TOKEN}`)
        .expect(200);

      const keys = Object.keys(response.body.data);
      expect(keys).not.toContain('apiKey');
      expect(keys).not.toContain('apiSecret');
      expect(keys).not.toContain('provider');
      expect(keys).not.toContain('lastSyncAt');
      expect(keys).not.toContain('lastTestResult');
      expect(keys).not.toContain('lastTestedAt');
      expect(keys).not.toContain('fieldMappings');
    });
  });

  describe('Pagination', () => {
    it('respects a small limit and reports the correct total across more rows than fit on one page', async () => {
      // 3 fresh integrations for COMPANY_A on top of whatever earlier tests
      // in this file already created — the assertions below only rely on
      // relative counts (this page vs. the running total), not on the
      // table being empty beforehand.
      const beforeResponse = await request(app.getHttpServer())
        .get('/api/integrations?page=1&limit=1')
        .set('Authorization', `Bearer ${SUPER_ADMIN_TOKEN}`)
        .expect(200);
      const totalBefore = beforeResponse.body.data.meta.total;

      await createIntegration(COMPANY_A);
      await createIntegration(COMPANY_A);
      await createIntegration(COMPANY_A);

      const response = await request(app.getHttpServer())
        .get('/api/integrations?page=1&limit=1')
        .set('Authorization', `Bearer ${SUPER_ADMIN_TOKEN}`)
        .expect(200);

      expect(response.body.data.items.length).toBe(1);
      expect(response.body.data.meta.page).toBe(1);
      expect(response.body.data.meta.limit).toBe(1);
      expect(response.body.data.meta.total).toBe(totalBefore + 3);
    });

    it('defaults to page 1 / limit 20 when no query params are supplied', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/integrations')
        .set('Authorization', `Bearer ${SUPER_ADMIN_TOKEN}`)
        .expect(200);

      expect(response.body.data.meta.page).toBe(1);
      expect(response.body.data.meta.limit).toBe(20);
      expect(response.body.data.items.length).toBeLessThanOrEqual(20);
    });
  });

  describe('Tenant isolation (composite key)', () => {
    it('Super Admin can access a specified company\'s integration', async () => {
      const created = await createIntegration(COMPANY_A);
      await request(app.getHttpServer())
        .get(`/api/integrations/${created.id}?companyId=${COMPANY_A}`)
        .set('Authorization', `Bearer ${SUPER_ADMIN_TOKEN}`)
        .expect(200);
    });

    it('a Company Admin can access their own company\'s integration', async () => {
      const created = await createIntegration(COMPANY_A);
      await request(app.getHttpServer())
        .get(`/api/integrations/${created.id}?companyId=${COMPANY_A}`)
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .expect(200);
    });

    it('a Company Admin cannot access another company\'s integration (403)', async () => {
      const created = await createIntegration(COMPANY_B);
      const response = await request(app.getHttpServer())
        .get(`/api/integrations/${created.id}?companyId=${COMPANY_B}`)
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .expect(403);

      expect(response.body.success).toBe(false);
    });

    it('composite-key lookup uses both companyId and id — the same id under a different companyId is not found', async () => {
      const created = await createIntegration(COMPANY_B);

      await request(app.getHttpServer())
        .get(`/api/integrations/${created.id}?companyId=${COMPANY_A}`)
        .set('Authorization', `Bearer ${SUPER_ADMIN_TOKEN}`) // Super Admin, so this is a 404, not a 403
        .expect(404);
    });

    it('rejects the request with 400 when companyId is omitted', async () => {
      const created = await createIntegration(COMPANY_A);
      await request(app.getHttpServer())
        .get(`/api/integrations/${created.id}`)
        .set('Authorization', `Bearer ${SUPER_ADMIN_TOKEN}`)
        .expect(400);
    });
  });

  describe('Update', () => {
    it('updates normal fields', async () => {
      const created = await createIntegration(COMPANY_A);

      await request(app.getHttpServer())
        .patch(`/api/integrations/${created.id}?companyId=${COMPANY_A}`)
        .set('Authorization', `Bearer ${SUPER_ADMIN_TOKEN}`)
        .send({ baseUrl: 'https://api.updated-hr.test' })
        .expect(200);

      const response = await request(app.getHttpServer())
        .get(`/api/integrations/${created.id}?companyId=${COMPANY_A}`)
        .set('Authorization', `Bearer ${SUPER_ADMIN_TOKEN}`)
        .expect(200);

      expect(response.body.data.baseUrl).toBe('https://api.updated-hr.test');
    });

    it('rotates credentials (verified directly in the database, never via the API)', async () => {
      const created = await createIntegration(COMPANY_A);

      await request(app.getHttpServer())
        .patch(`/api/integrations/${created.id}?companyId=${COMPANY_A}`)
        .set('Authorization', `Bearer ${SUPER_ADMIN_TOKEN}`)
        .send({ apiKey: 'rotated-key', apiSecret: 'rotated-secret' })
        .expect(200);

      const row = await prisma.integration_master.findUnique({
        where: { company_id_id: { company_id: COMPANY_A, id: BigInt(created.id) } },
      });
      expect(row?.api_key).toBe('rotated-key');
      expect(row?.api_secret).toBe('rotated-secret');
    });

    it('maps status correctly to Y/N in the database', async () => {
      const created = await createIntegration(COMPANY_A);

      await request(app.getHttpServer())
        .patch(`/api/integrations/${created.id}?companyId=${COMPANY_A}`)
        .set('Authorization', `Bearer ${SUPER_ADMIN_TOKEN}`)
        .send({ status: 'DISCONNECTED' })
        .expect(200);

      let row = await prisma.integration_master.findUnique({
        where: { company_id_id: { company_id: COMPANY_A, id: BigInt(created.id) } },
      });
      expect(row?.status).toBe('N');

      await request(app.getHttpServer())
        .patch(`/api/integrations/${created.id}?companyId=${COMPANY_A}`)
        .set('Authorization', `Bearer ${SUPER_ADMIN_TOKEN}`)
        .send({ status: 'CONNECTED' })
        .expect(200);

      row = await prisma.integration_master.findUnique({
        where: { company_id_id: { company_id: COMPANY_A, id: BigInt(created.id) } },
      });
      expect(row?.status).toBe('Y');
    });

    it('never writes apiKey/apiSecret into system logs', async () => {
      const created = await createIntegration(COMPANY_A);

      await request(app.getHttpServer())
        .patch(`/api/integrations/${created.id}?companyId=${COMPANY_A}`)
        .set('Authorization', `Bearer ${SUPER_ADMIN_TOKEN}`)
        .send({ apiKey: 'should-not-be-logged-key', apiSecret: 'should-not-be-logged-secret' })
        .expect(200);

      const entry = await waitForSystemLogEntry(
        systemLogsService,
        (candidate) => candidate.action === 'INTEGRATION_UPDATED' && candidate.resourceId === created.id,
      );

      expect(entry).toBeDefined();
      const serialized = JSON.stringify(entry);
      expect(serialized).not.toContain('should-not-be-logged-key');
      expect(serialized).not.toContain('should-not-be-logged-secret');
      // Checked as JSON key patterns, not bare substrings: the safe
      // replacement fields are legitimately named "apiKeyRotated" /
      // "apiSecretRotated", which contain "apiKey"/"apiSecret" as
      // substrings — a bare toContain check would incorrectly fail on
      // those safe fields instead of only on the real credential keys.
      expect(serialized).not.toContain('"apiKey":');
      expect(serialized).not.toContain('"apiSecret":');
    });
  });

  describe('Delete', () => {
    it('the correct company can delete its own integration', async () => {
      const created = await createIntegration(COMPANY_A);

      await request(app.getHttpServer())
        .delete(`/api/integrations/${created.id}?companyId=${COMPANY_A}`)
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/api/integrations/${created.id}?companyId=${COMPANY_A}`)
        .set('Authorization', `Bearer ${SUPER_ADMIN_TOKEN}`)
        .expect(404);
    });

    it('deleting with the wrong company context cannot affect another company\'s record', async () => {
      const created = await createIntegration(COMPANY_B);

      await request(app.getHttpServer())
        .delete(`/api/integrations/${created.id}?companyId=${COMPANY_B}`)
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`) // company A trying to delete company B's row
        .expect(403);

      await request(app.getHttpServer())
        .get(`/api/integrations/${created.id}?companyId=${COMPANY_B}`)
        .set('Authorization', `Bearer ${SUPER_ADMIN_TOKEN}`)
        .expect(200); // still there
    });
  });
});
