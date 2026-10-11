import { BadRequestException, Logger } from '@nestjs/common';
import { HR_SAMPLES, MockHrServer, MockReply, RecordedRequest } from './testing/mock-hr-server';
import { buildStatelessUserKey } from './utils/stateless-session.util';
import { HarnessCompany, HarnessEmployee, HarnessEndpoint, HrTestHarness, map } from './testing/hr-test-harness';

const server = new MockHrServer();
beforeAll(() => server.start());
afterAll(() => server.stop());
beforeEach(() => server.reset());

const NAME = 'Muhammad Shazil Ali';

const employeesFixture = (): HarnessEmployee[] => [
  { id: 'eA1', companyId: 'cA', name: NAME, externalEmployeeId: '000008' },
  { id: 'eA2', companyId: 'cA', name: 'Unlinked Person', externalEmployeeId: null },
  { id: 'eB1', companyId: 'cB', name: 'Other Company Employee', externalEmployeeId: '000777' },
];

/** Company A has the given endpoints; company B (a different tenant) has none configured. */
function harness(endpoints: HarnessEndpoint[], baseUrl = server.baseUrl): HrTestHarness {
  const companies: HarnessCompany[] = [
    { id: 'cA', shortname: 'OVACSOL', integrationId: 'intA', baseUrl, endpoints },
    { id: 'cB', shortname: 'OTHERCO', integrationId: 'intB', baseUrl, endpoints: [] },
  ];
  return new HrTestHarness(companies, employeesFixture());
}

const reply = (body: unknown, status = 200): MockReply => ({ status, body });
const only = (): RecordedRequest => {
  expect(server.requests).toHaveLength(1);
  return server.requests[0];
};

const SHIFT: HarnessEndpoint = {
  name: 'SHIFT_RECORD',
  httpMethod: 'GET',
  path: '/get_companies/shift_record/{{shortname}}/{{employeeId}}',
  mappings: [
    map('items[].id', 'shiftDetailId'),
    map('items[].start_datetime', 'startAt'),
    map('items[].end_datetime', 'endAt'),
    map('items[].total_hours', 'totalHours'),
    map('items[].rest_period', 'restPeriod'),
  ],
};

