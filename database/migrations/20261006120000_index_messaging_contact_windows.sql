-- Bound continuity checks to recent request events instead of scanning all historical contact aliases.
CREATE INDEX messaging_usage_active_contact_idx
  ON public.messaging_usage_events(event_type,occurred_at,contact_subject_id)
  WHERE contact_subject_id IS NOT NULL;

-- Resolve retained-key coverage by subject without scanning historical fingerprints.
CREATE INDEX messaging_contact_alias_subject_key_idx
  ON public.messaging_contact_fingerprint_aliases(subject_id,fingerprint_key_id);
