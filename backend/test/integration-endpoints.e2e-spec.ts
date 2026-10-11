import { createServer, Server, IncomingHttpHeaders } from 'http';
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
 * E2E coverage for the HR Integration Gateway foundation: the LOV-driven
 * auth-type listing, endpoint (integration_detail) CRUD, tenant isolation
 * on endpoints, the three auth gateways (API Key / Basic / OAuth2) actually
 * authenticating a real outbound call, the sanitized test-endpoint
 * capability (including that credentials never leak into the response),
 * response field detection, and field-mapping preview.
 *
 * Rather than mocking `fetch`, this file runs a real local HTTP server (see
 * `startFixtureServer` below) and points test integrations' base_url at it
 * — IntegrationEndpointExecutorService makes a genuine outbound HTTP call
 * exactly as it would against a real HR API, and the fixture server records
 * what it actually received so tests can assert the resolved auth headers
 * reached the wire without ever appearing in the API's own JSON response.
 *
 * Company id pool: every existing e2e file already claims a disjoint
 * two-character range (Integrations: ZA/ZB, Employees: ZC/ZD, Companies:
 * ZE-ZZ — the entire rest of the alphabet), so this file uses YA/YB
 * instead, following the same "own disjoint range so parallel Jest runs
 * against the same real database never collide" discipline.
 *
 * LOV ids: scripts/seed-integration-auth-type-lov.ts (the real, manual,
 * optional seed) uses ids 90001-90003. This file seeds its OWN
 * INTEGRATION_AUTH_TYPE rows with a different id range (995001-995003) so
 * this test suite passes identically whether or not that script has been
 * run against this database, and cleans them up afterwards.
 */
