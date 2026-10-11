import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { AddressInfo } from 'net';

/**
 * Test-only mock of the company's HR system (Oracle APEX). A real local HTTP
 * server, so the real executor/fetch/URL-encoding code runs end to end — only
 * the database is stubbed elsewhere. Records every request exactly as received
 * (`rawPath` is still percent-encoded, `path` is decoded) so tests can assert
 * what actually went over the wire.
 */
export interface RecordedRequest {
  method: string;
  rawPath: string;
  path: string;
  body: string;
  headers: IncomingMessage['headers'];
}

export interface MockReply {
  status?: number;
  body?: unknown;
  /** Sent verbatim instead of JSON.stringify(body) (e.g. '' for an empty body). */
  rawBody?: string;
}

export type MockHandler = (request: RecordedRequest) => MockReply;

const NOT_FOUND: MockHandler = () => ({ status: 404, body: { message: 'not found' } });

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export class MockHrServer {
  readonly requests: RecordedRequest[] = [];
  handler: MockHandler = NOT_FOUND;
  baseUrl = '';
  private server: Server | undefined;

  async start(): Promise<void> {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => this.handle(req, res));
    this.server = server;
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    this.baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/ords/erp`;
  }

  async stop(): Promise<void> {
    const server = this.server;
    if (!server) return;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  reset(): void {
    this.requests.length = 0;
    this.handler = NOT_FOUND;
  }

  private handle(req: IncomingMessage, res: ServerResponse): void {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const rawPath = req.url ?? '';
      const recorded: RecordedRequest = {
        method: req.method ?? '',
        rawPath,
        path: safeDecode(rawPath),
        body: Buffer.concat(chunks).toString('utf8'),
        headers: req.headers,
      };
      this.requests.push(recorded);
      const reply = this.handler(recorded);
      const payload = reply.rawBody ?? (reply.body === undefined ? '' : JSON.stringify(reply.body));
      res.writeHead(reply.status ?? 200, { 'Content-Type': 'application/json' });
      res.end(payload);
    });
  }
}

/**
 * Sample HR responses, taken from Update_Web_Services.docx. Field NAMES are the
 * document's; blank/invalid sample values (e.g. `"days": ,`) are filled with
 * plausible ones, and the Oracle APEX `{ items: [...] }` wrapper is the one the
 * document's company-information sample shows. The WiFi response has NO sample
 * in the document — its shape below is an ASSUMPTION built from the document's
 * prose (WiFi Name, BSSID, IP Address, Location, Status).
 * Token / password values are deliberately recognisable ("SECRET") so tests
 * can assert they never leak.
 */
const wrap = (item: Record<string, unknown>) => ({ items: [item], hasMore: false });

export const HR_SAMPLES = {
  companyInfo: wrap({
    id: '5',
    title: '.',
    shortname: 'OVACSOL',
    address: '',
    geo_fencing: 'Y',
    wifi_validation: 'Y',
    selfie_mandatory: 'Y',
    mock_gps_detection: 'Y',
    developer_options: 'N',
    default_geo_radius: null,
    offline_attendance_allowed: 'Y',
    server_time: '2026-10-04T02:03:17Z',
    time_zone: 'UTC+05:00',
    latitude: null,
    longitude: null,
  }),
  login: wrap({
    id: '5',
    user_name: 'Muhammad Shazil Ali',
    c_password: 'HR-SECRET-PASSWORD',
    employee_id: '000008',
    name: 'Muhammad Shazil Ali',
    imei_number: '',
    geo_fencing: 'Y',
    wifi_validation: 'Y',
    selfie_mandatory: 'N',
    mock_gps_detection: 'Y',
    developer_options: 'Y',
    default_geo_radius: null,
    offline_attendance_allowed: 'Y',
    break_flag: 'Y',
    legacy_code: '000009',
    latitude: null,
    longitude: null,
    user_id: 1108,
    android_id: '',
  }),
  shift: wrap({
    company_id: '5',
    shift_month_id: '',
    id: '04',
    change_hours: 0,
    start_datetime: '2026-10-04 10:00:00',
    end_datetime: '2026-10-04 18:00:00',
    grace_datetime: '2026-10-04 10:00:00',
    total_hours: 8,
    rest_period: 30,
  }),
  leave: wrap({
    company_id: '5',
    name: 'Muhammad Shazil Ali',
    title: 'Annual Leave',
    days: 2,
    entitled: 14,
    consummed: 3,
    balance: 11,
    official_leave: 'N',
  }),
  attendanceReport: {
    items: [
      {
        company_id: '5',
        id: 72,
        name: '',
        emp_img: 'SECRET-SELFIE-BASE64',
        punch_time: '2026-07-27T08:40:35Z',
        state: 'I',
        trn_source: 1,
        latitude: null,
        longitude: null,
        wifi: null,
        qr_code: null,
        wifi_check_status: null,
        android_id: '',
        app_version: null,
      },
      {
        company_id: '5',
        id: 73,
        name: '',
        emp_img: null,
        punch_time: '2026-07-27T17:02:10Z',
        state: 'O',
        trn_source: 1,
        latitude: null,
        longitude: null,
        wifi: null,
        qr_code: null,
        wifi_check_status: null,
        android_id: '',
        app_version: null,
      },
    ],
    hasMore: false,
  },
  /** ASSUMED shape — see note above. */
  wifi: wrap({ wifi_name: 'Ovacsol Ptcl', bssid: 'AA:BB:CC:DD:EE:FF', ip_address: '192.168.1.1', location: 'Head Office', status: 'ACTIVE' }),
  deviceInfo: wrap({
    company_name: 'Ovacsol',
    token_id: 17,
    user_id: 1108,
    user_name: 'Muhammad Shazil Ali',
    access_token: 'AT-SECRET-123',
    refresh_token: 'RT-SECRET-456',
    access_token_expiry: '2026-10-05T00:00:00Z',
    refresh_token_expiry: '2026-11-04T00:00:00Z',
    device_id: 'dev-1',
    device_name: 'TECNO TECNO CLA5',
    app_version: '1.0.1',
    ip_address: '192.168.1.100',
    last_access_time: '2026-10-04T01:00:00Z',
    status: 'EXPIRED',
    created_on: '2026-10-01T00:00:00Z',
  }),
  empty: { items: [], hasMore: false },
} as const;
