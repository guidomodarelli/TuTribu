-- The first admission activation converts the tribe's commercial memberships into free active members
-- inside the activation transaction, instead of asking the leader to decide each one in the rules flow.
--
-- * Who converts: guardian or tribemate rows in a commercial state (is_commercial_membership_state) that
--   show evidence of having been members: a guardian role (only members are promoted), a captured
--   commercial_recovery_status (the readable state snapshotted when the row became commercial), a
--   last_seen_at (presence is only touched while active or muted) or an applied paid membership source.
--   A paid invitation reserves blocked/payment_blocked when checkout opens and only a confirmed payment
--   makes the row readable, so a row with none of that evidence is a checkout that never joined: it is not
--   converted, but it keeps a paid way in. The activation records for it the snapshot a paid invitation promises
--   (active), audited as recover_active / academy_activation_pending_checkout, so a payment confirmed after the
--   activation still admits it through the protected paid recovery instead of failing on an unknown history.
-- * What they become: tribemate, active, none. The guardian role is dropped. Academy content still
--   depends on a subscription or grant; the conversion grants none.
-- * Trace: one append-only tribe_member_commercial_resolutions row per member, decision convert_free,
--   basis academy_activation_conversion, keyed by the activation ledger operation.
-- * After conversion the legacy membership subscription no longer governs the row: the subscription
--   reconciliation skips converted members (commercial_membership_converted_to_free), so a stale
--   Mercado Pago webhook cannot block or remove them again.
--
-- The leader review step is gone: its reader and resolver functions are dropped because nothing calls
-- them and a public SECURITY DEFINER writer without a product entrypoint is dead attack surface. The
-- resolutions table and its history are kept; recover_* and retire rows remain valid.

ALTER TABLE public.tribe_member_commercial_resolutions DROP CONSTRAINT tribe_member_commercial_resolution_operation_key;
ALTER TABLE public.tribe_member_commercial_resolutions ADD CONSTRAINT tribe_member_commercial_resolution_operation_key UNIQUE (tribe_id, operation_id, member_id);

ALTER TABLE public.tribe_member_commercial_resolutions DROP CONSTRAINT tribe_member_commercial_resolution_decision_check;
ALTER TABLE public.tribe_member_commercial_resolutions ADD CONSTRAINT tribe_member_commercial_resolution_decision_check
  CHECK (decision IN ('recover_active','recover_muted','retire','convert_free'));

ALTER TABLE public.tribe_member_commercial_resolutions DROP CONSTRAINT tribe_member_commercial_resolution_basis_check;
ALTER TABLE public.tribe_member_commercial_resolutions ADD CONSTRAINT tribe_member_commercial_resolution_basis_check CHECK (
  (decision='convert_free' AND basis='academy_activation_conversion')
  OR (decision='recover_active' AND basis='academy_activation_pending_checkout')
  OR (decision<>'convert_free' AND basis='prospective_leader_decision')
);

ALTER TABLE public.tribe_member_commercial_resolutions DROP CONSTRAINT tribe_member_commercial_resolution_result_check;
ALTER TABLE public.tribe_member_commercial_resolutions ADD CONSTRAINT tribe_member_commercial_resolution_result_check CHECK (
  resulting_role='tribemate'
  AND (
    (decision='recover_active' AND resulting_recovery_status='active' AND resulting_status=previous_status AND resulting_status_reason=previous_status_reason)
    OR (decision='recover_muted' AND resulting_recovery_status='muted' AND resulting_status=previous_status AND resulting_status_reason=previous_status_reason)
    OR (decision='retire' AND resulting_status='removed' AND resulting_status_reason='none'
      AND resulting_recovery_status IS NOT DISTINCT FROM previous_recovery_status)
    OR (decision='convert_free' AND resulting_status='active' AND resulting_status_reason='none'
      AND resulting_recovery_status IS NOT DISTINCT FROM previous_recovery_status)
  )
);

DROP FUNCTION public.resolve_commercial_membership_review(uuid,text,uuid,uuid,text,text,text,text,text,text);
DROP FUNCTION public.read_commercial_membership_reviews(uuid,text);

-- Single SQL source of who converts, shared by the activation writer and the preflight count. It is a
-- definer only to read the RLS-protected paid membership sources; it exposes a boolean, never a source row.
CREATE FUNCTION public.commercial_membership_converts_on_activation(candidate public.tribe_members)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT candidate.role IN ('guardian','tribemate')
    AND public.is_commercial_membership_state(candidate.status,candidate.status_reason)
    AND (candidate.role='guardian' OR candidate.commercial_recovery_status IS NOT NULL OR candidate.last_seen_at IS NOT NULL
      OR EXISTS(SELECT 1 FROM public.subscription_membership_effects paid WHERE paid.member_id=candidate.id AND paid.tribe_id=candidate.tribe_id
        AND paid.user_id=candidate.user_id AND paid.applied_at IS NOT NULL))
$$;
REVOKE ALL ON FUNCTION public.commercial_membership_converts_on_activation(public.tribe_members) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.commercial_membership_converts_on_activation(public.tribe_members) TO PUBLIC;

