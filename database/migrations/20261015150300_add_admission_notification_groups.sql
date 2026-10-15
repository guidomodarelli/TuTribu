-- Private durable buckets. Provider payloads and dispatch authority retain their outbox owner.
CREATE TABLE public.admission_notification_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id uuid NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  recipient_user_id text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  audience text NOT NULL CHECK(audience IN ('applicant','reviewer')),
  mode text NOT NULL CHECK(mode IN ('individual','grouped','daily')),
  preference_version integer NOT NULL CHECK(preference_version>=0),
  email_settings_version integer NOT NULL CHECK(email_settings_version>0),
  time_zone text NOT NULL,
  window_starts_at timestamptz NOT NULL,
  window_closes_at timestamptz NOT NULL,
  individual_obligation_id uuid,
  state text NOT NULL DEFAULT 'open' CHECK(state IN ('open','frozen','suppressed','expired')),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  frozen_manifest jsonb,
  deadline_at timestamptz,
  suppression_reason text,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT admission_notification_group_scope_key UNIQUE(id,tribe_id,recipient_user_id,audience),
  CONSTRAINT admission_notification_group_bucket_key UNIQUE NULLS NOT DISTINCT
    (tribe_id,recipient_user_id,audience,mode,preference_version,email_settings_version,time_zone,window_starts_at,window_closes_at,individual_obligation_id),
  CONSTRAINT admission_notification_group_individual_fkey FOREIGN KEY(individual_obligation_id,tribe_id)
    REFERENCES public.academy_admission_notification_obligations(id,tribe_id) ON DELETE CASCADE,
  CONSTRAINT admission_notification_group_individual_check CHECK((mode='individual')=(individual_obligation_id IS NOT NULL)),
  CONSTRAINT admission_notification_group_applicant_check CHECK(audience<>'applicant' OR (mode='individual' AND preference_version=0)),
  CONSTRAINT admission_notification_group_window_check CHECK(window_closes_at>=window_starts_at),
  CONSTRAINT admission_notification_group_clock_check CHECK(
    isfinite(window_starts_at) AND isfinite(window_closes_at)
    AND abs(extract(epoch FROM window_starts_at)*1000000)<=9007199254740991
    AND abs(extract(epoch FROM window_closes_at)*1000000)<=9007199254740991),
  CONSTRAINT admission_notification_group_manifest_check CHECK((state='frozen')=(frozen_manifest IS NOT NULL AND deadline_at IS NOT NULL)),
  CONSTRAINT admission_notification_group_closed_check CHECK((state='open')=(closed_at IS NULL)),
  CONSTRAINT admission_notification_group_reason_check CHECK(
    (state IN ('suppressed','expired'))=(suppression_reason IS NOT NULL)
    AND (suppression_reason IS NULL OR suppression_reason IN (
      'notification_scope_mismatch','recipient_not_authorized','event_not_current','email_disabled',
      'account_email_untrusted','email_capability_unavailable','event_predates_email_enablement',
      'event_predates_preference','preference_omitted','notification_deadline_expired',
      'deadline_before_preferred_window','notification_window_unavailable')))
);
CREATE INDEX admission_notification_group_due_idx ON public.admission_notification_groups(window_closes_at,id) WHERE state='open';

CREATE TABLE public.admission_notification_group_members (
  group_id uuid NOT NULL,
  tribe_id uuid NOT NULL,
  recipient_user_id text NOT NULL,
  audience text NOT NULL,
  obligation_id uuid NOT NULL,
  deadline_at timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','included','suppressed','expired')),
  suppression_reason text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT admission_notification_group_member_key PRIMARY KEY(obligation_id,recipient_user_id,audience),
  CONSTRAINT admission_notification_group_member_group_fkey FOREIGN KEY(group_id,tribe_id,recipient_user_id,audience)
    REFERENCES public.admission_notification_groups(id,tribe_id,recipient_user_id,audience) ON DELETE CASCADE,
  CONSTRAINT admission_notification_group_member_obligation_fkey FOREIGN KEY(obligation_id,tribe_id)
    REFERENCES public.academy_admission_notification_obligations(id,tribe_id) ON DELETE CASCADE,
  CONSTRAINT admission_notification_group_member_clock_check CHECK(isfinite(deadline_at) AND abs(extract(epoch FROM deadline_at)*1000000)<=9007199254740991),
  CONSTRAINT admission_notification_group_member_resolved_check CHECK((state='pending')=(resolved_at IS NULL)),
  CONSTRAINT admission_notification_group_member_reason_check CHECK(
    (state IN ('suppressed','expired'))=(suppression_reason IS NOT NULL)
    AND (suppression_reason IS NULL OR suppression_reason IN (
      'notification_scope_mismatch','recipient_not_authorized','event_not_current','email_disabled',
      'account_email_untrusted','email_capability_unavailable','event_predates_email_enablement',
      'event_predates_preference','preference_omitted','notification_deadline_expired',
      'deadline_before_preferred_window','notification_window_unavailable')))
);
CREATE INDEX admission_notification_group_member_group_idx ON public.admission_notification_group_members(group_id,obligation_id);

