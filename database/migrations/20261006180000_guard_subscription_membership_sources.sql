-- A current membership payment is a prospective source, independent of an old admission decision.
ALTER TABLE public.tribe_member_subscriptions ADD CONSTRAINT subscription_membership_origin_scope_key UNIQUE(id,tribe_id,user_id);
ALTER TABLE public.tribe_members ADD COLUMN subscription_membership_effect_id uuid;

CREATE TABLE public.subscription_membership_effects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid REFERENCES public.tribe_member_subscriptions(id) ON DELETE SET NULL,
  tribe_id uuid NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  member_id uuid REFERENCES public.tribe_members(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  provider_subscription_ref text NOT NULL,
  source_updated_at timestamptz NOT NULL,
  target_status text NOT NULL CONSTRAINT subscription_membership_target_check CHECK(target_status IN ('active','muted')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  applied_at timestamptz,
  revoked_at timestamptz,
  revocation_reason text,
  CONSTRAINT subscription_membership_event_key UNIQUE(subscription_id,member_id,source_updated_at),
  CONSTRAINT subscription_membership_effect_scope_key UNIQUE(id,tribe_id,user_id,member_id),
  CONSTRAINT subscription_membership_subscription_scope_fkey FOREIGN KEY(subscription_id,tribe_id,user_id)
    REFERENCES public.tribe_member_subscriptions(id,tribe_id,user_id) DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT subscription_membership_member_scope_fkey FOREIGN KEY(member_id,tribe_id,user_id)
    REFERENCES public.tribe_members(id,tribe_id,user_id) DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT subscription_membership_revocation_check CHECK((revoked_at IS NULL)=(revocation_reason IS NULL)),
  CONSTRAINT subscription_membership_time_check CHECK((applied_at IS NULL OR applied_at>=created_at) AND (revoked_at IS NULL OR (applied_at IS NOT NULL AND revoked_at>=applied_at)))
);
ALTER TABLE public.tribe_members ADD CONSTRAINT tribe_member_subscription_effect_fkey
  FOREIGN KEY(subscription_membership_effect_id,tribe_id,user_id,id)
  REFERENCES public.subscription_membership_effects(id,tribe_id,user_id,member_id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX subscription_membership_effect_active_idx ON public.subscription_membership_effects(tribe_id,user_id) WHERE applied_at IS NOT NULL AND revoked_at IS NULL;
ALTER TABLE public.subscription_membership_effects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_membership_effects FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.subscription_membership_effects FROM PUBLIC;
CREATE POLICY subscription_membership_effect_owner_writer ON public.subscription_membership_effects FOR ALL
  USING(current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.subscription_membership_effects'::regclass))
  WITH CHECK(current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.subscription_membership_effects'::regclass));

CREATE FUNCTION public.guard_subscription_membership_effect_origin() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE subscription_record public.tribe_member_subscriptions%ROWTYPE; price_record public.tribe_subscription_prices%ROWTYPE; integration_record public.tribe_payment_integrations%ROWTYPE;
BEGIN
  SELECT * INTO subscription_record FROM public.tribe_member_subscriptions WHERE id=NEW.subscription_id FOR SHARE;
  IF NOT FOUND OR subscription_record.product_key<>'membership' OR subscription_record.status<>'active'
    OR ROW(subscription_record.tribe_id,subscription_record.user_id,subscription_record.mercado_pago_preapproval_id,subscription_record.updated_at)
      IS DISTINCT FROM ROW(NEW.tribe_id,NEW.user_id,NEW.provider_subscription_ref,NEW.source_updated_at)
    OR subscription_record.mercado_pago_preapproval_id IS NULL THEN
    RAISE EXCEPTION 'paid membership source requires a current verified membership subscription' USING ERRCODE='23514';
  END IF;
  SELECT * INTO price_record FROM public.tribe_subscription_prices WHERE id=subscription_record.price_id AND tribe_id=NEW.tribe_id FOR SHARE;
  IF NOT FOUND OR price_record.product_key<>'membership' OR coalesce(subscription_record.payment_integration_id,price_record.payment_integration_id) IS DISTINCT FROM price_record.payment_integration_id THEN
    RAISE EXCEPTION 'paid membership source requires its own membership price and payment integration' USING ERRCODE='23514';
  END IF;
  SELECT * INTO integration_record FROM public.tribe_payment_integrations WHERE id=price_record.payment_integration_id AND tribe_id=NEW.tribe_id FOR SHARE;
  IF NOT FOUND OR integration_record.provider<>'mercado_pago' OR integration_record.status<>'connected' THEN
    RAISE EXCEPTION 'paid membership source payment integration is unavailable' USING ERRCODE='23514';
  END IF;
  IF NOT coalesce(public.can_manage_tribe_subscription_prices(NEW.tribe_id) OR public.current_app_user_id()=NEW.user_id OR public.is_mercado_pago_webhook_verified(),false) THEN
    RAISE EXCEPTION 'paid membership source requires current payment owner authority' USING ERRCODE='42501';
  END IF;
  IF NEW.applied_at IS NOT NULL OR NEW.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'paid membership source must be consumed prospectively' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_subscription_membership_effect_origin() FROM PUBLIC;
CREATE TRIGGER subscription_membership_effect_origin_guard BEFORE INSERT ON public.subscription_membership_effects
  FOR EACH ROW EXECUTE FUNCTION public.guard_subscription_membership_effect_origin();

CREATE FUNCTION public.guard_subscription_membership_effect_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.tribe_id,NEW.user_id,NEW.provider_subscription_ref,NEW.source_updated_at,NEW.target_status,NEW.created_at)
     IS DISTINCT FROM ROW(OLD.id,OLD.tribe_id,OLD.user_id,OLD.provider_subscription_ref,OLD.source_updated_at,OLD.target_status,OLD.created_at) THEN
    RAISE EXCEPTION 'paid membership effect origin is immutable' USING ERRCODE='23514';
  END IF;
  IF NEW.subscription_id IS DISTINCT FROM OLD.subscription_id AND NOT(OLD.subscription_id IS NOT NULL AND NEW.subscription_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.tribe_member_subscriptions WHERE id=OLD.subscription_id)) THEN
    RAISE EXCEPTION 'paid membership subscription origin cannot be reassigned' USING ERRCODE='23514';
  END IF;
  IF NEW.member_id IS DISTINCT FROM OLD.member_id AND NOT(OLD.member_id IS NOT NULL AND NEW.member_id IS NULL AND NEW.revoked_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.tribe_members WHERE id=OLD.member_id)) THEN
    RAISE EXCEPTION 'paid membership instance cannot be reassigned' USING ERRCODE='23514';
  END IF;
  IF OLD.applied_at IS NOT NULL AND NEW.applied_at IS DISTINCT FROM OLD.applied_at THEN
    RAISE EXCEPTION 'paid membership consumption is irreversible' USING ERRCODE='23514';
  END IF;
  IF OLD.revoked_at IS NOT NULL AND ROW(NEW.revoked_at,NEW.revocation_reason) IS DISTINCT FROM ROW(OLD.revoked_at,OLD.revocation_reason) THEN
    RAISE EXCEPTION 'paid membership revocation is irreversible' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_subscription_membership_effect_transition() FROM PUBLIC;
CREATE TRIGGER subscription_membership_effect_transition_guard BEFORE UPDATE ON public.subscription_membership_effects
  FOR EACH ROW EXECUTE FUNCTION public.guard_subscription_membership_effect_transition();

CREATE FUNCTION public.guard_subscription_membership_effect_commit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE effect public.subscription_membership_effects%ROWTYPE;
BEGIN
  SELECT * INTO effect FROM public.subscription_membership_effects WHERE id=NEW.id;
  IF effect.applied_at IS NULL OR effect.revoked_at IS NOT NULL OR NOT EXISTS(
    SELECT 1 FROM public.tribe_members member WHERE member.id=effect.member_id AND member.tribe_id=effect.tribe_id AND member.user_id=effect.user_id
      AND member.subscription_membership_effect_id=effect.id AND member.status=effect.target_status
  ) THEN RAISE EXCEPTION 'paid membership requires consumption in the same commit' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_subscription_membership_effect_commit() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER subscription_membership_effect_commit_guard AFTER INSERT ON public.subscription_membership_effects
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_subscription_membership_effect_commit();

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
    ELSIF NOT readable_before THEN NEW.commercial_recovery_status=OLD.commercial_recovery_status; END IF;
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

CREATE FUNCTION public.revoke_deleted_subscription_membership_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.subscription_membership_effects SET revoked_at=clock_timestamp(),revocation_reason='membership_deleted'
    WHERE member_id=OLD.id AND tribe_id=OLD.tribe_id AND user_id=OLD.user_id AND revoked_at IS NULL;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.revoke_deleted_subscription_membership_source() FROM PUBLIC;
CREATE TRIGGER subscription_membership_source_delete_guard BEFORE DELETE ON public.tribe_members FOR EACH ROW EXECUTE FUNCTION public.revoke_deleted_subscription_membership_source();
