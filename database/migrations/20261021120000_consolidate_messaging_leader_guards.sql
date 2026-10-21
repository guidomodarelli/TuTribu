-- Consolidate the messaging leadership guards into one statement each.
-- Every function keeps the exact statement and lock order of the sequential
-- TypeScript guard it replaces and stops at the same points. PL/pgSQL takes a
-- fresh snapshot per statement, so each step still observes rows committed
-- while an earlier lock was waiting.
-- SECURITY DEFINER, like lock_admission_canonical_leader and
-- authorize_admission_leader: SELECT ... FOR SHARE is governed by UPDATE
-- policies, so a request role without RLS bypass would silently skip locks on
-- rows it may only read. The actor is still the guarded transaction's
-- app.current_user_id, and the results expose only the actor's own facts and
-- the tribe's canonical leader.

-- PostgresMessagingAuthorizationReader.getCurrentLeadership: tribe, session and
-- canonical leadership, all FOR SHARE; the session liveness is checked last,
-- only when there is exactly one active leader.
CREATE FUNCTION public.read_messaging_leadership(
  target_tribe_id uuid,
  expected_user_id text,
  expected_session_id text
)
RETURNS TABLE(is_current boolean, leader_user_id text, member_role text, member_status text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $$
DECLARE
  actor text=public.current_app_user_id();
  member record;
  leader_count integer=0;
  leader_id text;
  own_role text;
  own_status text;
BEGIN
  IF actor IS NULL OR actor IS DISTINCT FROM expected_user_id THEN
    RETURN QUERY SELECT false, NULL::text, NULL::text, NULL::text; RETURN;
  END IF;
  PERFORM id FROM public.tribes WHERE id=target_tribe_id FOR SHARE;
  IF NOT FOUND THEN RETURN QUERY SELECT false, NULL::text, NULL::text, NULL::text; RETURN; END IF;
  PERFORM id FROM public.session WHERE id=expected_session_id AND "userId"=expected_user_id FOR SHARE;
  IF NOT FOUND THEN RETURN QUERY SELECT false, NULL::text, NULL::text, NULL::text; RETURN; END IF;
  FOR member IN
    SELECT user_id, role, status FROM public.tribe_members
    WHERE tribe_id=target_tribe_id AND (user_id=expected_user_id OR role='leader')
    ORDER BY user_id FOR SHARE
  LOOP
    IF member.role='leader' AND member.status='active' THEN leader_count=leader_count+1; leader_id=coalesce(leader_id, member.user_id); END IF;
    IF member.user_id=expected_user_id THEN own_role=member.role; own_status=member.status; END IF;
  END LOOP;
  IF leader_count<>1 THEN RETURN QUERY SELECT false, NULL::text, NULL::text, NULL::text; RETURN; END IF;
  PERFORM id FROM public.session WHERE id=expected_session_id AND "userId"=expected_user_id AND "expiresAt">clock_timestamp();
  IF NOT FOUND THEN RETURN QUERY SELECT false, NULL::text, NULL::text, NULL::text; RETURN; END IF;
  RETURN QUERY SELECT true, leader_id, own_role, own_status;
END;
$$;
REVOKE ALL ON FUNCTION public.read_messaging_leadership(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_messaging_leadership(uuid,text,text) TO PUBLIC;

-- PostgresMessagingConfigurationReader.authorize: live session FOR SHARE, tribe
-- FOR SHARE, the actor's and leaders' memberships FOR SHARE, then the session
-- liveness again. The audience decision stays in TypeScript, after these rows.
CREATE FUNCTION public.authorize_messaging_configuration_reader(
  target_tribe_id uuid,
  expected_user_id text,
  expected_session_id text
)
RETURNS TABLE(outcome text, members jsonb)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $$
DECLARE
  actor text=public.current_app_user_id();
  member record;
  locked_members jsonb='[]'::jsonb;
BEGIN
  IF actor IS NULL OR actor IS DISTINCT FROM expected_user_id THEN
    RETURN QUERY SELECT 'permission_denied'::text, NULL::jsonb; RETURN;
  END IF;
  PERFORM id FROM public.session WHERE id=expected_session_id AND "userId"=actor AND "expiresAt">clock_timestamp() FOR SHARE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'authentication_required'::text, NULL::jsonb; RETURN; END IF;
  PERFORM id FROM public.tribes WHERE id=target_tribe_id FOR SHARE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'permission_denied'::text, NULL::jsonb; RETURN; END IF;
  FOR member IN
    SELECT user_id, role, status FROM public.tribe_members
    WHERE tribe_id=target_tribe_id AND (user_id=actor OR role='leader')
    ORDER BY user_id FOR SHARE
  LOOP
    locked_members=locked_members||jsonb_build_object('user_id', member.user_id, 'role', member.role, 'status', member.status);
  END LOOP;
  PERFORM id FROM public.session WHERE id=expected_session_id AND "userId"=actor AND "expiresAt">clock_timestamp();
  IF NOT FOUND THEN RETURN QUERY SELECT 'authentication_required'::text, NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'checked'::text, locked_members;
END;
$$;
REVOKE ALL ON FUNCTION public.authorize_messaging_configuration_reader(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.authorize_messaging_configuration_reader(uuid,text,text) TO PUBLIC;

-- authorizeMessagingTribeManagement: the actor's user and session FOR SHARE and
-- a liveness check; for a sensitive operation, its Google account and session
-- binding FOR SHARE; the tribe (FOR UPDATE for connection, credential and
-- delivery operations, FOR SHARE otherwise); the original delivery, when
-- recovering one; the canonical leaders FOR SHARE and a final liveness check.
-- The caller evaluates whether a sensitive operation's resource matches its
-- context and passes it here, so a mismatch is reported at the same point.
CREATE FUNCTION public.authorize_messaging_tribe_management(
  target_tribe_id uuid,
  expected_user_id text,
  expected_session_id text,
  sensitive boolean,
  sensitive_scope_matches boolean,
  expected_account_id text,
  expected_subject text,
  exclusive_lock boolean,
  target_delivery_id uuid
)
RETURNS TABLE(outcome text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $$
DECLARE
  actor text=public.current_app_user_id();
  actor_email text;
  session_deadline timestamptz;
  linked_subject text;
  leader_count integer=0;
  leader_id text;
  member record;
BEGIN
  IF actor IS NULL OR actor IS DISTINCT FROM expected_user_id THEN
    RETURN QUERY SELECT 'permission_denied'::text; RETURN;
  END IF;
  SELECT email INTO actor_email FROM public."user" WHERE id=actor FOR SHARE;
  SELECT "expiresAt" INTO session_deadline FROM public.session WHERE id=expected_session_id AND "userId"=actor FOR SHARE;
  IF actor_email IS NULL OR session_deadline IS NULL THEN RETURN QUERY SELECT 'authentication_required'::text; RETURN; END IF;
  IF clock_timestamp()>=session_deadline THEN RETURN QUERY SELECT 'authentication_required'::text; RETURN; END IF;
  IF sensitive THEN
    IF NOT sensitive_scope_matches THEN RETURN QUERY SELECT 'permission_denied'::text; RETURN; END IF;
    SELECT "accountId" INTO linked_subject FROM public.account WHERE id=expected_account_id AND "userId"=actor AND "providerId"='google' FOR SHARE;
    PERFORM session_id FROM public.global_session_identity_bindings
    WHERE session_id=expected_session_id AND user_id=actor AND account_id=expected_account_id AND provider_subject=expected_subject
      AND normalized_email=lower(btrim(actor_email)) AND invalidated_at IS NULL FOR SHARE;
    IF linked_subject IS DISTINCT FROM expected_subject OR NOT FOUND THEN RETURN QUERY SELECT 'authentication_required'::text; RETURN; END IF;
  END IF;
  IF exclusive_lock THEN
    PERFORM id FROM public.tribes WHERE id=target_tribe_id FOR UPDATE;
  ELSE
    PERFORM id FROM public.tribes WHERE id=target_tribe_id FOR SHARE;
  END IF;
  IF NOT FOUND THEN RETURN QUERY SELECT 'permission_denied'::text; RETURN; END IF;
  IF target_delivery_id IS NOT NULL THEN
    PERFORM id FROM public.message_deliveries WHERE id=target_delivery_id AND tribe_id=target_tribe_id;
    IF NOT FOUND THEN RETURN QUERY SELECT 'permission_denied'::text; RETURN; END IF;
  END IF;
  FOR member IN
    SELECT user_id FROM public.tribe_members
    WHERE tribe_id=target_tribe_id AND role='leader' AND status='active'
    ORDER BY user_id FOR SHARE
  LOOP
    leader_count=leader_count+1; leader_id=coalesce(leader_id, member.user_id);
  END LOOP;
  IF leader_count<>1 OR leader_id IS DISTINCT FROM actor THEN RETURN QUERY SELECT 'permission_denied'::text; RETURN; END IF;
  IF clock_timestamp()>=session_deadline THEN RETURN QUERY SELECT 'authentication_required'::text; RETURN; END IF;
  RETURN QUERY SELECT 'authorized'::text;
END;
$$;
REVOKE ALL ON FUNCTION public.authorize_messaging_tribe_management(uuid,text,text,boolean,boolean,text,text,boolean,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.authorize_messaging_tribe_management(uuid,text,text,boolean,boolean,text,text,boolean,uuid) TO PUBLIC;
