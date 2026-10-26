-- Incremental certification: a sweep no longer re-examines every 24-hour source.
-- after_* is now a monotonic frontier kept across sweeps; through_at is the horizon of the open sweep only.
-- Each sweep reads the sources after the frontier up to its horizon, plus the pending retries of sources that were unavailable,
-- and certifies its horizon only up to the oldest pending retry. The horizon is read while the sweep holds the tribe row
-- FOR UPDATE, which conflicts with the FOR SHARE/FOR UPDATE that every source creator holds before choosing created_at,
-- so no source can commit behind a horizon already read. A trigger still queues any such late source as a retry.

-- Retries of sources whose collection was unavailable; they are examined again once per later sweep.
CREATE TABLE public.admission_notification_collection_retries (
  notification_id uuid PRIMARY KEY REFERENCES public.notifications(id) ON DELETE CASCADE,
  tribe_id uuid NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  source_created_at timestamptz NOT NULL,
  retried_through_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT admission_notification_collection_retries_clock_check CHECK(
    isfinite(source_created_at) AND abs(extract(epoch FROM source_created_at)*1000000)<=9007199254740991
    AND isfinite(retried_through_at) AND abs(extract(epoch FROM retried_through_at)*1000000)<=9007199254740991
    AND isfinite(created_at) AND abs(extract(epoch FROM created_at)*1000000)<=9007199254740991)
);
CREATE INDEX admission_notification_collection_retries_position_idx
  ON public.admission_notification_collection_retries(tribe_id,source_created_at,notification_id);
ALTER TABLE public.admission_notification_collection_retries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admission_notification_collection_retries FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.admission_notification_collection_retries FROM PUBLIC;
CREATE POLICY admission_notification_collection_retries_owner ON public.admission_notification_collection_retries FOR ALL
  USING(current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.admission_notification_collection_retries'::regclass))
  WITH CHECK(current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.admission_notification_collection_retries'::regclass));

-- Earlier checkpoints may have examined unavailable sources without recording a retry, so every tribe restarts once
-- with a full 24-hour sweep. The row is derived state: the next page recreates it at version 0.
DELETE FROM public.admission_notification_collection_progress;

ALTER TABLE public.admission_notification_collection_progress
  DROP CONSTRAINT admission_notification_collection_progress_cursor_check,
  ADD CONSTRAINT admission_notification_collection_progress_cursor_check CHECK(
    (version=0 AND num_nonnulls(through_at,after_created_at,after_obligation_id,after_recipient_user_id,after_audience)=0)
    OR (version>0 AND num_nonnulls(after_created_at,after_obligation_id,after_recipient_user_id,after_audience) IN (0,4)
      AND sweep_complete=(through_at IS NULL)
      AND (through_at IS NULL OR after_created_at IS NULL OR after_created_at<=through_at)));

CREATE OR REPLACE FUNCTION public.guard_admission_notification_collection_progress()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE observed_at timestamptz; oldest_retry timestamptz; certified timestamptz;
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.version<>0 OR NEW.last_page_through_at IS NOT NULL OR NEW.last_certified_through_at IS NOT NULL THEN
      RAISE EXCEPTION 'admission notification progress must start without a certified sweep' USING ERRCODE='23514';
    END IF;
    NEW.sweep_had_unavailable=true;
    RETURN NEW;
  END IF;
  IF ROW(NEW.tribe_id,NEW.created_at) IS DISTINCT FROM ROW(OLD.tribe_id,OLD.created_at)
    OR NEW.version<>OLD.version+1 OR NEW.last_operation_id IS NOT DISTINCT FROM OLD.last_operation_id THEN
    RAISE EXCEPTION 'admission notification progress requires a new scoped page and one version increment' USING ERRCODE='23514';
  END IF;
  observed_at=clock_timestamp();
  -- An open sweep keeps its horizon; a new sweep never moves it back; the frontier never rewinds or disappears.
  IF NEW.last_page_through_at IS NULL OR NEW.last_page_through_at>observed_at
    OR OLD.last_page_through_at IS NOT NULL AND NEW.last_page_through_at<OLD.last_page_through_at
    OR OLD.through_at IS NOT NULL AND NEW.last_page_through_at<>OLD.through_at
    OR NEW.through_at IS NOT NULL AND NEW.through_at<>NEW.last_page_through_at
    OR NEW.after_created_at IS NOT NULL AND NEW.after_created_at>NEW.last_page_through_at
    OR OLD.after_created_at IS NOT NULL AND (NEW.after_created_at IS NULL
      OR ROW(NEW.after_created_at,NEW.after_obligation_id,NEW.after_recipient_user_id,NEW.after_audience)
        <ROW(OLD.after_created_at,OLD.after_obligation_id,OLD.after_recipient_user_id,OLD.after_audience)) THEN
    RAISE EXCEPTION 'admission notification progress cannot change or rewind its source horizon or frontier' USING ERRCODE='23514';
  END IF;
  NEW.sweep_had_unavailable=(CASE WHEN OLD.through_at IS NOT NULL THEN OLD.sweep_had_unavailable ELSE false END) OR NEW.page_had_unavailable OR NEW.unavailable>0;
  IF NEW.sweep_complete THEN
    -- A pending retry keeps its own window and every later one uncertified; older-than-24-hour retries can no longer collect.
    SELECT min(retry.source_created_at) INTO oldest_retry FROM public.admission_notification_collection_retries retry
      WHERE retry.tribe_id=NEW.tribe_id AND retry.source_created_at>observed_at-interval '24 hours';
    certified=CASE WHEN oldest_retry IS NULL OR oldest_retry>NEW.last_page_through_at THEN NEW.last_page_through_at
      ELSE oldest_retry-interval '1 microsecond' END;
    NEW.last_certified_through_at=CASE WHEN OLD.last_certified_through_at IS NULL OR certified>OLD.last_certified_through_at
      THEN certified ELSE OLD.last_certified_through_at END;
  ELSE
    NEW.last_certified_through_at=OLD.last_certified_through_at;
  END IF;
  NEW.last_completed_at=observed_at;
  NEW.last_sweep_completed_at=CASE WHEN NEW.sweep_complete THEN observed_at ELSE OLD.last_sweep_completed_at END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_admission_notification_collection_progress() FROM PUBLIC;

-- Safety net: a notice whose source is not newer than the horizon already read is queued as a retry, so it is examined
-- by the next sweep and holds certification back instead of staying behind the frontier.
CREATE FUNCTION public.queue_late_admission_notification_source()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE source_created timestamptz; horizon timestamptz;
BEGIN
  SELECT progress.last_page_through_at INTO horizon FROM public.admission_notification_collection_progress progress
    WHERE progress.tribe_id=NEW.tribe_id;
  IF horizon IS NULL THEN RETURN NULL; END IF;
  SELECT obligation.created_at INTO source_created FROM public.academy_admission_notification_obligations obligation
    WHERE obligation.id=NEW.admission_obligation_id AND obligation.tribe_id=NEW.tribe_id;
  IF source_created IS NOT NULL AND source_created<=horizon THEN
    INSERT INTO public.admission_notification_collection_retries(notification_id,tribe_id,source_created_at,retried_through_at)
      VALUES(NEW.id,NEW.tribe_id,source_created,source_created-interval '1 microsecond') ON CONFLICT (notification_id) DO NOTHING;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.queue_late_admission_notification_source() FROM PUBLIC;
CREATE TRIGGER admission_notification_late_source_retry AFTER INSERT ON public.notifications
  FOR EACH ROW WHEN (NEW.admission_obligation_id IS NOT NULL) EXECUTE FUNCTION public.queue_late_admission_notification_source();
