import { createServer, Server } from 'http';
import type { AddressInfo } from 'net';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';
import { PrismaService } from './../src/prisma/prisma.service';
import { PrismaSessionsRepository } from './../src/auth/repositories/prisma-sessions.repository';
import { Session } from './../src/auth/interfaces/session.interface';
import { Role } from './../src/common/constants/roles.enum';

/**
 * E2E coverage for Phase 4F — Persistent Custom Field Mapping
 * (integration_field_mapping): create/list/get/update/delete, per-
 * transform-type transformConfig validation, DB-level duplicate prevention,
 * sort_order ordering, real Postgres persistence beyond one Nest app
 * instance, strict tenant isolation + full ownership-chain IDOR checks
 * (company -> integration -> endpoint -> mapping), SUPER_ADMIN/COMPANY_ADMIN
 * only (EMPLOYEE rejected), credential non-leakage, and the wiring of
 * persisted mappings into the existing test-endpoint execution pipeline
 * (TestEndpointResult.mappedSample).
 *
 * Company id pool: Integrations=ZA/ZB, Employees=ZC/ZD, Companies=ZE-ZZ,
 * HR-Integration-Gateway=YA/YB (see integration-endpoints.e2e-spec.ts) — this
 * file claims its own disjoint pair, XA/XB, so parallel/serial runs against
 * the same real database never collide.
 *
 * LOV ids: the HR-Integration-Gateway e2e file uses 995001-995003 (own
 * range, distinct from the real optional seed's 90001-90003). This file
 * seeds its OWN INTEGRATION_AUTH_TYPE row with yet another id (996001) so it
 * passes identically regardless of whether either of those has run.
 */
