-- Fixed administrative read facts use native identity, current locks and owner-only audit writes.
-- Pin user before session so the eventual audit FK cannot invert a physical-account deletion.
CREATE FUNCTION public.lock_academy_admission_administrative_reader(p_tribe_id uuid,p_session_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor_id text=public.current_app_user_id();
BEGIN
  IF actor_id IS NULL THEN RETURN false; END IF;
  PERFORM id FROM public.tribes WHERE id=p_tribe_id FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM id FROM public."user" WHERE id=actor_id FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM id FROM public.session WHERE id=p_session_id AND "userId"=actor_id FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  RETURN EXISTS(SELECT 1 FROM public.session WHERE id=p_session_id AND "userId"=actor_id AND "expiresAt">clock_timestamp());
END;
$$;
REVOKE ALL ON FUNCTION public.lock_academy_admission_administrative_reader(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lock_academy_admission_administrative_reader(uuid,text) TO PUBLIC;

CREATE FUNCTION public.record_academy_admission_administrative_exposure(
  p_tribe_id uuid,p_session_id text,p_surface text,p_resource_id uuid,p_resource_version integer,p_item_count integer
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor_id text=public.current_app_user_id(); actor_role text; actor_status text;
  stored_version integer; resource_kind text; read_rule text;
BEGIN
  IF actor_id IS NULL OR p_resource_id IS NULL OR p_item_count IS NULL OR p_item_count<0
    OR p_surface IS NULL OR p_surface NOT IN ('allowlist','allowlist_report','invitations','request_details')
    OR p_item_count>(CASE WHEN p_surface='allowlist_report' THEN 10000 ELSE 50 END) THEN RETURN false; END IF;
  IF NOT public.lock_academy_admission_administrative_reader(p_tribe_id,p_session_id) THEN RETURN false; END IF;
  SELECT role,status INTO actor_role,actor_status FROM public.tribe_members WHERE tribe_id=p_tribe_id AND user_id=actor_id FOR SHARE;
  IF actor_status IS DISTINCT FROM 'active' OR actor_role IS NULL
    OR (actor_role<>'leader' AND (p_surface<>'request_details' OR actor_role<>'guardian')) THEN RETURN false; END IF;
  IF p_surface='allowlist' THEN
    resource_kind='entries'; read_rule='read_allowlist_entries';
    IF p_resource_id<>p_tribe_id THEN
      SELECT version INTO stored_version FROM public.academy_allowlist_entries WHERE id=p_resource_id AND tribe_id=p_tribe_id FOR SHARE;
      IF NOT FOUND OR p_item_count<>1 THEN RETURN false; END IF;
    END IF;
  ELSIF p_surface='invitations' THEN
    resource_kind='invitations'; read_rule='read_personal_invitations';
    IF p_resource_id<>p_tribe_id THEN
      SELECT version INTO stored_version FROM public.academy_personal_invitations WHERE id=p_resource_id AND tribe_id=p_tribe_id FOR SHARE;
      IF NOT FOUND OR p_item_count<>1 THEN RETURN false; END IF;
    END IF;
  ELSIF p_surface='request_details' THEN
    resource_kind='requests'; read_rule='read_admission_reviews';
    IF p_resource_id<>p_tribe_id THEN
      SELECT version INTO stored_version FROM public.academy_admission_requests WHERE id=p_resource_id AND tribe_id=p_tribe_id FOR SHARE;
      IF NOT FOUND OR p_item_count<>1 THEN RETURN false; END IF;
    END IF;
  ELSE
    resource_kind='entries'; read_rule='read_allowlist_report';
    SELECT version INTO stored_version FROM public.academy_allowlist_imports
      WHERE id=p_resource_id AND tribe_id=p_tribe_id AND actor_user_id=actor_id AND expires_at>clock_timestamp() FOR SHARE;
    IF NOT FOUND THEN RETURN false; END IF;
  END IF;
  IF stored_version IS DISTINCT FROM p_resource_version
    OR NOT EXISTS(SELECT 1 FROM public.session WHERE id=p_session_id AND "userId"=actor_id AND "expiresAt">clock_timestamp()) THEN RETURN false; END IF;
  INSERT INTO public.academy_admission_audit_events(tribe_id,actor_user_id,resource_type,resource_id,event_type,rule,resource_version,metadata,created_at)
    VALUES(p_tribe_id,actor_id,'authorized_exposure',p_resource_id,'authorized_resource_exposure',read_rule,stored_version,
      jsonb_build_object('surface',p_surface,'itemCount',p_item_count,'resourceKind',resource_kind),clock_timestamp());
  IF NOT EXISTS(SELECT 1 FROM public.session WHERE id=p_session_id AND "userId"=actor_id AND "expiresAt">clock_timestamp()) THEN
    RAISE EXCEPTION 'admission administrative exposure session is no longer live' USING ERRCODE='42501';
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.record_academy_admission_administrative_exposure(uuid,text,text,uuid,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_academy_admission_administrative_exposure(uuid,text,text,uuid,integer,integer) TO PUBLIC;
