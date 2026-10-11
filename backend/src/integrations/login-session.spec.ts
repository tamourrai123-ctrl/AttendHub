import { BadGatewayException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { HrLoginSessionDto } from './dto/hr-login-session.dto';
import { MockHrServer, MockReply } from './testing/mock-hr-server';
import { HrTestHarness, map } from './testing/hr-test-harness';

const server = new MockHrServer();
beforeAll(() => server.start());
afterAll(() => server.stop());
beforeEach(() => server.reset());

function harness(extraMappings: ReturnType<typeof map>[] = []): HrTestHarness {
  return new HrTestHarness(
    [
      {
        id: 'cA',
        shortname: 'OVACSOL',
        integrationId: 'intA',
        baseUrl: server.baseUrl,
        endpoints: [
          {
            name: 'LOGIN_SESSION',
            httpMethod: 'POST',
            path: '/get_companies/login_sessions',
            mappings: [
              map('companyId', 'company_id', 'VALUE_MAP', { valueMap: { cA: '5' } }),
              map('userId', 'user_id'),
              map('deviceId', 'device_id'),
              map('deviceName', 'device_name'),
              map('appVersion', 'app_version'),
              map('ipAddress', 'ip_address'),
              map('accessToken', 'access_token'),
              map('refreshToken', 'refresh_token'),
              map('accessTokenExpiry', 'access_token_expiry'),
              map('lastAccessTime', 'last_access_time'),
              map('status', 'status'),
              map('createdOn', 'created_on'),
              ...extraMappings,
            ],
          },
        ],
      },
    ],
    [],
  );
}
const dto = (extra: object = {}) =>
  plainToInstance(HrLoginSessionDto, { userId: '1108', deviceId: 'dev1', deviceName: 'TECHNO', appVersion: '1.0.0', ipAddress: '192.168.1.100', ...extra });
const hrReply = (): MockReply => ({
  status: 200,
  body: { items: [{ access_token: 'SECRET-A', refresh_token: 'SECRET-R' }] },
});

describe('POST login session', () => {
  it('sends the mapped fields, with company_id from the session and status/times set by the hub', async () => {
    const h = harness();
    server.handler = hrReply;
    await h.loginSession.register('cA', '000008', dto({ accessToken: 'TOK-A', accessTokenExpiry: '2026-10-11T00:00:00Z' }));
    expect(server.requests[0].method).toBe('POST');
    expect(server.requests[0].rawPath).toBe('/ords/erp/get_companies/login_sessions');
    const body = JSON.parse(server.requests[0].body);
    expect(body).toMatchObject({
      company_id: '5',
      user_id: '1108',
      device_id: 'dev1',
      device_name: 'TECHNO',
      app_version: '1.0.0',
      ip_address: '192.168.1.100',
      access_token: 'TOK-A',
      refresh_token: null,
      access_token_expiry: '2026-10-11T00:00:00Z',
      status: 'ACTIVE',
    });
    expect(typeof body.last_access_time).toBe('string');
    expect(typeof body.created_on).toBe('string');
  });

  it('never returns anything from the HR response (no tokens leak back)', async () => {
    const h = harness();
    server.handler = hrReply;
    const out = await h.loginSession.register('cA', '000008', dto({ accessToken: 'TOK-A' }));
    expect(out).toEqual([]);
    expect(JSON.stringify(out)).not.toContain('SECRET');
  });

  it('fails plainly when HR reports failure, and logs no device or token values', async () => {
    const h = harness();
    server.handler = () => ({ status: 200, body: { status: 'Failed', access_token: 'SECRET-A' } });
    await expect(h.loginSession.register('cA', '000008', dto())).rejects.toThrow(BadGatewayException);
    expect(JSON.stringify(h.systemLogRecord.mock.calls)).not.toMatch(/SECRET|dev1|TECHNO|1108/);
  });

  it('requires a deviceId in the body', async () => {
    const errors = await validate(plainToInstance(HrLoginSessionDto, { userId: '1' }));
    expect(errors.map((e) => e.property)).toContain('deviceId');
  });
});
