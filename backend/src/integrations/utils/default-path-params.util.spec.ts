import { defaultPathParams, oracleDate } from './default-path-params.util';

describe('default path params', () => {
  it('formats a date like Oracle', () => {
    expect(oracleDate(new Date(Date.UTC(2026, 9, 20)))).toBe('20-OCT-2026');
    expect(oracleDate(new Date(Date.UTC(2026, 0, 5)))).toBe('05-JAN-2026');
  });
  it('defaults date', () => {
    expect(defaultPathParams(new Date(Date.UTC(2026, 9, 20))).date).toBe('20-OCT-2026');
  });
});