describe('Integration field mappings — Phase 4F persistent field mapping (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixtureServer: Server;
  let fixtureBaseUrl: string;

  const COMPANY_A = 'XA';
  const COMPANY_B = 'XB';

  const SUPER_ADMIN_TOKEN = 'test-super-admin-token-field-mappings';
  const COMPANY_A_TOKEN = 'test-company-a-token-field-mappings';
  const COMPANY_B_TOKEN = 'test-company-b-token-field-mappings';
  const EMPLOYEE_TOKEN = 'test-employee-token-field-mappings';

  const LOV_MASTER_ID = 996001n;
  const LOV_DETAIL_ID = 996001n;

  const testSessions = new Map<string, Session>([
    [
      SUPER_ADMIN_TOKEN,
      { token: SUPER_ADMIN_TOKEN, userId: 'usr_super_admin', role: Role.SUPER_ADMIN, issuedAt: new Date().toISOString() },
    ],
    [
      COMPANY_A_TOKEN,
      {
        token: COMPANY_A_TOKEN,
        userId: 'usr_company_admin_a',
        role: Role.COMPANY_ADMIN,
        companyId: COMPANY_A,
        issuedAt: new Date().toISOString(),
      },
    ],
    [
      COMPANY_B_TOKEN,
      {
        token: COMPANY_B_TOKEN,
        userId: 'usr_company_admin_b',
        role: Role.COMPANY_ADMIN,
        companyId: COMPANY_B,
        issuedAt: new Date().toISOString(),
      },
    ],
    [
      EMPLOYEE_TOKEN,
      {
        token: EMPLOYEE_TOKEN,
        userId: 'usr_employee_a',
        role: Role.EMPLOYEE,
        companyId: COMPANY_A,
        issuedAt: new Date().toISOString(),
      },
    ],
  ]);

  function sessionOverride() {
    return {
      findByToken: (token: string) => testSessions.get(token),
      create: () => {
        throw new Error('not used in this test override');
      },
      revoke: () => undefined,
    };
  }

  async function buildApp(): Promise<INestApplication> {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaSessionsRepository)
      .useValue(sessionOverride())
      .compile();

    const nestApp = moduleFixture.createNestApplication();
    nestApp.setGlobalPrefix('api');
    nestApp.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    nestApp.useGlobalFilters(new HttpExceptionFilter());
    await nestApp.init();
    return nestApp;
  }

  /** Stands in for the external HR system, for the mappedSample wiring test. */
  function startFixtureServer(): Promise<{ server: Server; baseUrl: string }> {
    return new Promise((resolve) => {
      const server = createServer((req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        res.setHeader('Content-Type', 'application/json');

        if (url.pathname === '/employees') {
          res.writeHead(200);
          res.end(
            JSON.stringify({
              data: [
                { id: 1, name: ' Alice ', active: true },
                { id: 2, name: 'BOB', active: false },
              ],
            }),
          );
          return;
        }

        res.writeHead(404);
        res.end(JSON.stringify({ error: 'not found' }));
      });

      server.listen(0, '127.0.0.1', () => {
        const address = server.address() as AddressInfo;
        resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` });
      });
    });
  }

  async function cleanupTestData(): Promise<void> {
    await prisma.integration_field_mapping.deleteMany({ where: { company_id: { in: [COMPANY_A, COMPANY_B] } } });
    await prisma.integration_detail.deleteMany({ where: { company_id: { in: [COMPANY_A, COMPANY_B] } } });
    await prisma.integration_master.deleteMany({ where: { company_id: { in: [COMPANY_A, COMPANY_B] } } });
    await prisma.usm_company.deleteMany({ where: { id: { in: [COMPANY_A, COMPANY_B] } } });
    await prisma.app_lov_detail.deleteMany({ where: { pid: LOV_MASTER_ID } });
    await prisma.app_lov_master.deleteMany({ where: { id: LOV_MASTER_ID } });
  }

  beforeAll(async () => {
    app = await buildApp();
    prisma = app.get(PrismaService);

    const fixture = await startFixtureServer();
    fixtureServer = fixture.server;
    fixtureBaseUrl = fixture.baseUrl;

    await cleanupTestData(); // idempotent — clears anything left by a prior interrupted run

    await prisma.usm_company.create({
      data: { id: COMPANY_A, title: 'Field Mapping E2E Test Co A', shortname: 'FMAPCOA', country: 1, status: 'Y' },
    });
    await prisma.usm_company.create({
      data: { id: COMPANY_B, title: 'Field Mapping E2E Test Co B', shortname: 'FMAPCOB', country: 1, status: 'Y' },
    });

    await prisma.app_lov_master.create({
      data: { id: LOV_MASTER_ID, title: 'INTEGRATION_AUTH_TYPE', show_hide_flag: 'Y' },
    });
    await prisma.app_lov_detail.create({
      data: { id: LOV_DETAIL_ID, pid: LOV_MASTER_ID, display: 'API Key', return: 'API', sorting: 1n, status: 'Y' },
    });
  });

  afterAll(async () => {
    await cleanupTestData();
    await new Promise<void>((resolve) => fixtureServer.close(() => resolve()));
    await app.close();
  });

  async function createIntegration(companyId: string, overrides: Record<string, unknown> = {}) {
    const response = await request(app.getHttpServer())
      .post('/api/integrations')
      .set('Authorization', `Bearer ${SUPER_ADMIN_TOKEN}`)
      .send({
        companyId,
        integrationType: 'HRS',
        authType: 'API',
        baseUrl: fixtureBaseUrl,
        apiKey: 'test-api-key-e2e-fieldmap',
        apiSecret: 'test-api-secret-e2e-fieldmap',
        ...overrides,
      })
      .expect(201);
    return response.body.data;
  }

  async function createEndpoint(integrationId: string, companyId: string, token: string, overrides: Record<string, unknown> = {}) {
    const response = await request(app.getHttpServer())
      .post(`/api/integrations/${integrationId}/endpoints?companyId=${companyId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'List employees',
        endpoint: '/employees',
        httpMethod: 'GET',
        requestType: 'JSON',
        responseType: 'JSON',
        ...overrides,
      })
      .expect(201);
    return response.body.data;
  }

  function mappingsUrl(integrationId: string, endpointId: string, companyId: string, extra = ''): string {
    return `/api/integrations/${integrationId}/endpoints/${endpointId}/mappings?companyId=${companyId}${extra}`;
  }

  function mappingUrl(integrationId: string, endpointId: string, mappingId: string, companyId: string): string {
    return `/api/integrations/${integrationId}/endpoints/${endpointId}/mappings/${mappingId}?companyId=${companyId}`;
  }

  function validMappingBody(overrides: Record<string, unknown> = {}) {
    return {
      sourcePath: 'data[].employeeId',
      targetField: 'profile.employeeId',
      ...overrides,
    };
  }

  describe('1. Create', () => {
    it('creates a field mapping with server-applied defaults (transformType NONE, sortOrder 1, status Y)', async () => {
      const integration = await createIntegration(COMPANY_A);
      const endpoint = await createEndpoint(integration.id, COMPANY_A, COMPANY_A_TOKEN);

      const response = await request(app.getHttpServer())
        .post(mappingsUrl(integration.id, endpoint.id, COMPANY_A))
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send(validMappingBody())
        .expect(201);

      expect(response.body.data).toMatchObject({
        companyId: COMPANY_A,
        integrationId: integration.id,
        endpointId: endpoint.id,
        sourcePath: 'data[].employeeId',
        targetField: 'profile.employeeId',
        transformType: 'NONE',
        transformConfig: {},
        sortOrder: 1,
        status: 'Y',
      });
      expect(response.body.data.id).toBeDefined();
    });

    it('rejects a sourcePath using a numeric array index instead of the structural "[]" marker (400)', async () => {
      const integration = await createIntegration(COMPANY_A);
      const endpoint = await createEndpoint(integration.id, COMPANY_A, COMPANY_A_TOKEN);

      await request(app.getHttpServer())
        .post(mappingsUrl(integration.id, endpoint.id, COMPANY_A))
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send(validMappingBody({ sourcePath: 'data[0].employeeId' }))
        .expect(400);
    });

    it('rejects an unrecognized transformType (400)', async () => {
      const integration = await createIntegration(COMPANY_A);
      const endpoint = await createEndpoint(integration.id, COMPANY_A, COMPANY_A_TOKEN);

      await request(app.getHttpServer())
        .post(mappingsUrl(integration.id, endpoint.id, COMPANY_A))
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send(validMappingBody({ transformType: 'EVAL_JS' }))
        .expect(400);
    });

    it('rejects VALUE_MAP with a missing/empty valueMap in transformConfig (400)', async () => {
      const integration = await createIntegration(COMPANY_A);
      const endpoint = await createEndpoint(integration.id, COMPANY_A, COMPANY_A_TOKEN);

      await request(app.getHttpServer())
        .post(mappingsUrl(integration.id, endpoint.id, COMPANY_A))
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send(validMappingBody({ targetField: 'profile.gender', transformType: 'VALUE_MAP', transformConfig: {} }))
        .expect(400);
    });

    it('rejects DEFAULT_IF_EMPTY without a defaultValue in transformConfig (400)', async () => {
      const integration = await createIntegration(COMPANY_A);
      const endpoint = await createEndpoint(integration.id, COMPANY_A, COMPANY_A_TOKEN);

      await request(app.getHttpServer())
        .post(mappingsUrl(integration.id, endpoint.id, COMPANY_A))
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send(validMappingBody({ targetField: 'profile.dept', transformType: 'DEFAULT_IF_EMPTY', transformConfig: {} }))
        .expect(400);
    });

    it('rejects transformConfig keys not recognized for the given transformType (400)', async () => {
      const integration = await createIntegration(COMPANY_A);
      const endpoint = await createEndpoint(integration.id, COMPANY_A, COMPANY_A_TOKEN);

      await request(app.getHttpServer())
        .post(mappingsUrl(integration.id, endpoint.id, COMPANY_A))
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send(validMappingBody({ targetField: 'profile.x', transformType: 'TRIM', transformConfig: { script: 'evil()' } }))
        .expect(400);
    });

    it('creates a valid VALUE_MAP mapping when transformConfig.valueMap is a well-formed string map', async () => {
      const integration = await createIntegration(COMPANY_A);
      const endpoint = await createEndpoint(integration.id, COMPANY_A, COMPANY_A_TOKEN);

      const response = await request(app.getHttpServer())
        .post(mappingsUrl(integration.id, endpoint.id, COMPANY_A))
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send(
          validMappingBody({
            targetField: 'profile.gender',
            transformType: 'VALUE_MAP',
            transformConfig: { valueMap: { M: 'Male', F: 'Female' } },
          }),
        )
        .expect(201);

      expect(response.body.data.transformConfig).toEqual({ valueMap: { M: 'Male', F: 'Female' } });
    });

    it('prevents a duplicate mapping (same sourcePath + targetField under the same endpoint) at the database level (409)', async () => {
      const integration = await createIntegration(COMPANY_A);
      const endpoint = await createEndpoint(integration.id, COMPANY_A, COMPANY_A_TOKEN);

      await request(app.getHttpServer())
        .post(mappingsUrl(integration.id, endpoint.id, COMPANY_A))
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send(validMappingBody())
        .expect(201);

      const response = await request(app.getHttpServer())
        .post(mappingsUrl(integration.id, endpoint.id, COMPANY_A))
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send(validMappingBody())
        .expect(409);

      expect(response.body.success).toBe(false);
    });
  });

  describe('2. List, ordered by sortOrder', () => {
    it('returns mappings ordered by sortOrder ascending, regardless of creation order, paginated', async () => {
      const integration = await createIntegration(COMPANY_A);
      const endpoint = await createEndpoint(integration.id, COMPANY_A, COMPANY_A_TOKEN);

      await request(app.getHttpServer())
        .post(mappingsUrl(integration.id, endpoint.id, COMPANY_A))
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send(validMappingBody({ sourcePath: 'c', targetField: 'c', sortOrder: 3 }))
        .expect(201);
      await request(app.getHttpServer())
        .post(mappingsUrl(integration.id, endpoint.id, COMPANY_A))
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send(validMappingBody({ sourcePath: 'a', targetField: 'a', sortOrder: 1 }))
        .expect(201);
      await request(app.getHttpServer())
        .post(mappingsUrl(integration.id, endpoint.id, COMPANY_A))
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send(validMappingBody({ sourcePath: 'b', targetField: 'b', sortOrder: 2 }))
        .expect(201);

      const response = await request(app.getHttpServer())
        .get(mappingsUrl(integration.id, endpoint.id, COMPANY_A))
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .expect(200);

      expect(response.body.data.items.map((m: { sourcePath: string }) => m.sourcePath)).toEqual(['a', 'b', 'c']);
      expect(response.body.data.meta).toEqual({ page: 1, limit: 20, total: 3 });
    });
  });

  describe('3. Get one', () => {
    it('gets one mapping by id', async () => {
      const integration = await createIntegration(COMPANY_A);
      const endpoint = await createEndpoint(integration.id, COMPANY_A, COMPANY_A_TOKEN);
      const created = await request(app.getHttpServer())
        .post(mappingsUrl(integration.id, endpoint.id, COMPANY_A))
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send(validMappingBody())
        .expect(201);

      const response = await request(app.getHttpServer())
        .get(mappingUrl(integration.id, endpoint.id, created.body.data.id, COMPANY_A))
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .expect(200);

      expect(response.body.data.targetField).toBe('profile.employeeId');
    });
  });

  describe('4. Update', () => {
    it('updates a mapping, re-validating transformConfig against the (possibly new) transformType', async () => {
      const integration = await createIntegration(COMPANY_A);
      const endpoint = await createEndpoint(integration.id, COMPANY_A, COMPANY_A_TOKEN);
      const created = await request(app.getHttpServer())
        .post(mappingsUrl(integration.id, endpoint.id, COMPANY_A))
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send(validMappingBody())
        .expect(201);

      await request(app.getHttpServer())
        .patch(mappingUrl(integration.id, endpoint.id, created.body.data.id, COMPANY_A))
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send({ transformType: 'UPPERCASE', status: 'N' })
        .expect(200);

      const response = await request(app.getHttpServer())
        .get(mappingUrl(integration.id, endpoint.id, created.body.data.id, COMPANY_A))
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .expect(200);

      expect(response.body.data.transformType).toBe('UPPERCASE');
      expect(response.body.data.status).toBe('N');
    });

    it('rejects an update that would leave transformConfig invalid for its (new) transformType (400)', async () => {
      const integration = await createIntegration(COMPANY_A);
      const endpoint = await createEndpoint(integration.id, COMPANY_A, COMPANY_A_TOKEN);
      const created = await request(app.getHttpServer())
        .post(mappingsUrl(integration.id, endpoint.id, COMPANY_A))
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send(validMappingBody())
        .expect(201);

      await request(app.getHttpServer())
        .patch(mappingUrl(integration.id, endpoint.id, created.body.data.id, COMPANY_A))
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send({ transformType: 'VALUE_MAP' }) // no valueMap supplied, and none exists from before (was NONE)
        .expect(400);
    });
  });

  describe('5. Delete', () => {
    it('deletes a mapping, which then 404s', async () => {
      const integration = await createIntegration(COMPANY_A);
      const endpoint = await createEndpoint(integration.id, COMPANY_A, COMPANY_A_TOKEN);
      const created = await request(app.getHttpServer())
        .post(mappingsUrl(integration.id, endpoint.id, COMPANY_A))
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send(validMappingBody())
        .expect(201);

      await request(app.getHttpServer())
        .delete(mappingUrl(integration.id, endpoint.id, created.body.data.id, COMPANY_A))
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(mappingUrl(integration.id, endpoint.id, created.body.data.id, COMPANY_A))
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .expect(404);
    });
  });

  describe('6. Real Postgres persistence beyond one Nest app instance', () => {
    it('a mapping created via one app instance is readable via a brand-new app instance', async () => {
      const integration = await createIntegration(COMPANY_A);
      const endpoint = await createEndpoint(integration.id, COMPANY_A, COMPANY_A_TOKEN);
      const created = await request(app.getHttpServer())
        .post(mappingsUrl(integration.id, endpoint.id, COMPANY_A))
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send(validMappingBody({ sourcePath: 'data[].survives', targetField: 'profile.survives' }))
        .expect(201);

      const secondApp = await buildApp();
      try {
        const response = await request(secondApp.getHttpServer())
          .get(mappingUrl(integration.id, endpoint.id, created.body.data.id, COMPANY_A))
          .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
          .expect(200);

        expect(response.body.data.sourcePath).toBe('data[].survives');
      } finally {
        await secondApp.close();
      }
    });
  });

  describe('7. Tenant isolation and IDOR', () => {
    it('a Company B admin cannot list Company A\'s mappings using their own companyId (404 — endpoint does not belong to Company B)', async () => {
      const integration = await createIntegration(COMPANY_A);
      const endpoint = await createEndpoint(integration.id, COMPANY_A, COMPANY_A_TOKEN);

      await request(app.getHttpServer())
        .get(mappingsUrl(integration.id, endpoint.id, COMPANY_B))
        .set('Authorization', `Bearer ${COMPANY_B_TOKEN}`)
        .expect(404);
    });

    it('a Company B admin cannot impersonate Company A via the companyId query param (403, rejected before any data lookup)', async () => {
      const integration = await createIntegration(COMPANY_A);
      const endpoint = await createEndpoint(integration.id, COMPANY_A, COMPANY_A_TOKEN);

      await request(app.getHttpServer())
        .get(mappingsUrl(integration.id, endpoint.id, COMPANY_A))
        .set('Authorization', `Bearer ${COMPANY_B_TOKEN}`)
        .expect(403);
    });

    it('SUPER_ADMIN gets 404 (not another tenant\'s data) when a real mapping id is looked up under the wrong companyId', async () => {
      const integrationA = await createIntegration(COMPANY_A);
      const endpointA = await createEndpoint(integrationA.id, COMPANY_A, COMPANY_A_TOKEN);
      const created = await request(app.getHttpServer())
        .post(mappingsUrl(integrationA.id, endpointA.id, COMPANY_A))
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send(validMappingBody())
        .expect(201);

      await request(app.getHttpServer())
        .get(mappingUrl(integrationA.id, endpointA.id, created.body.data.id, COMPANY_B))
        .set('Authorization', `Bearer ${SUPER_ADMIN_TOKEN}`)
        .expect(404);
    });

    it('a mapping id that exists but belongs to a different endpoint (same integration/company) 404s (ownership-chain IDOR check)', async () => {
      const integration = await createIntegration(COMPANY_A);
      const endpointOne = await createEndpoint(integration.id, COMPANY_A, COMPANY_A_TOKEN, { name: 'Endpoint one' });
      const endpointTwo = await createEndpoint(integration.id, COMPANY_A, COMPANY_A_TOKEN, { name: 'Endpoint two' });
      const created = await request(app.getHttpServer())
        .post(mappingsUrl(integration.id, endpointOne.id, COMPANY_A))
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send(validMappingBody())
        .expect(201);

      await request(app.getHttpServer())
        .get(mappingUrl(integration.id, endpointTwo.id, created.body.data.id, COMPANY_A))
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .expect(404);
    });

    it('an endpointId that does not belong to the given integrationId 404s (full ownership-chain check reused from EndpointsService)', async () => {
      const integrationA = await createIntegration(COMPANY_A);
      const integrationA2 = await createIntegration(COMPANY_A, { integrationType: 'HRS' });
      const endpointUnderA2 = await createEndpoint(integrationA2.id, COMPANY_A, COMPANY_A_TOKEN);

      await request(app.getHttpServer())
        .get(mappingsUrl(integrationA.id, endpointUnderA2.id, COMPANY_A))
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .expect(404);
    });

    it('a Company B admin cannot update Company A\'s mapping (404)', async () => {
      const integration = await createIntegration(COMPANY_A);
      const endpoint = await createEndpoint(integration.id, COMPANY_A, COMPANY_A_TOKEN);
      const created = await request(app.getHttpServer())
        .post(mappingsUrl(integration.id, endpoint.id, COMPANY_A))
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send(validMappingBody())
        .expect(201);

      await request(app.getHttpServer())
        .patch(mappingUrl(integration.id, endpoint.id, created.body.data.id, COMPANY_B))
        .set('Authorization', `Bearer ${COMPANY_B_TOKEN}`)
        .send({ status: 'N' })
        .expect(404);

      const stillThere = await request(app.getHttpServer())
        .get(mappingUrl(integration.id, endpoint.id, created.body.data.id, COMPANY_A))
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .expect(200);
      expect(stillThere.body.data.status).toBe('Y'); // unchanged — the cross-tenant update never applied
    });

    it('a Company B admin cannot delete Company A\'s mapping (404, and it still exists afterwards)', async () => {
      const integration = await createIntegration(COMPANY_A);
      const endpoint = await createEndpoint(integration.id, COMPANY_A, COMPANY_A_TOKEN);
      const created = await request(app.getHttpServer())
        .post(mappingsUrl(integration.id, endpoint.id, COMPANY_A))
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send(validMappingBody())
        .expect(201);

      await request(app.getHttpServer())
        .delete(mappingUrl(integration.id, endpoint.id, created.body.data.id, COMPANY_B))
        .set('Authorization', `Bearer ${COMPANY_B_TOKEN}`)
        .expect(404);

      await request(app.getHttpServer())
        .get(mappingUrl(integration.id, endpoint.id, created.body.data.id, COMPANY_A))
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .expect(200);
    });
  });

  describe('8. Role authorization', () => {
    it('rejects an EMPLOYEE from any field-mapping route (403)', async () => {
      const integration = await createIntegration(COMPANY_A);
      const endpoint = await createEndpoint(integration.id, COMPANY_A, COMPANY_A_TOKEN);

      await request(app.getHttpServer())
        .get(mappingsUrl(integration.id, endpoint.id, COMPANY_A))
        .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`)
        .expect(403);

      await request(app.getHttpServer())
        .post(mappingsUrl(integration.id, endpoint.id, COMPANY_A))
        .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`)
        .send(validMappingBody())
        .expect(403);
    });
  });

  describe('9. Credential non-leakage', () => {
    it('the mapping create/list/get responses never contain the integration\'s api_key/api_secret', async () => {
      const integration = await createIntegration(COMPANY_A, {
        apiKey: 'super-secret-key-value',
        apiSecret: 'super-secret-secret-value',
      });
      const endpoint = await createEndpoint(integration.id, COMPANY_A, COMPANY_A_TOKEN);

      const created = await request(app.getHttpServer())
        .post(mappingsUrl(integration.id, endpoint.id, COMPANY_A))
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send(validMappingBody())
        .expect(201);

      const list = await request(app.getHttpServer())
        .get(mappingsUrl(integration.id, endpoint.id, COMPANY_A))
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .expect(200);

      expect(JSON.stringify(created.body)).not.toContain('super-secret-key-value');
      expect(JSON.stringify(created.body)).not.toContain('super-secret-secret-value');
      expect(JSON.stringify(list.body)).not.toContain('super-secret-key-value');
      expect(JSON.stringify(list.body)).not.toContain('super-secret-secret-value');
    });
  });

  describe('10. Wired into the existing test-endpoint execution pipeline', () => {
    it('testEndpoint has no mappedSample when there are no active mappings (purely additive)', async () => {
      const integration = await createIntegration(COMPANY_A);
      const endpoint = await createEndpoint(integration.id, COMPANY_A, COMPANY_A_TOKEN);

      const response = await request(app.getHttpServer())
        .post(`/api/integrations/${integration.id}/endpoints/${endpoint.id}/test?companyId=${COMPANY_A}`)
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send({})
        .expect(201);

      expect(response.body.data.mappedSample).toBeUndefined();
    });

    it('applies TRIM/LOWERCASE/TO_STRING/VALUE_MAP mappings per-element against the real response, in mappedSample', async () => {
      const integration = await createIntegration(COMPANY_A, { apiKey: 'wiring-test-key', apiSecret: 'wiring-test-secret' });
      const endpoint = await createEndpoint(integration.id, COMPANY_A, COMPANY_A_TOKEN, { name: 'Wiring endpoint' });

      const mappings = [
        { sourcePath: 'data[].name', targetField: 'profile.name', transformType: 'TRIM' },
        { sourcePath: 'data[].name', targetField: 'profile.nameLower', transformType: 'LOWERCASE' },
        { sourcePath: 'data[].id', targetField: 'profile.id', transformType: 'TO_STRING' },
        {
          sourcePath: 'data[].active',
          targetField: 'profile.status',
          transformType: 'VALUE_MAP',
          transformConfig: { valueMap: { true: 'Active', false: 'Inactive' } },
        },
      ];
      for (const mapping of mappings) {
        await request(app.getHttpServer())
          .post(mappingsUrl(integration.id, endpoint.id, COMPANY_A))
          .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
          .send(mapping)
          .expect(201);
      }

      const response = await request(app.getHttpServer())
        .post(`/api/integrations/${integration.id}/endpoints/${endpoint.id}/test?companyId=${COMPANY_A}`)
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send({})
        .expect(201);

      expect(response.body.data.mappedSample).toEqual([
        { profile: { name: 'Alice', nameLower: ' alice ', id: '1', status: 'Active' } },
        { profile: { name: 'BOB', nameLower: 'bob', id: '2', status: 'Inactive' } },
      ]);

      // Credentials never leak into the mapped output either.
      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toContain('wiring-test-key');
      expect(serialized).not.toContain('wiring-test-secret');
    });

    it('an INACTIVE (status N) mapping is not applied in mappedSample', async () => {
      const integration = await createIntegration(COMPANY_A);
      const endpoint = await createEndpoint(integration.id, COMPANY_A, COMPANY_A_TOKEN, { name: 'Inactive mapping endpoint' });

      const created = await request(app.getHttpServer())
        .post(mappingsUrl(integration.id, endpoint.id, COMPANY_A))
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send({ sourcePath: 'data[].name', targetField: 'profile.name', transformType: 'TRIM' })
        .expect(201);

      await request(app.getHttpServer())
        .patch(mappingUrl(integration.id, endpoint.id, created.body.data.id, COMPANY_A))
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send({ status: 'N' })
        .expect(200);

      const response = await request(app.getHttpServer())
        .post(`/api/integrations/${integration.id}/endpoints/${endpoint.id}/test?companyId=${COMPANY_A}`)
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send({})
        .expect(201);

      expect(response.body.data.mappedSample).toBeUndefined();
    });
  });
});
