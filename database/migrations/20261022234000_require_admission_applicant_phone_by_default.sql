-- New admission policies require the applicant phone by default.
-- The application writes the domain default explicitly when it initializes a policy; this keeps the
-- column default aligned for any other insert. Only the default changes: existing rows keep the value
-- they already stored, including policies whose leader left the phone optional.
ALTER TABLE public.academy_admission_policies ALTER COLUMN requires_whatsapp_number SET DEFAULT true;
