#!/usr/bin/env node
/**
 * Live contract check for the company's HR (Oracle APEX / ORDS) web services.
 * Calls the 9 documented APIs directly (no AttendHub code involved) and reports,
 * per API: HTTP status, time, response shape (items/hasMore), row count and the
 * field names of the first row. It never prints secret values (passwords, tokens,
 * selfie data) and the report file is redacted the same way.
 *
 * Read-only by default. The two POST APIs (attendance, login session) write real
 * rows into the HR database, so they only run with HR_WRITE=1.
 *
 *   Windows (cmd):
 *     set HR_SHORTNAME=OVACSOL
 *     set HR_USERNAME=SHAZIL
 *     set HR_PASSWORD=your-password
 *     node scripts/hr-live-check.js
 *
 * Optional: HR_BASE_URL (default https://erp.ovacsol.com/ords/erp), HR_WIFI_NAME,
 * HR_EMPLOYEE_NAME, HR_EMPLOYEE_ID (overrides what login returns), HR_WRITE=1.
 * Needs Node 18+ (built-in fetch). No npm packages.
 */
const fs = require('fs');
const path = require('path');

const env = process.env;
const BASE = (env.HR_BASE_URL || 'https://erp.ovacsol.com/ords/erp').replace(/\/+$/, '');
const SHORT = env.HR_SHORTNAME;
const USER = env.HR_USERNAME;
const PASS = env.HR_PASSWORD;
const WRITE = env.HR_WRITE === '1';

if (!SHORT || !USER || !PASS) {
  console.error('Set HR_SHORTNAME, HR_USERNAME and HR_PASSWORD first (see the header of this file).');
  process.exit(1);
}

const SECRET_KEY = /pass|pwd|token|secret|emp_img|image|selfie|imei/i;
const enc = encodeURIComponent;
const report = [];
const results = [];

function line(text = '') {
  console.log(text);
  report.push(text);
}

function describeValue(key, value) {
  if (SECRET_KEY.test(key)) return value === null || value === '' ? '(empty)' : '(hidden)';
  if (value === null) return 'null';
  const text = typeof value === 'string' ? JSON.stringify(value) : String(value);
  return text.length > 40 ? `${text.slice(0, 37)}...` : text;
}

async function call(label, method, url, body) {
  const started = Date.now();
  let status = 0;
  let text = '';
  let error = '';
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    status = res.status;
    text = await res.text();
  } catch (err) {
    error = err && err.message ? err.message : String(err);
  }
  const ms = Date.now() - started;

  let json;
  let parseNote = '';
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      parseNote = 'body is not JSON';
    }
  }

  const shown = url.replace(PASS, '***').replace(enc(PASS), '***');
  line(`\n=== ${label}`);
  line(`${method} ${shown}`);
  if (error) {
    line(`RESULT: FAIL  could not connect (${error})`);
    results.push({ label, verdict: 'FAIL' });
    return { json: undefined, status };
  }

  line(`HTTP ${status}  ${ms} ms  ${text.length} bytes${parseNote ? `  (${parseNote})` : ''}`);

  const notes = [];
  let verdict = status >= 200 && status < 300 ? 'PASS' : 'FAIL';
  if (!text) {
    notes.push('empty body');
    if (verdict === 'PASS') verdict = 'WARN';
  }
  if (json && typeof json === 'object') {
    const keys = Object.keys(json);
    line(`top-level keys: ${keys.join(', ') || '(none)'}`);
    const rows = Array.isArray(json.items) ? json.items : Array.isArray(json) ? json : null;
    if (rows) {
      line(`rows: ${rows.length}${json.hasMore ? '  (hasMore=true: HR has more pages)' : ''}`);
      if (rows.length === 0) {
        notes.push('no rows returned');
        if (verdict === 'PASS') verdict = 'WARN';
      } else {
        const first = rows[0];
        line('first row fields:');
        for (const [k, v] of Object.entries(first)) line(`  ${k} = ${describeValue(k, v)}`);
        const blanks = Object.entries(first).filter(([, v]) => v === null || v === '').map(([k]) => k);
        if (blanks.length) line(`empty in first row: ${blanks.join(', ')}`);
        const keyNames = Object.keys(first);
        const mixed = keyNames.filter((k) => k !== k.toLowerCase());
        if (mixed.length) notes.push(`field names are not all lower-case (${mixed.join(', ')}); mapping paths are case-sensitive`);
      }
    } else {
      line('no items[] array: the body is a single object (map its fields directly, without "items[]")');
      for (const [k, v] of Object.entries(json)) line(`  ${k} = ${describeValue(k, v)}`);
    }
  } else if (text && !parseNote) {
    line(`body: ${text.slice(0, 120)}`);
  } else if (parseNote) {
    line(`body (first 120 chars): ${text.slice(0, 120).replace(SECRET_KEY, '***')}`);
    if (verdict === 'PASS') verdict = 'WARN';
  }
  for (const note of notes) line(`note: ${note}`);
  line(`RESULT: ${verdict}`);
  results.push({ label, verdict });
  return { json, status };
}

