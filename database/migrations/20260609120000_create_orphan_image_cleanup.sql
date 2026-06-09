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

-- Reclaim abandoned drafts: a draft upload older than the TTL was never attached
-- to a message, so it becomes pending_delete and joins the remote-deletion sweep.
CREATE FUNCTION public.reclaim_abandoned_draft_message_images(
  abandoned_draft_ttl interval
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
  WHERE status = 'draft'
    AND created_at < timezone('utc', now()) - abandoned_draft_ttl;

  GET DIAGNOSTICS reclaimed_count = ROW_COUNT;
  RETURN reclaimed_count;
END;
$$;

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
  WHERE id = target_asset_id;

  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RETURN affected_count > 0;
END;
$$;

-- Oldest-first batch of queued (CASCADE-orphaned) image ids awaiting a remote delete.
CREATE FUNCTION public.list_queued_remote_image_deletions(batch_limit integer)
RETURNS TABLE (queue_id uuid, cloudflare_image_id text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT id, cloudflare_image_id
  FROM public.pending_remote_image_deletions
  ORDER BY enqueued_at ASC
  LIMIT batch_limit;
$$;

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
  WHERE id = target_queue_id;

  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RETURN affected_count > 0;
END;
$$;
