import { BadGatewayException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PostAttendancePunchDto } from './dto/post-attendance-punch.dto';
import { MockHrServer, MockReply } from './testing/mock-hr-server';
import { HrTestHarness, map } from './testing/hr-test-harness';

const server = new MockHrServer();
beforeAll(() => server.start());
afterAll(() => server.stop());
beforeEach(() => server.reset());

const BASE_DTO = {
  punchTime: '2026-07-09T09:15:00.000Z',
  state: 'IN',
  latitude: 24.8607,
  longitude: 67.0011,
  wifi: 'PTCL',
  qrCode: 'QR123',
  filename: 'Picture.jpg',
  fileMimetype: 'image/jpeg',
  employeeImage: '/9j/4AAQSkZJRgABAQAAAQABAAD',
};

function harness(): HrTestHarness {
  return new HrTestHarness(
    [
      {
        id: 'cA',
        shortname: 'OVACSOL',
        integrationId: 'intA',
        baseUrl: server.baseUrl,
        endpoints: [
          {
            name: 'ATTENDANCE_POST',
            httpMethod: 'POST',
            path: '/get_companies/post_attendance',
            mappings: [
              map('companyId', 'company_id', 'VALUE_MAP', { valueMap: { cA: '5' } }),
              map('employeeCode', 'emp_code'),
              map('punchTime', 'punch_time'),
              map('state', 'state', 'VALUE_MAP', { valueMap: { IN: 'I', OUT: 'O' } }),
              map('wifi', 'wifi'),
              map('qrCode', 'qr_code'),
              map('fileCharset', 'file_charset'),
              map('wifiCheckStatus', 'wifi_check_status'),
              map('appVersion', 'app_version'),
              map('employeeName', 'employee_name'),
            ],
          },
        ],
      },
    ],
    [{ id: 'eA1', companyId: 'cA', name: 'Muhammad Shazil Ali', externalEmployeeId: '000008' }],
  );
}
const ok = (): MockReply => ({ status: 200, body: { status: 'Success' } });

describe('Post attendance: employee_name comes from the session', () => {
  it('sends the session name as employee_name, and never a name from the request body', async () => {
    const h = harness();
    server.handler = ok;
    await h.punch.postPunch('cA', '000008', plainToInstance(PostAttendancePunchDto, { ...BASE_DTO, employeeName: 'Hacker' }), 'Muhammad Shazil Ali');
    expect(JSON.parse(server.requests[0].body).employee_name).toBe('Muhammad Shazil Ali');
  });
});

describe('Post attendance: optional file_charset / wifi_check_status / app_version', () => {
  it('forwards the three new fields (mapped to the company field names) with employee_id as emp_code', async () => {
    const h = harness();
    server.handler = ok;

    await h.punch.postPunch('cA', '000008', plainToInstance(PostAttendancePunchDto, { ...BASE_DTO, fileCharset: 'UTF-8', wifiCheckStatus: 'CONNECTED', appVersion: '1.0.1' }));

    expect(server.requests).toHaveLength(1);
    expect(server.requests[0].method).toBe('POST');
    expect(server.requests[0].rawPath).toBe('/ords/erp/get_companies/post_attendance');
    expect(JSON.parse(server.requests[0].body)).toMatchObject({
      company_id: '5',
      emp_code: '000008',
      state: 'I',
      wifi: 'PTCL',
      qr_code: 'QR123',
      file_charset: 'UTF-8',
      wifi_check_status: 'CONNECTED',
      app_version: '1.0.1',
    });
  });

  it('without the new fields the request still goes through, with those values empty (existing behaviour)', async () => {
    const h = harness();
    server.handler = ok;

    await h.punch.postPunch('cA', '000008', plainToInstance(PostAttendancePunchDto, BASE_DTO));

    const body = JSON.parse(server.requests[0].body) as Record<string, unknown>;
    expect(body.emp_code).toBe('000008');
    expect(body.state).toBe('I');
    expect(body.file_charset ?? null).toBeNull();
    expect(body.wifi_check_status ?? null).toBeNull();
    expect(body.app_version ?? null).toBeNull();
  });

  it('an HTTP error from HR is still reported as a 502 (unchanged)', async () => {
    const h = harness();
    server.handler = () => ({ status: 500, body: { status: 'Failed' } });
    await expect(h.punch.postPunch('cA', '000008', plainToInstance(PostAttendancePunchDto, BASE_DTO))).rejects.toThrow(BadGatewayException);
  });
});

describe('Post attendance: an HTTP 2xx whose body says it failed is not success', () => {
  const dto = () => plainToInstance(PostAttendancePunchDto, BASE_DTO);
  const FAILED_CASES: Array<[string, MockReply]> = [
    ['a JSON "Failed" status', { status: 200, body: { status: 'Failed' } }],
    ['a plain-text error', { status: 200, rawBody: 'Error: ORA-00001 unique constraint violated' }],
  ];
  const OK_CASES: Array<[string, MockReply]> = [
    ['a JSON "Success" status', { status: 200, body: { status: 'Success' } }],
    ['"Success" with an empty error field', { status: 200, body: { status: 'Success', error: null } }],
    ['an empty body', { status: 201, rawBody: '' }],
  ];

  it.each(FAILED_CASES)('%s -> 502, audit row says failed, HR body not echoed', async (_label, response) => {
    const h = harness();
    server.handler = () => response;

    const error = await h.punch.postPunch('cA', '000008', dto()).catch((e: Error) => e);

    expect(error).toBeInstanceOf(BadGatewayException);
    expect((error as Error).message).not.toContain('ORA-00001');
    const audit = JSON.stringify(h.systemLogRecord.mock.calls);
    expect(audit).toContain('ATTENDANCE_PUNCH_FORWARD_FAILED');
    expect(audit).not.toContain('ATTENDANCE_PUNCH_FORWARDED');
    expect(audit).not.toContain('ORA-00001');
  });

  it.each(OK_CASES)('%s -> success, audit row says forwarded', async (_label, response) => {
    const h = harness();
    server.handler = () => response;

    await expect(h.punch.postPunch('cA', '000008', dto())).resolves.toBeUndefined();
    expect(JSON.stringify(h.systemLogRecord.mock.calls)).toContain('ATTENDANCE_PUNCH_FORWARDED');
  });
});

describe('PostAttendancePunchDto validation', () => {
  const errorsFor = async (extra: Record<string, unknown>) => validate(plainToInstance(PostAttendancePunchDto, { ...BASE_DTO, ...extra }));

  it('accepts the request with or without the three optional fields', async () => {
    expect(await errorsFor({})).toHaveLength(0);
    expect(await errorsFor({ fileCharset: 'UTF-8', wifiCheckStatus: 'OFFLINE', appVersion: '1.0.1' })).toHaveLength(0);
  });

  it('rejects wrong types and over-long values for them', async () => {
    expect((await errorsFor({ appVersion: 101 })).length).toBeGreaterThan(0);
    expect((await errorsFor({ fileCharset: 'x'.repeat(21) })).length).toBeGreaterThan(0);
    expect((await errorsFor({ wifiCheckStatus: 'y'.repeat(51) })).length).toBeGreaterThan(0);
  });
});
