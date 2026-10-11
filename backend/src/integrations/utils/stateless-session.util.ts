/**
 * Stateless employee sessions: AttendHub keeps NO employee record. After the
 * company's HR system verifies a mobile login, the session carries only the
 * company id and the HR's own employee id (usm_user_sessions.employee_id,
 * a plain text column), plus the HR display name inside the session's
 * user key — needed because some HR APIs (e.g. attendance report) are keyed
 * by employee NAME. The session row is revoked/expires like any other.
 *
 * userId format: "{companyId}:hr:{hrEmployeeId}|{name}"  (the "hr" segment is
 * non-numeric on purpose, so web-admin profile lookups (which expect a numeric
 * usm_users id) safely find nothing for these sessions).
 */
export const HR_EMPLOYEE_ID_MAX_LENGTH = 20; // usm_user_sessions.employee_id is varchar(20)
const NAME_MAX_LENGTH = 150;

export function buildStatelessUserKey(companyId: string, hrEmployeeId: string, name: string): string {
  const safeName = name.replace(/\|/g, ' ').trim().slice(0, NAME_MAX_LENGTH);
  return `${companyId}:hr:${hrEmployeeId}|${safeName}`;
}

/** The HR display name carried by a stateless session's userId, or '' if there is none. */
export function nameFromStatelessUserKey(userId: string | undefined): string {
  if (!userId) return '';
  const index = userId.indexOf('|');
  return index === -1 ? '' : userId.slice(index + 1).trim();
}
