import { BadGatewayException, BadRequestException, ForbiddenException, Logger, UnauthorizedException } from '@nestjs/common';
import { MobileLoginDto } from './dto/mobile-login.dto';
import { HR_SAMPLES, MockHrServer, MockReply } from './testing/mock-hr-server';
import { HarnessEndpoint, HrTestHarness, map } from './testing/hr-test-harness';

const server = new MockHrServer();
beforeAll(() => server.start());
afterAll(() => server.stop());
beforeEach(() => server.reset());

const USERNAME = 'Muhammad Shazil Ali';
const PASSWORD = 'p@ss/w rd#1';
const dto = { companyShortName: 'OVACSOL', username: USERNAME, password: PASSWORD } as MobileLoginDto;

const GET_LOGIN: HarnessEndpoint = {
  name: 'EMPLOYEE_LOGIN',
  httpMethod: 'GET',
  path: '/get_companies/login/{{shortname}}/{{username}}/{{password}}',
  mappings: [map('items[].employee_id', 'externalId')],
};

function harness(endpoint: HarnessEndpoint, linked = true): HrTestHarness {
  return new HrTestHarness(
    [{ id: 'cA', shortname: 'OVACSOL', integrationId: 'intA', baseUrl: server.baseUrl, endpoints: [endpoint] }],
    linked ? [{ id: 'eA1', companyId: 'cA', name: USERNAME, externalEmployeeId: '000008' }] : [],
  );
}
const reply = (body: unknown, status = 200): MockReply => ({ status, body });

describe('MobileAuthService with a GET login (credentials in the URL path)', () => {
  it('sends a GET with shortname/username/password URL-encoded in the path and no body', async () => {
    const h = harness(GET_LOGIN);
    server.handler = () => reply(HR_SAMPLES.login);

    const result = await h.mobileAuth.login(dto);

    expect(server.requests).toHaveLength(1);
    expect(server.requests[0].method).toBe('GET');
    expect(server.requests[0].rawPath).toBe('/ords/erp/get_companies/login/OVACSOL/Muhammad%20Shazil%20Ali/p%40ss%2Fw%20rd%231');
    expect(server.requests[0].body).toBe('');
    expect(result.token).toBe('test-jwt');
    expect(result.employee.id).toBe('000008');
  });

  it('identifies the employee by the HR employee_id (000008), not legacy_code (000009)', async () => {
    const h = harness(GET_LOGIN);
    server.handler = () => reply(HR_SAMPLES.login);
    const result = await h.mobileAuth.login(dto);
    expect(result.employee.id).toBe('000008');
  });

  it('carries the HR name from the login response when "name" is mapped, and stores nothing else', async () => {
    const h = harness({ ...GET_LOGIN, mappings: [map('items[].employee_id', 'externalId'), map('items[].name', 'name')] });
    server.handler = () => reply(HR_SAMPLES.login);
    const result = await h.mobileAuth.login(dto);
    expect(result.employee.name).toBe('Muhammad Shazil Ali');
    expect(Object.keys(result)).toEqual(['token', 'employee']);
  });

  it("never returns HR's c_password or the typed password, and never logs either", async () => {
    const h = harness(GET_LOGIN);
    server.handler = () => reply(HR_SAMPLES.login);
    const lines: string[] = [];
    const spies = (['log', 'warn', 'error', 'debug', 'verbose'] as const).map((level) =>
      jest.spyOn(Logger.prototype, level).mockImplementation((...args: unknown[]) => {
        lines.push(args.map(String).join(' '));
      }),
    );

    let result: unknown;
    try {
      result = await h.mobileAuth.login(dto);
    } finally {
      spies.forEach((spy) => spy.mockRestore());
    }

    const everything = JSON.stringify(result) + JSON.stringify(h.systemLogRecord.mock.calls) + lines.join('\n');
    expect(everything).not.toContain('HR-SECRET-PASSWORD');
    expect(everything).not.toContain('c_password');
    expect(everything).not.toContain(PASSWORD);
  });

  const NO_DATA_CASES: Array<[string, () => MockReply]> = [
    ['an empty items array', () => reply(HR_SAMPLES.empty)],
    ['an empty JSON object', () => reply({})],
    ['an empty body', () => ({ status: 200, rawBody: '' })],
    ['an HTTP 404', () => reply({ message: 'not found' }, 404)],
  ];
  it.each(NO_DATA_CASES)('treats %s as a failed login (401) and logs no username', async (_label, response) => {
    const h = harness(GET_LOGIN);
    server.handler = response;

    await expect(h.mobileAuth.login(dto)).rejects.toThrow(UnauthorizedException);

    const logged = JSON.stringify(h.systemLogRecord.mock.calls);
    expect(logged).toContain('MOBILE_LOGIN_FAILED');
    expect(logged).not.toContain(USERNAME);
    expect(logged).not.toContain(PASSWORD);
  });

  it('a non-empty answer with no readable employee id stays a 502 (a mapping problem, not bad credentials)', async () => {
    const h = harness(GET_LOGIN);
    server.handler = () => reply({ items: [{ user_name: 'x' }], hasMore: false });
    await expect(h.mobileAuth.login(dto)).rejects.toThrow(BadGatewayException);
  });

  it('valid credentials work with NO employee stored in the hub (stateless login)', async () => {
    const h = harness(GET_LOGIN, false);
    server.handler = () => reply(HR_SAMPLES.login);
    const result = await h.mobileAuth.login(dto);
    expect(result.employee.id).toBe('000008');
    expect(h.findByExternalIdentity).not.toHaveBeenCalled();
  });

  it('a GET login with no response mapping is still refused (400) before any HR call', async () => {
    const h = harness({ ...GET_LOGIN, mappings: [] });
    await expect(h.mobileAuth.login(dto)).rejects.toThrow(BadRequestException);
    expect(server.requests).toHaveLength(0);
  });
});

