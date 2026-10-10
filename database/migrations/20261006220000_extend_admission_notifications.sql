-- Admission notices remain tied to their original obligation and tenant.
-- This storage foundation does not decide admissions or dispatch external mail.
ALTER TABLE public.academy_admission_notification_obligations
  ADD CONSTRAINT admission_obligation_tenant_key UNIQUE(id,tribe_id);

ALTER TABLE public.notifications
  ADD COLUMN admission_obligation_id uuid,
  ADD COLUMN admission_audience text,
  ADD CONSTRAINT notifications_admission_obligation_fkey
    FOREIGN KEY(admission_obligation_id,tribe_id)
    REFERENCES public.academy_admission_notification_obligations(id,tribe_id) ON DELETE CASCADE;

ALTER TABLE public.notifications DROP CONSTRAINT notifications_valid_type;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_valid_type CHECK(type IN (
  'event_reminder_24h','event_reminder_15m','event_waitlist_promoted','event_proposal_reviewed',
  'event_occurrence_cancelled','event_occurrence_moved','event_recording_available',
  'admission_pending_created','admission_approved','admission_rejected',
  'admission_cancelled','admission_expired','admission_reminder'
));
ALTER TABLE public.notifications ADD CONSTRAINT notifications_admission_scope_check CHECK (
  (type IN ('admission_pending_created','admission_approved','admission_rejected',
    'admission_cancelled','admission_expired','admission_reminder')
    AND admission_obligation_id IS NOT NULL AND admission_audience IS NOT NULL
    AND admission_audience IN ('applicant','reviewer') AND payload='{}'::jsonb)
  OR (type NOT IN ('admission_pending_created','admission_approved','admission_rejected',
    'admission_cancelled','admission_expired','admission_reminder')
    AND admission_obligation_id IS NULL AND admission_audience IS NULL)
);
CREATE UNIQUE INDEX notifications_admission_recipient_key
  ON public.notifications(admission_obligation_id,recipient_user_id)
  WHERE admission_obligation_id IS NOT NULL;

-- A materialized obligation cannot be reassigned to another event or request.
CREATE FUNCTION public.guard_admission_notification_obligation_identity()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF ROW(NEW.id,NEW.tribe_id,NEW.request_id,NEW.applicant_user_id,NEW.event_type,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.tribe_id,OLD.request_id,OLD.applicant_user_id,OLD.event_type,OLD.created_at) THEN
    RAISE EXCEPTION 'admission notification obligation identity is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_admission_notification_obligation_identity() FROM PUBLIC;
CREATE TRIGGER admission_notification_obligation_identity_guard
  BEFORE UPDATE ON public.academy_admission_notification_obligations
  FOR EACH ROW EXECUTE FUNCTION public.guard_admission_notification_obligation_identity();

-- Validate identities owned by this database, including privileged direct writes.
-- Recipient read-state updates do not re-authorize the historical producer.
CREATE FUNCTION public.guard_admission_notification_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE obligation public.academy_admission_notification_obligations%ROWTYPE;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF (OLD.admission_obligation_id IS NOT NULL OR NEW.admission_obligation_id IS NOT NULL)
      AND ROW(NEW.id,NEW.recipient_user_id,NEW.tribe_id,NEW.type,NEW.payload,NEW.dedupe_key,
        NEW.admission_obligation_id,NEW.admission_audience,NEW.created_at)
      IS DISTINCT FROM ROW(OLD.id,OLD.recipient_user_id,OLD.tribe_id,OLD.type,OLD.payload,OLD.dedupe_key,
        OLD.admission_obligation_id,OLD.admission_audience,OLD.created_at) THEN
      RAISE EXCEPTION 'admission notification identity is immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.admission_obligation_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO obligation FROM public.academy_admission_notification_obligations
    WHERE id=NEW.admission_obligation_id AND tribe_id=NEW.tribe_id;
  IF NOT FOUND THEN RETURN NEW; END IF; -- The composite FK reports absent/crossed parents.
  IF NEW.type IS DISTINCT FROM 'admission_'||obligation.event_type
    OR NEW.dedupe_key IS DISTINCT FROM 'admission:'||obligation.id::text
    OR (NEW.admission_audience='applicant' AND NEW.recipient_user_id<>obligation.applicant_user_id) THEN
    RAISE EXCEPTION 'admission notification source or recipient does not match its obligation' USING ERRCODE='23514';
  END IF;
  IF NEW.admission_audience='reviewer' THEN
    PERFORM id FROM public.tribes WHERE id=obligation.tribe_id FOR SHARE;
    PERFORM id FROM public.tribe_members WHERE tribe_id=obligation.tribe_id
      AND user_id=NEW.recipient_user_id AND role IN ('leader','guardian') AND status='active' FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'admission notification recipient is not a current reviewer' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_admission_notification_identity() FROM PUBLIC;
