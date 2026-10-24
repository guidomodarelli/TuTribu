-- Retain only private admission provenance when a physical tribe deletion commits.
-- Deliveries and shared abuse counters remain separate owners of their lifetime.
CREATE TABLE public.academy_admission_retired_bindings (
  id uuid PRIMARY KEY,
  tribe_id uuid NOT NULL REFERENCES public.academy_admission_tribe_namespaces(tribe_id),
  contact_type text NOT NULL CHECK(contact_type IN ('email','phone')),
  contact_fingerprint bytea NOT NULL,
  fingerprint_key_id text NOT NULL,
  owner_reference_id uuid NOT NULL,
  first_request_reference_id uuid,
  first_proof_reference_id uuid,
  evidence_source text NOT NULL,
  created_at timestamptz NOT NULL,
  retired_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT admission_retired_binding_scope_key UNIQUE(id,tribe_id),
  CONSTRAINT admission_retired_binding_time_check CHECK(retired_at>=created_at)
);
CREATE INDEX admission_retired_binding_contact_idx
  ON public.academy_admission_retired_bindings(tribe_id,contact_type,fingerprint_key_id,contact_fingerprint);

CREATE TABLE public.academy_admission_retired_operations (
  id uuid PRIMARY KEY,
  tribe_id uuid NOT NULL REFERENCES public.academy_admission_tribe_namespaces(tribe_id),
  actor_reference_id uuid NOT NULL,
  operation_type text NOT NULL,
  idempotency_key uuid NOT NULL,
  intent_fingerprint bytea NOT NULL,
  fingerprint_key_id text NOT NULL,
  state text NOT NULL,
  version integer NOT NULL CHECK(version>0),
  created_at timestamptz NOT NULL,
  completed_at timestamptz,
  retired_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT admission_retired_operation_scope_key UNIQUE(id,tribe_id),
  CONSTRAINT admission_retired_operation_time_check CHECK(retired_at>=created_at)
);

CREATE TABLE public.academy_admission_retired_audit_events (
  id uuid PRIMARY KEY,
  tribe_id uuid NOT NULL REFERENCES public.academy_admission_tribe_namespaces(tribe_id),
  actor_reference_id uuid,
  operation_id uuid,
  resource_type text NOT NULL,
  resource_id uuid,
  event_type text NOT NULL,
  rule text,
  resource_version integer,
  created_at timestamptz NOT NULL,
  retired_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT admission_retired_audit_operation_fkey FOREIGN KEY(operation_id,tribe_id)
    REFERENCES public.academy_admission_retired_operations(id,tribe_id),
  CONSTRAINT admission_retired_audit_time_check CHECK(retired_at>=created_at)
);
CREATE INDEX admission_retired_audit_history_idx
  ON public.academy_admission_retired_audit_events(tribe_id,created_at DESC);

-- Global account/contact abuse windows outlive the live tribe. Keep the same
-- event identities and timestamps so existing budget readers do not reset.
ALTER TABLE public.messaging_usage_events
  DROP CONSTRAINT messaging_usage_event_tribe_fkey,
  ADD CONSTRAINT messaging_usage_event_tribe_fkey FOREIGN KEY(tribe_id)
    REFERENCES public.academy_admission_tribe_namespaces(tribe_id);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'academy_admission_retired_bindings','academy_admission_retired_operations',
    'academy_admission_retired_audit_events'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC',table_name);
    EXECUTE format('CREATE POLICY admission_retired_owner_writer ON public.%I FOR ALL USING(current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid=%L::regclass)) WITH CHECK(current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid=%L::regclass))',table_name,'public.'||table_name,'public.'||table_name);
  END LOOP;
END;
$$;

CREATE FUNCTION public.archive_deleted_admission_tribe()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  -- Physical deletion holds the live tribe row; archive and purge share its transaction.
  INSERT INTO public.academy_admission_retired_operations(
    id,tribe_id,actor_reference_id,operation_type,idempotency_key,intent_fingerprint,
    fingerprint_key_id,state,version,created_at,completed_at
  ) SELECT id,tribe_id,actor_reference_id,operation_type,idempotency_key,intent_fingerprint,
    fingerprint_key_id,state,version,created_at,completed_at
    FROM public.academy_admission_operations WHERE tribe_id=OLD.id;

  INSERT INTO public.academy_admission_retired_audit_events(
    id,tribe_id,actor_reference_id,operation_id,resource_type,resource_id,event_type,
    rule,resource_version,created_at
  ) SELECT audit.id,audit.tribe_id,
    CASE WHEN audit.actor_user_id IS NULL THEN NULL
      WHEN audit.actor_user_id=operation.actor_user_id THEN operation.actor_reference_id
      ELSE gen_random_uuid() END,
    audit.operation_id,audit.resource_type,audit.resource_id,audit.event_type,
    audit.rule,audit.resource_version,audit.created_at
    FROM public.academy_admission_audit_events audit
    LEFT JOIN public.academy_admission_operations operation
      ON operation.id=audit.operation_id AND operation.tribe_id=audit.tribe_id
    WHERE audit.tribe_id=OLD.id;

  INSERT INTO public.academy_admission_retired_bindings(
    id,tribe_id,contact_type,contact_fingerprint,fingerprint_key_id,owner_reference_id,
    first_request_reference_id,first_proof_reference_id,evidence_source,created_at
  ) SELECT id,tribe_id,contact_type,contact_fingerprint,fingerprint_key_id,owner_reference_id,
    first_request_id,first_proof_id,evidence_source,created_at
    FROM public.academy_admission_contact_bindings WHERE tribe_id=OLD.id;

  DELETE FROM public.academy_admission_audit_events WHERE tribe_id=OLD.id;
  DELETE FROM public.academy_admission_contact_bindings WHERE tribe_id=OLD.id;
  -- Deferred membership/decision references disappear together with the live tribe.
  DELETE FROM public.academy_admission_membership_effects WHERE tribe_id=OLD.id;
  -- Import rows reference entries, entries reference imports, and import progress
  -- references original operations. Purge transient resources in dependency order
  -- before the parent cascade removes those already archived operations.
  DELETE FROM public.academy_allowlist_import_rows WHERE tribe_id=OLD.id;
  -- Decision -> request and membership cycles are deferred and disappear with
  -- the live tribe. Remove the immediate list reference only after audit copy.
  DELETE FROM public.academy_admission_decisions WHERE tribe_id=OLD.id;
  DELETE FROM public.academy_allowlist_entries WHERE tribe_id=OLD.id;
  DELETE FROM public.academy_allowlist_imports WHERE tribe_id=OLD.id;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.archive_deleted_admission_tribe() FROM PUBLIC;
CREATE TRIGGER admission_tribe_archive_before_delete BEFORE DELETE ON public.tribes
  FOR EACH ROW EXECUTE FUNCTION public.archive_deleted_admission_tribe();
