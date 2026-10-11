-- Preserve each original intent and allow one explicit, audited child per original delivery.
ALTER TABLE public.message_deliveries
  ADD COLUMN recovery_of_delivery_id uuid,
  ADD COLUMN recovery_operation_id uuid,
  ADD CONSTRAINT messaging_delivery_tenant_key UNIQUE(id,tribe_id),
  ADD CONSTRAINT messaging_delivery_recovery_parent_key UNIQUE(recovery_of_delivery_id),
  ADD CONSTRAINT messaging_delivery_recovery_scope_check CHECK (
    (recovery_of_delivery_id IS NULL AND recovery_operation_id IS NULL)
    OR (recovery_of_delivery_id IS NOT NULL AND recovery_operation_id IS NOT NULL
      AND recovery_of_delivery_id<>id AND purpose='admission_notification' AND channel='email')
  ),
  ADD CONSTRAINT messaging_delivery_recovery_parent_fkey
    FOREIGN KEY(recovery_of_delivery_id,tribe_id) REFERENCES public.message_deliveries(id,tribe_id),
  ADD CONSTRAINT messaging_delivery_recovery_operation_fkey
    FOREIGN KEY(recovery_operation_id,tribe_id) REFERENCES public.academy_admission_operations(id,tribe_id);

ALTER TABLE public.message_deliveries DROP CONSTRAINT messaging_delivery_logical_key;
ALTER TABLE public.message_deliveries ADD CONSTRAINT messaging_delivery_logical_key
  UNIQUE NULLS NOT DISTINCT(tribe_id,purpose,source_resource_id,recipient_ref,recovery_of_delivery_id);

CREATE FUNCTION public.guard_notification_recovery_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF ROW(NEW.recovery_of_delivery_id,NEW.recovery_operation_id)
    IS DISTINCT FROM ROW(OLD.recovery_of_delivery_id,OLD.recovery_operation_id) THEN
    RAISE EXCEPTION 'notification recovery lineage is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_notification_recovery_identity() FROM PUBLIC;
CREATE TRIGGER notification_recovery_identity_guard BEFORE UPDATE ON public.message_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.guard_notification_recovery_identity();

CREATE FUNCTION public.guard_notification_recovery_commit() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE original public.message_deliveries%ROWTYPE; operation public.academy_admission_operations%ROWTYPE;
BEGIN
  IF NEW.recovery_of_delivery_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO original FROM public.message_deliveries WHERE id=NEW.recovery_of_delivery_id;
  SELECT * INTO operation FROM public.academy_admission_operations WHERE id=NEW.recovery_operation_id;
  IF original.id IS NULL OR operation.id IS NULL
    OR original.state NOT IN ('cancelled','failed')
    OR ROW(NEW.tribe_id,NEW.purpose,NEW.source_resource_id,NEW.recipient_ref,NEW.environment,NEW.security_epoch,NEW.deadline_at)
      IS DISTINCT FROM ROW(original.tribe_id,original.purpose,original.source_resource_id,original.recipient_ref,original.environment,original.security_epoch,original.deadline_at)
    OR NEW.connection_id=original.connection_id OR NEW.channel<>'email'
    OR operation.tribe_id<>NEW.tribe_id OR operation.actor_user_id IS DISTINCT FROM NEW.actor_user_id
    OR operation.operation_type<>'recover_notification_delivery' OR operation.state<>'completed'
    OR NEW.idempotency_key<>operation.id
    OR EXISTS(SELECT 1 FROM public.message_delivery_attempts WHERE delivery_id=original.id AND state<>'rejected')
    OR (NOT EXISTS(SELECT 1 FROM public.message_delivery_attempts WHERE delivery_id=original.id) AND original.state<>'cancelled')
    OR NOT EXISTS(SELECT 1 FROM public.academy_admission_audit_events
      WHERE tribe_id=NEW.tribe_id AND operation_id=operation.id AND actor_user_id=operation.actor_user_id
        AND resource_type='message_delivery' AND resource_id=NEW.id AND event_type='notification_delivery_recovered'
        AND metadata=jsonb_build_object('originalDeliveryId',original.id,'targetConnectionId',NEW.connection_id)) THEN
    RAISE EXCEPTION 'notification recovery requires closed original transport and atomic original lineage/audit' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_notification_recovery_commit() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER notification_recovery_commit_guard AFTER INSERT ON public.message_deliveries
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_notification_recovery_commit();