CREATE FUNCTION public.guard_admission_notification_group_member()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE locked_group public.admission_notification_groups%ROWTYPE;
  original_source public.academy_admission_notification_obligations%ROWTYPE;
BEGIN
  SELECT * INTO locked_group FROM public.admission_notification_groups WHERE id=NEW.group_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'admission notification group is unavailable' USING ERRCODE='23503'; END IF;
  IF ROW(NEW.tribe_id,NEW.recipient_user_id,NEW.audience)
    IS DISTINCT FROM ROW(locked_group.tribe_id,locked_group.recipient_user_id,locked_group.audience) THEN
    RAISE EXCEPTION 'admission notification group member scope mismatch' USING ERRCODE='23503';
  END IF;
  IF TG_OP='UPDATE' AND ROW(NEW.group_id,NEW.tribe_id,NEW.recipient_user_id,NEW.audience,NEW.obligation_id,NEW.deadline_at,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.group_id,OLD.tribe_id,OLD.recipient_user_id,OLD.audience,OLD.obligation_id,OLD.deadline_at,OLD.created_at) THEN
    RAISE EXCEPTION 'admission notification group member identity is immutable' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
  IF locked_group.state<>'open' THEN RAISE EXCEPTION 'admission notification group is already closed' USING ERRCODE='23514'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.state<>'pending' OR NEW.resolved_at IS NOT NULL OR NEW.suppression_reason IS NOT NULL THEN
      RAISE EXCEPTION 'admission notification group member must start pending' USING ERRCODE='23514';
    END IF;
    SELECT * INTO original_source FROM public.academy_admission_notification_obligations
      WHERE id=NEW.obligation_id AND tribe_id=NEW.tribe_id FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'admission notification source is unavailable' USING ERRCODE='23503'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.notifications WHERE admission_obligation_id=NEW.obligation_id
      AND tribe_id=NEW.tribe_id AND recipient_user_id=NEW.recipient_user_id AND admission_audience=NEW.audience) THEN
      RAISE EXCEPTION 'admission notification group member has no owned notice' USING ERRCODE='23503';
    END IF;
    IF locked_group.mode='individual' AND locked_group.individual_obligation_id<>NEW.obligation_id THEN
      RAISE EXCEPTION 'admission notification individual source mismatch' USING ERRCODE='23514';
    END IF;
    NEW.deadline_at=original_source.created_at+interval '24 hours';
  ELSE
    IF OLD.state<>'pending' OR NEW.state NOT IN ('included','suppressed','expired') THEN
      RAISE EXCEPTION 'admission notification group member transition is unavailable' USING ERRCODE='23514';
    END IF;
    IF NEW.state='expired' AND NEW.deadline_at>clock_timestamp() THEN
      RAISE EXCEPTION 'admission notification group member deadline has not elapsed' USING ERRCODE='23514';
    END IF;
    NEW.resolved_at=clock_timestamp();
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_admission_notification_group_member() FROM PUBLIC;
CREATE TRIGGER admission_notification_group_member_guard BEFORE INSERT OR UPDATE ON public.admission_notification_group_members
  FOR EACH ROW EXECUTE FUNCTION public.guard_admission_notification_group_member();

