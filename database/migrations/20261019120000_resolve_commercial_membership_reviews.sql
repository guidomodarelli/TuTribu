-- Owner tribes: authorized, audited prospective decisions for commercially blocked memberships
-- whose recovery state is unknown (historical NULL snapshot) or that still carry a privileged role.
-- A decision never reconstructs the past: it records what happens prospectively when the payment
-- is regularized, or retires the membership from commercial recovery.

CREATE TABLE public.tribe_member_commercial_resolutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id uuid NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  member_id uuid NOT NULL,
  member_user_id text NOT NULL,
  actor_user_id text NOT NULL,
  operation_id uuid NOT NULL,
  decision text NOT NULL,
  basis text NOT NULL DEFAULT 'prospective_leader_decision',
  previous_role text NOT NULL,
  previous_status text NOT NULL,
  previous_status_reason text NOT NULL,
  previous_recovery_status text,
  resulting_role text NOT NULL,
  resulting_status text NOT NULL,
  resulting_status_reason text NOT NULL,
  resulting_recovery_status text,
  reason text,
  decided_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  resolution_transaction_id xid8 NOT NULL DEFAULT pg_current_xact_id(),
  CONSTRAINT tribe_member_commercial_resolution_operation_key UNIQUE (tribe_id, operation_id),
  CONSTRAINT tribe_member_commercial_resolution_decision_check CHECK (decision IN ('recover_active','recover_muted','retire')),
  CONSTRAINT tribe_member_commercial_resolution_basis_check CHECK (basis='prospective_leader_decision'),
  CONSTRAINT tribe_member_commercial_resolution_previous_check CHECK (
    previous_role IN ('guardian','tribemate')
    AND ((previous_status='blocked' AND previous_status_reason='payment_blocked') OR (previous_status='removed' AND previous_status_reason='subscription_inactive'))
    AND (previous_recovery_status IS NULL OR previous_recovery_status IN ('active','muted'))
  ),
  CONSTRAINT tribe_member_commercial_resolution_result_check CHECK (
    resulting_role='tribemate'
    AND (
      (decision='recover_active' AND resulting_recovery_status='active' AND resulting_status=previous_status AND resulting_status_reason=previous_status_reason)
      OR (decision='recover_muted' AND resulting_recovery_status='muted' AND resulting_status=previous_status AND resulting_status_reason=previous_status_reason)
      OR (decision='retire' AND previous_role='guardian' AND resulting_status='removed' AND resulting_status_reason='none'
        AND resulting_recovery_status IS NOT DISTINCT FROM previous_recovery_status)
    )
  ),
  CONSTRAINT tribe_member_commercial_resolution_reason_check CHECK (reason IS NULL OR char_length(reason) BETWEEN 1 AND 500)
);
CREATE INDEX tribe_member_commercial_resolutions_tribe_idx ON public.tribe_member_commercial_resolutions(tribe_id, decided_at);
CREATE INDEX tribe_member_commercial_resolutions_member_idx ON public.tribe_member_commercial_resolutions(member_id, resolution_transaction_id);

-- The audit is append-only; only the tribe cascade may remove it.
CREATE FUNCTION public.guard_tribe_member_commercial_resolution_update() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  RAISE EXCEPTION 'commercial membership resolutions are append-only' USING ERRCODE='23514';
END;
$$;
REVOKE ALL ON FUNCTION public.guard_tribe_member_commercial_resolution_update() FROM PUBLIC;
CREATE TRIGGER tribe_member_commercial_resolution_append_only BEFORE UPDATE ON public.tribe_member_commercial_resolutions
  FOR EACH ROW EXECUTE FUNCTION public.guard_tribe_member_commercial_resolution_update();

ALTER TABLE public.tribe_member_commercial_resolutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tribe_member_commercial_resolutions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.tribe_member_commercial_resolutions FROM PUBLIC;
-- The table owner writes only through the definer function below; a non-bypass owner keeps that path.
CREATE POLICY tribe_member_commercial_resolution_owner ON public.tribe_member_commercial_resolutions FOR ALL
  USING(current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.tribe_member_commercial_resolutions'::regclass))
  WITH CHECK(current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.tribe_member_commercial_resolutions'::regclass));
-- RLS simple: only the tribe's active leader reads its own audit; nobody inserts or edits it directly.
CREATE POLICY tribe_member_commercial_resolution_leader_read ON public.tribe_member_commercial_resolutions FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.tribe_members leader WHERE leader.tribe_id=tribe_member_commercial_resolutions.tribe_id
    AND leader.user_id=public.current_app_user_id() AND leader.role='leader' AND leader.status='active'));
DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE INSERT, UPDATE, DELETE ON public.tribe_member_commercial_resolutions FROM authenticated;
    GRANT SELECT ON public.tribe_member_commercial_resolutions TO authenticated;
  END IF;
END $grants$;

-- The snapshot is still captured before hiding a readable membership and is never overwritten from a
-- commercial state, except by an audited resolution committed in this same transaction for this exact row.
CREATE OR REPLACE FUNCTION public.guard_academy_membership_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE protected boolean; protected_before boolean=false; effect public.academy_admission_membership_effects%ROWTYPE;
  paid_effect public.subscription_membership_effects%ROWTYPE; readable_before boolean=false; needs_source boolean;
  commercial_after boolean; active_basic_basis boolean=false;
BEGIN
  IF TG_OP='UPDATE' AND OLD.tribe_id IS DISTINCT FROM NEW.tribe_id THEN
    IF OLD.tribe_id<NEW.tribe_id THEN
      SELECT public.tribe_admission_control_is_active(OLD.tribe_id) INTO protected_before;
      SELECT public.tribe_admission_control_is_active(NEW.tribe_id) INTO protected;
    ELSE
      SELECT public.tribe_admission_control_is_active(NEW.tribe_id) INTO protected;
      SELECT public.tribe_admission_control_is_active(OLD.tribe_id) INTO protected_before;
    END IF;
  ELSE
    SELECT public.tribe_admission_control_is_active(NEW.tribe_id) INTO protected;
    protected_before=protected;
  END IF;
  commercial_after=(NEW.status='blocked' AND NEW.status_reason='payment_blocked') OR (NEW.status='removed' AND NEW.status_reason='subscription_inactive');
  IF TG_OP='UPDATE' THEN
    readable_before=OLD.status IN ('active','muted');
    IF ROW(NEW.id,NEW.tribe_id,NEW.user_id,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.tribe_id,OLD.user_id,OLD.created_at) AND (protected OR protected_before) THEN
      RAISE EXCEPTION 'protected membership identity and joining date are immutable' USING ERRCODE='23514';
    END IF;
    IF readable_before AND commercial_after THEN NEW.commercial_recovery_status=OLD.status;
    ELSIF NOT readable_before AND NOT (
      NEW.commercial_recovery_status IS DISTINCT FROM OLD.commercial_recovery_status
      AND EXISTS(SELECT 1 FROM public.tribe_member_commercial_resolutions resolution
        WHERE resolution.member_id=OLD.id AND resolution.tribe_id=OLD.tribe_id AND resolution.member_user_id=OLD.user_id
          AND resolution.decision IN ('recover_active','recover_muted')
          AND resolution.resulting_recovery_status=NEW.commercial_recovery_status
          AND resolution.resolution_transaction_id=pg_current_xact_id())
    ) THEN NEW.commercial_recovery_status=OLD.commercial_recovery_status; END IF;
    IF OLD.admission_membership_effect_id IS NOT NULL THEN
      SELECT EXISTS(SELECT 1 FROM public.academy_admission_membership_effects source WHERE source.id=OLD.admission_membership_effect_id
        AND source.tribe_id=OLD.tribe_id AND source.user_id=OLD.user_id AND source.member_id=OLD.id AND source.applied_at IS NOT NULL AND source.revoked_at IS NULL) INTO active_basic_basis;
    END IF;
    IF active_basic_basis AND commercial_after THEN
      NEW.status=OLD.status; NEW.status_reason=OLD.status_reason; NEW.admission_membership_effect_id=OLD.admission_membership_effect_id;
      RETURN NEW;
    END IF;
    IF readable_before AND NEW.status NOT IN ('active','muted') AND NOT commercial_after THEN
      IF active_basic_basis THEN UPDATE public.academy_admission_membership_effects SET revoked_at=clock_timestamp(),revocation_reason='membership_removed' WHERE id=OLD.admission_membership_effect_id AND revoked_at IS NULL; END IF;
      UPDATE public.subscription_membership_effects SET revoked_at=clock_timestamp(),revocation_reason='membership_removed'
        WHERE member_id=OLD.id AND tribe_id=OLD.tribe_id AND user_id=OLD.user_id AND revoked_at IS NULL;
    END IF;
    IF readable_before AND (NEW.admission_membership_effect_id IS DISTINCT FROM OLD.admission_membership_effect_id OR NEW.subscription_membership_effect_id IS DISTINCT FROM OLD.subscription_membership_effect_id) THEN
      RAISE EXCEPTION 'existing readable membership does not consume another source' USING ERRCODE='23514';
    END IF;
  END IF;
  needs_source=coalesce(protected,false) AND NEW.status IN ('active','muted') AND (TG_OP='INSERT' OR NOT readable_before);
  IF NOT needs_source THEN RETURN NEW; END IF;
  IF NEW.role<>'tribemate' OR NEW.status_reason<>'none' THEN RAISE EXCEPTION 'protected membership requires a basic source' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND (OLD.role<>'tribemate' OR NOT((OLD.status='blocked' AND OLD.status_reason='payment_blocked') OR (OLD.status='removed' AND OLD.status_reason='subscription_inactive'))
      OR OLD.commercial_recovery_status IS NULL OR NEW.status IS DISTINCT FROM OLD.commercial_recovery_status) THEN
    RAISE EXCEPTION 'protected recovery requires known readable commercial state' USING ERRCODE='23514';
  END IF;
  IF NEW.subscription_membership_effect_id IS NOT NULL THEN
    SELECT * INTO paid_effect FROM public.subscription_membership_effects WHERE id=NEW.subscription_membership_effect_id FOR UPDATE;
    IF FOUND AND paid_effect.applied_at IS NULL AND paid_effect.revoked_at IS NULL THEN
      IF ROW(paid_effect.tribe_id,paid_effect.user_id,paid_effect.member_id,paid_effect.target_status) IS DISTINCT FROM ROW(NEW.tribe_id,NEW.user_id,NEW.id,NEW.status)
        OR NOT EXISTS(SELECT 1 FROM public.tribe_member_subscriptions subscription WHERE subscription.id=paid_effect.subscription_id AND subscription.tribe_id=NEW.tribe_id AND subscription.user_id=NEW.user_id AND subscription.product_key='membership' AND subscription.status='active' AND subscription.updated_at=paid_effect.source_updated_at AND subscription.mercado_pago_preapproval_id=paid_effect.provider_subscription_ref) THEN
        RAISE EXCEPTION 'paid membership source is absent, crossed or stale' USING ERRCODE='23514';
      END IF;
      UPDATE public.subscription_membership_effects SET applied_at=clock_timestamp() WHERE id=paid_effect.id;
      RETURN NEW;
    END IF;
  END IF;
  IF NEW.admission_membership_effect_id IS NULL THEN RAISE EXCEPTION 'protected membership requires a prospective source' USING ERRCODE='23514'; END IF;
  SELECT * INTO effect FROM public.academy_admission_membership_effects WHERE id=NEW.admission_membership_effect_id FOR UPDATE;
  IF NOT FOUND OR ROW(effect.tribe_id,effect.user_id,effect.member_id,effect.target_status) IS DISTINCT FROM ROW(NEW.tribe_id,NEW.user_id,NEW.id,NEW.status) OR effect.applied_at IS NOT NULL OR effect.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'protected membership source is absent, crossed or already consumed' USING ERRCODE='23514';
  END IF;
  UPDATE public.academy_admission_membership_effects SET applied_at=clock_timestamp() WHERE id=effect.id;
  RETURN NEW;
