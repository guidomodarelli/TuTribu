-- Make the orphan-image maintenance crossings on public.message_images portable
-- to deployments whose migration/app role is an ordinary table owner WITHOUT
-- BYPASSRLS, mirroring 20260609140000 for the remote-deletion queue.
--
-- 20260529100000 put public.message_images under FORCE ROW LEVEL SECURITY with
-- only user/membership policies (read for tribemates, draft INSERT for active
-- members, UPDATE for authors/uploaders/staff). The SECURITY DEFINER maintenance
-- functions that run as the table owner with no app user context still touch this
-- table:
--   * reads: enqueue_tribe_message_images_for_remote_deletion and
--     enqueue_user_message_images_for_remote_deletion snapshot live ids before the
--     CASCADE; reclaim_abandoned_draft_message_images selects abandoned drafts in
--     its subquery; list_message_images_pending_remote_deletion batches pending
--     rows for the sweep;
--   * updates: reclaim_abandoned_draft_message_images marks abandoned drafts
--     pending_delete; confirm_message_image_remote_deleted finalizes a confirmed
--     remote delete; mark_message_images_pending_delete_on_message_delete marks
--     images pending_delete before a message is removed.
--
-- All of these assumed the owner bypasses RLS (as Neon's `neondb_owner` does). On
-- a deployment whose owner is an ordinary role WITHOUT BYPASSRLS, FORCE ROW LEVEL
-- SECURITY applies RLS to the owner too. The user/membership policies key on
-- public.current_app_user_id(), which is empty under the cron (and inside the
-- definer triggers there is no app user either), so they match nothing and the
-- owner is denied. The consequences:
--   * the scheduled sweep sees no abandoned drafts and no pending_delete rows, so
--     it can never reclaim or finalize them and the Cloudflare assets leak;
--   * deleting a message, tribe, or user fails: the BEFORE DELETE triggers can no
--     longer read or update message_images, aborting the delete.
--
-- The fix follows the same owner-exception pattern as 20260609140000 (and
-- 20260528140000 before it): add narrowly scoped policies that authorize the
-- table owner -- and only the table owner -- to read and update. The owner is
-- matched dynamically against pg_class.relowner, so the policy is correct
-- whatever role owns the table in a given deployment and never has to name a role
-- that may not exist. FORCE ROW LEVEL SECURITY stays on, and because the
-- predicate requires `current_user` to BE the table owner, every other principal
-- (request-scoped roles such as tutribu_rls_app, a future anonymous Data API
-- role) is still bound by the existing user/membership policies only -- the
-- SECURITY DEFINER functions remain the single sanctioned maintenance crossing.
--
-- No owner INSERT or DELETE policy is added: no maintenance path inserts into
-- message_images, and rows are removed only through the FK CASCADE, which is a
-- referential action exempt from RLS. The owner crossing needs read and update,
-- nothing more.
--
-- Where the owner already bypasses RLS (the current Neon deployment) these
-- policies are a no-op: a BYPASSRLS owner is exempt from policy evaluation
-- regardless. They only change behavior for the non-bypass-owner deployment the
-- original design left broken.

-- SELECT crossing for the enqueue triggers' snapshot reads, the reclaim subquery,
-- and list_message_images_pending_remote_deletion's pending-row batch.
CREATE POLICY "Owner maintenance can read message images"
ON public.message_images
FOR SELECT
USING (
  current_user = (
    SELECT pg_get_userbyid(pg_class.relowner)
    FROM pg_class
    WHERE pg_class.oid = 'public.message_images'::regclass
  )
);

-- UPDATE crossing for reclaim_abandoned_draft_message_images,
-- confirm_message_image_remote_deleted, and
-- mark_message_images_pending_delete_on_message_delete. USING authorizes the rows
-- the maintenance UPDATE can target; WITH CHECK authorizes the rewritten row it
-- produces. Both require current_user to be the table owner, so a non-bypass owner
-- is allowed while request-scoped roles never match this policy.
CREATE POLICY "Owner maintenance can update message images"
ON public.message_images
FOR UPDATE
USING (
  current_user = (
    SELECT pg_get_userbyid(pg_class.relowner)
    FROM pg_class
    WHERE pg_class.oid = 'public.message_images'::regclass
  )
)
WITH CHECK (
  current_user = (
    SELECT pg_get_userbyid(pg_class.relowner)
    FROM pg_class
    WHERE pg_class.oid = 'public.message_images'::regclass
  )
);
