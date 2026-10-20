/**
 * Placeholders in an endpoint path. The hub's own style is "{{shortname}}"; the HR API document writes the same
 * thing as ":p_shortname" (Oracle style). Both are understood and map to the same parameter names.
 */
const COLON_PARAM_ALIASES: Record<string, string> = {
  shortname: 'shortname',
  username: 'username',
  password: 'password',
  name: 'name',
  employeeid: 'employeeId',
  wifiname: 'wifiName',
  bssid: 'wifiName',
};

/**
 * ":p_short_name" -> "shortname", ":p_employee_id" -> "employeeId" (known names), and any other ":p_something" ->
 * its camelCase form (":p_date" -> "date", ":p_from_date" -> "fromDate"). A bare colon word that does not start with
 * "p_" and is not a known name is not a placeholder (undefined).
 */
export function colonParamName(raw: string): string | undefined {
  const known = COLON_PARAM_ALIASES[raw.replace(/^p_/i, '').replace(/_/g, '').toLowerCase()];
  if (known) return known;
  if (!/^p_/i.test(raw)) return undefined;
  const parts = raw
    .slice(2)
    .split('_')
    .filter(Boolean)
    .map((part) => part.toLowerCase());
  if (parts.length === 0) return undefined;
  return parts[0] + parts.slice(1).map((part) => part[0].toUpperCase() + part.slice(1)).join('');
}

/** Replaces "{{name}}" and ":p_name" placeholders with the (URL-encoded) values supplied; unknown or unsupplied ones stay as written. */
export function fillPathPlaceholders(path: string, params: Record<string, string>): string {
  const has = (key: string): boolean => Object.prototype.hasOwnProperty.call(params, key);
  const withBraces = path.replace(/\{\{(\w+)\}\}/g, (match, name: string) => (has(name) ? encodeURIComponent(params[name]) : match));
  return withBraces.replace(/:((?:p_)?[A-Za-z_]+)/g, (match, raw: string) => {
    const key = colonParamName(raw);
    return key && has(key) ? encodeURIComponent(params[key]) : match;
  });
}

/** The distinct parameter names a path asks for, in order of appearance. */
export function pathParamNames(path: string): string[] {
  const names: string[] = [];
  for (const match of path.matchAll(/\{\{(\w+)\}\}|:((?:p_)?[A-Za-z_]+)/g)) {
    const name = match[1] ?? colonParamName(match[2]);
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}
