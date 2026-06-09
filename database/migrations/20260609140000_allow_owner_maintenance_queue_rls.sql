-- Make the orphan-image remote-deletion queue portable to deployments whose
-- migration/app role is an ordinary table owner WITHOUT BYPASSRLS.
--
-- 20260609120000 locked public.pending_remote_image_deletions with FORCE ROW
-- LEVEL SECURITY and intentionally NO policies, on the assumption that the
-- SECURITY DEFINER maintenance functions — which run as the table owner — would
-- always cross it because the owner bypasses RLS. That assumption only holds when
-- the owner carries the BYPASSRLS attribute (as Neon's `neondb_owner` does). In a
-- deployment where the owner is an ordinary role without BYPASSRLS, FORCE ROW
-- LEVEL SECURITY applies RLS to the owner too, and with no policy present the
-- owner is denied every operation. The consequences:
--   * the BEFORE DELETE enqueue triggers can no longer INSERT, so deleting a
--     tribe or user that still has live message images fails with
--     "new row violates row-level security policy" instead of capturing the
--     Cloudflare ids — the delete is aborted entirely;
--   * list_queued_remote_image_deletions returns nothing and
--     delete_queued_remote_image_deletion no-ops, so the scheduled sweep can
--     never drain the queue and the Cloudflare assets leak.
--
-- The fix follows the owner-exception pattern already used in this schema (see
-- 20260528140000, which lets the SECURITY DEFINER owner satisfy the
-- tribe_invitations UPDATE policy): add narrowly scoped policies that authorize
-- the table owner — and only the table owner — to enqueue, read, and dequeue.
-- The owner is matched dynamically against pg_class.relowner, so the policy is
-- correct whatever role owns the table in a given deployment, and it never has to
-- name a role that may not exist. FORCE ROW LEVEL SECURITY stays on, and because
-- the predicate requires `current_user` to BE the table owner, every other
-- principal (request-scoped roles, a future anonymous Data API role) is still
-- denied all direct access — the SECURITY DEFINER functions remain the only
-- sanctioned crossing point, exactly as the original lockdown intended.
--
-- Where the owner already bypasses RLS (the current Neon deployment) these
-- policies are a no-op: a BYPASSRLS owner is exempt from policy evaluation
-- regardless. They only change behavior for the non-bypass-owner deployment the
-- original design left broken.

-- INSERT crossing for the BEFORE DELETE enqueue triggers
-- (enqueue_tribe_message_images_for_remote_deletion /
-- enqueue_user_message_images_for_remote_deletion), which snapshot Cloudflare ids
-- into the queue before the CASCADE removes the owning message_images rows.
CREATE POLICY "Owner maintenance can enqueue remote image deletions"
ON public.pending_remote_image_deletions
FOR INSERT
WITH CHECK (
  current_user = (
    SELECT pg_get_userbyid(pg_class.relowner)
    FROM pg_class
    WHERE pg_class.oid = 'public.pending_remote_image_deletions'::regclass
  )
);

-- SELECT crossing for list_queued_remote_image_deletions, the sweep's
-- oldest-first batch read of queued (CASCADE-orphaned) ids.
CREATE POLICY "Owner maintenance can read remote image deletions"
ON public.pending_remote_image_deletions
FOR SELECT
USING (
  current_user = (
    SELECT pg_get_userbyid(pg_class.relowner)
    FROM pg_class
    WHERE pg_class.oid = 'public.pending_remote_image_deletions'::regclass
  )
);

-- DELETE crossing for delete_queued_remote_image_deletion, which drops a queued
-- entry once its Cloudflare DELETE has succeeded.
CREATE POLICY "Owner maintenance can delete remote image deletions"
ON public.pending_remote_image_deletions
FOR DELETE
USING (
  current_user = (
    SELECT pg_get_userbyid(pg_class.relowner)
    FROM pg_class
    WHERE pg_class.oid = 'public.pending_remote_image_deletions'::regclass
  )
);
