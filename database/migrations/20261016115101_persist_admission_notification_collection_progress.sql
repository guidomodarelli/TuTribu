-- One bounded private checkpoint per live tribe; the latest receipt is not dispatch authority.
CREATE TABLE public.admission_notification_collection_progress (
  tribe_id uuid PRIMARY KEY REFERENCES public.tribes(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 0,
  through_at timestamptz,
  after_created_at timestamptz,
  after_obligation_id uuid,
  after_recipient_user_id text,
  after_audience text,
  last_operation_id uuid,
  last_completed_at timestamptz,
  last_sweep_completed_at timestamptz,
  examined integer NOT NULL DEFAULT 0,
  collected integer NOT NULL DEFAULT 0,
  existing integer NOT NULL DEFAULT 0,
  suppressed integer NOT NULL DEFAULT 0,
  unavailable integer NOT NULL DEFAULT 0,
  bucket_closed integer NOT NULL DEFAULT 0,
  sweep_complete boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT admission_notification_collection_progress_version_check CHECK(version>=0),
  CONSTRAINT admission_notification_collection_progress_counts_check CHECK(
    examined BETWEEN 0 AND 25 AND collected>=0 AND existing>=0 AND suppressed>=0
    AND unavailable>=0 AND bucket_closed>=0 AND examined=collected+existing+suppressed+unavailable+bucket_closed),
  CONSTRAINT admission_notification_collection_progress_receipt_check CHECK(
    (version=0 AND last_operation_id IS NULL AND last_completed_at IS NULL AND last_sweep_completed_at IS NULL
      AND examined=0 AND NOT sweep_complete)
    OR (version>0 AND last_operation_id IS NOT NULL AND last_completed_at IS NOT NULL
      AND (last_sweep_completed_at IS NULL OR last_sweep_completed_at<=last_completed_at)
      AND (NOT sweep_complete OR last_sweep_completed_at IS NOT NULL AND last_sweep_completed_at=last_completed_at))),
  CONSTRAINT admission_notification_collection_progress_cursor_check CHECK(
    ((version=0 OR sweep_complete) AND num_nonnulls(through_at,after_created_at,after_obligation_id,after_recipient_user_id,after_audience)=0)
    OR (version>0 AND NOT sweep_complete AND num_nonnulls(through_at,after_created_at,after_obligation_id,after_recipient_user_id,after_audience)=5
      AND after_created_at<=through_at AND after_created_at>through_at-interval '24 hours')),
  CONSTRAINT admission_notification_collection_progress_audience_check CHECK(after_audience IS NULL OR after_audience IN ('applicant','reviewer')),
  CONSTRAINT admission_notification_collection_progress_clock_check CHECK(
    isfinite(created_at) AND abs(extract(epoch FROM created_at)*1000000)<=9007199254740991
    AND (through_at IS NULL OR isfinite(through_at) AND abs(extract(epoch FROM through_at)*1000000)<=9007199254740991)
    AND (after_created_at IS NULL OR isfinite(after_created_at) AND abs(extract(epoch FROM after_created_at)*1000000)<=9007199254740991)
    AND (last_completed_at IS NULL OR isfinite(last_completed_at) AND abs(extract(epoch FROM last_completed_at)*1000000)<=9007199254740991)
    AND (last_sweep_completed_at IS NULL OR isfinite(last_sweep_completed_at) AND abs(extract(epoch FROM last_sweep_completed_at)*1000000)<=9007199254740991))
);
ALTER TABLE public.admission_notification_collection_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admission_notification_collection_progress FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.admission_notification_collection_progress FROM PUBLIC;
CREATE POLICY admission_notification_collection_progress_owner ON public.admission_notification_collection_progress FOR ALL
  USING(current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.admission_notification_collection_progress'::regclass))
  WITH CHECK(current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.admission_notification_collection_progress'::regclass));

CREATE FUNCTION public.guard_admission_notification_collection_progress()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE observed_at timestamptz;
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.version<>0 THEN RAISE EXCEPTION 'admission notification progress must start at its initial version' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF ROW(NEW.tribe_id,NEW.created_at) IS DISTINCT FROM ROW(OLD.tribe_id,OLD.created_at)
    OR NEW.version<>OLD.version+1 OR NEW.last_operation_id IS NOT DISTINCT FROM OLD.last_operation_id THEN
    RAISE EXCEPTION 'admission notification progress requires a new scoped page and one version increment' USING ERRCODE='23514';
  END IF;
  observed_at=clock_timestamp();
  IF NEW.through_at IS NOT NULL AND (NEW.through_at>observed_at
    OR OLD.through_at IS NOT NULL AND (NEW.through_at<>OLD.through_at
      OR ROW(NEW.after_created_at,NEW.after_obligation_id,NEW.after_recipient_user_id,NEW.after_audience)
        <=ROW(OLD.after_created_at,OLD.after_obligation_id,OLD.after_recipient_user_id,OLD.after_audience))) THEN
    RAISE EXCEPTION 'admission notification progress cannot change or rewind an open source sweep' USING ERRCODE='23514';
  END IF;
  NEW.last_completed_at=observed_at;
  NEW.last_sweep_completed_at=CASE WHEN NEW.sweep_complete THEN observed_at ELSE OLD.last_sweep_completed_at END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_admission_notification_collection_progress() FROM PUBLIC;
CREATE TRIGGER admission_notification_collection_progress_guard BEFORE INSERT OR UPDATE ON public.admission_notification_collection_progress
  FOR EACH ROW EXECUTE FUNCTION public.guard_admission_notification_collection_progress();
