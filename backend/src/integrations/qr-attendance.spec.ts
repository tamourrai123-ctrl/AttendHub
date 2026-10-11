import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { MockHrServer } from './testing/mock-hr-server';
import { HrTestHarness } from './testing/hr-test-harness';

const server = new MockHrServer();
beforeAll(() => server.start());
afterAll(() => server.stop());
beforeEach(() => server.reset());

const harness = (withEndpoint = true): HrTestHarness =>
  new HrTestHarness(
    [
      {
        id: 'cA',
        shortname: 'DEMO',
        integrationId: 'intA',
        baseUrl: server.baseUrl,
        endpoints: withEndpoint ? [{ name: 'QR_ATTENDANCE', httpMethod: 'POST', path: '/get_companies/post_qrcode_attendance', mappings: [] }] : [],
      },
    ],
    [],
  );

describe('POST QR attendance (generate QR token)', () => {
  it('POSTs an empty JSON body to HR and reports only success', async () => {
    server.handler = () => ({ status: 200, body: { status: 'Success', qr: 'SECRET-QR' } });
    const out = await harness().qrAttendance.generate('cA');
    expect(out).toEqual({ delivered: true });
    expect(server.requests[0].method).toBe('POST');
    expect(server.requests[0].rawPath).toBe('/ords/erp/get_companies/post_qrcode_attendance');
    expect(JSON.parse(server.requests[0].body)).toEqual({});
  });

  it('fails plainly when HR reports failure, without logging the HR body', async () => {
    server.handler = () => ({ status: 200, body: { status: 'Failed', qr: 'SECRET-QR' } });
    const h = harness();
    await expect(h.qrAttendance.generate('cA')).rejects.toThrow(BadGatewayException);
    expect(JSON.stringify(h.systemLogRecord.mock.calls)).not.toContain('SECRET');
  });

  it('asks the admin to configure the endpoint first', async () => {
    await expect(harness(false).qrAttendance.generate('cA')).rejects.toThrow(BadRequestException);
    expect(server.requests).toHaveLength(0);
  });
});
