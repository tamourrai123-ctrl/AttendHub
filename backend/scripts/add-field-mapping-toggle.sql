-- Super Admin switch: shows (Y) or hides (N) the custom field mapping section per endpoint. Default N (hidden).
-- Run once in the Supabase SQL Editor. Safe to re-run (it never changes values already stored).
ALTER TABLE integration_detail
  ADD COLUMN IF NOT EXISTS field_mapping_enabled CHAR(1) NOT NULL DEFAULT 'N';

-- If an earlier version of this script already added the column with default 'Y', fix the default for new rows.
ALTER TABLE integration_detail
  ALTER COLUMN field_mapping_enabled SET DEFAULT 'N';

ALTER TABLE integration_detail
  DROP CONSTRAINT IF EXISTS ck_integration_detail_field_mapping_enabled;
ALTER TABLE integration_detail
  ADD CONSTRAINT ck_integration_detail_field_mapping_enabled CHECK (field_mapping_enabled IN ('Y', 'N'));
