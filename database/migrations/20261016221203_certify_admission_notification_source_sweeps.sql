-- A completion clock is not a proof that every original source through a window was examined.
-- Existing partial sweeps remain uncertified until a new complete, available sweep finishes.
ALTER TABLE public.admission_notification_collection_progress
  ADD COLUMN last_page_through_at timestamptz,
  ADD COLUMN last_certified_through_at timestamptz,
  ADD COLUMN sweep_had_unavailable boolean NOT NULL DEFAULT true,
  ADD COLUMN page_had_unavailable boolean NOT NULL DEFAULT true,
  ADD CONSTRAINT admission_notification_collection_progress_certification_check CHECK (
    (last_page_through_at IS NULL OR isfinite(last_page_through_at)
      AND abs(extract(epoch FROM last_page_through_at)*1000000)<=9007199254740991
      AND last_page_through_at<=last_completed_at)
    AND (last_certified_through_at IS NULL OR isfinite(last_certified_through_at)
      AND abs(extract(epoch FROM last_certified_through_at)*1000000)<=9007199254740991
      AND last_page_through_at IS NOT NULL AND last_certified_through_at<=last_page_through_at)
  );

CREATE OR REPLACE FUNCTION public.guard_admission_notification_collection_progress()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE observed_at timestamptz;
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
  IF NEW.last_page_through_at IS NULL OR NEW.last_page_through_at>observed_at
    OR OLD.last_page_through_at IS NOT NULL AND NEW.last_page_through_at<OLD.last_page_through_at
    OR OLD.through_at IS NOT NULL AND NEW.last_page_through_at<>OLD.through_at
    OR NEW.through_at IS NOT NULL AND (NEW.through_at<>NEW.last_page_through_at OR NEW.through_at>observed_at
      OR OLD.through_at IS NOT NULL AND (NEW.through_at<>OLD.through_at
        OR ROW(NEW.after_created_at,NEW.after_obligation_id,NEW.after_recipient_user_id,NEW.after_audience)
          <=ROW(OLD.after_created_at,OLD.after_obligation_id,OLD.after_recipient_user_id,OLD.after_audience))) THEN
    RAISE EXCEPTION 'admission notification progress cannot change or rewind its original source cutoff' USING ERRCODE='23514';
  END IF;
  NEW.sweep_had_unavailable=(CASE WHEN OLD.through_at IS NOT NULL THEN OLD.sweep_had_unavailable ELSE false END) OR NEW.page_had_unavailable OR NEW.unavailable>0;
  NEW.last_certified_through_at=CASE WHEN NEW.sweep_complete AND NOT NEW.sweep_had_unavailable
    THEN NEW.last_page_through_at ELSE OLD.last_certified_through_at END;
  NEW.last_completed_at=observed_at;
  NEW.last_sweep_completed_at=CASE WHEN NEW.sweep_complete THEN observed_at ELSE OLD.last_sweep_completed_at END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_admission_notification_collection_progress() FROM PUBLIC;