CREATE TRIGGER admission_notification_identity_guard BEFORE INSERT OR UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.guard_admission_notification_identity();

-- A boolean visibility projection for the current actor; no contact or request
-- fields are returned. Runtime repositories must repeat recipient/visibility
-- predicates because an inherited runtime role may bypass RLS.
CREATE FUNCTION public.can_read_admission_notification(p_obligation_id uuid,p_audience text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.academy_admission_notification_obligations obligation
    JOIN public.academy_admission_requests request
      ON request.id=obligation.request_id AND request.tribe_id=obligation.tribe_id
      AND request.user_id=obligation.applicant_user_id
    WHERE obligation.id=p_obligation_id AND (
      (p_audience='applicant' AND request.user_id=public.current_app_user_id())
      OR (p_audience='reviewer' AND EXISTS (
        SELECT 1 FROM public.tribe_members member WHERE member.tribe_id=request.tribe_id
          AND member.user_id=public.current_app_user_id()
          AND member.role IN ('leader','guardian') AND member.status='active'
      ))
    )
  );
$$;
REVOKE ALL ON FUNCTION public.can_read_admission_notification(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_admission_notification(uuid,text) TO PUBLIC;

DROP POLICY "Recipients can read own notifications" ON public.notifications;
CREATE POLICY "Recipients can read own notifications" ON public.notifications FOR SELECT USING (
  recipient_user_id=public.current_app_user_id() AND CASE
    WHEN admission_obligation_id IS NOT NULL THEN
      public.can_read_admission_notification(admission_obligation_id,admission_audience)
    ELSE public.can_read_tribe_content(tribe_id)
  END
);
DROP POLICY "Recipients can mark own notifications as read" ON public.notifications;
CREATE POLICY "Recipients can mark own notifications as read" ON public.notifications FOR UPDATE USING (
  recipient_user_id=public.current_app_user_id() AND CASE
    WHEN admission_obligation_id IS NOT NULL THEN
      public.can_read_admission_notification(admission_obligation_id,admission_audience)
    ELSE public.can_read_tribe_content(tribe_id)
  END
) WITH CHECK (
  recipient_user_id=public.current_app_user_id() AND CASE
    WHEN admission_obligation_id IS NOT NULL THEN
      public.can_read_admission_notification(admission_obligation_id,admission_audience)
    ELSE public.can_read_tribe_content(tribe_id)
  END
);

-- Called only inside the authorized source transaction. Locks follow tribe,
-- reviewer, request and obligation order. Replays never rewrite read state.
CREATE FUNCTION public.enqueue_admission_notification(p_obligation_id uuid,p_recipient_user_id text,p_audience text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE obligation public.academy_admission_notification_obligations%ROWTYPE; inserted_count integer;
BEGIN
  IF p_audience IS NULL OR p_audience NOT IN ('applicant','reviewer') OR p_recipient_user_id IS NULL THEN
    RAISE EXCEPTION 'admission notification audience is unavailable' USING ERRCODE='23514';
  END IF;
  SELECT * INTO obligation FROM public.academy_admission_notification_obligations WHERE id=p_obligation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'admission notification obligation is unavailable' USING ERRCODE='23503'; END IF;
  PERFORM id FROM public.tribes WHERE id=obligation.tribe_id FOR SHARE;
  IF p_audience='reviewer' THEN
    PERFORM id FROM public.tribe_members WHERE tribe_id=obligation.tribe_id
      AND user_id=p_recipient_user_id AND role IN ('leader','guardian') AND status='active' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'admission notification recipient is not a current reviewer' USING ERRCODE='42501'; END IF;
  ELSIF p_recipient_user_id<>obligation.applicant_user_id THEN
    RAISE EXCEPTION 'admission notification applicant does not own the request' USING ERRCODE='42501';
  END IF;
  PERFORM id FROM public.academy_admission_requests WHERE id=obligation.request_id
    AND tribe_id=obligation.tribe_id AND user_id=obligation.applicant_user_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'admission notification request is unavailable' USING ERRCODE='23503'; END IF;
  SELECT * INTO obligation FROM public.academy_admission_notification_obligations WHERE id=p_obligation_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'admission notification obligation is unavailable' USING ERRCODE='23503'; END IF;
  INSERT INTO public.notifications(recipient_user_id,tribe_id,type,payload,dedupe_key,admission_obligation_id,admission_audience)
    VALUES(p_recipient_user_id,obligation.tribe_id,'admission_'||obligation.event_type,'{}'::jsonb,
      'admission:'||obligation.id::text,obligation.id,p_audience)
    ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted_count=ROW_COUNT;
  RETURN inserted_count>0;
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_admission_notification(uuid,text,text) FROM PUBLIC;
