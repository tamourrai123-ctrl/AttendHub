-- Subscriptions / plan limits migration. Run ONCE in the Supabase SQL editor (safe to re-run: every statement is idempotent).
-- Adds: plan limits + custom features on pricing_master, plan link + trial on usm_company, and the mobile_app_users seat table.

-- 1) Plan limits (Super Admin sets these in the Pricing panel)
ALTER TABLE pricing_master ADD COLUMN IF NOT EXISTS max_users       INTEGER NULL;               -- NULL = unlimited
ALTER TABLE pricing_master ADD COLUMN IF NOT EXISTS trial_days      INTEGER NOT NULL DEFAULT 0; -- 0 = no free trial
ALTER TABLE pricing_master ADD COLUMN IF NOT EXISTS custom_features JSONB   NOT NULL DEFAULT '[]'::jsonb; -- [{key,label,value}]

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_pricing_master_max_users') THEN
    ALTER TABLE pricing_master ADD CONSTRAINT ck_pricing_master_max_users CHECK (max_users IS NULL OR max_users >= 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_pricing_master_trial_days') THEN
    ALTER TABLE pricing_master ADD CONSTRAINT ck_pricing_master_trial_days CHECK (trial_days >= 0 AND trial_days <= 365);
  END IF;
END $$;

-- 2) Company -> plan link (NULL plan_id = legacy company, no limits applied)
ALTER TABLE usm_company ADD COLUMN IF NOT EXISTS plan_id         BIGINT      NULL;
ALTER TABLE usm_company ADD COLUMN IF NOT EXISTS plan_status     VARCHAR(10) NULL;   -- 'TRIAL' | 'ACTIVE'
ALTER TABLE usm_company ADD COLUMN IF NOT EXISTS plan_started_at TIMESTAMP(6) NULL;
ALTER TABLE usm_company ADD COLUMN IF NOT EXISTS trial_ends_at   TIMESTAMP(6) NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_usm_company_plan') THEN
    ALTER TABLE usm_company
      ADD CONSTRAINT fk_usm_company_plan FOREIGN KEY (plan_id) REFERENCES pricing_master (id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_usm_company_plan_status') THEN
    ALTER TABLE usm_company ADD CONSTRAINT ck_usm_company_plan_status CHECK (plan_status IS NULL OR plan_status IN ('TRIAL', 'ACTIVE'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_usm_company_plan_id ON usm_company (plan_id);

-- 3) Mobile app seats: one row per HR employee who has connected through the app (this is what the plan's max_users counts)
CREATE TABLE IF NOT EXISTS mobile_app_users (
  company_id           VARCHAR(2)   NOT NULL,
  external_employee_id VARCHAR(100) NOT NULL,
  employee_name        VARCHAR(100) NULL,
  first_seen_at        TIMESTAMP(6) NOT NULL DEFAULT now(),
  last_seen_at         TIMESTAMP(6) NOT NULL DEFAULT now(),
  CONSTRAINT pk_mobile_app_users PRIMARY KEY (company_id, external_employee_id),
  CONSTRAINT fk_mobile_app_users_company FOREIGN KEY (company_id) REFERENCES usm_company (id) ON DELETE CASCADE
);
