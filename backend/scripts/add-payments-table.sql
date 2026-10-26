-- Payment history. Run ONCE in the Supabase SQL editor (safe to re-run).
-- Rows are written by the payment gateway's webhook later; nothing is entered by hand.
CREATE TABLE IF NOT EXISTS payments (
  id           BIGSERIAL     PRIMARY KEY,
  company_id   VARCHAR(2)    NOT NULL,
  plan_name    VARCHAR(100)  NULL,
  amount       NUMERIC(12,2) NOT NULL,
  currency     VARCHAR(3)    NOT NULL,
  status       VARCHAR(10)   NOT NULL,
  method       VARCHAR(50)   NULL,
  provider     VARCHAR(50)   NULL,
  reference    VARCHAR(120)  NULL,
  period_start TIMESTAMP(6)  NULL,
  period_end   TIMESTAMP(6)  NULL,
  paid_at      TIMESTAMP(6)  NULL,
  created_at   TIMESTAMP(6)  NOT NULL DEFAULT now(),
  CONSTRAINT fk_payments_company FOREIGN KEY (company_id) REFERENCES usm_company (id) ON DELETE CASCADE,
  CONSTRAINT ck_payments_status CHECK (status IN ('PAID','PENDING','FAILED','REFUNDED')),
  CONSTRAINT ck_payments_amount CHECK (amount >= 0)
);
CREATE INDEX IF NOT EXISTS ix_payments_company_created ON payments (company_id, created_at DESC);
