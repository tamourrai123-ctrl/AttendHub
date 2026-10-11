/**
 * Date/time reading and writing for the "Date / time" mapping transform. Plain data only — a pattern is never
 * evaluated as code. All calendar fields are read and written in UTC so the result never depends on the server's zone.
 *
 * Pattern tokens: YYYY YY MMMM MMM MM M DD D HH H hh h mm m ss s SSSSSS SSS A a, and [text] for literal text.
 * Special output patterns: ISO, EPOCH (seconds), EPOCH_MS.
 */
const TOKEN_RE = /\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|DD|D|HH|H|hh|h|mm|m|ss|s|SSSSSS|SSS|A|a/g;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export const MAX_DATE_PATTERN_LENGTH = 60;

export function formatDate(date: Date, pattern: string): string {
  const p = pattern.trim();
  if (p.toUpperCase() === 'ISO') return date.toISOString();
  if (p.toUpperCase() === 'EPOCH') return String(Math.floor(date.getTime() / 1000));
  if (p.toUpperCase() === 'EPOCH_MS') return String(date.getTime());
  const h24 = date.getUTCHours();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const ms = date.getUTCMilliseconds();
  return p.replace(TOKEN_RE, (token, literal?: string) => {
    if (literal !== undefined) return literal;
    switch (token) {
      case 'YYYY': return pad(date.getUTCFullYear(), 4);
      case 'YY': return pad(date.getUTCFullYear() % 100);
      case 'MMMM': return MONTHS[date.getUTCMonth()];
      case 'MMM': return MONTHS[date.getUTCMonth()].slice(0, 3);
      case 'MM': return pad(date.getUTCMonth() + 1);
      case 'M': return String(date.getUTCMonth() + 1);
      case 'DD': return pad(date.getUTCDate());
      case 'D': return String(date.getUTCDate());
      case 'HH': return pad(h24);
      case 'H': return String(h24);
      case 'hh': return pad(h12);
      case 'h': return String(h12);
      case 'mm': return pad(date.getUTCMinutes());
      case 'm': return String(date.getUTCMinutes());
      case 'ss': return pad(date.getUTCSeconds());
      case 's': return String(date.getUTCSeconds());
      case 'SSSSSS': return pad(ms * 1000, 6);
      case 'SSS': return pad(ms, 3);
      case 'A': return h24 < 12 ? 'AM' : 'PM';
      case 'a': return h24 < 12 ? 'am' : 'pm';
      default: return token;
    }
  });
}

interface Parts { y: number; mo: number; d: number; h: number; mi: number; s: number; ms: number; pm?: boolean; hour12?: boolean }