describe('Integration endpoints — HR Integration Gateway (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixtureServer: Server;
  let fixtureBaseUrl: string;
  let receivedRequests: Array<{ path: string; method: string; headers: IncomingHttpHeaders; body: string }>;

  const COMPANY_A = 'YA';
  const COMPANY_B = 'YB';

  const SUPER_ADMIN_TOKEN = 'test-super-admin-token-hr-gateway';
  const COMPANY_A_TOKEN = 'test-company-a-token-hr-gateway';
  const COMPANY_B_TOKEN = 'test-company-b-token-hr-gateway';

  const LOV_MASTER_ID = 995001n;
  const LOV_DETAILS = [
    { id: 995001n, display: 'API Key', return: 'API', sorting: 1n },
    { id: 995002n, display: 'Basic Auth', return: 'BAS', sorting: 2n },
    { id: 995003n, display: 'OAuth 2.0', return: 'OAU', sorting: 3n },
  ];

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

  /**
   * Stands in for the external HR system. Every request is recorded (path,
   * method, headers, raw body) before being answered, so tests can assert
   * on exactly what the executor/gateway sent — including auth headers —
   * without needing to inspect any internal state.
   */
  function startFixtureServer(): Promise<{ server: Server; baseUrl: string }> {
    return new Promise((resolve) => {
      const server = createServer((req, res) => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => {
          const url = new URL(req.url ?? '/', 'http://localhost');
          const body = Buffer.concat(chunks).toString('utf8');
          receivedRequests.push({ path: url.pathname, method: req.method ?? 'GET', headers: req.headers, body });

          res.setHeader('Content-Type', 'application/json');

          if (url.pathname === '/employees') {
            res.writeHead(200);
            res.end(
              JSON.stringify({
                data: [
                  { id: 1, name: 'Alice Example', email: 'alice@example.test' },
                  { id: 2, name: 'Bob Example', email: 'bob@example.test' },
                ],
              }),
            );
            return;
          }

          if (url.pathname === '/echo-auth') {
            res.writeHead(200);
            res.end(JSON.stringify({ ok: true }));
            return;
          }

          if (url.pathname === '/oauth/token') {
            res.writeHead(200);
            res.end(JSON.stringify({ access_token: 'test-oauth-access-token-abc', token_type: 'Bearer' }));
            return;
          }

          if (url.pathname === '/protected') {
            res.writeHead(200);
            res.end(JSON.stringify({ secret: 'classified-hr-data' }));
            return;
          }

          if (url.pathname === '/always-fails') {
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'internal error' }));
            return;
          }

          res.writeHead(404);
          res.end(JSON.stringify({ error: 'not found' }));
        });
      });

      server.listen(0, '127.0.0.1', () => {
        const address = server.address() as AddressInfo;
        resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` });
      });
    });
  }

  async function cleanupTestData(): Promise<void> {
    await prisma.integration_detail.deleteMany({ where: { company_id: { in: [COMPANY_A, COMPANY_B] } } });
    await prisma.integration_master.deleteMany({ where: { company_id: { in: [COMPANY_A, COMPANY_B] } } });
    await prisma.usm_company.deleteMany({ where: { id: { in: [COMPANY_A, COMPANY_B] } } });
    await prisma.app_lov_detail.deleteMany({ where: { pid: LOV_MASTER_ID } });
    await prisma.app_lov_master.deleteMany({ where: { id: LOV_MASTER_ID } });
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
    receivedRequests = [];

    const fixture = await startFixtureServer();
    fixtureServer = fixture.server;
    fixtureBaseUrl = fixture.baseUrl;

    await cleanupTestData(); // idempotent — clears anything left by a prior interrupted run

    await prisma.usm_company.create({
      data: { id: COMPANY_A, title: 'HR Gateway E2E Test Co A', shortname: 'HRGWCOA', country: 1, status: 'Y' },
    });
    await prisma.usm_company.create({
      data: { id: COMPANY_B, title: 'HR Gateway E2E Test Co B', shortname: 'HRGWCOB', country: 1, status: 'Y' },
    });

    await prisma.app_lov_master.create({
      data: { id: LOV_MASTER_ID, title: 'INTEGRATION_AUTH_TYPE', show_hide_flag: 'Y' },
    });
    for (const detail of LOV_DETAILS) {
      await prisma.app_lov_detail.create({
        data: { id: detail.id, pid: LOV_MASTER_ID, display: detail.display, return: detail.return, sorting: detail.sorting, status: 'Y' },
      });
    }
  });

  afterAll(async () => {
    await cleanupTestData();
    await new Promise<void>((resolve) => fixtureServer.close(() => resolve()));
    await app.close();
  });

  async function createIntegration(companyId: string, authType: string, overrides: Record<string, unknown> = {}) {
    const response = await request(app.getHttpServer())
      .post('/api/integrations')
      .set('Authorization', `Bearer ${SUPER_ADMIN_TOKEN}`)
      .send({
        companyId,
        integrationType: 'HRS',
        authType,
        baseUrl: fixtureBaseUrl,
        apiKey: 'test-api-key-e2e-12345',
        apiSecret: 'test-api-secret-e2e-98765',
        ...overrides,
      })
      .expect(201);
    return response.body.data;
  }

  function validEndpointBody(overrides: Record<string, unknown> = {}) {
    return {
      name: 'List employees',
      description: 'Returns all employees.',
      endpoint: '/employees',
      httpMethod: 'GET',
      requestType: 'JSON',
      responseType: 'JSON',
      ...overrides,
    };
  }

  describe('1. LOV-driven auth types', () => {
    it('GET /integrations/tools/auth-types returns the seeded options, sorted', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/integrations/tools/auth-types')
        .set('Authorization', `Bearer ${SUPER_ADMIN_TOKEN}`)
        .expect(200);

      expect(response.body.data).toEqual([
        { value: 'API', title: 'API Key', sorting: 1 },
        { value: 'BAS', title: 'Basic Auth', sorting: 2 },
        { value: 'OAU', title: 'OAuth 2.0', sorting: 3 },
      ]);
    });
  });

  describe('2. Endpoint CRUD', () => {
    it('creates an endpoint under an integration (Company Admin, own company)', async () => {
      const integration = await createIntegration(COMPANY_A, 'API');

      const response = await request(app.getHttpServer())
        .post(`/api/integrations/${integration.id}/endpoints?companyId=${COMPANY_A}`)
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send(validEndpointBody())
        .expect(201);

      expect(response.body.data).toMatchObject({
        integrationId: integration.id,
        companyId: COMPANY_A,
        name: 'List employees',
        endpoint: '/employees',
        httpMethod: 'GET',
        status: 'ACTIVE',
      });
    });

    it('rejects an invalid httpMethod', async () => {
      const integration = await createIntegration(COMPANY_A, 'API');
      await request(app.getHttpServer())
        .post(`/api/integrations/${integration.id}/endpoints?companyId=${COMPANY_A}`)
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send(validEndpointBody({ httpMethod: 'TRACE' }))
        .expect(400);
    });

    it('rejects an endpoint path that is not a relative path starting with "/"', async () => {
      const integration = await createIntegration(COMPANY_A, 'API');
      await request(app.getHttpServer())
        .post(`/api/integrations/${integration.id}/endpoints?companyId=${COMPANY_A}`)
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send(validEndpointBody({ endpoint: 'https://evil.example.com/steal' }))
        .expect(400);
    });

    it('paginates the endpoint list at the database level', async () => {
      const integration = await createIntegration(COMPANY_A, 'API');
      for (const name of ['Endpoint 1', 'Endpoint 2', 'Endpoint 3']) {
        await request(app.getHttpServer())
          .post(`/api/integrations/${integration.id}/endpoints?companyId=${COMPANY_A}`)
          .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
          .send(validEndpointBody({ name }))
          .expect(201);
      }

      const response = await request(app.getHttpServer())
        .get(`/api/integrations/${integration.id}/endpoints?companyId=${COMPANY_A}&page=1&limit=2`)
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .expect(200);

      expect(response.body.data.items.length).toBe(2);
      expect(response.body.data.meta).toEqual({ page: 1, limit: 2, total: 3 });
    });

    it('gets one endpoint by id', async () => {
      const integration = await createIntegration(COMPANY_A, 'API');
      const created = await request(app.getHttpServer())
        .post(`/api/integrations/${integration.id}/endpoints?companyId=${COMPANY_A}`)
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send(validEndpointBody())
        .expect(201);

      const response = await request(app.getHttpServer())
        .get(`/api/integrations/${integration.id}/endpoints/${created.body.data.id}?companyId=${COMPANY_A}`)
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .expect(200);

      expect(response.body.data.name).toBe('List employees');
    });

    it('updates an endpoint', async () => {
      const integration = await createIntegration(COMPANY_A, 'API');
      const created = await request(app.getHttpServer())
        .post(`/api/integrations/${integration.id}/endpoints?companyId=${COMPANY_A}`)
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send(validEndpointBody())
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/api/integrations/${integration.id}/endpoints/${created.body.data.id}?companyId=${COMPANY_A}`)
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send({ status: 'INACTIVE' })
        .expect(200);

      const response = await request(app.getHttpServer())
        .get(`/api/integrations/${integration.id}/endpoints/${created.body.data.id}?companyId=${COMPANY_A}`)
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .expect(200);

      expect(response.body.data.status).toBe('INACTIVE');
    });

    it('deletes an endpoint, which then 404s', async () => {
      const integration = await createIntegration(COMPANY_A, 'API');
      const created = await request(app.getHttpServer())
        .post(`/api/integrations/${integration.id}/endpoints?companyId=${COMPANY_A}`)
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send(validEndpointBody())
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/api/integrations/${integration.id}/endpoints/${created.body.data.id}?companyId=${COMPANY_A}`)
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/api/integrations/${integration.id}/endpoints/${created.body.data.id}?companyId=${COMPANY_A}`)
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .expect(404);
    });
  });

  describe('3. Tenant isolation', () => {
    it('a Company B admin cannot list Company A\'s endpoints (403)', async () => {
      const integration = await createIntegration(COMPANY_A, 'API');
      const response = await request(app.getHttpServer())
        .get(`/api/integrations/${integration.id}/endpoints?companyId=${COMPANY_A}`)
        .set('Authorization', `Bearer ${COMPANY_B_TOKEN}`)
        .expect(403);

      expect(response.body.success).toBe(false);
    });

    it('an integration id that does not belong to the given companyId 404s, not leaks another tenant\'s data', async () => {
      const integrationA = await createIntegration(COMPANY_A, 'API');
      await request(app.getHttpServer())
        .get(`/api/integrations/${integrationA.id}/endpoints?companyId=${COMPANY_B}`)
        .set('Authorization', `Bearer ${SUPER_ADMIN_TOKEN}`)
        .expect(404);
    });
  });

  describe('4. Auth gateways actually authenticate the outbound call', () => {
    it('API Key gateway sends X-API-Key, and it never appears in the API\'s own response', async () => {
      const integration = await createIntegration(COMPANY_A, 'API', { apiKey: 'the-real-api-key-value' });
      const endpoint = await request(app.getHttpServer())
        .post(`/api/integrations/${integration.id}/endpoints?companyId=${COMPANY_A}`)
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send(validEndpointBody({ name: 'Echo auth', endpoint: '/echo-auth' }))
        .expect(201);

      receivedRequests = [];
      const response = await request(app.getHttpServer())
        .post(`/api/integrations/${integration.id}/endpoints/${endpoint.body.data.id}/test?companyId=${COMPANY_A}`)
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send({})
        .expect(201);

      expect(response.body.data.success).toBe(true);
      expect(response.body.data.statusCode).toBe(200);

      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toContain('the-real-api-key-value');
      expect(serialized).not.toContain('X-API-Key');

      const received = receivedRequests.find((r) => r.path === '/echo-auth');
      expect(received?.headers['x-api-key']).toBe('the-real-api-key-value');
    });

    it('Basic Auth gateway sends a correct base64 Authorization header', async () => {
      const integration = await createIntegration(COMPANY_A, 'BAS', { apiKey: 'basicuser', apiSecret: 'basicpass' });
      const endpoint = await request(app.getHttpServer())
        .post(`/api/integrations/${integration.id}/endpoints?companyId=${COMPANY_A}`)
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send(validEndpointBody({ name: 'Echo auth', endpoint: '/echo-auth' }))
        .expect(201);

      receivedRequests = [];
      await request(app.getHttpServer())
        .post(`/api/integrations/${integration.id}/endpoints/${endpoint.body.data.id}/test?companyId=${COMPANY_A}`)
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send({})
        .expect(201);

      const expected = `Basic ${Buffer.from('basicuser:basicpass', 'utf8').toString('base64')}`;
      const received = receivedRequests.find((r) => r.path === '/echo-auth');
      expect(received?.headers['authorization']).toBe(expected);
    });

    it('OAuth2 gateway fetches a token from the configured token endpoint and uses it as a Bearer token', async () => {
      const integration = await createIntegration(COMPANY_A, 'OAU', { apiKey: 'oauth-client-id', apiSecret: 'oauth-client-secret' });

      await request(app.getHttpServer())
        .post(`/api/integrations/${integration.id}/endpoints?companyId=${COMPANY_A}`)
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send(
          validEndpointBody({
            name: 'OAUTH2_TOKEN_ENDPOINT',
            endpoint: '/oauth/token',
            httpMethod: 'POST',
            requestType: 'FORM',
          }),
        )
        .expect(201);

      const protectedEndpoint = await request(app.getHttpServer())
        .post(`/api/integrations/${integration.id}/endpoints?companyId=${COMPANY_A}`)
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send(validEndpointBody({ name: 'Protected resource', endpoint: '/protected' }))
        .expect(201);

      receivedRequests = [];
      const response = await request(app.getHttpServer())
        .post(`/api/integrations/${integration.id}/endpoints/${protectedEndpoint.body.data.id}/test?companyId=${COMPANY_A}`)
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send({})
        .expect(201);

      expect(response.body.data.success).toBe(true);

      const tokenRequest = receivedRequests.find((r) => r.path === '/oauth/token');
      expect(tokenRequest?.method).toBe('POST');
      expect(tokenRequest?.body).toContain('client_id=oauth-client-id');
      expect(tokenRequest?.body).toContain('client_secret=oauth-client-secret');

      const protectedRequest = receivedRequests.find((r) => r.path === '/protected');
      expect(protectedRequest?.headers['authorization']).toBe('Bearer test-oauth-access-token-abc');

      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toContain('oauth-client-secret');
      expect(serialized).not.toContain('test-oauth-access-token-abc');
    });
  });

  describe('5. Auth type must be an active LOV value before executing', () => {
    it('rejects testing an endpoint whose integration has an unrecognized auth_type', async () => {
      const integration = await createIntegration(COMPANY_A, 'ZZZ');
      const endpoint = await request(app.getHttpServer())
        .post(`/api/integrations/${integration.id}/endpoints?companyId=${COMPANY_A}`)
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send(validEndpointBody())
        .expect(201);

      const response = await request(app.getHttpServer())
        .post(`/api/integrations/${integration.id}/endpoints/${endpoint.body.data.id}/test?companyId=${COMPANY_A}`)
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('6. Test-endpoint failure handling', () => {
    it('reports success:false with the real status code when the external API returns an error', async () => {
      const integration = await createIntegration(COMPANY_A, 'API');
      const endpoint = await request(app.getHttpServer())
        .post(`/api/integrations/${integration.id}/endpoints?companyId=${COMPANY_A}`)
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send(validEndpointBody({ name: 'Failing endpoint', endpoint: '/always-fails' }))
        .expect(201);

      const response = await request(app.getHttpServer())
        .post(`/api/integrations/${integration.id}/endpoints/${endpoint.body.data.id}/test?companyId=${COMPANY_A}`)
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send({})
        .expect(201);

      expect(response.body.data.success).toBe(false);
      expect(response.body.data.statusCode).toBe(500);
    });
  });

  describe('7. Response field detection', () => {
    it('reports structural array paths, not per-index paths', async () => {
      const integration = await createIntegration(COMPANY_A, 'API');
      const endpoint = await request(app.getHttpServer())
        .post(`/api/integrations/${integration.id}/endpoints?companyId=${COMPANY_A}`)
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send(validEndpointBody({ name: 'List employees', endpoint: '/employees' }))
        .expect(201);

      const response = await request(app.getHttpServer())
        .post(`/api/integrations/${integration.id}/endpoints/${endpoint.body.data.id}/test?companyId=${COMPANY_A}`)
        .set('Authorization', `Bearer ${COMPANY_A_TOKEN}`)
        .send({})
        .expect(201);

      const fields = response.body.data.detectedFields;
      expect(fields).toEqual(
        expect.arrayContaining([
          { path: 'data', type: 'array' },
          { path: 'data[].id', type: 'number' },
          { path: 'data[].name', type: 'string' },
          { path: 'data[].email', type: 'string' },
        ]),
      );
      // No per-index paths like "data[0].id" anywhere in the result.
      expect(fields.some((f: { path: string }) => /\[\d+\]/.test(f.path))).toBe(false);
    });

    it('the standalone detect-response-fields tool works on a pasted sample, with no live call', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/integrations/tools/detect-response-fields')
        .set('Authorization', `Bearer ${SUPER_ADMIN_TOKEN}`)
        .send({ sampleResponse: { results: [{ empId: 'E1', active: true }] } })
        .expect(201);

      expect(response.body.data.fields).toEqual(
        expect.arrayContaining([
          { path: 'results', type: 'array' },
          { path: 'results[].empId', type: 'string' },
          { path: 'results[].active', type: 'boolean' },
        ]),
      );
    });
  });

  describe('8. Field mapping preview (no persistence)', () => {
    it('applies TRIM/UPPERCASE/VALUE_MAP transforms and builds nested target fields', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/integrations/tools/preview-field-mapping')
        .set('Authorization', `Bearer ${SUPER_ADMIN_TOKEN}`)
        .send({
          sampleRecord: { firstName: '  Alice  ', gender: 'F', status: 'active' },
          mappings: [
            { sourcePath: 'firstName', targetField: 'profile.firstName', transform: 'TRIM' },
            { sourcePath: 'status', targetField: 'profile.status', transform: 'UPPERCASE' },
            {
              sourcePath: 'gender',
              targetField: 'profile.gender',
              transform: 'VALUE_MAP',
              valueMap: { M: 'Male', F: 'Female' },
            },
            { sourcePath: 'missingField', targetField: 'profile.missing', defaultValue: 'N/A' },
          ],
        })
        .expect(201);

      expect(response.body.data.mapped).toEqual({
        profile: { firstName: 'Alice', status: 'ACTIVE', gender: 'Female', missing: 'N/A' },
      });
    });
  });
});
