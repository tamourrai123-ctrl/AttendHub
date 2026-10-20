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

/** ":p_date" -> "date", ":p_from_date" -> "fromDate"; known names first; a colon word without "p_" is not a placeholder. */
function colonParamName(raw: string): string | undefined {
  const known = ALIASES[raw.replace(/^p_/i, "").replace(/_/g, "").toLowerCase()];
  if (known) return known;
  if (!/^p_/i.test(raw)) return undefined;
  const parts = raw.slice(2).split("_").filter(Boolean).map((part) => part.toLowerCase());
  if (parts.length === 0) return undefined;
  return parts[0] + parts.slice(1).map((part) => part[0].toUpperCase() + part.slice(1)).join("");
}

/** Parameter names a path asks for, in order. */
export function pathParamNames(path: string): string[] {
  const names: string[] = [];
  for (const match of path.matchAll(/\{\{(\w+)\}\}|:((?:p_)?[A-Za-z_]+)/g)) {
    const name = match[1] ?? colonParamName(match[2]);
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** What the hub fills in by itself when a box is left alone: `date` = today as HR writes it, e.g. 20-OCT-2026. */
export function defaultParamValue(name: string): string {
  if (name !== "date") return "";
  const now = new Date();
  return `${String(now.getUTCDate()).padStart(2, "0")}-${MONTHS[now.getUTCMonth()]}-${now.getUTCFullYear()}`;
}

/** "fromDate" -> "From date" for placeholders that have no fixed label. */
export function labelForParam(name: string): string {
  if (PARAM_LABELS[name]) return PARAM_LABELS[name];
  const spaced = name.replace(/([A-Z])/g, " $1").toLowerCase().trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export const PARAM_LABELS: Record<string, string> = {
  username: "Username",
  password: "Password",
  name: "Employee name",
  employeeId: "Employee ID",
  wifiName: "WiFi name",
  date: "Date",
};
