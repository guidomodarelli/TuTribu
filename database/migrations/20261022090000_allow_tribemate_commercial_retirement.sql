-- Lets the leader retire a commercially blocked tribemate during the membership review, as it already could a guardian.
-- Before, a tribemate whose recovery state was unknown could only come back (active or muted) once paid, so a leader who
-- did not want it back had to remove it elsewhere. retire keeps its meaning for both roles: an administrative removal
-- (removed/none, role tribemate) that no payment, approval, CSV or token lifts. A tribemate already resolved is still
-- not a case (membership_already_resolved), and the canonical leader row never is.

ALTER TABLE public.tribe_member_commercial_resolutions DROP CONSTRAINT tribe_member_commercial_resolution_result_check;
ALTER TABLE public.tribe_member_commercial_resolutions ADD CONSTRAINT tribe_member_commercial_resolution_result_check CHECK (
  resulting_role='tribemate'
  AND (
    (decision='recover_active' AND resulting_recovery_status='active' AND resulting_status=previous_status AND resulting_status_reason=previous_status_reason)
    OR (decision='recover_muted' AND resulting_recovery_status='muted' AND resulting_status=previous_status AND resulting_status_reason=previous_status_reason)
    OR (decision='retire' AND resulting_status='removed' AND resulting_status_reason='none'
      AND resulting_recovery_status IS NOT DISTINCT FROM previous_recovery_status)
  )
);

-- Same resolver as 20261020120000, without the guardian-only restriction on retire.
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
