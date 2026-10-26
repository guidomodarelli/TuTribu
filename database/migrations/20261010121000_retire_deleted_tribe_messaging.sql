-- Delivery identity and charged/uncertain attempts survive their live tribe.
-- This permits late original receipts without restoring send authority.
ALTER TABLE public.messaging_usage_policies
  DROP CONSTRAINT messaging_usage_tribe_fkey,
  ADD CONSTRAINT messaging_usage_tribe_fkey FOREIGN KEY(tribe_id)
    REFERENCES public.academy_admission_tribe_namespaces(tribe_id);
ALTER TABLE public.tenant_messaging_connections
  DROP CONSTRAINT messaging_connection_tribe_fkey,
  ADD CONSTRAINT messaging_connection_tribe_fkey FOREIGN KEY(tribe_id)
    REFERENCES public.academy_admission_tribe_namespaces(tribe_id);

CREATE FUNCTION public.retire_deleted_tribe_messaging()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE retirement_time timestamptz;
BEGIN
  retirement_time:=clock_timestamp();
  PERFORM id FROM public.tenant_messaging_connections
    WHERE tribe_id=OLD.id ORDER BY id FOR UPDATE;
  PERFORM connection_id FROM public.messaging_connection_versions
    WHERE tribe_id=OLD.id ORDER BY connection_id,version FOR UPDATE;
  PERFORM id FROM public.message_deliveries
    WHERE tribe_id=OLD.id ORDER BY id FOR UPDATE;

  -- Never rewrite a committed attempt, reservation, payload or its lease here.
  UPDATE public.message_deliveries delivery
    SET state='cancelled',last_outcome='tribe_deleted',lease_token=NULL,
      lease_until=NULL,version=version+1
    WHERE tribe_id=OLD.id AND state='queued'
      AND NOT EXISTS(SELECT 1 FROM public.message_delivery_attempts attempt
        WHERE attempt.delivery_id=delivery.id);
  UPDATE public.messaging_connection_versions
    SET retired_at=coalesce(public.messaging_connection_versions.retired_at,retirement_time),
      purge_after=coalesce(purge_after,retirement_time)
    WHERE tribe_id=OLD.id;
  UPDATE public.messaging_secret_envelopes
    SET retired_at=coalesce(public.messaging_secret_envelopes.retired_at,retirement_time),
      purge_after=coalesce(purge_after,retirement_time)
    WHERE tribe_id=OLD.id;
  UPDATE public.messaging_secret_envelopes
    SET iv=NULL,ciphertext=NULL,purged_at=clock_timestamp()
    WHERE tribe_id=OLD.id AND purged_at IS NULL;
  UPDATE public.tenant_messaging_connections
    SET state='disconnected',state_reason='tribe_deleted',is_selected=false,
      selected_version=NULL,is_candidate=false,candidate_version=NULL,
      retired_at=coalesce(public.tenant_messaging_connections.retired_at,retirement_time),
      version=version+1,updated_at=retirement_time
    WHERE tribe_id=OLD.id AND public.tenant_messaging_connections.retired_at IS NULL;

  -- Codes/proofs cannot authorize another request once the tribe is deleted.
  -- Deferred live request references disappear in the same parent transaction.
  DELETE FROM public.messaging_connection_diagnostics WHERE tribe_id=OLD.id;
  DELETE FROM public.verification_code_envelopes WHERE tribe_id=OLD.id;
  DELETE FROM public.academy_admission_verification_proofs WHERE tribe_id=OLD.id;
  DELETE FROM public.contact_verification_challenges WHERE tribe_id=OLD.id;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.retire_deleted_tribe_messaging() FROM PUBLIC;
-- Alphabetical ordering archives bindings before removing referenced proofs.
CREATE TRIGGER admission_tribe_messaging_retirement BEFORE DELETE ON public.tribes
  FOR EACH ROW EXECUTE FUNCTION public.retire_deleted_tribe_messaging();
