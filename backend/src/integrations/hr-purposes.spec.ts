import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { Role } from '../common/constants/roles.enum';
import { ENDPOINT_PURPOSES, findEndpointPurposeByName } from './constants/endpoint-purposes.constant';
import { EndpointsService } from './endpoints.service';
import { HrLookupController } from './hr-lookup.controller';
import { isTokenSourcePath } from './utils/sensitive-source-path.util';

const fieldsOf = (name: string): string[] => (findEndpointPurposeByName(name)?.fields ?? []).map((f) => f.field);

describe('endpoint purposes', () => {
  it('every document API has exactly the fields of the HR API document, in document order', () => {
    expect(fieldsOf('ATTENDANCE_FETCH')).toEqual(['companyId', 'punchId', 'employeeName', 'employeeImage', 'punchTime', 'state', 'source', 'latitude', 'longitude', 'wifi', 'qrCode', 'wifiCheckStatus', 'androidId', 'appVersion']);
    expect(fieldsOf('LEAVE')).toEqual(['companyId', 'employeeName', 'leaveType', 'totalLeaveDays', 'entitledLeave', 'consumedLeave', 'availableLeaveBalance', 'leaveStatus']);
    expect(fieldsOf('COMPANY_INFO')).toHaveLength(15);
    expect(fieldsOf('DEVICE_INFO')).toHaveLength(15);
    expect(fieldsOf('WIFI_INFO')).toHaveLength(5);
    expect(fieldsOf('SHIFT_RECORD')).toHaveLength(9);
    expect(findEndpointPurposeByName('LOGIN_SESSION')?.requestFields).toHaveLength(13);
    expect(findEndpointPurposeByName('EMPLOYEE_LOGIN')?.responseFields).toHaveLength(19);
    expect(findEndpointPurposeByName('EMPLOYEE_LOGIN')?.defaultHttpMethod).toBe('GET')
    expect(findEndpointPurposeByName('EMPLOYEE_LOGIN')?.direction).toBe('INBOUND');
  });

  it('ATTENDANCE_POST = exactly the fields of the HR post_attendance document (plus the hub-set source/addedBy)', () => {
    expect(fieldsOf('ATTENDANCE_POST')).toEqual([
      'companyId', 'employeeCode', 'punchTime', 'state', 'source', 'latitude', 'longitude', 'wifi', 'qrCode', 'addedBy', 'employeeImage', 'filename', 'fileMimetype',
      'fileCharset', 'docFileId', 'pushToken', 'wifiCheckStatus', 'manualLogoutFlag', 'appVersion',
    ]);
  });

  it('has unique purpose names and unique field names within each purpose', () => {
    const names = ENDPOINT_PURPOSES.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
    for (const purpose of ENDPOINT_PURPOSES) {
      const fields = purpose.fields.map((f) => f.field);
      expect(new Set(fields).size).toBe(fields.length);
    }
  });

  it('the new lookup purposes are Inbound/GET', () => {
    for (const name of ['SHIFT_RECORD', 'WIFI_INFO', 'COMPANY_INFO', 'DEVICE_INFO', 'ATTENDANCE_PUNCHES']) {
      const purpose = findEndpointPurposeByName(name);
      expect(purpose).toBeDefined();
      expect(purpose?.direction).toBe('INBOUND');
      expect(purpose?.defaultHttpMethod).toBe('GET');
    }
  });

  it('only Device Info (admin read) and Login Session (send) offer token fields, and attendance punches match the HR document', () => {
    for (const purpose of ENDPOINT_PURPOSES) {
      if (purpose.name === 'DEVICE_INFO' || purpose.name === 'LOGIN_SESSION') continue;
      const all = [...purpose.fields, ...(purpose.requestFields ?? []), ...(purpose.responseFields ?? [])].map((f) => f.field);
      for (const field of all) {
        expect(['accessToken', 'refreshToken', 'token']).not.toContain(field);
      }
    }
    expect(fieldsOf('ATTENDANCE_PUNCHES')).toHaveLength(14); // exactly the HR Mobile Attendance Report document's fields
  });
});

describe('HTTP method rule per purpose', () => {
  const svc = new EndpointsService({} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
  const check = (name: string, method: string) => svc['assertHttpMethodMatchesPurpose'](name, method);

  it('EMPLOYEE_LOGIN (Authentication) is a GET, as in the HR document, and nothing else', () => {
    expect(() => check('EMPLOYEE_LOGIN', 'POST')).toThrow(BadRequestException);
    expect(() => check('EMPLOYEE_LOGIN', 'GET')).not.toThrow();
    expect(() => check('EMPLOYEE_LOGIN', 'PUT')).toThrow(BadRequestException);
  });

  it('every other purpose still allows exactly its one method, with the original message', () => {
    expect(() => check('ATTENDANCE_POST', 'POST')).not.toThrow();
    expect(() => check('ATTENDANCE_POST', 'GET')).toThrow(/must use HTTP method POST, not GET\./);
    expect(() => check('LEAVE', 'GET')).not.toThrow();
    expect(() => check('LEAVE', 'POST')).toThrow(/must use HTTP method GET, not POST\./);
    expect(() => check('SHIFT_RECORD', 'POST')).toThrow(BadRequestException);
  });

  it('names that are not a purpose are unrestricted', () => {
    expect(() => check('MY_CUSTOM_ENDPOINT', 'DELETE')).not.toThrow();
  });
});

const TOKEN_PATH_CASES: Array<[string, boolean]> = [
    ['items[].access_token', true],
    ['items[].refresh_token', true],
    ['access_token', true],
    ['items[].accessToken', true],
    ['token', true],
    ['items[].tokens.access_token', true],
    ['items[].access_token_expiry', false],
    ['items[].refresh_token_expiry', false],
    ['items[].token_id', false],
    ['items[].device_name', false],
];

describe('isTokenSourcePath', () => {
  it.each(TOKEN_PATH_CASES)('%s -> %s', (path, expected) => {
    expect(isTokenSourcePath(path)).toBe(expected);
  });
});

describe('HrLookupController roles', () => {
  const rolesOf = (method: keyof HrLookupController): unknown => Reflect.getMetadata(ROLES_KEY, HrLookupController.prototype[method]);

  it('device-info is Company Admin only; employee lookups are Employee only; company-info allows both', () => {
    expect(rolesOf('deviceInfo')).toEqual([Role.COMPANY_ADMIN]);
    for (const method of ['shift', 'wifi', 'leave', 'attendancePunches'] as const) {
      expect(rolesOf(method)).toEqual([Role.EMPLOYEE]);
    }
    expect(rolesOf('companyInfo')).toEqual([Role.EMPLOYEE, Role.COMPANY_ADMIN]);
  });
});

describe('HR API document coverage', () => {
  it('shows exactly the 10 document APIs in the picker', () => {
    const shown = ENDPOINT_PURPOSES.filter((p) => !p.hideFromPicker).map((p) => p.name).sort();
    expect(shown).toEqual(
      ['ATTENDANCE_FETCH', 'ATTENDANCE_POST', 'COMPANY_INFO', 'DEVICE_INFO', 'EMPLOYEE_LOGIN', 'LEAVE', 'LOGIN_SESSION', 'QR_ATTENDANCE', 'SHIFT_RECORD', 'WIFI_INFO'],
    );
  });
});
