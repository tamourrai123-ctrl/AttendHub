/** Same placeholder rules as the backend (utils/path-placeholders.util.ts): "{{shortname}}" or the HR document's ":p_shortname". */
const ALIASES: Record<string, string> = {
  shortname: "shortname",
  username: "username",
  password: "password",
  name: "name",
  employeeid: "employeeId",
  wifiname: "wifiName",
  bssid: "wifiName",
};

/** Parameter names a path asks for, in order. */
export function pathParamNames(path: string): string[] {
  const names: string[] = [];
  for (const match of path.matchAll(/\{\{(\w+)\}\}|:((?:p_)?[A-Za-z_]+)/g)) {
    const name = match[1] ?? ALIASES[match[2].replace(/^p_/i, "").replace(/_/g, "").toLowerCase()];
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

export const PARAM_LABELS: Record<string, string> = {
  username: "Username",
  password: "Password",
  name: "Employee name",
  employeeId: "Employee ID",
  wifiName: "WiFi name",
};
