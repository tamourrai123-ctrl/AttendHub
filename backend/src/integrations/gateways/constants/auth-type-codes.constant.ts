/**
 * Canonical auth_type codes this codebase's gateway factory knows how to
 * dispatch on. These are VARCHAR(3) values (matching
 * integration_master.auth_type's column width) and are the SAME codes
 * scripts/seed-integration-auth-type-lov.ts inserts into app_lov_detail
 * under the LOV_GROUPS.INTEGRATION_AUTH_TYPE group (see
 * src/lov/constants/lov-groups.constant.ts).
 *
 * Why this constant exists at all, given the "never hardcode LOV codes"
 * instruction: a factory that picks a *class* to instantiate is, by
 * necessity, a switch over some finite set of code values — that dispatch
 * logic cannot itself come from a database row. What LovService governs is
 * *validity*: IntegrationEndpointExecutorService checks
 * `lovService.isValidValue(LOV_GROUPS.INTEGRATION_AUTH_TYPE, master.auth_type)`
 * against the live LOV data BEFORE ever reaching this factory, so an
 * integration whose auth_type was never seeded/activated in LOV is
 * rejected with a clear error rather than silently falling through to a
 * default gateway. If this feature's LOV group is ever renamed or
 * re-coded in app_lov_detail without updating this file, dispatch will
 * start failing for the new codes — that coupling is an inherent property
 * of "a database value selects a code path" and is called out in the
 * final report rather than hidden.
 */
export const AUTH_TYPE_CODES = {
  API_KEY: 'API',
  BASIC_AUTH: 'BAS',
  OAUTH2: 'OAU',
} as const;

export type AuthTypeCode = (typeof AUTH_TYPE_CODES)[keyof typeof AUTH_TYPE_CODES];
