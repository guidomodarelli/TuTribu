-- Retain native claimed/focal scopes independently of temporary deliveries or deleted accounts.
CREATE TABLE public.messaging_dispatch_runs (
  run_id uuid NOT NULL,
  tribe_id uuid NOT NULL,
  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL,
  outcome text NOT NULL CHECK(outcome IN ('completed','incomplete')),
  counters jsonb NOT NULL CHECK(jsonb_typeof(counters)='object'),
  PRIMARY KEY(run_id,tribe_id),
  CHECK(finished_at>=started_at)
);
CREATE INDEX messaging_dispatch_run_history_idx ON public.messaging_dispatch_runs(tribe_id,finished_at DESC);
ALTER TABLE public.messaging_dispatch_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messaging_dispatch_runs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.messaging_dispatch_runs FROM PUBLIC;
CREATE POLICY messaging_dispatch_run_owner ON public.messaging_dispatch_runs FOR ALL
  USING(current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.messaging_dispatch_runs'::regclass))
  WITH CHECK(current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.messaging_dispatch_runs'::regclass));

CREATE TABLE public.messaging_dispatch_phase_samples (
  sample_id uuid NOT NULL,
  run_id uuid NOT NULL,
  tribe_id uuid NOT NULL,
  phase text NOT NULL CHECK(phase IN ('claim','authorize','prepare','send','complete','late','defer')),
  duration_ms bigint NOT NULL CHECK(duration_ms>=0 AND duration_ms<=9007199254740991),
  PRIMARY KEY(sample_id,tribe_id),
  FOREIGN KEY(run_id,tribe_id) REFERENCES public.messaging_dispatch_runs(run_id,tribe_id) ON DELETE CASCADE
);
CREATE INDEX messaging_dispatch_phase_scope_idx ON public.messaging_dispatch_phase_samples(tribe_id,phase);
ALTER TABLE public.messaging_dispatch_phase_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messaging_dispatch_phase_samples FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.messaging_dispatch_phase_samples FROM PUBLIC;
CREATE POLICY messaging_dispatch_phase_owner ON public.messaging_dispatch_phase_samples FOR ALL
  USING(current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.messaging_dispatch_phase_samples'::regclass))
  WITH CHECK(current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.messaging_dispatch_phase_samples'::regclass));