describe('MobileAuthService with the pre-existing POST login (unchanged behaviour)', () => {
  const POST_LOGIN: HarnessEndpoint = {
    name: 'EMPLOYEE_LOGIN',
    httpMethod: 'POST',
    path: '/get_companies/login',
    mappings: [map('username', 'user_name'), map('password', 'pwd'), map('items[].employee_id', 'externalId')],
  };

  it('still sends the mapped body and signs the employee in', async () => {
    const h = harness(POST_LOGIN);
    server.handler = () => reply(HR_SAMPLES.login);

    const result = await h.mobileAuth.login(dto);

    expect(server.requests[0].method).toBe('POST');
    expect(server.requests[0].rawPath).toBe('/ords/erp/get_companies/login');
    expect(JSON.parse(server.requests[0].body)).toEqual({ user_name: USERNAME, pwd: PASSWORD });
    expect(result.employee.id).toBe('000008');
  });

  it('still requires at least one request-side mapping for a POST login', async () => {
    const h = harness({ ...POST_LOGIN, mappings: [map('items[].employee_id', 'externalId')] });
    await expect(h.mobileAuth.login(dto)).rejects.toThrow(BadRequestException);
    expect(server.requests).toHaveLength(0);
  });
});

describe('Login also registers the login session with HR when the app sends its device facts', () => {
  const LOGIN_SESSION: HarnessEndpoint = {
    name: 'LOGIN_SESSION',
    httpMethod: 'POST',
    path: '/get_companies/login_sessions',
    mappings: [
      map('companyId', 'company_id', 'VALUE_MAP', { valueMap: { cA: '5' } }),
      map('userId', 'user_id', 'TO_STRING'),
      map('deviceId', 'device_id'),
      map('appVersion', 'app_version'),
      map('accessToken', 'access_token'),
    ],
  };
  const LOGIN_WITH_USER_ID: HarnessEndpoint = {
    ...GET_LOGIN,
    mappings: [map('items[].employee_id', 'externalId'), map('items[].user_id', 'userId')],
  };
  const twoEndpointHarness = (): HrTestHarness =>
    new HrTestHarness(
      [{ id: 'cA', shortname: 'OVACSOL', integrationId: 'intA', baseUrl: server.baseUrl, endpoints: [LOGIN_WITH_USER_ID, LOGIN_SESSION] }],
      [],
    );
  const routed = (sessionReply: MockReply = reply({ status: 'Success' })) => (req: { rawPath: string }) =>
    req.rawPath.includes('login_sessions') ? sessionReply : reply(HR_SAMPLES.login);

  it('posts the session with HR user_id (from the login response) and the session token', async () => {
    const h = twoEndpointHarness();
    server.handler = routed();
    const result = await h.mobileAuth.login({ ...dto, deviceId: 'dev1', appVersion: '1.0.0' } as MobileLoginDto);
    const session = server.requests.find((r) => r.rawPath.includes('login_sessions'));
    expect(session?.method).toBe('POST');
    expect(JSON.parse(session!.body)).toEqual({ company_id: '5', user_id: '1108', device_id: 'dev1', app_version: '1.0.0', access_token: expect.any(String) });
    expect(Object.keys(result)).toEqual(['token', 'employee']);
  });

  it('records the session on EVERY login, even when the app sends no device facts (they go as null)', async () => {
    const h = twoEndpointHarness();
    server.handler = routed();
    await h.mobileAuth.login(dto);
    const session = server.requests.find((r) => r.rawPath.includes('login_sessions'));
    expect(JSON.parse(session!.body)).toMatchObject({ company_id: '5', user_id: '1108', device_id: null });
  });

  it('logs in normally when the company has no Login Session endpoint', async () => {
    const h = harness(LOGIN_WITH_USER_ID);
    server.handler = routed();
    const result = await h.mobileAuth.login({ ...dto, deviceId: 'dev1' } as MobileLoginDto);
    expect(result.token).toBe('test-jwt');
    expect(server.requests.some((r) => r.rawPath.includes('login_sessions'))).toBe(false);
  });

  it('still logs the employee in when HR rejects the session registration', async () => {
    const h = twoEndpointHarness();
    server.handler = routed({ status: 500, body: { message: 'boom' } });
    const result = await h.mobileAuth.login({ ...dto, deviceId: 'dev1' } as MobileLoginDto);
    expect(result.token).toBe('test-jwt');
  });
});

describe('MobileAuthService plan enforcement', () => {
  it('takes an app-user seat only after HR has verified the employee', async () => {
    const h = harness(GET_LOGIN);
    server.handler = () => reply(HR_SAMPLES.login);
    await h.mobileAuth.login(dto);
    expect(h.subscriptions.registerMobileUser).toHaveBeenCalledWith('cA', '000008', '');
  });

  it('does not touch the seat count when the HR login fails', async () => {
    const h = harness(GET_LOGIN);
    server.handler = () => reply({ message: 'denied' }, 401);
    await expect(h.mobileAuth.login(dto)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(h.subscriptions.registerMobileUser).not.toHaveBeenCalled();
  });

  it('rejects the login (and issues no session) when the plan has no seat left or the trial ended', async () => {
    const h = harness(GET_LOGIN);
    server.handler = () => reply(HR_SAMPLES.login);
    h.subscriptions.registerMobileUser.mockRejectedValueOnce(new ForbiddenException('limit reached'));
    await expect(h.mobileAuth.login(dto)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