const firstRow = (r) => (r && r.json && Array.isArray(r.json.items) ? r.json.items[0] : undefined);
const pick = (row, ...names) => {
  if (!row) return undefined;
  for (const n of names) if (row[n] !== undefined && row[n] !== null && row[n] !== '') return row[n];
  return undefined;
};

(async () => {
  line(`HR live check  ${new Date().toISOString()}`);
  line(`base: ${BASE}   company: ${SHORT}   user: ${USER}   write tests: ${WRITE ? 'ON' : 'off (set HR_WRITE=1 to enable)'}`);

  // 1) company information
  const company = await call('1) Company Information', 'GET', `${BASE}/get_companies/${enc(SHORT)}`);
  const companyId = pick(firstRow(company), 'id', 'company_id');

  // 2) authentication
  const login = await call('2) Authentication', 'GET', `${BASE}/get_companies/login/${enc(SHORT)}/${enc(USER)}/${enc(PASS)}`);
  const me = firstRow(login);
  if (!me) line('note: login returned no row, so employee-based checks below use the HR_* overrides if given.');
  const employeeId = env.HR_EMPLOYEE_ID || pick(me, 'employee_id', 'emp_code', 'legacy_code');
  const employeeName = env.HR_EMPLOYEE_NAME || pick(me, 'name', 'user_name') || USER;
  const userId = pick(me, 'user_id');

  // 4) mobile attendance report
  await call('4) Mobile Attendance Report', 'GET', `${BASE}/get_companies/attendance_report/${enc(SHORT)}/${enc(employeeName)}`);

  // 5) wifi information
  const wifi = env.HR_WIFI_NAME || 'Ovacsol Ptcl';
  await call('5) WiFi Information', 'GET', `${BASE}/get_companies/fetch_wifi/${enc(SHORT)}/${enc(wifi)}`);

  // 6) shift record
  if (employeeId) await call('6) Shift Record', 'GET', `${BASE}/get_companies/shift_record/${enc(SHORT)}/${enc(employeeId)}`);
  else line('\n=== 6) Shift Record\nSKIPPED: no employee id (login returned none; set HR_EMPLOYEE_ID)');

  // 7) leave report
  if (employeeId) await call('7) Leave Report', 'GET', `${BASE}/get_companies/leave_report/${enc(SHORT)}/${enc(employeeId)}`);
  else line('\n=== 7) Leave Report\nSKIPPED: no employee id');

  // 9) user token report (device info)
  await call('9) User Token Report (device_info)', 'GET', `${BASE}/get_companies/device_info/${enc(SHORT)}/${enc(USER)}`);

  // 3) post attendance and 8) login session: these WRITE into HR
  if (WRITE) {
    const cid = String(companyId || '');
    await call('3) Attendance (POST, writes a row)', 'POST', `${BASE}/get_companies/post_attendance`, {
      company_id: cid,
      emp_code: String(employeeId || ''),
      punch_time: new Date().toISOString().slice(0, 19),
      state: 'I',
      trn_source: 1,
      latitude: 24.8607,
      longitude: 67.0011,
      wifi: wifi,
      qr_code: 'TEST',
      filename: 'test.jpg',
      file_mimetype: 'image/jpeg',
      file_charset: 'UTF-8',
      emp_img: '',
    });
    await call('8) User Tokens / login_sessions (POST, writes a row)', 'POST', `${BASE}/get_companies/login_sessions`, {
      company_id: cid,
      user_id: String(userId || ''),
      device_id: 'HR-LIVE-CHECK',
      device_name: 'LIVE CHECK',
      app_version: '1.0.0',
      ip_address: '127.0.0.1',
      add_by: USER,
    });
  } else {
    line('\n=== 3) Attendance (POST) and 8) User Tokens (POST)\nSKIPPED: they write real rows into HR. Run again with HR_WRITE=1 to include them.');
  }

  line('\n=== SUMMARY');
  for (const r of results) line(`${r.verdict.padEnd(5)} ${r.label}`);

  const file = path.join(__dirname, 'hr-live-report.txt');
  fs.writeFileSync(file, report.join('\n') + '\n');
  console.log(`\nSaved (secrets hidden): ${file}`);
})();
