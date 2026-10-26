-- Aligns the leader's commercial membership review with the activation preflight criterion.
-- The preflight treats as commercial any membership whose status is blocked or removed AND whose
-- reason is payment_blocked or subscription_inactive, in any combination. The review only listed and
-- resolved the canonical pairs (blocked+payment_blocked, removed+subscription_inactive), so a crossed
-- pair blocked the activation without a way to resolve it. The preflight is not relaxed: the review
-- now lists and resolves the four combinations through one SQL predicate, mirrored in TypeScript by
-- isCommercialMembershipState (src/modules/academy-admissions/domain/entities/commercial-membership-review.ts).
-- guard_academy_membership_source is unchanged: its resolution exception keys on the audited
-- resolution of this transaction and on the row not being readable, never on a status pair.

-- Single SQL source of the commercial criterion shared by the review reader, its resolver and the audit.
CREATE FUNCTION public.is_commercial_membership_state(p_status text,p_status_reason text)
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=pg_catalog AS $$
  SELECT p_status IN ('blocked','removed') AND p_status_reason IN ('payment_blocked','subscription_inactive')
$$;
REVOKE ALL ON FUNCTION public.is_commercial_membership_state(text,text) FROM PUBLIC;

-- The audit accepts every commercial combination as the previous state; the outcome rules are unchanged.
ALTER TABLE public.tribe_member_commercial_resolutions DROP CONSTRAINT tribe_member_commercial_resolution_previous_check;
ALTER TABLE public.tribe_member_commercial_resolutions ADD CONSTRAINT tribe_member_commercial_resolution_previous_check CHECK (
  previous_role IN ('guardian','tribemate')
  AND public.is_commercial_membership_state(previous_status,previous_status_reason)
  AND (previous_recovery_status IS NULL OR previous_recovery_status IN ('active','muted'))
);

-- Lists the commercially blocked memberships that still need a leader decision: tribemates whose
-- recovery state is unknown and privileged (guardian) memberships, in any commercial combination.
-- The canonical leader row is never a case.
CREATE OR REPLACE FUNCTION public.read_commercial_membership_reviews(p_tribe_id uuid,p_session_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor_id text := public.current_app_user_id(); pending jsonb; pending_count integer; resolved_count integer;
BEGIN
  IF actor_id IS NULL OR p_tribe_id IS NULL OR p_session_id IS NULL THEN RETURN NULL; END IF;
  PERFORM tribe.id FROM public.tribes tribe WHERE tribe.id=p_tribe_id FOR SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM session.id FROM public.session session WHERE session.id=p_session_id AND session."userId"=actor_id AND session."expiresAt">clock_timestamp() FOR SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT public.lock_admission_canonical_leader(p_tribe_id) THEN RETURN NULL; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.tribe_academy_settings settings WHERE settings.tribe_id=p_tribe_id AND settings.access_model='academy') THEN RETURN NULL; END IF;
  SELECT count(*)::integer INTO pending_count FROM public.tribe_members member
    WHERE member.tribe_id=p_tribe_id AND member.role IN ('guardian','tribemate')
      AND public.is_commercial_membership_state(member.status,member.status_reason)
      AND (member.role='guardian' OR member.commercial_recovery_status IS NULL);
  SELECT coalesce(jsonb_agg(jsonb_build_object('memberId',page.id,'displayName',page.name,'role',page.role,'status',page.status,
      'statusReason',page.status_reason,'recoveryStatus',page.commercial_recovery_status,'joinedAt',page.created_at) ORDER BY page.created_at,page.id),'[]'::jsonb)
    INTO pending
    FROM (SELECT member.id,applicant.name,member.role,member.status,member.status_reason,member.commercial_recovery_status,member.created_at
      FROM public.tribe_members member JOIN public."user" applicant ON applicant.id=member.user_id
      WHERE member.tribe_id=p_tribe_id AND member.role IN ('guardian','tribemate')
        AND public.is_commercial_membership_state(member.status,member.status_reason)
        AND (member.role='guardian' OR member.commercial_recovery_status IS NULL)
      ORDER BY member.created_at,member.id LIMIT 200) page;
  SELECT count(*)::integer INTO resolved_count FROM public.tribe_member_commercial_resolutions resolution WHERE resolution.tribe_id=p_tribe_id;
  RETURN jsonb_build_object('cases',pending,'pendingCount',pending_count,'resolvedCount',resolved_count);
