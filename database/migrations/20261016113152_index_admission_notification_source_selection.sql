-- Seek original source positions within a bounded private tenant sweep.
CREATE INDEX admission_notification_source_position_idx
ON public.academy_admission_notification_obligations(tribe_id,created_at,id);
