-- Admission decisions are prospective, single-use sources of basic membership.
-- Product eligibility, moderation and current actor authority remain in application.
ALTER TABLE public.tribes ADD COLUMN admissions_control_activated_at timestamptz;
ALTER TABLE public.tribe_members ADD COLUMN commercial_recovery_status text
  CONSTRAINT tribe_member_commercial_recovery_check CHECK(commercial_recovery_status IN ('active','muted'));
ALTER TABLE public.tribe_members ADD COLUMN admission_membership_effect_id uuid;
CREATE UNIQUE INDEX tribe_member_admission_scope_key ON public.tribe_members(id,tribe_id,user_id);

CREATE TABLE public.academy_admission_membership_effects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id uuid NOT NULL UNIQUE,
  request_id uuid NOT NULL UNIQUE,
  tribe_id uuid NOT NULL REFERENCES public.tribes(id) DEFERRABLE INITIALLY DEFERRED,
  user_id text NOT NULL REFERENCES public."user"(id) DEFERRABLE INITIALLY DEFERRED,
  member_id uuid REFERENCES public.tribe_members(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  outcome text NOT NULL DEFAULT 'approved' CONSTRAINT admission_membership_effect_outcome_check CHECK(outcome='approved'),
  target_status text NOT NULL CONSTRAINT admission_membership_effect_target_check CHECK(target_status IN ('active','muted')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  applied_at timestamptz,
  revoked_at timestamptz,
  revocation_reason text,
  CONSTRAINT admission_membership_effect_scope_key UNIQUE(id,tribe_id,user_id,member_id),
  CONSTRAINT admission_membership_effect_decision_scope_key UNIQUE(id,decision_id,request_id,tribe_id,user_id,outcome),
  CONSTRAINT admission_membership_effect_decision_fkey FOREIGN KEY(decision_id,request_id,tribe_id,user_id,outcome)
    REFERENCES public.academy_admission_decisions(id,request_id,tribe_id,user_id,outcome) DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT admission_membership_effect_member_scope_fkey FOREIGN KEY(member_id,tribe_id,user_id)
    REFERENCES public.tribe_members(id,tribe_id,user_id) DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT admission_membership_effect_revocation_check CHECK((revoked_at IS NULL)=(revocation_reason IS NULL)),
  CONSTRAINT admission_membership_effect_time_check CHECK((applied_at IS NULL OR applied_at>=created_at) AND (revoked_at IS NULL OR (applied_at IS NOT NULL AND revoked_at>=applied_at)))
);
ALTER TABLE public.academy_admission_decisions ADD CONSTRAINT admission_decision_membership_effect_fkey
  FOREIGN KEY(membership_effect_id,id,request_id,tribe_id,user_id,outcome)
  REFERENCES public.academy_admission_membership_effects(id,decision_id,request_id,tribe_id,user_id,outcome) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.tribe_members ADD CONSTRAINT tribe_member_admission_effect_fkey
  FOREIGN KEY(admission_membership_effect_id,tribe_id,user_id,id)
  REFERENCES public.academy_admission_membership_effects(id,tribe_id,user_id,member_id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX admission_membership_effect_active_idx ON public.academy_admission_membership_effects(tribe_id,user_id) WHERE applied_at IS NOT NULL AND revoked_at IS NULL;
ALTER TABLE public.academy_admission_membership_effects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_admission_membership_effects FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.academy_admission_membership_effects FROM PUBLIC;
CREATE POLICY admission_membership_effect_owner_writer ON public.academy_admission_membership_effects FOR ALL
  USING(current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.academy_admission_membership_effects'::regclass))
  WITH CHECK(current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.academy_admission_membership_effects'::regclass));

CREATE FUNCTION public.guard_admission_control_marker() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' AND NEW.admissions_control_activated_at IS NOT NULL THEN
    RAISE EXCEPTION 'admission control activation must follow tribe bootstrap' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND OLD.admissions_control_activated_at IS NOT NULL AND NEW.admissions_control_activated_at IS DISTINCT FROM OLD.admissions_control_activated_at THEN
    RAISE EXCEPTION 'admission control activation marker is irreversible' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_admission_control_marker() FROM PUBLIC;
CREATE TRIGGER admission_control_marker_guard BEFORE INSERT OR UPDATE ON public.tribes FOR EACH ROW EXECUTE FUNCTION public.guard_admission_control_marker();

CREATE FUNCTION public.guard_admission_first_activation_commit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.admissions_control_activated_at IS NULL AND NEW.admissions_control_activated_at IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.academy_admission_policies policy WHERE policy.tribe_id=NEW.id AND policy.activated_at=NEW.admissions_control_activated_at
  ) THEN RAISE EXCEPTION 'admission control activation requires its policy in the same commit' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_admission_first_activation_commit() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER admission_first_activation_commit_guard AFTER UPDATE ON public.tribes
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_admission_first_activation_commit();

CREATE FUNCTION public.guard_admission_membership_effect_creation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.applied_at IS NOT NULL OR NEW.revoked_at IS NOT NULL OR NEW.member_id IS NULL THEN
    RAISE EXCEPTION 'admission membership effect must start unused and scoped' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_admission_membership_effect_creation() FROM PUBLIC;
CREATE TRIGGER admission_membership_effect_creation_guard BEFORE INSERT ON public.academy_admission_membership_effects
  FOR EACH ROW EXECUTE FUNCTION public.guard_admission_membership_effect_creation();

CREATE FUNCTION public.guard_admission_membership_effect_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.decision_id,NEW.request_id,NEW.tribe_id,NEW.user_id,NEW.outcome,NEW.target_status,NEW.created_at)
     IS DISTINCT FROM ROW(OLD.id,OLD.decision_id,OLD.request_id,OLD.tribe_id,OLD.user_id,OLD.outcome,OLD.target_status,OLD.created_at) THEN
    RAISE EXCEPTION 'admission membership effect origin is immutable' USING ERRCODE='23514';
  END IF;
  IF NEW.member_id IS DISTINCT FROM OLD.member_id AND NOT(
    OLD.member_id IS NOT NULL AND NEW.member_id IS NULL AND NEW.revoked_at IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM public.tribe_members member WHERE member.id=OLD.member_id)
  ) THEN RAISE EXCEPTION 'admission membership instance cannot be reassigned' USING ERRCODE='23514'; END IF;
  IF OLD.applied_at IS NOT NULL AND NEW.applied_at IS DISTINCT FROM OLD.applied_at THEN
    RAISE EXCEPTION 'admission membership consumption is irreversible' USING ERRCODE='23514';
  END IF;
  IF OLD.revoked_at IS NOT NULL AND ROW(NEW.revoked_at,NEW.revocation_reason) IS DISTINCT FROM ROW(OLD.revoked_at,OLD.revocation_reason) THEN
    RAISE EXCEPTION 'admission membership revocation is irreversible' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_admission_membership_effect_transition() FROM PUBLIC;
CREATE TRIGGER admission_membership_effect_transition_guard BEFORE UPDATE ON public.academy_admission_membership_effects
  FOR EACH ROW EXECUTE FUNCTION public.guard_admission_membership_effect_transition();

CREATE FUNCTION public.guard_admission_membership_effect_commit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE effect public.academy_admission_membership_effects%ROWTYPE;
BEGIN
  SELECT * INTO effect FROM public.academy_admission_membership_effects source WHERE source.id=NEW.id;
  IF effect.applied_at IS NULL OR effect.revoked_at IS NOT NULL OR NOT EXISTS(
    SELECT 1 FROM public.tribe_members member WHERE member.id=effect.member_id AND member.tribe_id=effect.tribe_id
      AND member.user_id=effect.user_id AND member.admission_membership_effect_id=effect.id AND member.status=effect.target_status
  ) THEN RAISE EXCEPTION 'admission decision requires consumed membership effect in the same commit' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_admission_membership_effect_commit() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER admission_membership_effect_commit_guard AFTER INSERT ON public.academy_admission_membership_effects
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_admission_membership_effect_commit();

CREATE FUNCTION public.guard_academy_membership_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE protected boolean; protected_before boolean=false; effect public.academy_admission_membership_effects%ROWTYPE; readable_before boolean=false; needs_source boolean;
  commercial_after boolean; active_basic_basis boolean=false;
BEGIN
  -- Changing a tenant is exceptional; lock both scopes in UUID order before
  -- deciding whether either existing or requested scope is already protected.
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
    ELSIF NOT readable_before THEN NEW.commercial_recovery_status=OLD.commercial_recovery_status; END IF;
    IF OLD.admission_membership_effect_id IS NOT NULL THEN
      SELECT EXISTS(SELECT 1 FROM public.academy_admission_membership_effects source WHERE source.id=OLD.admission_membership_effect_id
        AND source.tribe_id=OLD.tribe_id AND source.user_id=OLD.user_id AND source.member_id=OLD.id AND source.applied_at IS NOT NULL AND source.revoked_at IS NULL) INTO active_basic_basis;
    END IF;
    IF active_basic_basis AND commercial_after THEN
      NEW.status=OLD.status; NEW.status_reason=OLD.status_reason; NEW.admission_membership_effect_id=OLD.admission_membership_effect_id;
      RETURN NEW;
    END IF;
    IF readable_before AND NEW.status NOT IN ('active','muted') AND NOT commercial_after AND active_basic_basis THEN
      UPDATE public.academy_admission_membership_effects source SET revoked_at=clock_timestamp(),revocation_reason='membership_removed'
        WHERE source.id=OLD.admission_membership_effect_id AND source.revoked_at IS NULL;
    END IF;
    IF readable_before AND NEW.admission_membership_effect_id IS DISTINCT FROM OLD.admission_membership_effect_id THEN
      RAISE EXCEPTION 'existing readable membership does not consume another admission' USING ERRCODE='23514';
    END IF;
  END IF;
  needs_source=coalesce(protected,false) AND NEW.status IN ('active','muted') AND (TG_OP='INSERT' OR NOT readable_before);
  IF NOT needs_source THEN RETURN NEW; END IF;
  IF NEW.admission_membership_effect_id IS NULL OR NEW.role<>'tribemate' OR NEW.status_reason<>'none' THEN
    RAISE EXCEPTION 'protected membership requires a basic admission source' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND (OLD.role<>'tribemate' OR NOT((OLD.status='blocked' AND OLD.status_reason='payment_blocked') OR (OLD.status='removed' AND OLD.status_reason='subscription_inactive'))
      OR OLD.commercial_recovery_status IS NULL OR NEW.status IS DISTINCT FROM OLD.commercial_recovery_status) THEN
    RAISE EXCEPTION 'protected recovery requires known readable commercial state' USING ERRCODE='23514';
  END IF;
  SELECT * INTO effect FROM public.academy_admission_membership_effects source WHERE source.id=NEW.admission_membership_effect_id FOR UPDATE;
  IF NOT FOUND OR ROW(effect.tribe_id,effect.user_id,effect.member_id,effect.target_status) IS DISTINCT FROM ROW(NEW.tribe_id,NEW.user_id,NEW.id,NEW.status)
    OR effect.applied_at IS NOT NULL OR effect.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'protected membership source is absent, crossed or already consumed' USING ERRCODE='23514';
  END IF;
  UPDATE public.academy_admission_membership_effects source SET applied_at=clock_timestamp() WHERE source.id=effect.id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_academy_membership_source() FROM PUBLIC;
CREATE TRIGGER academy_membership_source_guard BEFORE INSERT OR UPDATE ON public.tribe_members
  FOR EACH ROW EXECUTE FUNCTION public.guard_academy_membership_source();

CREATE FUNCTION public.revoke_deleted_admission_membership_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.admission_membership_effect_id IS NOT NULL THEN
    UPDATE public.academy_admission_membership_effects source SET revoked_at=clock_timestamp(),revocation_reason='membership_deleted'
      WHERE source.id=OLD.admission_membership_effect_id AND source.revoked_at IS NULL;
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.revoke_deleted_admission_membership_source() FROM PUBLIC;
CREATE TRIGGER admission_membership_delete_guard BEFORE DELETE ON public.tribe_members
  FOR EACH ROW EXECUTE FUNCTION public.revoke_deleted_admission_membership_source();

-- Simple RLS scope predicate; a missing tribe is closed. Permission to read
-- source rows or consume them is never granted by this boolean projection.
CREATE FUNCTION public.tribe_admission_control_is_active(target_tribe_id uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE protected boolean;
BEGIN
  -- SHARE conflicts with the non-key activation UPDATE; KEY SHARE would not.
  -- READ COMMITTED rechecks the current tuple after waiting for that lock.
  SELECT tribe.admissions_control_activated_at IS NOT NULL INTO protected
    FROM public.tribes tribe WHERE tribe.id=target_tribe_id FOR SHARE;
  RETURN coalesce(protected,true);
END;
$$;
CREATE POLICY academy_admission_provenance_required ON public.tribe_members AS RESTRICTIVE FOR INSERT
  WITH CHECK(NOT public.tribe_admission_control_is_active(tribe_id) OR admission_membership_effect_id IS NOT NULL);

-- Preserve canonical legacy behavior before activation. Afterwards these
-- selectors cannot route a caller around the single admission writer.
CREATE OR REPLACE FUNCTION public.tribe_academy_admission_id_by_slug(target_tribe_slug text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT tribes.id FROM public.tribes
  INNER JOIN public.tribe_academy_settings ON tribe_academy_settings.tribe_id=tribes.id
  WHERE tribes.slug=lower(btrim(target_tribe_slug)) AND tribe_academy_settings.access_model='academy'
    AND tribe_academy_settings.admission_enabled=true AND tribes.admissions_control_activated_at IS NULL
    AND public.current_app_user_id() IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM public.tribe_members WHERE tribe_members.tribe_id=tribes.id
      AND tribe_members.user_id=public.current_app_user_id() AND tribe_members.status='blocked' AND tribe_members.status_reason='conduct_blocked')
  LIMIT 1;
$$;
CREATE OR REPLACE FUNCTION public.tribe_open_join_id_by_slug(target_tribe_slug text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT tribes.id FROM public.tribes
  INNER JOIN public.tribe_subscription_prices ON tribe_subscription_prices.tribe_id=tribes.id
  WHERE tribes.slug=target_tribe_slug AND tribes.free_join_is_current=false AND tribes.admissions_control_activated_at IS NULL
    AND tribe_subscription_prices.product_key='membership' AND tribe_subscription_prices.status='active'
    AND tribe_subscription_prices.is_current=true AND tribe_subscription_prices.mercado_pago_preapproval_plan_id IS NOT NULL
    AND NOT public.tribe_uses_academy_access(tribes.id)
  LIMIT 1;
$$;

-- Legacy WITH CHECK subqueries joined tribes back to tribe_members and recurse
-- under a genuine non-bypass role. Keep the same scoped facts behind definer
-- predicates; the provenance trigger still applies to the privileged writer.
CREATE FUNCTION public.can_accept_legacy_free_invitation(target_tribe_id uuid,target_invitation_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.current_app_user_id() IS NOT NULL AND NOT public.tribe_admission_control_is_active(target_tribe_id) AND EXISTS(
    SELECT 1 FROM public.tribes tribe INNER JOIN public.tribe_invitations invitation ON invitation.tribe_id=tribe.id
    WHERE tribe.id=target_tribe_id AND invitation.status='active'
      AND invitation.token_hash=NULLIF(current_setting('app.current_invitation_hash',true),'')
      AND (target_invitation_id IS NULL OR target_invitation_id=invitation.id)
      AND (invitation.subscription_association_type='free' OR (invitation.subscription_association_type='current' AND tribe.free_join_is_current))
  );
$$;
CREATE FUNCTION public.can_join_legacy_academy(target_tribe_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT coalesce(target_tribe_id=public.tribe_academy_admission_id_by_slug((SELECT tribe.slug FROM public.tribes tribe WHERE tribe.id=target_tribe_id)),false);
$$;
ALTER POLICY "Authenticated users can accept active invitations" ON public.tribe_members
  WITH CHECK(user_id=public.current_app_user_id() AND role='tribemate' AND status='active' AND status_reason='none'
    AND joined_via='free_invitation' AND public.can_accept_legacy_free_invitation(tribe_id,joined_via_invitation_id));
ALTER POLICY "Authenticated users can activate own free invitation membership" ON public.tribe_members
  WITH CHECK(user_id=public.current_app_user_id() AND role='tribemate' AND status='active' AND status_reason='none'
    AND joined_via='free_invitation' AND public.can_accept_legacy_free_invitation(tribe_id,joined_via_invitation_id));
ALTER POLICY "Authenticated users can join academy tribes as basic members" ON public.tribe_members
  WITH CHECK(user_id=public.current_app_user_id() AND role='tribemate' AND status='active' AND status_reason='none'
    AND joined_via='academy_admission' AND joined_via_invitation_id IS NULL AND public.can_join_legacy_academy(tribe_id));
