-- Shared issuance namespaces retain their original UUID/MAC and record only
-- the private owner purpose required for readonly diagnostic recovery.
ALTER TABLE public.academy_admission_operations
  ADD COLUMN verification_purpose text,
  ADD CONSTRAINT admission_operation_verification_purpose_check CHECK (
    verification_purpose IS NULL OR (
      operation_type IN ('issue_contact_challenge','resend_contact_challenge')
      AND verification_purpose IN ('admission','connection_diagnostic')
    )
  );

-- Never infer denied/started history. An issued diagnostic needs the full
-- original ledger -> delivery -> challenge -> diagnostic owner lineage.
UPDATE public.academy_admission_operations operation
SET verification_purpose='connection_diagnostic'
WHERE operation.operation_type IN ('issue_contact_challenge','resend_contact_challenge')
  AND operation.state='completed'
  AND EXISTS (
    SELECT 1 FROM public.message_deliveries delivery
    JOIN public.contact_verification_challenges challenge
      ON challenge.delivery_id=delivery.id AND challenge.tribe_id=delivery.tribe_id
      AND challenge.connection_id=delivery.connection_id
      AND challenge.connection_version=delivery.connection_version
    JOIN public.messaging_connection_diagnostics diagnostic
      ON diagnostic.challenge_id=challenge.id AND diagnostic.tribe_id=challenge.tribe_id
      AND diagnostic.connection_id=challenge.connection_id
      AND diagnostic.connection_version=challenge.connection_version
    WHERE delivery.idempotency_key=operation.id AND delivery.tribe_id=operation.tribe_id
      AND delivery.actor_user_id=operation.actor_user_id
      AND challenge.user_id=operation.actor_user_id
      AND diagnostic.leader_user_id=operation.actor_user_id
      AND delivery.purpose='connection_diagnostic' AND challenge.purpose='connection_diagnostic'
      AND delivery.source_resource_id=diagnostic.id
      AND operation.public_result->>'outcome'='issued'
      AND operation.public_result->>'diagnosticId'=diagnostic.id::text
      AND operation.public_result->>'challengeId'=challenge.id::text
      AND operation.public_result->>'deliveryId'=delivery.id::text
      AND operation.public_result->>'connectionId'=delivery.connection_id::text
      AND operation.public_result->>'connectionVersion'=delivery.connection_version::text
  );

CREATE FUNCTION public.guard_admission_operation_verification_purpose()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.verification_purpose IS DISTINCT FROM OLD.verification_purpose THEN
    RAISE EXCEPTION 'admission operation verification purpose is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_admission_operation_verification_purpose() FROM PUBLIC;
CREATE TRIGGER admission_operation_verification_purpose_guard
BEFORE UPDATE ON public.academy_admission_operations
FOR EACH ROW EXECUTE FUNCTION public.guard_admission_operation_verification_purpose();
