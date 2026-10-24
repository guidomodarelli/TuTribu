-- Audit operation references belong to the same tenant as their event.
-- A retained reference protects its ledger provenance until authorized retention
-- maintenance explicitly minimizes or removes the dependent audit record.
ALTER TABLE public.academy_admission_operations
  ADD CONSTRAINT admission_operation_scope_key UNIQUE (id, tribe_id);

ALTER TABLE public.academy_admission_audit_events
  ADD CONSTRAINT admission_audit_operation_fkey
  FOREIGN KEY (operation_id, tribe_id)
  REFERENCES public.academy_admission_operations(id, tribe_id)
  ON DELETE RESTRICT;
