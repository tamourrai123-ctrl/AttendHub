-- Global endpoints: Super Admin defines them once; every Company Admin can pick them when adding an endpoint.
-- Run once in the Supabase SQL Editor. Safe to run twice.
CREATE TABLE IF NOT EXISTS global_endpoint (
  id            BIGSERIAL PRIMARY KEY,
  name          VARCHAR(60)  NOT NULL,
  label         VARCHAR(100) NOT NULL,
  description   VARCHAR(255),
  direction     CHAR(1)      NOT NULL,                 -- 'I' inbound (reads from HR), 'O' outbound (sends to HR)
  http_method   VARCHAR(10)  NOT NULL DEFAULT 'GET',
  fields        JSONB        NOT NULL DEFAULT '[]'::jsonb,  -- optional AttendHub-side fields: [{"field":"x","label":"X"}]
  callable_by   CHAR(1)      NOT NULL DEFAULT 'A',     -- 'A' company admin only, 'E' admin and employees
  status        CHAR(1)      NOT NULL DEFAULT 'Y',     -- 'Y' active, 'N' disabled
  created_by    VARCHAR(100),
  created_at    TIMESTAMP(6) NOT NULL DEFAULT now(),
  updated_at    TIMESTAMP(6) NOT NULL DEFAULT now(),
  CONSTRAINT uq_global_endpoint_name UNIQUE (name),
  CONSTRAINT ck_global_endpoint_direction CHECK (direction IN ('I','O')),
  CONSTRAINT ck_global_endpoint_method CHECK (http_method IN ('GET','POST','PUT','PATCH','DELETE')),
  CONSTRAINT ck_global_endpoint_callable_by CHECK (callable_by IN ('A','E')),
  CONSTRAINT ck_global_endpoint_status CHECK (status IN ('Y','N'))
);
