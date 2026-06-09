-- Orphan image cleanup: preventive blindaje so no Cloudflare image is left
-- alive after the row that referenced it is gone.
--
-- Four leak paths existed:
--   1. A pending_delete message image whose remote DELETE failed stayed
--      pending_delete forever; nothing retried it.
--   2. A draft upload the user never published (closed the tab, navigated away)
--      kept the Cloudflare asset and the draft row forever.
--   3. Deleting a user CASCADE-deletes its message_images rows, dropping the
--      cloudflare_image_id before anything deletes the remote asset.
--   4. Deleting a tribe does the same through the tribe_id CASCADE.
--
-- Gaps 1 and 2 are swept directly from public.message_images. Gaps 3 and 4
-- cannot keep the row (tribe_id is NOT NULL and anchors RLS, uploaded_by
-- CASCADEs), so a BEFORE DELETE trigger captures each cloudflare_image_id into a
-- decoupled queue that carries no foreign keys and therefore survives the
-- CASCADE. A scheduled maintenance sweep then deletes every queued and pending
-- asset from Cloudflare.
--
-- All maintenance entrypoints are SECURITY DEFINER functions owned by the table
-- owner: the cron sweep runs without an authenticated user, so it cannot satisfy
-- the FORCE-RLS policies on public.message_images, and the queue table is locked
-- down with FORCE RLS and no policies. The definer functions are the only
-- sanctioned crossing point, mirroring the existing message-delete trigger.
--
-- Because a SECURITY DEFINER function runs with the owner's rights and bypasses
-- RLS, EXECUTE on it is a privilege. PostgreSQL grants EXECUTE to PUBLIC by
-- default, which would let any request-scoped role (or a future role such as an
-- anonymous Data API role) drive these definer-rights primitives directly. Every
-- function below therefore REVOKEs EXECUTE FROM PUBLIC. The cron sweep runs as
-- the function owner, which retains EXECUTE after the revoke, so the lockdown
-- never breaks the sweep; the callable entrypoints are additionally granted to a
-- dedicated runtime role (`authenticated`) where the deployment exposes one. On
-- top of the privilege lockdown the callable entrypoints self-authorize as
-- maintenance work by refusing to act whenever a request carries an app user
-- context (`app.current_user_id`), the same GUC the rest of the RLS policies key
-- on, so even a granted request-scoped role does nothing. The cron sweep has no
-- app user, so it is the only caller that ever does work. As extra defense in
-- depth, the remote-deletion confirmation only ever transitions rows that are
-- already `pending_delete`, so it can never hide an `attached` or `draft` image.
-- The trigger functions get no EXECUTE grant at all: triggers fire with the
-- owner's rights regardless of the caller's EXECUTE privilege.

-- Decoupled remote-deletion queue. No foreign keys: it must outlive the tribe or
-- user rows whose CASCADE wipes the owning message_images rows.
CREATE TABLE public.pending_remote_image_deletions (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "cloudflare_image_id" text NOT NULL,
  "origin" text NOT NULL,
  "enqueued_at" timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT "pending_remote_image_deletions_image_key" UNIQUE ("cloudflare_image_id"),
  CONSTRAINT "pending_remote_image_deletions_origin_check" CHECK (
    "origin" IN ('tribe_deleted', 'user_deleted')
  )
);

CREATE INDEX "idx_pending_remote_image_deletions_enqueued_at"
  ON public.pending_remote_image_deletions ("enqueued_at");

ALTER TABLE public.pending_remote_image_deletions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_remote_image_deletions FORCE ROW LEVEL SECURITY;
-- Intentionally no policies: only the SECURITY DEFINER maintenance functions
-- below touch this table. Request-scoped roles get no direct access.

-- BEFORE DELETE on a tribe: snapshot its still-live image ids into the queue
-- before the tribe_id CASCADE removes the message_images rows.
CREATE FUNCTION public.enqueue_tribe_message_images_for_remote_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.pending_remote_image_deletions (cloudflare_image_id, origin)
  SELECT message_images.cloudflare_image_id, 'tribe_deleted'
  FROM public.message_images
  WHERE message_images.tribe_id = OLD.id
    AND message_images.status <> 'deleted'
  ON CONFLICT (cloudflare_image_id) DO NOTHING;

  RETURN OLD;
END;
$$;

CREATE TRIGGER tribes_enqueue_message_images_before_delete
BEFORE DELETE ON public.tribes
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_tribe_message_images_for_remote_deletion();

-- Trigger functions fire with the owner's rights regardless of who triggers the
-- DELETE, so PUBLIC never needs EXECUTE. Revoke it to keep this from being a
-- directly callable definer primitive.
REVOKE EXECUTE ON FUNCTION public.enqueue_tribe_message_images_for_remote_deletion()
  FROM PUBLIC;

-- BEFORE DELETE on a user: snapshot the image ids it uploaded before the
-- uploaded_by CASCADE removes the message_images rows.
CREATE FUNCTION public.enqueue_user_message_images_for_remote_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.pending_remote_image_deletions (cloudflare_image_id, origin)
  SELECT message_images.cloudflare_image_id, 'user_deleted'
  FROM public.message_images
  WHERE message_images.uploaded_by = OLD.id
    AND message_images.status <> 'deleted'
  ON CONFLICT (cloudflare_image_id) DO NOTHING;

  RETURN OLD;
