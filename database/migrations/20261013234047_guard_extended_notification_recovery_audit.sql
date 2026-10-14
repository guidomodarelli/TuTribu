-- Bind the enriched private recovery fact to the same closed transport and original operation.
CREATE OR REPLACE FUNCTION public.guard_notification_recovery_commit() RETURNS trigger
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
    OR NOT EXISTS(SELECT 1 FROM public.academy_admission_audit_events audit
      WHERE audit.tribe_id=NEW.tribe_id AND audit.operation_id=operation.id AND audit.actor_user_id=operation.actor_user_id
        AND audit.resource_type='message_delivery' AND audit.resource_id=NEW.id AND audit.event_type='notification_delivery_recovered'
        AND audit.rule='explicit_notification_recovery' AND audit.cause='authorized_connection_replacement'
        AND audit.resource_version=NEW.version AND audit.created_at=NEW.created_at
        AND audit.metadata->>'originalFromState' IN ('queued','failed','suppressed','cancelled')
        AND audit.metadata=jsonb_build_object(
          'fromState',NULL,'toState',NEW.state,'previousVersion',NULL,
          'connectionId',NEW.connection_id,'connectionVersion',NEW.connection_version,'channel',NEW.channel,
          'attemptId',NULL,'authorizedUsagePolicyVersion',NULL,
          'originalDeliveryId',original.id,'targetConnectionId',NEW.connection_id,
          'originalConnectionId',original.connection_id,'originalConnectionVersion',original.connection_version,
          'originalFromState',audit.metadata->'originalFromState','originalToState',original.state,
          'previousOriginalVersion',original.version-1,'originalVersion',original.version,
          'originalAttemptId',(SELECT id FROM public.message_delivery_attempts WHERE delivery_id=original.id ORDER BY sequence DESC LIMIT 1),
          'originalAuthorizedUsagePolicyVersion',(SELECT authorized_usage_policy_version FROM public.message_delivery_attempts WHERE delivery_id=original.id ORDER BY sequence DESC LIMIT 1))) THEN
    RAISE EXCEPTION 'notification recovery requires closed original transport and atomic original lineage/audit' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_notification_recovery_commit() FROM PUBLIC;