function build(parts: Parts): Date | null {
  let h = parts.h;
  if (parts.hour12) {
    if (h < 1 || h > 12) return null;
    h = h % 12 + (parts.pm ? 12 : 0);
  }
  if (parts.mo < 1 || parts.mo > 12 || parts.d < 1 || parts.d > 31 || h > 23 || parts.mi > 59 || parts.s > 59) return null;
  const date = new Date(Date.UTC(parts.y, parts.mo - 1, parts.d, h, parts.mi, parts.s, parts.ms));
  // reject overflow such as 31 Feb
  if (date.getUTCMonth() !== parts.mo - 1 || date.getUTCDate() !== parts.d) return null;
  return date;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Reads `text` using an explicit pattern (same tokens as formatDate). */
export function parseWithPattern(text: string, pattern: string): Date | null {
  const order: string[] = [];
  let re = '';
  let last = 0;
  const p = pattern.trim();
  for (const m of p.matchAll(TOKEN_RE)) {
    re += escapeRe(p.slice(last, m.index));
    last = (m.index ?? 0) + m[0].length;
    if (m[1] !== undefined) { re += escapeRe(m[1]); continue; }
    order.push(m[0]);
    re += m[0] === 'MMMM' || m[0] === 'MMM' ? '([A-Za-z]+)' : m[0] === 'A' || m[0] === 'a' ? '([AaPp][Mm])' : m[0] === 'YYYY' ? '(\\d{4})' : m[0] === 'SSSSSS' ? '(\\d{1,6})' : m[0] === 'SSS' ? '(\\d{1,3})' : '(\\d{1,2})';
  }
  re += escapeRe(p.slice(last));
  const match = new RegExp(`^\\s*${re}\\s*$`).exec(text);
  if (!match) return null;
  const parts: Parts = { y: 1970, mo: 1, d: 1, h: 0, mi: 0, s: 0, ms: 0 };
  for (let i = 0; i < order.length; i++) {
    const v = match[i + 1];
    switch (order[i]) {
      case 'YYYY': parts.y = Number(v); break;
      case 'YY': parts.y = 2000 + Number(v); break;
      case 'MMMM': case 'MMM': {
        const idx = MONTHS.findIndex((name) => name.toLowerCase().startsWith(v.toLowerCase().slice(0, 3)));
        if (idx < 0) return null;
        parts.mo = idx + 1; break;
      }
      case 'MM': case 'M': parts.mo = Number(v); break;
      case 'DD': case 'D': parts.d = Number(v); break;
      case 'HH': case 'H': parts.h = Number(v); break;
      case 'hh': case 'h': parts.h = Number(v); parts.hour12 = true; break;
      case 'mm': case 'm': parts.mi = Number(v); break;
      case 'ss': case 's': parts.s = Number(v); break;
      case 'SSSSSS': parts.ms = Math.floor(Number(v.padEnd(6, '0')) / 1000); break;
      case 'SSS': parts.ms = Number(v.padEnd(3, '0')); break;
      case 'A': case 'a': parts.pm = v.toLowerCase() === 'pm'; break;
    }
  }
  if (parts.pm !== undefined) parts.hour12 = true;
  return build(parts);
}

/** Reads a date without being told its format: ISO, "7/22/2026 11:34:17.000000 AM", "22-07-2026", "2026-07-22 13:12:01", epoch numbers. */
export function parseAnyDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return new Date(value < 1e11 ? value * 1000 : value);
  }
  const text = String(value).trim();
  if (!text) return null;
  if (/^\d{9,13}$/.test(text)) return parseAnyDate(Number(text));

  // 2026-07-22T13:12:01Z / 2026-07-22 13:12:01(.123456) (no zone => UTC)
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i.exec(text);
  if (iso) {
    const base = build({ y: +iso[1], mo: +iso[2], d: +iso[3], h: +(iso[4] ?? 0), mi: +(iso[5] ?? 0), s: +(iso[6] ?? 0), ms: Math.floor(Number((iso[7] ?? '0').padEnd(3, '0').slice(0, 3))) });
    if (!base) return null;
    const zone = iso[8];
    if (zone && zone.toUpperCase() !== 'Z') {
      const sign = zone.startsWith('-') ? -1 : 1;
      const digits = zone.replace(/[^0-9]/g, '');
      base.setTime(base.getTime() - sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4))) * 60000);
    }
    return base;
  }

  // 7/22/2026 11:34:17.000000 AM, 22-07-2026 13:00, 22.07.2026
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?\s*([AaPp][Mm])?)?$/.exec(text);
  if (dmy) {
    let a = +dmy[1];
    let b = +dmy[2];
    // slashes follow the HR document (month first); a first number above 12 can only be a day
    let mo = a, d = b;
    if (a > 12 && b <= 12) { mo = b; d = a; }
    if (text.includes('-') || text.includes('.')) { if (a <= 31 && b <= 12) { d = a; mo = b; } }
    const mer = dmy[8];
    return build({
      y: +dmy[3], mo, d, h: +(dmy[4] ?? 0), mi: +(dmy[5] ?? 0), s: +(dmy[6] ?? 0),
      ms: Math.floor(Number((dmy[7] ?? '0').padEnd(3, '0').slice(0, 3))),
      hour12: mer !== undefined, pm: mer ? mer.toLowerCase() === 'pm' : undefined,
    });
  }

  const native = new Date(text);
  return Number.isNaN(native.getTime()) ? null : native;
}

/** Full transform: read (explicit pattern or automatic), write (pattern or ISO). Returns null when the value is not a date. */
export function transformDate(value: unknown, inputFormat?: string, outputFormat?: string): string | null {
  const date = inputFormat?.trim() ? parseWithPattern(String(value), inputFormat) : parseAnyDate(value);
  if (!date) return null;
  return formatDate(date, outputFormat?.trim() ? outputFormat : 'ISO');
}
