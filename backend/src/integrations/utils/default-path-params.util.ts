const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** Today as HR (Oracle) writes dates in a URL: "20-OCT-2026" (UTC). */
export function oracleDate(now: Date = new Date()): string {
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${day}-${MONTHS[now.getUTCMonth()]}-${now.getUTCFullYear()}`;
}

/** Values a path placeholder gets when the caller does not supply one. Today only `date`. */
export function defaultPathParams(now: Date = new Date()): Record<string, string> {
  return { date: oracleDate(now) };
}
