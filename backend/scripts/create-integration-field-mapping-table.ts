/**
 * One-off DDL — NOT part of the application, and NOT a Prisma migration.
 * Manually creates the `integration_field_mapping` table (Phase 4F:
 * Persistent Custom Field Mapping), per this project's established
 * "PostgreSQL is manually managed, Prisma only introspects" convention
 * (see scripts/add-companies-admin-email-index.ts,
 * scripts/seed-integration-auth-type-lov.ts from earlier phases).
 *
 * Confirmed by scripts/inspect-field-mapping-schema.ts against the real
 * database before writing this:
 *   - integration_field_mapping does NOT already exist.
 *   - integration_master's only index is its PK, pk_im_id (company_id, id).
 *   - integration_detail's only index is its PK, pk_id_id (company_id, id).
 *   - usm_company's PK is usm_company_pkey (id); un_title_company /
 *     un_shortname_company are pre-existing unique constraints, unrelated.
 *
 * DESIGN, matching this project's existing conventions exactly:
 *   - Composite PK (company_id, id) — the same shape as integration_master
 *     and integration_detail, not a surrogate-only PK.
 *   - status CHAR(1) DEFAULT 'Y' with a CHECK ('Y'/'N' only) — the same
 *     shape/convention as integration_master.status / integration_detail.status
 *     (both confirmed to have this exact CHECK in earlier phases).
 *   - add_by/edit_by VARCHAR(50), add_date/edit_date TIMESTAMP(6) — copied
 *     verbatim from integration_detail's own audit columns.
 *   - transform_type VARCHAR(20), matching integration_detail.request_type/
 *     response_type's width, with its own CHECK restricting it to exactly
 *     the 8 controlled transformations already implemented in
 *     FieldMappingService — this is REQUIRED, not just app-layer validation:
 *     it makes "no arbitrary transform strings" a database-enforced
 *     guarantee, not only a DTO-level one.
 *   - transform_config JSONB DEFAULT '{}' — data only, never executable;
 *     shape is validated per transform_type at the DTO/service layer (see
 *     create-field-mapping.dto.ts) since a single JSONB column can't carry
 *     a conditional CHECK per transform_type without a much more complex
 *     constraint than this phase's "avoid over-engineering" instruction
 *     warrants.
 *
 * FOREIGN KEYS (Phase 4F section 17's exact required relationship):
 *   - company_id -> usm_company(id)
 *   - (company_id, integration_id) -> integration_master(company_id, id)
 *     — a direct match against integration_master's existing PK, no
 *     supporting constraint needed.
 *   - (company_id, integration_id, endpoint_id) ->
 *     integration_detail(company_id, integration_id, id) — integration_detail's
 *     actual PK is only (company_id, id) (integration_id is a plain column,
 *     not part of it), so Postgres cannot form this 3-column FK against the
 *     2-column PK directly. This script therefore ALSO adds one new,
 *     purely additive UNIQUE constraint to the EXISTING integration_detail
 *     table — un_integration_detail_company_integration_id UNIQUE
 *     (company_id, integration_id, id) — solely to give this FK a target.
 *     It changes nothing about integration_detail's existing PK, columns,
 *     data, or behavior; it is trivially satisfied by every existing row
 *     (company_id, id) is already unique, so adding integration_id to it
 *     cannot introduce a violation. This is the one "alter an existing
 *     table" this script performs, and it exists only because Phase 4F's
 *     own spec explicitly requires this exact 3-column FK.
 *
 * UNIQUENESS: un_ifm_no_duplicate UNIQUE (company_id, integration_id,
 * endpoint_id, source_path, target_field) — prevents the same source path
 * mapping to the same target field twice under one endpoint, regardless of
 * status (kept simple, per Phase 4F section 26's "keep it simple" guidance
 * — an inactive duplicate is still a duplicate).
 *
 * INDEXING: exactly one purpose-built composite index,
 * idx_integration_field_mapping_lookup (company_id, integration_id,
 * endpoint_id, sort_order) — serves the one real access pattern (list a
 * specific endpoint's mappings, ordered by sort_order) in a single index
 * scan. (The UNIQUE constraint above creates its own index automatically,
 * for correctness, not this lookup shape — its trailing columns
 * (source_path, target_field) don't help an ORDER BY sort_order query, so
 * this second index is not redundant with it.) The table is created empty
 * here, so plain CREATE INDEX (not CONCURRENTLY) is fine — there is no
 * concurrent-write contention to protect against on a table with no rows
 * and no other code referencing it yet.
 *
 * Every statement is guarded to be safely re-runnable: CREATE TABLE IF NOT
 * EXISTS, CREATE INDEX IF NOT EXISTS, and a DO block that checks
 * pg_constraint before adding the supporting unique constraint (Postgres
 * has no ADD CONSTRAINT IF NOT EXISTS). Nothing here ever drops or alters
 * existing data.
 *
 * Run once with: npx ts-node scripts/create-integration-field-mapping-table.ts
 *
 * (Optional, separate, manual step afterwards: `npx prisma db pull` +
 * `npx prisma generate` + `npx prisma validate`, exactly as Phase 4F's
 * instructions specify — not run by this script itself.)
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

async function main(): Promise<void> {
  let app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>> | undefined;

  try {
    app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
    const prisma = app.get(PrismaService);

    console.log('Step 1/3: adding supporting unique constraint to integration_detail (if not already present)...');
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'un_integration_detail_company_integration_id'
        ) THEN
          ALTER TABLE integration_detail
            ADD CONSTRAINT un_integration_detail_company_integration_id UNIQUE (company_id, integration_id, id);
        END IF;
      END $$;
    `);
    console.log('Done.');

    console.log('Step 2/3: creating integration_field_mapping (if it does not already exist)...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS integration_field_mapping (
        id BIGINT GENERATED BY DEFAULT AS IDENTITY,
        company_id VARCHAR(2) NOT NULL,
        integration_id BIGINT NOT NULL,
        endpoint_id BIGINT NOT NULL,
        source_path VARCHAR(500) NOT NULL,
        target_field VARCHAR(100) NOT NULL,
        transform_type VARCHAR(20) NOT NULL DEFAULT 'NONE',
        transform_config JSONB NOT NULL DEFAULT '{}'::jsonb,
        sort_order INT NOT NULL DEFAULT 1,
        status CHAR(1) NOT NULL DEFAULT 'Y',
        add_by VARCHAR(50),
        add_date TIMESTAMP(6) DEFAULT now(),
        edit_by VARCHAR(50),
        edit_date TIMESTAMP(6),
        CONSTRAINT pk_integration_field_mapping PRIMARY KEY (company_id, id),
        CONSTRAINT chk_ifm_status CHECK (status IN ('Y', 'N')),
        CONSTRAINT chk_ifm_transform_type CHECK (
          transform_type IN ('NONE','TRIM','UPPERCASE','LOWERCASE','TO_STRING','DATE_ISO','VALUE_MAP','DEFAULT_IF_EMPTY')
        ),
        CONSTRAINT fk_ifm_company FOREIGN KEY (company_id)
          REFERENCES usm_company (id),
        CONSTRAINT fk_ifm_integration FOREIGN KEY (company_id, integration_id)
          REFERENCES integration_master (company_id, id),
        CONSTRAINT fk_ifm_endpoint FOREIGN KEY (company_id, integration_id, endpoint_id)
          REFERENCES integration_detail (company_id, integration_id, id),
        CONSTRAINT un_ifm_no_duplicate UNIQUE (company_id, integration_id, endpoint_id, source_path, target_field)
      );
    `);
    console.log('Done.');

    console.log('Step 3/3: creating the lookup index (if it does not already exist)...');
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_integration_field_mapping_lookup
        ON integration_field_mapping (company_id, integration_id, endpoint_id, sort_order);
    `);
    console.log('Done.');

    console.log('\nVerifying...');
    const columns = await prisma.$queryRawUnsafe(
      `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='integration_field_mapping' ORDER BY ordinal_position`,
    );
    console.log(columns);
    const indexes = await prisma.$queryRawUnsafe(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'integration_field_mapping'`);
    console.log(indexes);
    const detailConstraint = await prisma.$queryRawUnsafe(
      `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'integration_detail' AND indexname = 'un_integration_detail_company_integration_id'`,
    );
    console.log(detailConstraint);

    console.log('\nAll done.');
  } catch (error) {
    console.error('Schema creation failed:');
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (app) {
      await app.close();
    }
  }
}

main();