END;
$$;
REVOKE ALL ON FUNCTION public.read_commercial_membership_reviews(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_commercial_membership_reviews(uuid,text) TO PUBLIC;

-- Records one prospective decision under the tribe/leader/member locks. Denials return a code without
-- writing; a membership that changed or is no longer a case is rejected; a repeated operation replays.
-- A recover decision keeps the observed status and reason, crossed pairs included; retire still removes.
CREATE OR REPLACE FUNCTION public.resolve_commercial_membership_review(
  p_tribe_id uuid,p_session_id text,p_operation_id uuid,p_member_id uuid,p_decision text,
  p_expected_role text,p_expected_status text,p_expected_status_reason text,p_expected_recovery_status text,p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor_id text := public.current_app_user_id(); normalized_reason text := nullif(btrim(p_reason),'');
  member public.tribe_members%ROWTYPE; stored public.tribe_member_commercial_resolutions%ROWTYPE;
  next_role text := 'tribemate'; next_status text; next_status_reason text; next_recovery text; privileged boolean;
BEGIN
  IF actor_id IS NULL OR p_session_id IS NULL THEN RETURN jsonb_build_object('status','denied','code','authentication_required'); END IF;
  IF p_tribe_id IS NULL OR p_operation_id IS NULL OR p_member_id IS NULL OR p_decision IS NULL
    OR p_decision NOT IN ('recover_active','recover_muted','retire') OR char_length(coalesce(normalized_reason,''))>500 THEN
    RETURN jsonb_build_object('status','denied','code','invalid_input');
  END IF;
  PERFORM tribe.id FROM public.tribes tribe WHERE tribe.id=p_tribe_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','denied','code','resource_unavailable'); END IF;
  PERFORM session.id FROM public.session session WHERE session.id=p_session_id AND session."userId"=actor_id AND session."expiresAt">clock_timestamp() FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','denied','code','authentication_required'); END IF;
  IF NOT public.lock_admission_canonical_leader(p_tribe_id) THEN RETURN jsonb_build_object('status','denied','code','permission_denied'); END IF;
  IF NOT EXISTS(SELECT 1 FROM public.tribe_academy_settings settings WHERE settings.tribe_id=p_tribe_id AND settings.access_model='academy' FOR SHARE) THEN
    RETURN jsonb_build_object('status','denied','code','resource_unavailable');
  END IF;
  SELECT * INTO stored FROM public.tribe_member_commercial_resolutions resolution WHERE resolution.tribe_id=p_tribe_id AND resolution.operation_id=p_operation_id;
  IF FOUND THEN
    IF stored.actor_user_id<>actor_id OR stored.member_id<>p_member_id OR stored.decision<>p_decision OR stored.reason IS DISTINCT FROM normalized_reason THEN
      RETURN jsonb_build_object('status','denied','code','idempotency_conflict');
    END IF;
    RETURN jsonb_build_object('status','resolved','replayed',true,'resolutionId',stored.id,'memberId',stored.member_id,'decision',stored.decision,
      'resultingRole',stored.resulting_role,'resultingStatus',stored.resulting_status,'resultingRecoveryStatus',stored.resulting_recovery_status,'decidedAt',stored.decided_at);
  END IF;
  SELECT * INTO member FROM public.tribe_members candidate WHERE candidate.id=p_member_id AND candidate.tribe_id=p_tribe_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','rejected','reason','membership_unavailable'); END IF;
  IF member.role='leader' OR member.user_id=actor_id THEN RETURN jsonb_build_object('status','rejected','reason','canonical_leader'); END IF;
  IF NOT public.is_commercial_membership_state(member.status,member.status_reason) THEN
    RETURN jsonb_build_object('status','rejected','reason','membership_not_commercial');
  END IF;
  IF ROW(member.role,member.status,member.status_reason,member.commercial_recovery_status)
    IS DISTINCT FROM ROW(p_expected_role,p_expected_status,p_expected_status_reason,p_expected_recovery_status) THEN
    RETURN jsonb_build_object('status','rejected','reason','membership_changed');
  END IF;
  privileged := member.role<>'tribemate';
  IF NOT privileged AND member.commercial_recovery_status IS NOT NULL THEN RETURN jsonb_build_object('status','rejected','reason','membership_already_resolved'); END IF;
  IF NOT privileged AND p_decision='retire' THEN RETURN jsonb_build_object('status','rejected','reason','decision_not_allowed'); END IF;
  IF p_decision='retire' THEN
    next_status := 'removed'; next_status_reason := 'none'; next_recovery := member.commercial_recovery_status;
  ELSE
    next_status := member.status; next_status_reason := member.status_reason;
    next_recovery := CASE p_decision WHEN 'recover_active' THEN 'active' ELSE 'muted' END;
  END IF;
  INSERT INTO public.tribe_member_commercial_resolutions(tribe_id,member_id,member_user_id,actor_user_id,operation_id,decision,
    previous_role,previous_status,previous_status_reason,previous_recovery_status,
    resulting_role,resulting_status,resulting_status_reason,resulting_recovery_status,reason)
  VALUES (p_tribe_id,member.id,member.user_id,actor_id,p_operation_id,p_decision,
    member.role,member.status,member.status_reason,member.commercial_recovery_status,
    next_role,next_status,next_status_reason,next_recovery,normalized_reason)
  RETURNING * INTO stored;
  UPDATE public.tribe_members SET role=next_role,status=next_status,status_reason=next_status_reason,commercial_recovery_status=next_recovery
    WHERE id=member.id AND tribe_id=p_tribe_id;
  -- The guards may never silently keep another state: confirm the exact persisted outcome.
  IF NOT EXISTS(SELECT 1 FROM public.tribe_members saved WHERE saved.id=member.id AND saved.role=next_role AND saved.status=next_status
    AND saved.status_reason=next_status_reason AND saved.commercial_recovery_status IS NOT DISTINCT FROM next_recovery) THEN
    RAISE EXCEPTION 'commercial membership resolution was not persisted as decided' USING ERRCODE='23514';
  END IF;
  RETURN jsonb_build_object('status','resolved','replayed',false,'resolutionId',stored.id,'memberId',stored.member_id,'decision',stored.decision,
    'resultingRole',stored.resulting_role,'resultingStatus',stored.resulting_status,'resultingRecoveryStatus',stored.resulting_recovery_status,'decidedAt',stored.decided_at);
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_commercial_membership_review(uuid,text,uuid,uuid,text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_commercial_membership_review(uuid,text,uuid,uuid,text,text,text,text,text,text) TO PUBLIC;