CREATE FUNCTION public.guard_admission_notification_group()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE original_source public.academy_admission_notification_obligations%ROWTYPE;
  observed_at timestamptz; expected_manifest jsonb; expected_deadline timestamptz;
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.state<>'open' OR NEW.version<>1 OR NEW.frozen_manifest IS NOT NULL
      OR NEW.deadline_at IS NOT NULL OR NEW.closed_at IS NOT NULL OR NEW.suppression_reason IS NOT NULL THEN
      RAISE EXCEPTION 'admission notification group must start open' USING ERRCODE='23514';
    END IF;
    PERFORM NEW.window_starts_at AT TIME ZONE NEW.time_zone;
    IF NEW.mode='grouped' AND (NEW.window_starts_at<>date_bin(interval '5 minutes',NEW.window_starts_at,timestamptz 'epoch')
      OR NEW.window_closes_at<>NEW.window_starts_at+interval '5 minutes') THEN
      RAISE EXCEPTION 'admission notification grouped window mismatch' USING ERRCODE='23514';
    ELSIF NEW.mode='daily' AND ((NEW.window_starts_at AT TIME ZONE NEW.time_zone)::time<>time '09:00'
      OR NEW.window_closes_at<>(((NEW.window_starts_at AT TIME ZONE NEW.time_zone)+interval '1 day') AT TIME ZONE NEW.time_zone)) THEN
      RAISE EXCEPTION 'admission notification daily window mismatch' USING ERRCODE='23514';
    ELSIF NEW.mode='individual' THEN
      SELECT * INTO original_source FROM public.academy_admission_notification_obligations WHERE id=NEW.individual_obligation_id AND tribe_id=NEW.tribe_id FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'admission notification individual source is unavailable' USING ERRCODE='23503'; END IF;
      IF NEW.window_starts_at<>original_source.created_at OR NEW.window_closes_at<>original_source.created_at
        OR (NEW.audience='applicant' AND NEW.recipient_user_id<>original_source.applicant_user_id) THEN
        RAISE EXCEPTION 'admission notification individual identity mismatch' USING ERRCODE='23514';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.state<>'open' THEN
    IF NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'closed admission notification group is immutable' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF ROW(NEW.id,NEW.tribe_id,NEW.recipient_user_id,NEW.audience,NEW.mode,NEW.preference_version,NEW.email_settings_version,
    NEW.time_zone,NEW.window_starts_at,NEW.window_closes_at,NEW.individual_obligation_id,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.tribe_id,OLD.recipient_user_id,OLD.audience,OLD.mode,OLD.preference_version,OLD.email_settings_version,
    OLD.time_zone,OLD.window_starts_at,OLD.window_closes_at,OLD.individual_obligation_id,OLD.created_at) THEN
    RAISE EXCEPTION 'admission notification group identity is immutable' USING ERRCODE='23514';
  END IF;
  IF NEW.state='open' THEN
    IF NEW.version<>OLD.version OR NEW.frozen_manifest IS NOT NULL OR NEW.deadline_at IS NOT NULL OR NEW.closed_at IS NOT NULL OR NEW.suppression_reason IS NOT NULL THEN
      RAISE EXCEPTION 'admission notification open no-op cannot change its epoch' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'admission notification group close requires one version increment' USING ERRCODE='23514'; END IF;
  PERFORM obligation_id FROM public.admission_notification_group_members WHERE group_id=OLD.id ORDER BY obligation_id FOR UPDATE;
  observed_at=clock_timestamp();
  IF NEW.state='frozen' THEN
    IF observed_at<OLD.window_closes_at THEN RAISE EXCEPTION 'admission notification group window remains open' USING ERRCODE='23514'; END IF;
    SELECT min(group_member.deadline_at),jsonb_build_object('format',1,'identity',jsonb_build_object(
      'tribeId',OLD.tribe_id,'recipientUserId',OLD.recipient_user_id,'audience',OLD.audience,'mode',OLD.mode,
      'preferenceVersion',OLD.preference_version,'emailSettingsVersion',OLD.email_settings_version,
      'individualObligationId',OLD.individual_obligation_id,'window',jsonb_build_object('timeZone',OLD.time_zone,
        'startsAtMicroseconds',(extract(epoch FROM OLD.window_starts_at)*1000000)::bigint,
        'closesAtMicroseconds',(extract(epoch FROM OLD.window_closes_at)*1000000)::bigint)),
      'items',jsonb_agg(jsonb_build_object('obligationId',group_member.obligation_id,'admissionRequestId',obligation.request_id,
        'event',obligation.event_type,'createdAtMicroseconds',(extract(epoch FROM obligation.created_at)*1000000)::bigint,
        'deadlineAtMicroseconds',(extract(epoch FROM group_member.deadline_at)*1000000)::bigint) ORDER BY group_member.obligation_id))
      INTO expected_deadline,expected_manifest FROM public.admission_notification_group_members group_member
      JOIN public.academy_admission_notification_obligations obligation ON obligation.id=group_member.obligation_id AND obligation.tribe_id=group_member.tribe_id
      WHERE group_member.group_id=OLD.id AND group_member.state IN ('pending','included') AND group_member.deadline_at>observed_at;
    IF expected_deadline IS NULL OR NEW.deadline_at IS DISTINCT FROM expected_deadline OR NEW.frozen_manifest IS DISTINCT FROM expected_manifest THEN
      RAISE EXCEPTION 'admission notification frozen manifest or deadline mismatch' USING ERRCODE='23514';
    END IF;
    UPDATE public.admission_notification_group_members SET state='expired',suppression_reason='notification_deadline_expired'
      WHERE group_id=OLD.id AND state='pending' AND deadline_at<=observed_at;
    UPDATE public.admission_notification_group_members SET state='included' WHERE group_id=OLD.id AND state='pending' AND deadline_at>observed_at;
    NEW.suppression_reason=NULL;
  ELSIF NEW.state='expired' THEN
    IF NOT EXISTS(SELECT 1 FROM public.admission_notification_group_members WHERE group_id=OLD.id)
      OR EXISTS(SELECT 1 FROM public.admission_notification_group_members WHERE group_id=OLD.id AND deadline_at>observed_at) THEN
      RAISE EXCEPTION 'admission notification group still has an unexpired source' USING ERRCODE='23514';
    END IF;
    UPDATE public.admission_notification_group_members SET state='expired',suppression_reason='notification_deadline_expired' WHERE group_id=OLD.id AND state='pending';
    NEW.suppression_reason='notification_deadline_expired';
    NEW.frozen_manifest=NULL; NEW.deadline_at=NULL;
  ELSIF NEW.state='suppressed' THEN
    IF NEW.suppression_reason IS NULL THEN RAISE EXCEPTION 'admission notification suppression requires its cause' USING ERRCODE='23514'; END IF;
    UPDATE public.admission_notification_group_members SET state='suppressed',suppression_reason=NEW.suppression_reason WHERE group_id=OLD.id AND state='pending';
    NEW.frozen_manifest=NULL; NEW.deadline_at=NULL;
  ELSE
    RAISE EXCEPTION 'admission notification group close is unavailable' USING ERRCODE='23514';
  END IF;
  NEW.closed_at=observed_at;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_admission_notification_group() FROM PUBLIC;
