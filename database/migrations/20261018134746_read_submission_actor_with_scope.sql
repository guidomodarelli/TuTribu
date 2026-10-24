-- Group existing scope/account/context transport without changing caller authority.
CREATE FUNCTION public.lock_academy_admission_membership_scope(
  requested_tribe_id uuid,requested_applicant_id text,requested_lock_domain text
) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path=pg_catalog,public,pg_temp AS $function$
DECLARE locked_scope record;
BEGIN
  WITH actor_identity AS MATERIALIZED (
    SELECT public.current_app_user_id() AS actor_id
  ), own_tribe AS MATERIALIZED (
    SELECT tribe.id FROM public.tribes tribe CROSS JOIN actor_identity actor
    WHERE tribe.id=requested_tribe_id AND actor.actor_id=requested_applicant_id
    FOR SHARE OF tribe
  ), managed_tribe AS MATERIALIZED (
    SELECT tribe.id FROM public.tribes tribe CROSS JOIN actor_identity actor
    WHERE tribe.id=requested_tribe_id AND actor.actor_id IS NOT NULL
      AND actor.actor_id<>requested_applicant_id
    FOR UPDATE OF tribe
  ), locked_tribe AS MATERIALIZED (
    SELECT id FROM own_tribe UNION ALL SELECT id FROM managed_tribe
  )
  SELECT true AS locked,CASE WHEN actor.actor_id=requested_applicant_id THEN
    pg_advisory_xact_lock(hashtextextended(
      jsonb_build_array(requested_lock_domain,tribe.id,requested_applicant_id)::text,0
    ))
  END AS applicant_lock INTO locked_scope
  FROM locked_tribe tribe CROSS JOIN actor_identity actor;
  RETURN coalesce(locked_scope.locked,false);
END;
$function$;

CREATE FUNCTION public.read_locked_admission_submission_actor(
  requested_tribe_id uuid,requested_user_id text,requested_session_id text,
  requested_lock_domain text
) RETURNS TABLE(scope_locked boolean,actor jsonb)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path=pg_catalog,public,pg_temp AS $function$
DECLARE current_actor jsonb;
BEGIN
  IF NOT public.lock_academy_admission_membership_scope(
    requested_tribe_id,requested_user_id,requested_lock_domain
  ) THEN
    RETURN QUERY SELECT false,NULL::jsonb;
    RETURN;
  END IF;

  PERFORM account_row.id FROM public."user" account_row
  WHERE account_row.id=requested_user_id AND public.current_app_user_id()=requested_user_id
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT true,NULL::jsonb;
    RETURN;
  END IF;

  SELECT jsonb_build_object('userId',current_context.user_id,
    'role',current_context.role,'status',current_context.status)
  INTO current_actor
  FROM public.read_admission_reviewer_context(requested_tribe_id,requested_session_id) current_context;
  RETURN QUERY SELECT true,current_actor;
END;
$function$;

REVOKE ALL ON FUNCTION public.lock_academy_admission_membership_scope(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lock_academy_admission_membership_scope(uuid,text,text) TO PUBLIC;
REVOKE ALL ON FUNCTION public.read_locked_admission_submission_actor(uuid,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_locked_admission_submission_actor(uuid,text,text,text) TO PUBLIC;
