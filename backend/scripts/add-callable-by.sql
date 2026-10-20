-- Who may call a custom endpoint from the app: 'A' = company admin only (default), 'E' = admin and employees.
ALTER TABLE integration_detail
  ADD COLUMN IF NOT EXISTS callable_by CHAR(1) NOT NULL DEFAULT 'A';

ALTER TABLE integration_detail
  DROP CONSTRAINT IF EXISTS ck_integration_detail_callable_by;
ALTER TABLE integration_detail
  ADD CONSTRAINT ck_integration_detail_callable_by CHECK (callable_by IN ('A','E'));
