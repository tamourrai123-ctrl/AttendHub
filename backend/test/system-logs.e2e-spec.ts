import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';
import { PrismaService } from './../src/prisma/prisma.service';
import { SystemLogsService } from './../src/system-logs/system-logs.service';
import { SystemLogEntry } from './../src/system-logs/interfaces/system-log-entry.interface';

/**
 * System Logs e2e coverage — added for Phase A.1 (the System Logs database
 * migration: InMemorySystemLogsRepository -> PrismaSystemLogsRepository).
 *
 * There is no direct POST /api/system-logs endpoint (entries are only ever
 * created as a side effect of other services calling
 * SystemLogsService.record()), so these tests trigger real log entries via
 * the Companies API (SUPER_ADMIN-only, like this module) rather than
 * inventing a way to call SystemLogsService.record() directly.
 *
 * Like companies.e2e-spec.ts, this suite uses the real POST /api/auth/login
 * flow (no InMemorySessionsRepository override needed) for both the
 * SUPER_ADMIN and legacy COMPANY_ADMIN demo accounts.
 *
 * Test companies use their own 2-character id pool ('Y' + A..Z) so they
 * never collide with the ZA/ZB (Integrations), ZC/ZD (Employees), or ZE-ZZ
 * (Companies) test companies, in case Jest runs e2e spec files in parallel
 * against the same real Postgres database.
 *
 * SystemLogsService.record() is fire-and-forget by design (see its class
 * doc comment) — it doesn't block the HTTP response these tests await while
 * the corresponding row is still being written to Postgres. In practice
 * that write — a single local-Postgres INSERT — settles well before the
 * next line of a test runs, but waitForSystemLogEntry() polls briefly for
 * the expected entry so these assertions are deterministic rather than
 * dependent on timing.
 */
