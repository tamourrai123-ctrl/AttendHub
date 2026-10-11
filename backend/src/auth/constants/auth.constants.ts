/**
 * Centralized TTLs for every token this module issues. Hardcoded rather
 * than environment-configurable — Phase 4G's own "do not add configuration
 * surface area this phase doesn't need" guidance — but centralized here
 * (not duplicated across AuthService/AuthModule/PrismaSessionsRepository)
 * so a future change to any of them happens in exactly one place.
 */
export const SESSION_TTL_SECONDS = 60 * 60 * 24; // 24 hours
export const EMAIL_VERIFY_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours
export const PASSWORD_RESET_TTL_MS = 1000 * 60 * 60; // 1 hour

/** Character set for generated usm_company.id values — see AuthService.generateCompanyId(). Excludes ambiguous-looking characters (0/O, 1/I) since these ids may occasionally be read by a human (support, logs). */
export const COMPANY_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const COMPANY_ID_MAX_ATTEMPTS = 8;
