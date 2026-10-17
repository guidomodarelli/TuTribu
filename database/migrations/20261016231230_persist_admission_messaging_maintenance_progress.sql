-- One bounded private current workflow, independent of optional message credentials.
CREATE TABLE public.admission_messaging_maintenance_progress (
  scope text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  run_id uuid NOT NULL,
  state text NOT NULL DEFAULT 'running',
  external_environment text,
  external_security_epoch text,
  first_phase integer NOT NULL DEFAULT 0,
  next_phase integer NOT NULL DEFAULT 1,
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deadline_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '45 seconds',
  lease_until timestamptz NOT NULL DEFAULT clock_timestamp()+interval '90 seconds',
  finished_at timestamptz,
  last_successful_at timestamptz,
  deadline_reached boolean NOT NULL DEFAULT false,
  phases jsonb NOT NULL,
  CONSTRAINT admission_messaging_maintenance_scope_check CHECK(scope='admission_messaging'),
  CONSTRAINT admission_messaging_maintenance_version_check CHECK(version>0),
  CONSTRAINT admission_messaging_maintenance_state_check CHECK(state IN ('running','completed','incomplete')),
  CONSTRAINT admission_messaging_maintenance_external_scope_check CHECK(
    num_nonnulls(external_environment,external_security_epoch)=0 OR
    num_nonnulls(external_environment,external_security_epoch)=2 AND length(btrim(external_environment))>0 AND length(btrim(external_security_epoch))>0),
  CONSTRAINT admission_messaging_maintenance_phase_check CHECK(
    first_phase BETWEEN 0 AND 6 AND next_phase BETWEEN 0 AND 6
    AND jsonb_typeof(phases)='array' AND jsonb_array_length(phases)=7
    AND phases @> '[{"phase":"expire_requests"},{"phase":"purge_admission"},{"phase":"purge_messaging"},{"phase":"materialize_reminders"},{"phase":"prepare_notifications"},{"phase":"dispatch_outbox"},{"phase":"reconcile_leases"}]'::jsonb),
  CONSTRAINT admission_messaging_maintenance_receipt_check CHECK(
    (state='running')=(finished_at IS NULL) AND deadline_at>=started_at AND deadline_at<=started_at+interval '45 seconds'
    AND lease_until=started_at+interval '90 seconds' AND (finished_at IS NULL OR finished_at>=started_at)
    AND (last_successful_at IS NULL OR last_successful_at<=coalesce(finished_at,started_at))),
  CONSTRAINT admission_messaging_maintenance_clock_check CHECK(
    isfinite(started_at) AND isfinite(deadline_at) AND isfinite(lease_until)
    AND abs(extract(epoch FROM started_at)*1000000)<=9007199254740991
    AND abs(extract(epoch FROM deadline_at)*1000000)<=9007199254740991
    AND abs(extract(epoch FROM lease_until)*1000000)<=9007199254740991
    AND (finished_at IS NULL OR isfinite(finished_at) AND abs(extract(epoch FROM finished_at)*1000000)<=9007199254740991)
    AND (last_successful_at IS NULL OR isfinite(last_successful_at) AND abs(extract(epoch FROM last_successful_at)*1000000)<=9007199254740991))
);
ALTER TABLE public.admission_messaging_maintenance_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admission_messaging_maintenance_progress FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.admission_messaging_maintenance_progress FROM PUBLIC;
CREATE POLICY admission_messaging_maintenance_owner ON public.admission_messaging_maintenance_progress FOR ALL
  USING(current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.admission_messaging_maintenance_progress'::regclass))
  WITH CHECK(current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.admission_messaging_maintenance_progress'::regclass));

CREATE FUNCTION public.guard_admission_messaging_maintenance_progress()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE observed_at timestamptz=clock_timestamp();
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.version<>1 OR NEW.state<>'running' THEN
      RAISE EXCEPTION 'admission maintenance must begin with its original running version' USING ERRCODE='23514';
    END IF;
    NEW.first_phase=0;
    NEW.next_phase=1;
    NEW.started_at=observed_at;
    NEW.deadline_at=observed_at+interval '45 seconds';
    NEW.lease_until=observed_at+interval '90 seconds';
    NEW.finished_at=NULL;
    NEW.last_successful_at=NULL;
    NEW.deadline_reached=false;
    RETURN NEW;
  END IF;
  IF NEW.scope<>OLD.scope OR NEW.version<>OLD.version+1 THEN
    RAISE EXCEPTION 'admission maintenance observation requires its original scope and one version increment' USING ERRCODE='23514';
  END IF;
  IF NEW.run_id<>OLD.run_id THEN
    IF NEW.state<>'running' OR OLD.state='running' AND OLD.lease_until>observed_at
      AND ROW(NEW.external_environment,NEW.external_security_epoch) IS NOT DISTINCT FROM ROW(OLD.external_environment,OLD.external_security_epoch) THEN
      RAISE EXCEPTION 'admission maintenance original is still leased' USING ERRCODE='23514';
    END IF;
    NEW.first_phase=OLD.next_phase;
    NEW.next_phase=(OLD.next_phase+1)%7;
    NEW.started_at=observed_at;
    NEW.deadline_at=observed_at+interval '45 seconds';
    NEW.lease_until=observed_at+interval '90 seconds';
    NEW.finished_at=NULL;
    NEW.deadline_reached=false;
    NEW.last_successful_at=CASE WHEN ROW(NEW.external_environment,NEW.external_security_epoch) IS NOT DISTINCT FROM ROW(OLD.external_environment,OLD.external_security_epoch) THEN OLD.last_successful_at ELSE NULL END;
    RETURN NEW;
  END IF;
  IF ROW(NEW.external_environment,NEW.external_security_epoch,NEW.started_at,NEW.lease_until,NEW.first_phase,NEW.next_phase)
      IS DISTINCT FROM ROW(OLD.external_environment,OLD.external_security_epoch,OLD.started_at,OLD.lease_until,OLD.first_phase,OLD.next_phase)
    OR NEW.deadline_at>OLD.deadline_at OR OLD.state='completed' THEN
    RAISE EXCEPTION 'admission maintenance cannot replace the original lease, turn or completed observation' USING ERRCODE='23514';
  END IF;
  NEW.deadline_reached=OLD.deadline_reached OR NEW.deadline_reached OR observed_at>=NEW.deadline_at
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.phases) phase WHERE phase->'late'='true'::jsonb);
  IF OLD.state='incomplete' THEN
    IF NEW.state<>'incomplete' THEN RAISE EXCEPTION 'late admission maintenance cannot become a successful new run' USING ERRCODE='23514'; END IF;
    NEW.finished_at=OLD.finished_at;
    NEW.last_successful_at=OLD.last_successful_at;
  ELSIF NEW.state='running' THEN
    NEW.finished_at=NULL;
    NEW.last_successful_at=OLD.last_successful_at;
  ELSE
    NEW.finished_at=observed_at;
    IF NEW.deadline_reached OR EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.phases) phase WHERE phase->>'status' IS DISTINCT FROM 'completed' OR phase->>'observation' IS DISTINCT FROM 'recorded') THEN
      NEW.state='incomplete';
    END IF;
    NEW.last_successful_at=CASE WHEN NEW.state='completed' THEN observed_at ELSE OLD.last_successful_at END;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_admission_messaging_maintenance_progress() FROM PUBLIC;
CREATE TRIGGER admission_messaging_maintenance_progress_guard BEFORE INSERT OR UPDATE ON public.admission_messaging_maintenance_progress
  FOR EACH ROW EXECUTE FUNCTION public.guard_admission_messaging_maintenance_progress();

-- Native queue age reads a single indexed oldest queued original, without counting the entire queue.
CREATE INDEX messaging_delivery_queued_age_idx ON public.message_deliveries(created_at,id) WHERE state='queued';
