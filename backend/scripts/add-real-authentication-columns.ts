/**
 * One-off DDL — NOT part of the application, and NOT a Prisma migration.
 * Manually adds the columns/table Phase 4G ("Real Authentication & SaaS
 * Signup") needs, per this project's established "PostgreSQL is manually
 * managed, Prisma only introspects" convention (see
 * scripts/create-integration-field-mapping-table.ts from Phase 4F for the
 * same pattern).
 *
 * Inspected before writing this (via prisma/schema.prisma, already
 * introspected in earlier phases):
 *   - usm_users has NO email_verified / verification / reset-token columns
 *     of any kind, and NO unique constraint on email_address.
 *   - usm_users' PK is the composite (company_id, user_id).
 *   - No sessions/tokens table of any kind exists yet.
 *
 * DESIGN, matching this project's existing conventions:
 *   - email_verified CHAR(1) NOT NULL DEFAULT 'N' — the same Y/N convention
 *     already used by usm_company.status, integration_master.status, etc.
 *   - email_verify_token_hash / reset_token_hash CHAR(64) NULL — a SHA-256
 *     hex digest (64 chars), never the raw token. The raw, single-use token
 *     is only ever emailed to the user, never persisted anywhere.
 *   - email_verify_expires / reset_token_expires TIMESTAMP(6) NULL —
 *     mirrors add_date/edit_date's existing TIMESTAMP(6) width.
 *   - usm_users.email_address UNIQUE: added ONLY if the live data has no
 *     duplicates. This script checks first (see Step 1) and reports
 *     clearly rather than letting a blind ALTER TABLE fail (or silently
 *     leaving duplicate rows possible) — see the console output this
 *     script prints for what to do if duplicates are found.
 *
 * usm_user_sessions (new table) — deliberately NOT foreign-keyed to
 * usm_users. Reason: Phase 4G's login endpoint must, for this phase, also
 * accept the three pre-existing hardcoded demo accounts (SUPER_ADMIN /
 * COMPANY_ADMIN / EMPLOYEE — see
 * src/auth/repositories/in-memory-users.repository.ts) as a backward-
 * compatibility bridge, because the still-mock Attendance/Leave/Pricing/
 * Monitoring modules and the existing auth-rbac.e2e-spec.ts suite are
 * built entirely around those three accounts' fake ids (companyId
 * 'cmp_001' — 7 characters, which cannot fit usm_users.company_id's real
 * VARCHAR(2) column, so those accounts can never correspond to a real row
 * here). This is called out explicitly in the final report as a decision
 * requiring approval, not treated as a hidden permanent design. A plain,
 * unique-indexed token_hash column (no FK) lets one sessions table serve
 * both real, DB-backed users and these legacy demo sessions uniformly.
 *   - token_hash CHAR(64) UNIQUE — SHA-256 hex digest of the JWT; the raw
 *     JWT itself is never stored.
 *   - user_key VARCHAR(255) — a stable identifier for whoever the session
 *     belongs to (a real user's "company_id:user_id", or a legacy demo
 *     account's fixed id such as "usr_super_admin"). Not a foreign key.
 *   - company_id / employee_id are plain, unenforced VARCHAR columns
 *     carried on the session row purely so revocation lookups don't need a
 *     join back to usm_users for legacy sessions that have no such row.
 *
 * Every statement is guarded to be safely re-runnable: ADD COLUMN IF NOT
 * EXISTS, CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, and a DO
 * block checking pg_constraint before adding the unique constraint
 * (Postgres has no ADD CONSTRAINT IF NOT EXISTS). Nothing here ever drops
 * or alters existing data.
 *
 * Run once with: npx ts-node scripts/add-real-authentication-columns.ts
 *
 * (Optional, separate, manual step afterwards: `npx prisma db pull` +
 * `npx prisma generate` + `npx prisma validate` — not run by this script.)
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

async function main(): Promise<void> {
  let app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>> | undefined;

  try {
    app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
    const prisma = app.get(PrismaService);

    console.log('Step 1/5: checking usm_users.email_address for existing duplicates...');
    const duplicates = await prisma.$queryRawUnsafe<Array<{ email_address: string; count: bigint }>>(`
      SELECT email_address, COUNT(*) AS count
      FROM usm_users
      WHERE email_address IS NOT NULL
      GROUP BY email_address
      HAVING COUNT(*) > 1
    `);
    const canAddUniqueEmail = duplicates.length === 0;
    if (canAddUniqueEmail) {
      console.log('No duplicates found — safe to add the unique constraint.');
    } else {
      console.warn(
        `Found ${duplicates.length} duplicate email_address value(s) — SKIPPING the unique constraint. ` +
          'Resolve the duplicates below, then re-run this script to add it:',
      );
      console.warn(duplicates);
    }

    console.log('\nStep 2/5: adding verification/reset columns to usm_users (if not already present)...');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE usm_users
        ADD COLUMN IF NOT EXISTS email_verified CHAR(1) NOT NULL DEFAULT 'N',
        ADD COLUMN IF NOT EXISTS email_verify_token_hash CHAR(64),
        ADD COLUMN IF NOT EXISTS email_verify_expires TIMESTAMP(6),
        ADD COLUMN IF NOT EXISTS reset_token_hash CHAR(64),
        ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMP(6);
    `);
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'chk_usm_users_email_verified'
        ) THEN
          ALTER TABLE usm_users
            ADD CONSTRAINT chk_usm_users_email_verified CHECK (email_verified IN ('Y', 'N'));
        END IF;
      END $$;
    `);
    console.log('Done.');

    if (canAddUniqueEmail) {
      console.log('\nStep 3/5: adding UNIQUE constraint on usm_users.email_address (if not already present)...');
      await prisma.$executeRawUnsafe(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'un_usm_users_email_address'
          ) THEN
            ALTER TABLE usm_users
              ADD CONSTRAINT un_usm_users_email_address UNIQUE (email_address);
          END IF;
        END $$;
      `);
      console.log('Done.');
    } else {
      console.log('\nStep 3/5: skipped (duplicates present — see warning above).');
    }

    console.log('\nStep 4/5: creating usm_user_sessions (if it does not already exist)...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS usm_user_sessions (
        id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        user_key VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL,
        company_id VARCHAR(20),
        employee_id VARCHAR(20),
        token_hash CHAR(64) NOT NULL,
        issued_at TIMESTAMP(6) NOT NULL DEFAULT now(),
        expires_at TIMESTAMP(6) NOT NULL,
        revoked_at TIMESTAMP(6),
        CONSTRAINT un_user_sessions_token_hash UNIQUE (token_hash)
      );
    `);
    // Widens company_id/employee_id even if the table already existed from
    // an earlier run of this script with narrower columns (VARCHAR(2) /
    // VARCHAR(50), sized only for REAL usm_company.id / usm_users.user_id
    // values). Widening is required because AuthService.login() also
    // accepts the three legacy hardcoded demo accounts (see AuthService's
    // class doc comment) as a backward-compatibility bridge, and their
    // companyId/employeeId ('cmp_001' / 'emp_001', 7 characters) do not fit
    // a real company id's width. ALTER COLUMN ... TYPE to a type the column
    // is already at is a harmless no-op in Postgres, so this is safe to run
    // every time regardless of whether the table is new or pre-existing.
    await prisma.$executeRawUnsafe(`
      ALTER TABLE usm_user_sessions
        ALTER COLUMN company_id TYPE VARCHAR(20),
        ALTER COLUMN employee_id TYPE VARCHAR(20);
    `);
    console.log('Done.');

    console.log('\nStep 5/5: creating supporting indexes (if not already present)...');
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_user_sessions_user_key ON usm_user_sessions (user_key);
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON usm_user_sessions (expires_at);
    `);
    console.log('Done.');

    console.log('\nVerifying...');
    const usersColumns = await prisma.$queryRawUnsafe(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'usm_users'
        AND column_name IN ('email_verified','email_verify_token_hash','email_verify_expires','reset_token_hash','reset_token_expires')
      ORDER BY ordinal_position
    `);
    console.log(usersColumns);
    const usersConstraints = await prisma.$queryRawUnsafe(`
      SELECT conname FROM pg_constraint
      WHERE conname IN ('chk_usm_users_email_verified', 'un_usm_users_email_address')
    `);
    console.log(usersConstraints);
    const sessionsColumns = await prisma.$queryRawUnsafe(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'usm_user_sessions'
      ORDER BY ordinal_position
    `);
    console.log(sessionsColumns);
    const sessionsIndexes = await prisma.$queryRawUnsafe(`
      SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'usm_user_sessions'
    `);
    console.log(sessionsIndexes);

    console.log('\nAll done.');
    if (!canAddUniqueEmail) {
      console.log(
        '\nREMINDER: the unique constraint on email_address was skipped because of duplicates — ' +
          'resolve them and re-run this script when convenient. Login-by-email will still work in the ' +
          'meantime (it already matches case-insensitively), but two accounts could theoretically share ' +
          'one email until the constraint is in place.',
      );
    }
  } catch (error) {
    console.error('Schema change failed:');
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (app) {
      await app.close();
    }
  }
}

main();
