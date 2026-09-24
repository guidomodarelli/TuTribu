-- Tribe events phase 4: let the request role evaluate the occurrence helper.
--
-- 20260923120000 created public.is_tribe_event_series_occurrence as an
-- owner-only helper (REVOKE FROM PUBLIC) because only the membership trigger
-- called it. The calendar feed and the shared "series in range" predicate
-- (monthly listing, attendance streak, feed) now call it directly from
-- request statements to drop exception rows that a schedule edit left stale.
-- The runtime connects as the schema owner, but with the intended
-- least-privilege request role those statements would fail with
-- "permission denied for function is_tribe_event_series_occurrence".
--
-- The function is safe to expose: it is pure and IMMUTABLE, reads no table,
-- is not SECURITY DEFINER, and only answers whether a timestamp is a slot of
-- the schedule passed as arguments, so it discloses nothing the caller did
-- not already provide. PUBLIC stays revoked; only the request role gains
-- EXECUTE. The role may not exist in every environment, so the grant is
-- guarded like the other request-role grants.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.is_tribe_event_series_occurrence(
      timestamptz, timestamptz, text, timestamptz
    ) TO authenticated;
  END IF;
END $$;