END;
$$;

-- Lists the commercially blocked memberships that still need a leader decision: tribemates whose
-- recovery state is unknown and privileged (guardian) memberships. The canonical leader row is never a case.
CREATE FUNCTION public.read_commercial_membership_reviews(p_tribe_id uuid,p_session_id text)
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
      AND ((member.status='blocked' AND member.status_reason='payment_blocked') OR (member.status='removed' AND member.status_reason='subscription_inactive'))
      AND (member.role='guardian' OR member.commercial_recovery_status IS NULL);
  SELECT coalesce(jsonb_agg(jsonb_build_object('memberId',page.id,'displayName',page.name,'role',page.role,'status',page.status,
      'statusReason',page.status_reason,'recoveryStatus',page.commercial_recovery_status,'joinedAt',page.created_at) ORDER BY page.created_at,page.id),'[]'::jsonb)
    INTO pending
    FROM (SELECT member.id,applicant.name,member.role,member.status,member.status_reason,member.commercial_recovery_status,member.created_at
      FROM public.tribe_members member JOIN public."user" applicant ON applicant.id=member.user_id
      WHERE member.tribe_id=p_tribe_id AND member.role IN ('guardian','tribemate')
        AND ((member.status='blocked' AND member.status_reason='payment_blocked') OR (member.status='removed' AND member.status_reason='subscription_inactive'))
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
CREATE FUNCTION public.resolve_commercial_membership_review(
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
  IF NOT ((member.status='blocked' AND member.status_reason='payment_blocked') OR (member.status='removed' AND member.status_reason='subscription_inactive')) THEN
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
