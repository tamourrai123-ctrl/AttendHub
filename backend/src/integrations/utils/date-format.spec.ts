import { formatDate, parseAnyDate, transformDate } from './date-format.util';

describe('date transform', () => {
  it('reads the HR document format and writes the SQL-friendly one', () => {
    expect(transformDate(' 7/22/2026 11:34:17.000000 AM', undefined, 'YYYY-MM-DD HH:mm:ss')).toBe('2026-07-22 11:34:17');
    expect(transformDate('7/22/2026 11:34:17.000000 PM', undefined, 'YYYY-MM-DD HH:mm:ss')).toBe('2026-07-22 23:34:17');
    expect(transformDate('7/22/2026 12:05:00 AM', undefined, 'HH:mm')).toBe('00:05');
  });
  it('reads ISO (with T/Z, zone offsets, plain space) and epoch', () => {
    expect(transformDate('2026-07-22T13:12:01Z', undefined, 'M/D/YYYY h:mm:ss.SSSSSS A')).toBe('7/22/2026 1:12:01.000000 PM');
    expect(transformDate('2026-07-22 13:12:01', undefined, 'ISO')).toBe('2026-07-22T13:12:01.000Z');
    expect(transformDate('2026-07-22T18:12:01+05:00', undefined, 'HH:mm')).toBe('13:12');
    expect(transformDate(1784725921, undefined, 'YYYY-MM-DD')).toBe('2026-07-22');
    expect(transformDate('1784725921000', undefined, 'EPOCH')).toBe('1784725921');
  });
  it('reads day-first dates and honours an explicit input pattern', () => {
    expect(transformDate('22-07-2026 09:30', undefined, 'YYYY-MM-DD HH:mm')).toBe('2026-07-22 09:30');
    expect(transformDate('22/07/2026', undefined, 'YYYY-MM-DD')).toBe('2026-07-22');
    expect(transformDate('03/04/2026', 'DD/MM/YYYY', 'YYYY-MM-DD')).toBe('2026-04-03');
    expect(transformDate('22-Jul-2026', 'DD-MMM-YYYY', 'YYYY-MM-DD')).toBe('2026-07-22');
  });
  it('defaults to ISO output, supports literals, rejects non-dates', () => {
    expect(transformDate('2026-07-22', undefined, undefined)).toBe('2026-07-22T00:00:00.000Z');
    expect(formatDate(new Date(Date.UTC(2026, 6, 5, 9, 3, 4)), 'DD [at] HH:mm')).toBe('05 at 09:03');
    expect(transformDate('not a date')).toBeNull();
    expect(parseAnyDate('31/02/2026')).toBeNull();
  });
});