-- Converts every eligible commercial membership of a tribe that is about to activate admission control.
-- Runs in the activation transaction before the marker is set, so the membership-source guard still treats
-- the tribe as unprotected and the update needs no admission source. Returns the converted count.
CREATE FUNCTION public.convert_commercial_memberships_on_admission_activation(p_tribe_id uuid,p_session_id text,p_operation_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor_id text := public.current_app_user_id(); member public.tribe_members%ROWTYPE; converted integer := 0;
BEGIN
  IF actor_id IS NULL OR p_session_id IS NULL OR p_tribe_id IS NULL OR p_operation_id IS NULL THEN
    RAISE EXCEPTION 'commercial membership conversion requires an authenticated activation' USING ERRCODE='42501';
  END IF;
  PERFORM tribe.id FROM public.tribes tribe WHERE tribe.id=p_tribe_id AND tribe.admissions_control_activated_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'commercial membership conversion requires a tribe before its first activation' USING ERRCODE='23514'; END IF;
  PERFORM session.id FROM public.session session WHERE session.id=p_session_id AND session."userId"=actor_id AND session."expiresAt">clock_timestamp() FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'commercial membership conversion requires a current session' USING ERRCODE='42501'; END IF;
  IF NOT public.lock_admission_canonical_leader(p_tribe_id) THEN
    RAISE EXCEPTION 'commercial membership conversion requires the canonical leader' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.tribe_academy_settings settings WHERE settings.tribe_id=p_tribe_id AND settings.access_model='academy') THEN
    RAISE EXCEPTION 'commercial membership conversion requires an academy tribe' USING ERRCODE='23514';
  END IF;
  FOR member IN SELECT candidate.* FROM public.tribe_members candidate
    WHERE candidate.tribe_id=p_tribe_id AND candidate.user_id<>actor_id AND public.commercial_membership_converts_on_activation(candidate)
    ORDER BY candidate.id FOR UPDATE
  LOOP
    INSERT INTO public.tribe_member_commercial_resolutions(tribe_id,member_id,member_user_id,actor_user_id,operation_id,decision,basis,
      previous_role,previous_status,previous_status_reason,previous_recovery_status,
      resulting_role,resulting_status,resulting_status_reason,resulting_recovery_status,reason)
    VALUES (p_tribe_id,member.id,member.user_id,actor_id,p_operation_id,'convert_free','academy_activation_conversion',
      member.role,member.status,member.status_reason,member.commercial_recovery_status,
      'tribemate','active','none',member.commercial_recovery_status,NULL);
    UPDATE public.tribe_members SET role='tribemate',status='active',status_reason='none' WHERE id=member.id AND tribe_id=p_tribe_id;
    -- The guards may never silently keep another state: confirm the exact persisted outcome.
    IF NOT EXISTS(SELECT 1 FROM public.tribe_members saved WHERE saved.id=member.id AND saved.role='tribemate' AND saved.status='active' AND saved.status_reason='none') THEN
      RAISE EXCEPTION 'commercial membership conversion was not persisted' USING ERRCODE='23514';
    END IF;
    converted := converted + 1;
  END LOOP;
  -- The rows left commercial are paid checkouts that never joined. Once protected, a confirmed payment only recovers
  -- a known snapshot, so record the one a paid invitation promises (active) under the same audited resolution the
  -- membership-source guard accepts in this transaction. They stay blocked until a payment confirms.
  FOR member IN SELECT candidate.* FROM public.tribe_members candidate
    WHERE candidate.tribe_id=p_tribe_id AND candidate.user_id<>actor_id AND candidate.role='tribemate'
      AND public.is_commercial_membership_state(candidate.status,candidate.status_reason) AND candidate.commercial_recovery_status IS NULL
    ORDER BY candidate.id FOR UPDATE
  LOOP
    INSERT INTO public.tribe_member_commercial_resolutions(tribe_id,member_id,member_user_id,actor_user_id,operation_id,decision,basis,
      previous_role,previous_status,previous_status_reason,previous_recovery_status,
      resulting_role,resulting_status,resulting_status_reason,resulting_recovery_status,reason)
    VALUES (p_tribe_id,member.id,member.user_id,actor_id,p_operation_id,'recover_active','academy_activation_pending_checkout',
      member.role,member.status,member.status_reason,NULL,
      'tribemate',member.status,member.status_reason,'active',NULL);
    UPDATE public.tribe_members SET commercial_recovery_status='active' WHERE id=member.id AND tribe_id=p_tribe_id;
    IF NOT EXISTS(SELECT 1 FROM public.tribe_members saved WHERE saved.id=member.id AND saved.status=member.status
      AND saved.status_reason=member.status_reason AND saved.commercial_recovery_status='active') THEN
      RAISE EXCEPTION 'pending checkout recovery snapshot was not persisted' USING ERRCODE='23514';
    END IF;
  END LOOP;
  RETURN converted;
END;
$$;
REVOKE ALL ON FUNCTION public.convert_commercial_memberships_on_admission_activation(uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.convert_commercial_memberships_on_admission_activation(uuid,text,uuid) TO PUBLIC;

-- Membership-product reconciliation runs as the paying account, which cannot read the leader-only audit.
-- This definer predicate exposes only whether one membership was converted, never the audit row.
CREATE FUNCTION public.commercial_membership_converted_to_free(p_member_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT EXISTS(SELECT 1 FROM public.tribe_member_commercial_resolutions conversion
    WHERE conversion.member_id=p_member_id AND conversion.decision='convert_free')
$$;
REVOKE ALL ON FUNCTION public.commercial_membership_converted_to_free(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.commercial_membership_converted_to_free(uuid) TO PUBLIC;
