import { BadRequestException } from '@nestjs/common';
import { fillPathPlaceholders, pathParamNames } from './utils/path-placeholders.util';
import { EndpointsService } from './endpoints.service';
import { FieldMappingService } from './services/field-mapping.service';

describe('path placeholders', () => {
  const params = { shortname: 'DEMO', employeeId: '000008', username: 'a b', wifiName: 'Ovacsol Ptcl', name: 'Shazil', password: 'p@ss' };

  it('fills the hub style {{name}}', () => {
    expect(fillPathPlaceholders('/get_companies/shift_record/{{shortname}}/{{employeeId}}', params)).toBe('/get_companies/shift_record/DEMO/000008');
  });

  it('fills the HR document style :p_name for every API in the document', () => {
    expect(fillPathPlaceholders('/get_companies/shift_record/:p_shortname/:p_employee_id', params)).toBe('/get_companies/shift_record/DEMO/000008');
    expect(fillPathPlaceholders('/get_companies/login/:p_short_name/:p_user_name/:p_password', params)).toBe('/get_companies/login/DEMO/a%20b/p%40ss');
    expect(fillPathPlaceholders('/get_companies/attendance_report/:p_shortname/:p_name', params)).toBe('/get_companies/attendance_report/DEMO/Shazil');
    expect(fillPathPlaceholders('/get_companies/fetch_wifi/:p_shortname/:p_wifi_name', params)).toBe('/get_companies/fetch_wifi/DEMO/Ovacsol%20Ptcl');
    expect(fillPathPlaceholders('/get_companies/fetch_wifi/:p_shortname/:p_bssid', params)).toBe('/get_companies/fetch_wifi/DEMO/Ovacsol%20Ptcl');
    expect(fillPathPlaceholders('/get_companies/device_info/:p_shortname/:p_username', params)).toBe('/get_companies/device_info/DEMO/a%20b');
  });

  it('leaves unknown or unsupplied placeholders as written and a fixed path unchanged', () => {
    expect(fillPathPlaceholders('/get_companies/OVACSOL', params)).toBe('/get_companies/OVACSOL');
    expect(fillPathPlaceholders('/x/:p_unknown/{{missing}}', params)).toBe('/x/:p_unknown/{{missing}}');
  });

  it('lists the parameters a path asks for', () => {
    expect(pathParamNames('/get_companies/shift_record/:p_shortname/{{employeeId}}')).toEqual(['shortname', 'employeeId']);
  });
});

describe('test endpoint (POST) sends a real mapped body', () => {
  const endpoint = { id: 'e1', name: 'ATTENDANCE_POST', httpMethod: 'POST' } as never;
  const mapping = (sourcePath: string, targetField: string) => ({ sourcePath, targetField, transformType: 'NONE', transformConfig: {}, sortOrder: 1 });
  const build = (mappings: unknown[]) => {
    const execute = jest.fn().mockResolvedValue({ success: true, statusCode: 200, durationMs: 1, body: { status: 'Success' } });
    const service = new EndpointsService(
      { findByCompositeId: jest.fn() } as never,
      { findByCompositeId: jest.fn().mockResolvedValue({}) } as never,
      { execute } as never,
      { detect: () => [] } as never,
      { findActiveByEndpoint: jest.fn().mockResolvedValue(mappings) } as never,
      new FieldMappingService(),
      { record: jest.fn() } as never,
      { findById: jest.fn().mockResolvedValue({ shortname: 'DEMO' }) } as never,
    );
    jest.spyOn(service, 'findOne').mockResolvedValue(endpoint);
    return { service, execute };
  };

  it('maps the sample record, fills shortname, and POSTs the mapped body', async () => {
    const { service, execute } = build([mapping('employeeCode', 'emp_code'), mapping('state', 'state')]);
    const out = await service.testEndpoint('cA', 'i1', 'e1', undefined, 'admin', { employeeCode: '000008', state: 'I' });
    expect(execute).toHaveBeenCalledWith('cA', 'i1', 'e1', { shortname: 'DEMO' }, { emp_code: '000008', state: 'I' });
    expect(out.sentBody).toEqual({ emp_code: '000008', state: 'I' });
    expect(out.success).toBe(true);
  });

  it('reports a failure when HR answers HTTP 200 but the body says FAILED', async () => {
    const { service, execute } = build([mapping('state', 'state')]);
    execute.mockResolvedValue({ success: true, statusCode: 200, durationMs: 1, body: { status: 'FAILED', message: 'ORA-01843: not a valid month' } });
    const out = await service.testEndpoint('cA', 'i1', 'e1', undefined, 'admin', { state: 'I' });
    expect(out.success).toBe(false);
    expect(out.error).toContain('failed');
    expect(out.sampleBody).toEqual({ status: 'FAILED', message: 'ORA-01843: not a valid month' });
  });

  it('sends the typed record exactly as written when no mapping exists', async () => {
    const { service, execute } = build([]);
    const out = await service.testEndpoint('cA', 'i1', 'e1', undefined, 'admin', { user_id: '1108' });
    expect(execute).toHaveBeenCalledWith('cA', 'i1', 'e1', { shortname: 'DEMO' }, { user_id: '1108' });
    expect(out.sentAsIs).toBe(true);
  });

  it('sends a record already in the HR field names as written, even when mappings exist', async () => {
    const { service } = build([mapping('userId', 'user_id')]);
    const out = await service.testEndpoint('cA', 'i1', 'e1', undefined, 'admin', { user_id: '1108' });
    expect(out.sentBody).toEqual({ user_id: '1108' });
    expect(out.sentAsIs).toBe(true);
  });

  it('refuses an empty sample record', async () => {
    const { service, execute } = build([mapping('userId', 'user_id')]);
    await expect(service.testEndpoint('cA', 'i1', 'e1', undefined, 'admin', {})).rejects.toThrow(BadRequestException);
    expect(execute).not.toHaveBeenCalled();
  });
});