describe('System Logs (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let systemLogsService: SystemLogsService;
  let superAdminToken: string;
  let companyAdminToken: string;

  const COMPANY_ID_POOL = Array.from({ length: 26 }, (_, i) => `Y${String.fromCharCode('A'.charCodeAt(0) + i)}`);
  let nextIdIndex = 0;

  function nextCompanyId(): string {
    const id = COMPANY_ID_POOL[nextIdIndex];
    nextIdIndex += 1;
    if (!id) {
      throw new Error('Ran out of test company ids — widen COMPANY_ID_POOL.');
    }
    return id;
  }

  async function cleanupTestCompanies(): Promise<void> {
    await prisma.usm_users.deleteMany({ where: { company_id: { in: COMPANY_ID_POOL } } });
    await prisma.usm_company.deleteMany({ where: { id: { in: COMPANY_ID_POOL } } });
  }

  async function waitForSystemLogEntry(
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

  function validCreateBody(id: string, overrides: Record<string, unknown> = {}) {
    return {
      id,
      name: `System Logs E2E Test ${id}`,
      shortname: `SLE2E${id}`,
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
    systemLogsService = app.get(SystemLogsService);

    await cleanupTestCompanies();

    const superAdminLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@tamotam.test', password: 'admin123' })
      .expect(200);
    superAdminToken = superAdminLogin.body.data.token;

    const companyAdminLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'company@tamotam.test', password: 'company123' })
      .expect(200);
    companyAdminToken = companyAdminLogin.body.data.token;
  });

  afterAll(async () => {
    await cleanupTestCompanies();
    await app.close();
  });

  describe('Access control', () => {
    it('SUPER_ADMIN can list system logs', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/system-logs')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(Array.isArray(response.body.data.items)).toBe(true);
      expect(response.body.data.meta).toEqual(
        expect.objectContaining({ page: expect.any(Number), limit: expect.any(Number), total: expect.any(Number) }),
      );
    });

    it('returns 404 for a system log id that does not exist', async () => {
      await request(app.getHttpServer())
        .get('/api/system-logs/999999999')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(404);
    });

    // This is the application's whole tenant-isolation guarantee for
    // System Logs today: SystemLogsController is @Roles(Role.SUPER_ADMIN)
    // only, so no Company Admin can reach these routes at all, regardless
    // of company_id. See PrismaSystemLogsRepository's class doc comment for
    // why company_id itself is not yet populated/filtered on.
    it('COMPANY_ADMIN cannot list system logs (403)', async () => {
      await request(app.getHttpServer())
        .get('/api/system-logs')
        .set('Authorization', `Bearer ${companyAdminToken}`)
        .expect(403);
    });

    it('COMPANY_ADMIN cannot fetch a single system log entry (403)', async () => {
      await request(app.getHttpServer())
        .get('/api/system-logs/1')
        .set('Authorization', `Bearer ${companyAdminToken}`)
        .expect(403);
    });
  });

  describe('Create', () => {
    it('a domain action (Company create) writes a real row to the system_logs table', async () => {
      const created = await createCompany();

      const entry = await waitForSystemLogEntry(
        (candidate) => candidate.action === 'COMPANY_CREATED' && candidate.resourceId === created.id,
      );
      expect(entry).toBeDefined();

      const row = await prisma.system_logs.findUnique({ where: { id: BigInt(entry!.id) } });
      expect(row).not.toBeNull();
      expect(row?.action).toBe('COMPANY_CREATED');
      expect(row?.module).toBe('Company');
    });
  });

  describe('Read', () => {
    it('a written entry can be retrieved through GET /api/system-logs/:id with the full SystemLogEntry shape', async () => {
      const created = await createCompany();

      const entry = await waitForSystemLogEntry(
        (candidate) => candidate.action === 'COMPANY_CREATED' && candidate.resourceId === created.id,
      );
      expect(entry).toBeDefined();

      const response = await request(app.getHttpServer())
        .get(`/api/system-logs/${entry!.id}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(response.body.data.id).toBe(entry!.id);
      expect(response.body.data.action).toBe('COMPANY_CREATED');
      expect(response.body.data.resource).toBe('Company');
      expect(response.body.data.resourceId).toBe(created.id);
      expect(response.body.data.severity).toBe('INFO');
      expect(typeof response.body.data.description).toBe('string');
      expect(response.body.data.description).not.toContain('[[SYSLOG_META]]');
      expect(typeof response.body.data.user).toBe('string');
      expect(response.body.data.user.length).toBeGreaterThan(0);
      expect(new Date(response.body.data.timestamp).toString()).not.toBe('Invalid Date');
      expect(Object.keys(response.body.data).sort()).toEqual(
        ['id', 'timestamp', 'user', 'action', 'resource', 'resourceId', 'severity', 'description', 'metadata'].sort(),
      );
    });

    it('a WARNING-severity action (Company delete) is persisted and read back with that severity', async () => {
      const created = await createCompany();

      await request(app.getHttpServer())
        .delete(`/api/companies/${created.id}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      const entry = await waitForSystemLogEntry(
        (candidate) => candidate.action === 'COMPANY_DELETED' && candidate.resourceId === created.id,
      );
      expect(entry).toBeDefined();
      expect(entry?.severity).toBe('WARNING');
    });
  });

  describe('Persistence', () => {
    it('the entry is a durable Postgres row (created_at is a real timestamp), not an in-memory mirror', async () => {
      const created = await createCompany();

      const entry = await waitForSystemLogEntry(
        (candidate) => candidate.action === 'COMPANY_CREATED' && candidate.resourceId === created.id,
      );
      expect(entry).toBeDefined();

      const row = await prisma.system_logs.findUnique({ where: { id: BigInt(entry!.id) } });
      expect(row).not.toBeNull();
      expect(row?.created_at).toBeInstanceOf(Date);

      // Known, documented compatibility gap (see PrismaSystemLogsRepository):
      // neither column has a caller-supplied value to persist yet.
      expect(row?.company_id).toBeNull();
      expect(row?.user_id).toBeNull();
    });
  });

  describe('Pagination (database-level)', () => {
    it('respects limit, reports the correct total, and echoes the requested page size', async () => {
      const beforeResponse = await request(app.getHttpServer())
        .get('/api/system-logs?page=1&limit=1')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);
      const totalBefore = beforeResponse.body.data.meta.total;

      await createCompany();
      await createCompany();
      await createCompany();

      const response = await request(app.getHttpServer())
        .get('/api/system-logs?page=1&limit=1')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(response.body.data.items.length).toBe(1);
      expect(response.body.data.meta.page).toBe(1);
      expect(response.body.data.meta.limit).toBe(1);
      expect(response.body.data.meta.total).toBeGreaterThanOrEqual(totalBefore + 3);
    });

    it('defaults to page 1 / limit 20 when no query params are supplied', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/system-logs')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(response.body.data.meta.page).toBe(1);
      expect(response.body.data.meta.limit).toBe(20);
      expect(response.body.data.items.length).toBeLessThanOrEqual(20);
    });

    it('returns newest entries first', async () => {
      const first = await createCompany();
      const second = await createCompany();

      await waitForSystemLogEntry((candidate) => candidate.action === 'COMPANY_CREATED' && candidate.resourceId === second.id);

      const response = await request(app.getHttpServer())
        .get('/api/system-logs?page=1&limit=5')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      const actionsInOrder: string[] = response.body.data.items.map(
        (entry: SystemLogEntry) => `${entry.action}:${entry.resourceId}`,
      );
      const secondIndex = actionsInOrder.indexOf(`COMPANY_CREATED:${second.id}`);
      const firstIndex = actionsInOrder.indexOf(`COMPANY_CREATED:${first.id}`);
      expect(secondIndex).toBeGreaterThanOrEqual(0);
      expect(firstIndex).toBeGreaterThan(secondIndex);
    });
  });

  describe('Column-mapping / leakage boundary', () => {
    it('caller-supplied metadata lands only in description, never in the module/status/request_path columns', async () => {
      const created = await createCompany();
      const marker = `MARKER_${created.id}_${Date.now()}`;

      await request(app.getHttpServer())
        .patch(`/api/companies/${created.id}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ name: marker })
        .expect(200);

      const entry = await waitForSystemLogEntry(
        (candidate) => candidate.action === 'COMPANY_UPDATED' && candidate.resourceId === created.id,
      );
      expect(entry).toBeDefined();
      // companies.service.ts passes { changes: dto } as metadata, and dto
      // includes the new name — so the marker should be recoverable from
      // the reconstructed entry...
      expect(JSON.stringify(entry?.metadata)).toContain(marker);

      // ...but only via the description column's JSON footer, never
      // spilled into the columns repurposed for resource/severity/resourceId.
      const row = await prisma.system_logs.findUnique({ where: { id: BigInt(entry!.id) } });
      expect(row?.module).toBe('Company');
      expect(row?.status).toBe('INFO');
      expect(row?.request_path).toBe(created.id);
      expect(row?.description).toContain(marker);
    });
  });
});
