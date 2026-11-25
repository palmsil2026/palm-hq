CREATE TABLE finance_runs (
  scheduled_at TEXT PRIMARY KEY NOT NULL,
  business_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('checked', 'check_failed')),
  cash_payments_checked INTEGER,
  remits_checked INTEGER,
  findings_json TEXT,
  failure_code TEXT,
  CHECK (
    (status = 'checked' AND cash_payments_checked >= 0 AND remits_checked >= 0
      AND cash_payments_checked IS NOT NULL AND remits_checked IS NOT NULL
      AND findings_json IS NOT NULL AND json_valid(findings_json) AND failure_code IS NULL)
    OR
    (status = 'check_failed' AND cash_payments_checked IS NULL AND remits_checked IS NULL
      AND findings_json IS NULL AND failure_code IS NOT NULL)
  )
) STRICT;
