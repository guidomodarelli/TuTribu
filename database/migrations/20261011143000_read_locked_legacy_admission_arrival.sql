-- Historical links provide attribution, never membership or personal permission.
-- SELECT FOR SHARE also evaluates UPDATE RLS. Only the table owner may take
-- this scoped read lock; WITH CHECK false grants no additional update path.
CREATE POLICY "Invitation owner can lock historical admission arrival"
ON public.tribe_invitations FOR UPDATE
USING (
  current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class
    WHERE oid='public.tribe_invitations'::regclass)
  AND token_hash=current_setting('app.current_invitation_hash',true)
  AND status='active' AND revoked_at IS NULL
)
WITH CHECK (false);

CREATE FUNCTION public.read_legacy_admission_invitation(
  p_tribe_id uuid,p_user_id text,p_session_id text,p_token_hash text
)
RETURNS TABLE (id uuid,tribe_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  actor_id text := public.current_app_user_id();
  matched_invitation_id uuid;
BEGIN
  IF actor_id IS NULL OR actor_id IS DISTINCT FROM p_user_id THEN RETURN; END IF;
  PERFORM tribe.id FROM public.tribes tribe
    WHERE tribe.id=p_tribe_id AND public.tribe_uses_academy_access(tribe.id) FOR SHARE;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM account.id FROM public."user" account WHERE account.id=actor_id FOR SHARE;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM session.id FROM public.session session
    WHERE session.id=p_session_id AND session."userId"=actor_id FOR SHARE;
  IF NOT FOUND THEN RETURN; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.session session WHERE session.id=p_session_id
    AND session."userId"=actor_id AND session."expiresAt">clock_timestamp()) THEN RETURN; END IF;
  PERFORM set_config('app.current_invitation_hash',p_token_hash,true);
  SELECT invitation.id INTO matched_invitation_id
    FROM public.tribe_invitations invitation
    WHERE invitation.tribe_id=p_tribe_id AND invitation.token_hash=p_token_hash
      AND invitation.status='active' AND invitation.revoked_at IS NULL
    FOR SHARE OF invitation;
  IF NOT FOUND THEN RETURN; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.session session WHERE session.id=p_session_id
    AND session."userId"=actor_id AND session."expiresAt">clock_timestamp()) THEN RETURN; END IF;
  RETURN QUERY SELECT matched_invitation_id,p_tribe_id;
END;
$$;
REVOKE ALL ON FUNCTION public.read_legacy_admission_invitation(uuid,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_legacy_admission_invitation(uuid,text,text,text) TO PUBLIC;