END;
$$;

CREATE TRIGGER user_enqueue_message_images_before_delete
BEFORE DELETE ON public."user"
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_user_message_images_for_remote_deletion();

REVOKE EXECUTE ON FUNCTION public.enqueue_user_message_images_for_remote_deletion()
  FROM PUBLIC;

-- Reclaim abandoned drafts: a draft upload older than the TTL was never attached
-- to a message, so it becomes pending_delete and joins the remote-deletion sweep.
-- Bounded by batch_limit so a large backlog of abandoned drafts is reclaimed
-- oldest-first across several runs instead of locking and rewriting most of
-- message_images in one unbounded UPDATE, matching the per-source batch the rest
-- of the sweep drains afterward.
CREATE FUNCTION public.reclaim_abandoned_draft_message_images(
  abandoned_draft_ttl interval,
  batch_limit integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  reclaimed_count integer;
BEGIN
  UPDATE public.message_images
  SET status = 'pending_delete',
      message_id = NULL,
      sort_order = NULL,
      updated_at = timezone('utc', now())
  WHERE id IN (
    SELECT id
    FROM public.message_images
    WHERE status = 'draft'
      AND created_at < timezone('utc', now()) - abandoned_draft_ttl
      -- Maintenance-only: never reclaim drafts when called inside an app user
      -- context, so a request-scoped role cannot force-reclaim live drafts.
      AND nullif(current_setting('app.current_user_id', true), '') IS NULL
    ORDER BY created_at ASC
    LIMIT batch_limit
  );

  GET DIAGNOSTICS reclaimed_count = ROW_COUNT;
  RETURN reclaimed_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reclaim_abandoned_draft_message_images(interval, integer)
  FROM PUBLIC;

-- Oldest-first batch of message images awaiting a remote delete.
CREATE FUNCTION public.list_message_images_pending_remote_deletion(
  batch_limit integer
)
RETURNS TABLE (asset_id uuid, cloudflare_image_id text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT message_images.id, message_images.cloudflare_image_id
  FROM public.message_images
  WHERE message_images.status = 'pending_delete'
  ORDER BY message_images.updated_at ASC
  LIMIT batch_limit;
$$;

-- Migration 20260609130000 drops this single-argument form and recreates it with
-- a grace-window parameter, fully locked down again there. Revoke PUBLIC here so
-- the function is owner-only for the brief window before that migration runs.
REVOKE EXECUTE ON FUNCTION public.list_message_images_pending_remote_deletion(integer)
  FROM PUBLIC;

-- Confirm a message image as remotely deleted once the Cloudflare DELETE succeeded.
CREATE FUNCTION public.confirm_message_image_remote_deleted(target_asset_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  affected_count integer;
BEGIN
  UPDATE public.message_images
  SET status = 'deleted',
      updated_at = timezone('utc', now())
  WHERE id = target_asset_id
    -- Only confirm rows already slated for deletion: this can never flip an
    -- attached or draft image to deleted (which would hide it from the UI while
    -- leaving the Cloudflare asset alive), and it no-ops if an interactive delete
    -- already rolled the row back to a visible state.
    AND status = 'pending_delete'
    -- Maintenance-only: a request-scoped role cannot drive remote-deletion state.
    AND nullif(current_setting('app.current_user_id', true), '') IS NULL;

  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RETURN affected_count > 0;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_message_image_remote_deleted(uuid)
  FROM PUBLIC;

-- Oldest-first batch of queued (CASCADE-orphaned) image ids awaiting a remote delete.
CREATE FUNCTION public.list_queued_remote_image_deletions(batch_limit integer)
RETURNS TABLE (queue_id uuid, cloudflare_image_id text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT id, cloudflare_image_id
  FROM public.pending_remote_image_deletions
  -- Maintenance-only: return nothing inside an app user context.
  WHERE nullif(current_setting('app.current_user_id', true), '') IS NULL
  ORDER BY enqueued_at ASC
  LIMIT batch_limit;
$$;

REVOKE EXECUTE ON FUNCTION public.list_queued_remote_image_deletions(integer)
  FROM PUBLIC;

-- Remove a queued entry once its Cloudflare DELETE succeeded.
CREATE FUNCTION public.delete_queued_remote_image_deletion(target_queue_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  affected_count integer;
BEGIN
  DELETE FROM public.pending_remote_image_deletions
  WHERE id = target_queue_id
    -- Maintenance-only: a request-scoped role cannot drop queued entries (which
    -- would orphan the Cloudflare asset by removing it from the sweep).
    AND nullif(current_setting('app.current_user_id', true), '') IS NULL;

  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RETURN affected_count > 0;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_queued_remote_image_deletion(uuid)
  FROM PUBLIC;

-- Grant the callable maintenance entrypoints to a dedicated runtime role where
-- the deployment provisions one, behind the guarded pattern used across the other
-- migrations (skipped when the role is absent; the cron sweep runs as the owner
-- regardless). The single-argument listing function is intentionally excluded:
-- migration 20260609130000 drops it and grants its grace-window replacement. The
-- trigger functions are excluded too: triggers never need a caller EXECUTE grant.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.reclaim_abandoned_draft_message_images(interval, integer) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.confirm_message_image_remote_deleted(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.list_queued_remote_image_deletions(integer) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.delete_queued_remote_image_deletion(uuid) TO authenticated;
  END IF;
END;
$$;
