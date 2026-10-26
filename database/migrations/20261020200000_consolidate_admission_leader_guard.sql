-- Consolidate the admission leader guard into one statement.
-- It keeps the exact lock order of the former sequential guard: tribe
-- (FOR UPDATE for a sensitive operation, FOR SHARE otherwise), user, session,
-- account projection, canonical leadership, and, for a sensitive operation of
-- a Google-linked account, its account and session identity binding; then it
-- projects the account again and samples the clock after every wait.
-- PL/pgSQL takes a fresh snapshot per statement, so each step still observes
-- rows committed while an earlier lock was waiting.
-- SECURITY DEFINER, like lock_admission_canonical_leader: SELECT ... FOR SHARE
-- is governed by UPDATE policies, so a request role without RLS bypass would
-- silently skip locks on rows it may only read (for example its own session
-- identity binding). The actor is still the guarded transaction's
-- app.current_user_id and the result exposes only an outcome and the actor's
-- own session deadline.
CREATE FUNCTION public.authorize_admission_leader(
  target_tribe_id uuid,
  expected_user_id text,
  expected_session_id text,
  exclusive_lock boolean
)
RETURNS TABLE(outcome text, session_expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $$
DECLARE
  actor text=public.current_app_user_id();
  linked_account_id text;
  current_expires_at timestamptz;
BEGIN
  IF actor IS NULL OR actor IS DISTINCT FROM expected_user_id THEN
    RETURN QUERY SELECT 'permission_denied'::text, NULL::timestamptz; RETURN;
  END IF;
  IF exclusive_lock THEN
    PERFORM id FROM public.tribes WHERE id=target_tribe_id FOR UPDATE;
  ELSE
    PERFORM id FROM public.tribes WHERE id=target_tribe_id FOR SHARE;
  END IF;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'resource_unavailable'::text, NULL::timestamptz; RETURN;
  END IF;
  PERFORM id FROM public."user" WHERE id=actor FOR SHARE;
  PERFORM id FROM public.session WHERE id=expected_session_id AND "userId"=actor FOR SHARE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'authentication_required'::text, NULL::timestamptz; RETURN;
  END IF;
  -- Same live account projection as PostgresAuthenticatedAccountProvider:
  -- live session of the actor and the Google account its binding (or its
  -- single Google account, without a binding) designates.
  SELECT current_session."expiresAt",
    CASE WHEN nullif(google_account.id,'') IS NOT NULL AND nullif(google_account."accountId",'') IS NOT NULL THEN google_account.id END
  INTO current_expires_at, linked_account_id
  FROM public."user" account_user
  INNER JOIN public.session current_session ON current_session."userId"=account_user.id AND current_session.id=expected_session_id AND current_session."expiresAt">clock_timestamp()
  LEFT JOIN public.global_session_identity_bindings binding ON binding.session_id=current_session.id AND binding.user_id=account_user.id
  LEFT JOIN LATERAL (
    SELECT linked.id, linked."accountId" FROM public.account linked WHERE linked."userId"=account_user.id AND linked."providerId"='google' AND (
      (binding.session_id IS NOT NULL AND binding.invalidated_at IS NULL AND binding.normalized_email=lower(btrim(account_user.email)) AND linked.id=binding.account_id AND linked."accountId"=binding.provider_subject)
      OR (binding.session_id IS NULL AND (SELECT count(*) FROM public.account candidate WHERE candidate."userId"=account_user.id AND candidate."providerId"='google')=1)
    )
  ) google_account ON true
  WHERE account_user.id=actor
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'authentication_required'::text, NULL::timestamptz; RETURN;
  END IF;
  IF public.lock_admission_canonical_leader(target_tribe_id) IS DISTINCT FROM true THEN
    RETURN QUERY SELECT 'permission_denied'::text, NULL::timestamptz; RETURN;
  END IF;
  IF exclusive_lock AND linked_account_id IS NOT NULL THEN
    PERFORM id FROM public.account WHERE id=linked_account_id AND "userId"=actor FOR SHARE;
    PERFORM session_id FROM public.global_session_identity_bindings WHERE session_id=expected_session_id AND user_id=actor FOR SHARE;
  END IF;
  SELECT current_session."expiresAt" INTO current_expires_at
  FROM public."user" account_user
  INNER JOIN public.session current_session ON current_session."userId"=account_user.id AND current_session.id=expected_session_id AND current_session."expiresAt">clock_timestamp()
  WHERE account_user.id=actor
  LIMIT 1;
  IF NOT FOUND OR NOT (current_expires_at>clock_timestamp()) THEN
    RETURN QUERY SELECT 'authentication_required'::text, NULL::timestamptz; RETURN;
  END IF;
  RETURN QUERY SELECT 'authorized'::text, current_expires_at;
END;
$$;
REVOKE ALL ON FUNCTION public.authorize_admission_leader(uuid,text,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.authorize_admission_leader(uuid,text,text,boolean) TO PUBLIC;
