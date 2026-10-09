-- Preserve the exact private list resource/version used by a system decision.
-- Existing historical decisions remain unknown rather than receiving a backfill.
ALTER TABLE public.academy_admission_decisions
  ADD COLUMN allowlist_entry_id uuid,
  ADD COLUMN allowlist_entry_version integer,
  ADD CONSTRAINT admission_decision_allowlist_pair_check CHECK (
    (allowlist_entry_id IS NULL AND allowlist_entry_version IS NULL)
    OR (allowlist_entry_id IS NOT NULL AND allowlist_entry_version IS NOT NULL AND allowlist_entry_version > 0)
  ),
  ADD CONSTRAINT admission_decision_allowlist_scope_fkey
    FOREIGN KEY (allowlist_entry_id, tribe_id)
    REFERENCES public.academy_allowlist_entries(id, tribe_id) ON DELETE RESTRICT;

CREATE FUNCTION public.guard_admission_allowlist_authorization_history() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.allowlist_entry_id, NEW.allowlist_entry_version)
     IS DISTINCT FROM ROW(OLD.allowlist_entry_id, OLD.allowlist_entry_version) THEN
    RAISE EXCEPTION 'admission list authorization history is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_admission_allowlist_authorization_history() FROM PUBLIC;
CREATE TRIGGER admission_allowlist_authorization_history BEFORE UPDATE ON public.academy_admission_decisions
  FOR EACH ROW EXECUTE FUNCTION public.guard_admission_allowlist_authorization_history();
