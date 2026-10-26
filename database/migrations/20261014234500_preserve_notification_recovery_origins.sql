-- Recovered deliveries outlive the live tribe and its executable operation ledger.
-- Keep only the opaque origin pair for exactly the retained delivery's lifetime.
-- Acquire every existing DDL owner in its final mode before backfill. A busy
-- owner rejects the whole cutover instead of forming a lock-upgrade cycle.
LOCK TABLE public.tribes,public.academy_admission_tribe_namespaces,
  public.academy_admission_operations,public.message_deliveries IN ACCESS EXCLUSIVE MODE NOWAIT;
--> statement-breakpoint

CREATE TABLE public.messaging_notification_recovery_origins (
  operation_id uuid NOT NULL,
  tribe_id uuid NOT NULL,
  CONSTRAINT messaging_notification_recovery_origins_pkey PRIMARY KEY(operation_id,tribe_id),
  CONSTRAINT messaging_notification_recovery_origin_namespace_fkey FOREIGN KEY(tribe_id)
    REFERENCES public.academy_admission_tribe_namespaces(tribe_id)
);
ALTER TABLE public.messaging_notification_recovery_origins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messaging_notification_recovery_origins FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.messaging_notification_recovery_origins FROM PUBLIC;
CREATE POLICY messaging_notification_recovery_origin_owner ON public.messaging_notification_recovery_origins FOR ALL
  USING(current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.messaging_notification_recovery_origins'::regclass))
  WITH CHECK(current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.messaging_notification_recovery_origins'::regclass));

-- The old FK guarantees a live source for every committed recovery at cutover.
-- Do not manufacture continuity from an archived operation or an arbitrary id.
INSERT INTO public.messaging_notification_recovery_origins(operation_id,tribe_id)
  SELECT DISTINCT operation.id,operation.tribe_id
  FROM public.message_deliveries delivery
  JOIN public.academy_admission_operations operation
    ON operation.id=delivery.recovery_operation_id AND operation.tribe_id=delivery.tribe_id
  WHERE delivery.recovery_operation_id IS NOT NULL
    AND operation.operation_type='recover_notification_delivery' AND operation.state='completed'
    AND operation.actor_user_id IS NOT DISTINCT FROM delivery.actor_user_id;

ALTER TABLE public.message_deliveries DROP CONSTRAINT messaging_delivery_recovery_operation_fkey;
ALTER TABLE public.message_deliveries ADD CONSTRAINT messaging_delivery_recovery_operation_fkey
  FOREIGN KEY(recovery_operation_id,tribe_id)
  REFERENCES public.messaging_notification_recovery_origins(operation_id,tribe_id);

CREATE FUNCTION public.register_notification_recovery_origin() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  IF NEW.recovery_operation_id IS NULL THEN RETURN NEW; END IF;
  -- Follow the owning writer's tenant fence; never wait backwards on deletion.
  PERFORM tribe.id FROM public.tribes tribe
    JOIN public.academy_admission_tribe_namespaces namespace ON namespace.tribe_id=tribe.id
    WHERE tribe.id=NEW.tribe_id AND namespace.retired_at IS NULL FOR KEY SHARE OF tribe NOWAIT;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'notification recovery requires its live tenant' USING ERRCODE='42501';
  END IF;
  PERFORM id FROM public.academy_admission_operations
    WHERE id=NEW.recovery_operation_id AND tribe_id=NEW.tribe_id
      AND actor_user_id=NEW.actor_user_id AND operation_type='recover_notification_delivery'
    FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'notification recovery requires its live scoped operation' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.messaging_notification_recovery_origins(operation_id,tribe_id)
    VALUES(NEW.recovery_operation_id,NEW.tribe_id) ON CONFLICT DO NOTHING;
  -- The existing deferred commit guard still requires completed original/audit identity.
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.register_notification_recovery_origin() FROM PUBLIC;
CREATE TRIGGER notification_recovery_origin_registration BEFORE INSERT ON public.message_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.register_notification_recovery_origin();

CREATE FUNCTION public.guard_notification_recovery_origin_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'notification recovery origin is immutable' USING ERRCODE='23514';
END;
$$;
REVOKE ALL ON FUNCTION public.guard_notification_recovery_origin_identity() FROM PUBLIC;
CREATE TRIGGER notification_recovery_origin_identity_guard BEFORE UPDATE
  ON public.messaging_notification_recovery_origins FOR EACH ROW
  EXECUTE FUNCTION public.guard_notification_recovery_origin_identity();

-- Preserve the former live FK's deletion protection. Only the actual tribe
-- cascade may remove the executable ledger after its exact original was archived.
CREATE FUNCTION public.guard_notification_recovery_live_operation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.messaging_notification_recovery_origins
      WHERE operation_id=OLD.id AND tribe_id=OLD.tribe_id)
    AND (EXISTS(SELECT 1 FROM public.tribes WHERE id=OLD.tribe_id)
      OR NOT EXISTS(SELECT 1 FROM public.academy_admission_retired_operations original
        WHERE original.id=OLD.id AND original.tribe_id=OLD.tribe_id
          AND ROW(original.actor_reference_id,original.operation_type,original.idempotency_key,
            original.intent_fingerprint,original.fingerprint_key_id,original.state,original.version,
            original.created_at,original.completed_at)
          IS NOT DISTINCT FROM ROW(OLD.actor_reference_id,OLD.operation_type,OLD.idempotency_key,
            OLD.intent_fingerprint,OLD.fingerprint_key_id,OLD.state,OLD.version,OLD.created_at,OLD.completed_at))) THEN
    RAISE EXCEPTION 'notification recovery live operation must retain its original lineage'
      USING ERRCODE='23503', CONSTRAINT='messaging_delivery_recovery_operation_fkey';
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_notification_recovery_live_operation() FROM PUBLIC;
CREATE TRIGGER notification_recovery_live_operation_guard BEFORE DELETE
  ON public.academy_admission_operations FOR EACH ROW
  EXECUTE FUNCTION public.guard_notification_recovery_live_operation();

CREATE FUNCTION public.release_deleted_notification_recovery_origin() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  IF OLD.recovery_operation_id IS NOT NULL THEN
    DELETE FROM public.messaging_notification_recovery_origins origin
      WHERE origin.operation_id=OLD.recovery_operation_id AND origin.tribe_id=OLD.tribe_id
        AND NOT EXISTS(SELECT 1 FROM public.message_deliveries delivery
          WHERE delivery.recovery_operation_id=origin.operation_id AND delivery.tribe_id=origin.tribe_id);
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.release_deleted_notification_recovery_origin() FROM PUBLIC;
CREATE TRIGGER notification_recovery_origin_release AFTER DELETE ON public.message_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.release_deleted_notification_recovery_origin();
