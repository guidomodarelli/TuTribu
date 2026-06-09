-- Guard the orphan-image sweep against the interactive delete window.
--
-- The interactive deleteImage path marks a message image pending_delete,
-- deletes the Cloudflare asset, then either confirms it deleted or — on a
-- transient Cloudflare failure — rolls the row back to its prior attached/draft
-- state. The scheduled sweep also drains pending_delete rows. If the sweep
-- picked up a row an interactive delete had just marked, it could delete and
-- confirm the remote asset while the interactive request, observing a transient
-- failure, restored the row to a visible state — leaving a visible row pointing
-- at an already-deleted Cloudflare image.
--
-- The sweep now skips rows still inside the interactive delete window: it only
-- drains pending_delete rows whose updated_at is older than the caller-supplied
-- grace interval. The application keeps that window well above any single
-- request's lifetime, so a freshly interactive-marked row is never touched by
-- the sweep until the interactive request has certainly finished (succeeded,
-- rolled back, or given up). The rollback update is independently guarded in the
-- adapter so it can never resurrect a row another actor already finalized.

-- Recreate the listing function with the grace-window parameter. CREATE OR
-- REPLACE cannot change an existing function's argument list, so drop the
-- single-argument form added in 20260609120000 first.
DROP FUNCTION IF EXISTS public.list_message_images_pending_remote_deletion(integer);

CREATE FUNCTION public.list_message_images_pending_remote_deletion(
  batch_limit integer,
  interactive_delete_grace interval
)
RETURNS TABLE (asset_id uuid, cloudflare_image_id text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT message_images.id, message_images.cloudflare_image_id
  FROM public.message_images
  WHERE message_images.status = 'pending_delete'
    AND message_images.updated_at
      < timezone('utc', now()) - interactive_delete_grace
    -- Maintenance-only: return nothing inside an app user context so this never
    -- leaks pending cloudflare_image_id values to a request-scoped role. The
    -- DROP above reset the single-argument form's privileges, so this recreated
    -- function must lock itself down again (see 20260609120000 for the rationale).
    AND nullif(current_setting('app.current_user_id', true), '') IS NULL
  ORDER BY message_images.updated_at ASC
  LIMIT batch_limit;
$$;

-- CREATE FUNCTION grants EXECUTE to PUBLIC by default; revoke it so this stays an
-- owner-only (cron sweep) primitive, and re-grant to the runtime role behind the
-- same guarded pattern used in 20260609120000.
REVOKE EXECUTE ON FUNCTION public.list_message_images_pending_remote_deletion(integer, interval)
  FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.list_message_images_pending_remote_deletion(integer, interval) TO authenticated;
  END IF;
END;
$$;