describe('bare colon placeholder (":shortname", as written in the HR document for Company Information)', () => {
  it('is filled just like ":p_shortname"', () => {
    expect(fillPathPlaceholders('/get_companies/:shortname', { shortname: 'OVACSOL' })).toBe('/get_companies/OVACSOL');
    expect(fillPathPlaceholders('/get_companies/leave_report/:shortname/:employee_id', { shortname: 'DEMO', employeeId: '000008' })).toBe('/get_companies/leave_report/DEMO/000008');
    expect(fillPathPlaceholders('/x/:unknownword', { shortname: 'A' })).toBe('/x/:unknownword');
  });
});

describe('every path written in the HR API document resolves completely', () => {
  const ALL = { shortname: 'OVACSOL', employeeId: '000008', name: 'Shazil', username: 'SHAZIL', password: 'x', wifiName: 'Ptcl' };
  const DOC_PATHS: [string, string[]][] = [
    ['/get_companies/:shortname', ['shortname']],
    ['/get_companies/attendance_report/:p_shortname/:p_name', ['shortname', 'name']],
    ['/get_companies/device_info/:p_shortname/:p_username', ['shortname', 'username']],
    ['/get_companies/login/:p_short_name/:p_user_name/:p_password', ['shortname', 'username', 'password']],
    ['/get_companies/fetch_wifi/:p_shortname/:p_bssid', ['shortname', 'wifiName']],
    ['/get_companies/fetch_wifi/:p_shortname/:p_wifi_name', ['shortname', 'wifiName']],
    ['/get_companies/leave_report/:p_shortname/:p_employee_id', ['shortname', 'employeeId']],
    ['/get_companies/shift_record/:p_shortname/:p_employee_id', ['shortname', 'employeeId']],
  ];
  it.each(DOC_PATHS)('%s', (path, expected) => {
    expect(pathParamNames(path)).toEqual(expected);
    expect(fillPathPlaceholders(path, ALL)).not.toMatch(/:/);
  });
});

describe('generic :p_ placeholders', () => {
  const { fillPathPlaceholders, pathParamNames, colonParamName } = require('./utils/path-placeholders.util');
  it('maps any :p_ word to camelCase', () => {
    expect(colonParamName('p_date')).toBe('date');
    expect(colonParamName('p_from_date')).toBe('fromDate');
    expect(colonParamName('p_shortname')).toBe('shortname');
    expect(colonParamName('date')).toBeUndefined();
  });
  it('fills and lists them', () => {
    const path = '/ceo/:p_shortname/:p_date';
    expect(pathParamNames(path)).toEqual(['shortname', 'date']);
    expect(fillPathPlaceholders(path, { shortname: 'ovac', date: '20-OCT-2026' })).toBe('/ceo/ovac/20-OCT-2026');
  });
});
