-- Bind temporary file context and every confirmed row to its original operation.
-- Legacy previews keep null recovery metadata and remain closed to new writes.
ALTER TABLE public.academy_allowlist_imports
  ADD COLUMN security_environment text,
  ADD COLUMN security_epoch text,
  ADD COLUMN active_operation_id uuid REFERENCES public.academy_admission_operations(id) ON DELETE RESTRICT,
  ADD COLUMN completed_rows integer NOT NULL DEFAULT 0 CHECK(completed_rows BETWEEN 0 AND 10000);
ALTER TABLE public.academy_allowlist_import_rows
  ADD COLUMN entry_version integer CHECK(entry_version>0),
  ADD COLUMN confirmed_operation_id uuid REFERENCES public.academy_admission_operations(id) ON DELETE RESTRICT;
ALTER TABLE public.academy_allowlist_import_rows ADD CONSTRAINT admission_import_row_original_result_check
  CHECK(outcome IS NULL OR (confirmed_operation_id IS NOT NULL AND
    ((outcome IN ('added','unchanged') AND entry_id IS NOT NULL AND entry_version IS NOT NULL)
      OR (outcome IN ('skipped','conflict') AND entry_id IS NULL AND entry_version IS NULL)))) NOT VALID;

-- Accepted selections survive a different explicit resume. This is a private
-- backend ledger: runtime request roles get no read/write policy or grant.
ALTER TABLE public.academy_admission_operations ADD CONSTRAINT admission_operation_actor_scope_key UNIQUE(id,tribe_id,actor_user_id);
ALTER TABLE public.academy_allowlist_imports ADD CONSTRAINT admission_import_actor_scope_key UNIQUE(id,tribe_id,actor_user_id);
CREATE TABLE public.academy_allowlist_import_selections (
  operation_id uuid PRIMARY KEY,
  import_id uuid NOT NULL,
  tribe_id uuid NOT NULL,
  actor_user_id text NOT NULL,
  expected_version integer NOT NULL CHECK(expected_version>0),
  selected_rows integer[] NOT NULL CHECK(cardinality(selected_rows)>0 AND cardinality(selected_rows)<=10000),
  accepted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(operation_id,tribe_id,actor_user_id) REFERENCES public.academy_admission_operations(id,tribe_id,actor_user_id) ON DELETE RESTRICT,
  FOREIGN KEY(import_id,tribe_id,actor_user_id) REFERENCES public.academy_allowlist_imports(id,tribe_id,actor_user_id) ON DELETE CASCADE
);
ALTER TABLE public.academy_allowlist_import_selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_allowlist_import_selections FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.academy_allowlist_import_selections FROM PUBLIC;
CREATE POLICY admission_owner_writer ON public.academy_allowlist_import_selections FOR ALL
  USING(current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.academy_allowlist_import_selections'::regclass))
  WITH CHECK(current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.academy_allowlist_import_selections'::regclass));
CREATE FUNCTION public.guard_allowlist_import_selection_original() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'allowlist import accepted selection is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_allowlist_import_selection_original() FROM PUBLIC;
CREATE TRIGGER admission_import_selection_original_guard BEFORE UPDATE ON public.academy_allowlist_import_selections
  FOR EACH ROW EXECUTE FUNCTION public.guard_allowlist_import_selection_original();

CREATE FUNCTION public.guard_allowlist_import_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.tribe_id,NEW.actor_user_id,NEW.contact_type,NEW.policy_version,
    NEW.file_fingerprint,NEW.fingerprint_key_id,NEW.security_environment,NEW.security_epoch,
    NEW.created_at,NEW.expires_at,NEW.purge_after) IS DISTINCT FROM
    ROW(OLD.id,OLD.tribe_id,OLD.actor_user_id,OLD.contact_type,OLD.policy_version,
    OLD.file_fingerprint,OLD.fingerprint_key_id,OLD.security_environment,OLD.security_epoch,
    OLD.created_at,OLD.expires_at,OLD.purge_after) THEN
    RAISE EXCEPTION 'allowlist import identity and deadline are immutable' USING ERRCODE='23514';
  END IF;
  IF OLD.state IN ('completed','cancelled','expired') AND
    ROW(NEW.state,NEW.selected_rows,NEW.completed_rows) IS DISTINCT FROM
    ROW(OLD.state,OLD.selected_rows,OLD.completed_rows) THEN
    RAISE EXCEPTION 'allowlist import terminal progress is immutable' USING ERRCODE='23514';
  END IF;
  IF NEW.completed_rows<OLD.completed_rows THEN
    RAISE EXCEPTION 'allowlist import confirmed progress cannot decrease' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_allowlist_import_identity() FROM PUBLIC;
CREATE TRIGGER admission_import_identity_guard BEFORE UPDATE ON public.academy_allowlist_imports
  FOR EACH ROW EXECUTE FUNCTION public.guard_allowlist_import_identity();
CREATE TRIGGER admission_import_version_guard BEFORE UPDATE ON public.academy_allowlist_imports
  FOR EACH ROW EXECUTE FUNCTION public.guard_admission_resource_version('state','selected_rows','completed_rows');

CREATE FUNCTION public.guard_allowlist_import_row_original() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.import_id,NEW.tribe_id,NEW.row_number,NEW.input_data,NEW.validation_result)
    IS DISTINCT FROM ROW(OLD.import_id,OLD.tribe_id,OLD.row_number,OLD.input_data,OLD.validation_result) THEN
    RAISE EXCEPTION 'allowlist import input and preview validation are immutable' USING ERRCODE='23514';
  END IF;
  IF OLD.outcome IS NOT NULL AND ROW(NEW.outcome,NEW.entry_id,NEW.entry_version,NEW.confirmed_operation_id,NEW.committed_at)
    IS DISTINCT FROM ROW(OLD.outcome,OLD.entry_id,OLD.entry_version,OLD.confirmed_operation_id,OLD.committed_at) THEN
    RAISE EXCEPTION 'allowlist import confirmed row is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_allowlist_import_row_original() FROM PUBLIC;
CREATE TRIGGER admission_import_row_original_guard BEFORE UPDATE ON public.academy_allowlist_import_rows
  FOR EACH ROW EXECUTE FUNCTION public.guard_allowlist_import_row_original();

-- Final authorization/MAC waits occur after staging a row. Check the immutable
-- deadline again at transaction commit, so no expired block becomes durable.
CREATE FUNCTION public.guard_allowlist_import_row_deadline_commit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE deadline timestamptz;
BEGIN
  IF OLD.outcome IS NULL AND NEW.outcome IS NOT NULL THEN
    SELECT expires_at INTO deadline FROM public.academy_allowlist_imports
      WHERE id=NEW.import_id AND tribe_id=NEW.tribe_id;
    IF deadline IS NULL OR NEW.committed_at>=deadline OR clock_timestamp()>=deadline THEN
      RAISE EXCEPTION 'allowlist import row deadline passed before commit' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_allowlist_import_row_deadline_commit() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER admission_import_row_deadline_commit_guard
  AFTER UPDATE ON public.academy_allowlist_import_rows DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.guard_allowlist_import_row_deadline_commit();
