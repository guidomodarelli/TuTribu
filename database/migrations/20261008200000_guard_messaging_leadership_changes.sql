-- Canonical membership changes stop old credentials before their transaction can
-- publish the new leadership. Secrets, admission evidence and charged work remain.
CREATE FUNCTION public.lock_messaging_leadership_scope() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE previous_scope uuid; next_scope uuid; changing_leadership boolean=false;
BEGIN
  IF TG_OP='DELETE' THEN
    previous_scope=OLD.tribe_id;
    changing_leadership=OLD.role='leader' AND OLD.status='active';
  ELSIF TG_OP='INSERT' THEN
    next_scope=NEW.tribe_id;
    changing_leadership=NEW.role='leader' AND NEW.status='active';
  ELSE
    previous_scope=OLD.tribe_id; next_scope=NEW.tribe_id;
    changing_leadership=((OLD.role='leader' AND OLD.status='active') OR (NEW.role='leader' AND NEW.status='active'))
      AND ROW(NEW.tribe_id,NEW.user_id,NEW.role,NEW.status)
        IS DISTINCT FROM ROW(OLD.tribe_id,OLD.user_id,OLD.role,OLD.status);
  END IF;
  IF changing_leadership THEN
    -- The UPDATE already owns its member tuple. Never wait to upgrade a tribe
    -- share fence while another authority owns the tribe and waits for that member.
    PERFORM id FROM public.tribes WHERE id IN (previous_scope,next_scope) ORDER BY id FOR UPDATE NOWAIT;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.lock_messaging_leadership_scope() FROM PUBLIC;
-- Alphabetical trigger order places this before academy_membership_source_guard.
CREATE TRIGGER academy_admission_leadership_lock BEFORE INSERT OR UPDATE OR DELETE
ON public.tribe_members FOR EACH ROW EXECUTE FUNCTION public.lock_messaging_leadership_scope();

CREATE FUNCTION public.suspend_previous_leader_messaging(target_tribe uuid,retained_leader text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE connection record; stopped_at timestamptz;
BEGIN
  PERFORM id FROM public.tribes WHERE id=target_tribe FOR UPDATE;
  stopped_at=clock_timestamp();
  FOR connection IN
    SELECT id FROM public.tenant_messaging_connections
    WHERE tribe_id=target_tribe AND retired_at IS NULL
      AND state IN ('draft','ready','active','degraded')
      AND (retained_leader IS NULL OR contributed_by_user_id IS DISTINCT FROM retained_leader)
    ORDER BY id FOR UPDATE
  LOOP
    PERFORM id FROM public.messaging_connection_versions
      WHERE tribe_id=target_tribe AND connection_id=connection.id ORDER BY version FOR UPDATE;
    UPDATE public.tenant_messaging_connections
      SET state='suspended',state_reason='leadership_changed',version=version+1,updated_at=stopped_at
      WHERE id=connection.id AND tribe_id=target_tribe;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.suspend_previous_leader_messaging(uuid,text) FROM PUBLIC;

CREATE FUNCTION public.guard_messaging_leadership_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE previous_scope uuid; next_scope uuid; lost_leader boolean=false; gained_leader boolean=false;
BEGIN
  IF TG_OP<>'INSERT' THEN
    previous_scope=OLD.tribe_id;
    IF OLD.role='leader' AND OLD.status='active' THEN
      IF TG_OP='DELETE' THEN lost_leader=true;
      ELSE lost_leader=ROW(NEW.tribe_id,NEW.user_id,NEW.role,NEW.status)
        IS DISTINCT FROM ROW(OLD.tribe_id,OLD.user_id,OLD.role,OLD.status); END IF;
    END IF;
  END IF;
  IF TG_OP<>'DELETE' THEN
    next_scope=NEW.tribe_id;
    IF NEW.role='leader' AND NEW.status='active' THEN
      IF TG_OP='INSERT' THEN gained_leader=true;
      ELSE gained_leader=ROW(NEW.tribe_id,NEW.user_id,NEW.role,NEW.status)
        IS DISTINCT FROM ROW(OLD.tribe_id,OLD.user_id,OLD.role,OLD.status); END IF;
    END IF;
  END IF;
  IF NOT lost_leader AND NOT gained_leader THEN RETURN NULL; END IF;
  -- Two-scope exceptional updates follow UUID order; regular owner transfers
  -- already retain the same tribe fence before changing either membership row.
  PERFORM id FROM public.tribes WHERE id IN (previous_scope,next_scope) ORDER BY id FOR UPDATE;
  IF lost_leader THEN PERFORM public.suspend_previous_leader_messaging(previous_scope,NULL); END IF;
  IF gained_leader THEN PERFORM public.suspend_previous_leader_messaging(next_scope,NEW.user_id); END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_messaging_leadership_change() FROM PUBLIC;
CREATE TRIGGER messaging_leadership_change_guard AFTER INSERT OR UPDATE OR DELETE
ON public.tribe_members FOR EACH ROW EXECUTE FUNCTION public.guard_messaging_leadership_change();
