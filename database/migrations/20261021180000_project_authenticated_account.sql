-- Project the current account in one statement.
-- The projection used to run in its own guarded transaction only to set
-- app.current_user_id before one SELECT: four round trips for one statement.
-- This SECURITY INVOKER function keeps the exact projection, under the same
-- RLS policies, and in standalone mode sets the request actor itself for the
-- statement's implicit transaction and restores it before returning, so the
-- caller can run it alone in one round trip.
-- Without standalone mode it runs inside the caller's guarded transaction and
-- stays bound to that transaction's actor: another actor's, or no actor's,
-- transaction projects nothing, as before.
CREATE FUNCTION public.read_authenticated_account(
  expected_user_id text,
  expected_session_id text,
  google_provider_id text,
  standalone boolean
)
RETURNS TABLE(user_id text, normalized_email text, session_id text, expires_at timestamptz, account_id text, subject text, identity_evidence jsonb)
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,public AS $$
#variable_conflict use_column
DECLARE
  previous_actor text=current_setting('app.current_user_id', true);
BEGIN
  IF standalone THEN
    PERFORM set_config('app.current_user_id', expected_user_id, true);
  END IF;
  RETURN QUERY
  select account_user.id as user_id,lower(btrim(account_user.email)) as normalized_email,
    current_session.id as session_id,current_session."expiresAt" as expires_at,
    google_account.id as account_id,google_account."accountId" as subject,
    case when capture.id is null then null else jsonb_build_object('id',capture.id,'userId',capture.user_id,'accountId',capture.account_id,'subject',capture.provider_subject,'normalizedEmail',capture.normalized_email,'classification',capture.classification,'version',capture.version,'verifiedAt',capture.verified_at,'invalidatedAt',capture.invalidated_at) end as identity_evidence
  from public."user" account_user
  inner join public.session current_session on current_session."userId"=account_user.id and current_session.id=expected_session_id and current_session."expiresAt">clock_timestamp()
  left join public.global_session_identity_bindings binding on binding.session_id=current_session.id and binding.user_id=account_user.id
  left join lateral (
    select linked.* from public.account linked where linked."userId"=account_user.id and linked."providerId"=google_provider_id and (
      (binding.session_id is not null and binding.invalidated_at is null and binding.normalized_email=lower(btrim(account_user.email)) and linked.id=binding.account_id and linked."accountId"=binding.provider_subject)
      or (binding.session_id is null and (select count(*) from public.account candidate where candidate."userId"=account_user.id and candidate."providerId"=google_provider_id)=1)
    )
  ) google_account on true
  left join public.global_identity_evidence capture on capture.user_id=account_user.id and capture.account_id=google_account.id and capture.provider_id=google_provider_id and capture.provider_subject=google_account."accountId" and capture.normalized_email=lower(btrim(account_user.email)) and capture.invalidated_at is null
  where account_user.id=expected_user_id and public.current_app_user_id()=expected_user_id;
  IF standalone THEN
    PERFORM set_config('app.current_user_id', coalesce(previous_actor, ''), true);
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.read_authenticated_account(text,text,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_authenticated_account(text,text,text,boolean) TO PUBLIC;
