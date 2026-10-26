-- Applies only to the exact disposable parent before its restore copy is frozen.
CREATE SCHEMA IF NOT EXISTS native_test_support;

CREATE TABLE native_test_support.messaging_restore_phases (
  id uuid PRIMARY KEY,
  cohort_id uuid NOT NULL,
  expected_branch text NOT NULL,
  phase text NOT NULL CHECK (phase IN ('baseline', 'locked', 'locked_original', 'epoch', 'retired_key', 'reconcile', 'reopen')),
  state text NOT NULL DEFAULT 'prepared' CHECK (state IN ('prepared', 'running', 'completed', 'failed')),
  work_runs integer NOT NULL DEFAULT 0 CHECK (work_runs >= 0),
  cipher_operations integer CHECK (cipher_operations >= 0),
  checked_rejections integer CHECK (checked_rejections >= 0),
  provider_requests integer CHECK (provider_requests >= 0),
  invitation_round_trip boolean,
  runtime_version text,
  source_commit text,
  bundle_sha256 text,
  failure_code text,
  started_at timestamptz,
  completed_at timestamptz,
  UNIQUE (cohort_id, phase)
);