CREATE TRIGGER admission_notification_group_guard BEFORE INSERT OR UPDATE ON public.admission_notification_groups
  FOR EACH ROW EXECUTE FUNCTION public.guard_admission_notification_group();

CREATE FUNCTION public.guard_admission_notification_group_inclusion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF NEW.state='included' AND NOT EXISTS(SELECT 1 FROM public.admission_notification_groups notification_group
    WHERE notification_group.id=NEW.group_id AND notification_group.state='frozen'
      AND notification_group.frozen_manifest->'items' @> jsonb_build_array(jsonb_build_object('obligationId',NEW.obligation_id))) THEN
    RAISE EXCEPTION 'admission notification included source lacks its frozen group' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_admission_notification_group_inclusion() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER admission_notification_group_inclusion_guard AFTER INSERT OR UPDATE ON public.admission_notification_group_members
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_admission_notification_group_inclusion();

ALTER TABLE public.admission_notification_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admission_notification_groups FORCE ROW LEVEL SECURITY;
ALTER TABLE public.admission_notification_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admission_notification_group_members FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.admission_notification_groups,public.admission_notification_group_members FROM PUBLIC;
CREATE POLICY admission_notification_group_owner ON public.admission_notification_groups FOR ALL
  USING(current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.admission_notification_groups'::regclass))
  WITH CHECK(current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.admission_notification_groups'::regclass));
CREATE POLICY admission_notification_group_member_owner ON public.admission_notification_group_members FOR ALL
  USING(current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.admission_notification_group_members'::regclass))
  WITH CHECK(current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.admission_notification_group_members'::regclass));