describe('HrLookupService (mock HR server, real executor + mapping engine)', () => {
  it('company-info: fills {{shortname}} from the session company and maps the response', async () => {
    const h = harness([
      {
        name: 'COMPANY_INFO',
        httpMethod: 'GET',
        path: '/get_companies/{{shortname}}',
        mappings: [map('items[].id', 'companyId'), map('items[].geo_fencing', 'geoFencing'), map('items[].server_time', 'serverTime')],
      },
    ]);
    server.handler = () => reply(HR_SAMPLES.companyInfo);

    const records = await h.lookup.getCompanyInfo('cA');

    expect(records).toEqual([{ companyId: '5', geoFencing: 'Y', serverTime: '2026-10-04T02:03:17Z' }]);
    expect(only().method).toBe('GET');
    expect(only().rawPath).toBe('/ords/erp/get_companies/OVACSOL');
  });

  it('shift: fills {{shortname}} and {{employeeId}} (the HR employee_id carried by the session)', async () => {
    const h = harness([SHIFT]);
    server.handler = () => reply(HR_SAMPLES.shift);

    const records = await h.lookup.getShift('cA', '000008');

    expect(records).toEqual([
      { shiftDetailId: '04', startAt: '2026-10-04 10:00:00', endAt: '2026-10-04 18:00:00', totalHours: 8, restPeriod: 30 },
    ]);
    expect(only().rawPath).toBe('/ords/erp/get_companies/shift_record/OVACSOL/000008');
  });

  it('shift: an HR response with no rows gives an empty array, not an error', async () => {
    const h = harness([SHIFT]);
    server.handler = () => reply(HR_SAMPLES.empty);
    await expect(h.lookup.getShift('cA', '000008')).resolves.toEqual([]);
  });

  it('wifi: URL-encodes names containing spaces and reserved characters', async () => {
    const h = harness([
      {
        name: 'WIFI_INFO',
        httpMethod: 'GET',
        path: '/get_companies/fetch_wifi/{{shortname}}/{{wifiName}}',
        mappings: [map('items[].wifi_name', 'wifiName'), map('items[].bssid', 'bssid'), map('items[].status', 'status')],
      },
    ]);
    server.handler = () => reply(HR_SAMPLES.wifi);

    const records = await h.lookup.getWifi('cA', 'Ovacsol Ptcl');
    expect(records).toEqual([{ wifiName: 'Ovacsol Ptcl', bssid: 'AA:BB:CC:DD:EE:FF', status: 'ACTIVE' }]);
    expect(only().rawPath).toBe('/ords/erp/get_companies/fetch_wifi/OVACSOL/Ovacsol%20Ptcl');

    server.requests.length = 0;
    await h.lookup.getWifi('cA', 'A/B?x=1#y');
    expect(only().rawPath).toBe('/ords/erp/get_companies/fetch_wifi/OVACSOL/A%2FB%3Fx%3D1%23y');
  });

  it('leave: reuses the LEAVE endpoint; employee comes from the session (rows carry no employee code)', async () => {
    const h = harness([
      {
        name: 'LEAVE',
        httpMethod: 'GET',
        path: '/get_companies/leave_report/{{shortname}}/{{employeeId}}',
        mappings: [
          map('items[].title', 'leaveType'),
          map('items[].days', 'totalLeaveDays'),
          map('items[].entitled', 'entitledLeave'),
          map('items[].consummed', 'consumedLeave'),
          map('items[].balance', 'availableLeaveBalance'),
        ],
      },
    ]);
    server.handler = () => reply(HR_SAMPLES.leave);

    const records = await h.lookup.getLeave('cA', '000008');

    expect(records).toEqual([
      { leaveType: 'Annual Leave', totalLeaveDays: 2, entitledLeave: 14, consumedLeave: 3, availableLeaveBalance: 11 },
    ]);
    expect(records[0]).not.toHaveProperty('employeeCode');
    expect(only().rawPath).toBe('/ords/erp/get_companies/leave_report/OVACSOL/000008');
  });

  it('attendance punches: one raw record per punch (no grouping), name URL-encoded, selfie never exposed', async () => {
    const h = harness([
      {
        name: 'ATTENDANCE_PUNCHES',
        httpMethod: 'GET',
        path: '/get_companies/attendance_report/{{shortname}}/{{name}}',
        mappings: [
          map('items[].id', 'punchId'),
          map('items[].punch_time', 'punchTime'),
          map('items[].state', 'state', 'VALUE_MAP', { valueMap: { I: 'IN', O: 'OUT' } }),
          map('items[].trn_source', 'source'),
        ],
      },
    ]);
    server.handler = () => reply(HR_SAMPLES.attendanceReport);

    const records = await h.lookup.getAttendancePunches('cA', '000008', buildStatelessUserKey('cA', '000008', NAME));

    expect(records).toEqual([
      { punchId: 72, punchTime: '2026-07-27T08:40:35Z', state: 'IN', source: 1 },
      { punchId: 73, punchTime: '2026-07-27T17:02:10Z', state: 'OUT', source: 1 },
    ]);
    expect(JSON.stringify(records)).not.toContain('SECRET-SELFIE');
    expect(only().rawPath).toBe('/ords/erp/get_companies/attendance_report/OVACSOL/Muhammad%20Shazil%20Ali');
  });

  it('attendance report via ATTENDANCE_FETCH (the document API): raw punches, name URL-encoded, selfie never exposed', async () => {
    const h = harness([
      {
        name: 'ATTENDANCE_FETCH',
        httpMethod: 'GET',
        path: '/get_companies/attendance_report/{{shortname}}/{{name}}',
        mappings: [
          map('items[].id', 'punchId'),
          map('items[].punch_time', 'punchTime'),
          map('items[].state', 'state', 'VALUE_MAP', { valueMap: { I: 'IN', O: 'OUT' } }),
          map('items[].trn_source', 'source'),
        ],
      },
    ]);
    server.handler = () => reply(HR_SAMPLES.attendanceReport);

    const records = await h.lookup.getAttendancePunches('cA', '000008', buildStatelessUserKey('cA', '000008', NAME));

    expect(records).toEqual([
      { punchId: 72, punchTime: '2026-07-27T08:40:35Z', state: 'IN', source: 1 },
      { punchId: 73, punchTime: '2026-07-27T17:02:10Z', state: 'OUT', source: 1 },
    ]);
    expect(JSON.stringify(records)).not.toContain('SECRET-SELFIE');
    expect(only().rawPath).toBe('/ords/erp/get_companies/attendance_report/OVACSOL/Muhammad%20Shazil%20Ali');
  });

  describe('device info (tokens)', () => {
    const DEVICE: HarnessEndpoint = {
      name: 'DEVICE_INFO',
      httpMethod: 'GET',
      path: '/get_companies/device_info/{{shortname}}/{{username}}',
      mappings: [
        map('items[].device_name', 'deviceName'),
        map('items[].status', 'status'),
        map('items[].access_token_expiry', 'accessTokenExpiry'),
      ],
    };

    it('returns only mapped, non-token fields and encodes the username from the body', async () => {
      const h = harness([DEVICE]);
      server.handler = () => reply(HR_SAMPLES.deviceInfo);

      const records = await h.lookup.getDeviceInfo('cA', NAME);

      expect(records).toEqual([{ deviceName: 'TECNO TECNO CLA5', status: 'EXPIRED', accessTokenExpiry: '2026-10-05T00:00:00Z' }]);
      expect(JSON.stringify(records)).not.toContain('SECRET');
      expect(only().rawPath).toBe('/ords/erp/get_companies/device_info/OVACSOL/Muhammad%20Shazil%20Ali');
    });

    it('returns the access/refresh tokens only when the admin mapped them', async () => {
      const h = harness([{ ...DEVICE, mappings: [...DEVICE.mappings, map('items[].access_token', 'accessToken'), map('items[].refresh_token', 'refreshToken')] }]);
      server.handler = () => reply(HR_SAMPLES.deviceInfo);

      const records = await h.lookup.getDeviceInfo('cA', NAME);

      expect(records[0]).toMatchObject({ accessToken: expect.any(String), refreshToken: expect.any(String) });
    });
  });

  describe('tenant isolation and linking', () => {
    it("another company's user never reaches HR (their company has no endpoint) and A's data is untouched", async () => {
      const h = harness([SHIFT]);
      server.handler = () => reply(HR_SAMPLES.shift);

      await expect(h.lookup.getShift('cB', 'eB1')).rejects.toThrow(BadRequestException);
      expect(server.requests).toHaveLength(0);
    });

    it('uses the session company short name, never another company\'s', async () => {
      const h = harness([SHIFT]);
      server.handler = () => reply(HR_SAMPLES.shift);
      await h.lookup.getShift('cA', '000008');
      expect(only().rawPath).toContain('/OVACSOL/');
      expect(only().rawPath).not.toContain('OTHERCO');
    });

    it('punches without a name in the session get a 400 and nothing is sent to HR', async () => {
      const h = harness([SHIFT]);
      await expect(h.lookup.getAttendancePunches('cA', '000008', 'cA:hr:000008|')).rejects.toThrow(BadRequestException);
      await expect(h.lookup.getAttendancePunches('cA', '000008', undefined)).rejects.toThrow(BadRequestException);
      expect(server.requests).toHaveLength(0);
    });
  });

  describe('failures and logging', () => {
    it('a non-2xx HR answer becomes a 400 whose message holds no employee value', async () => {
      const h = harness([SHIFT]);
      server.handler = () => reply({ message: 'boom 000008' }, 500);

      const error = await h.lookup.getShift('cA', '000008').catch((e: Error) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as Error).message).not.toContain('000008');
      expect((error as Error).message).not.toContain('OVACSOL');
    });

    it('when HR is unreachable, logs show the template path ({{placeholders}}) and never resolved values', async () => {
      const h = harness([SHIFT], 'http://127.0.0.1:1/ords/erp'); // nothing listens on port 1
      const lines: string[] = [];
      const capture = (...args: unknown[]) => {
        lines.push(args.map(String).join(' '));
      };
      const spies = (['log', 'warn', 'error', 'debug', 'verbose'] as const).map((level) =>
        jest.spyOn(Logger.prototype, level).mockImplementation(capture),
      );

      try {
        await expect(h.lookup.getShift('cA', '000008')).rejects.toThrow(BadRequestException);
      } finally {
        spies.forEach((spy) => spy.mockRestore());
      }

      const logged = lines.join('\n');
      expect(logged).toContain('{{shortname}}');
      expect(logged).toContain('{{employeeId}}');
      expect(logged).not.toContain('000008');
      expect(logged).not.toContain('OVACSOL');
    });
  });
});
