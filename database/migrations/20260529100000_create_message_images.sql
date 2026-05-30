CREATE TABLE "message_images" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tribe_id" uuid NOT NULL REFERENCES "tribes"("id") ON DELETE CASCADE,
  "message_id" uuid REFERENCES "messages"("id") ON DELETE SET NULL,
  "deleted_message_id" uuid,
  "uploaded_by" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "cloudflare_image_id" text NOT NULL,
  "delivery_url" text NOT NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "alt_text" text NOT NULL DEFAULT '',
  "sort_order" integer,
  "created_at" timestamptz NOT NULL DEFAULT timezone('utc', now()),
  "updated_at" timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT "message_images_status_check" CHECK (
    "status" IN ('draft', 'attached', 'pending_delete', 'deleted')
  ),
  CONSTRAINT "message_images_alt_text_length_check" CHECK (
    char_length("alt_text") <= 160
  ),
  CONSTRAINT "message_images_attached_shape_check" CHECK (
    (
      "status" = 'attached'
      AND "message_id" IS NOT NULL
      AND "sort_order" IS NOT NULL
      AND "sort_order" BETWEEN 0 AND 3
    )
    OR (
      "status" <> 'attached'
      AND ("sort_order" IS NULL OR "sort_order" BETWEEN 0 AND 3)
    )
  )
);

CREATE UNIQUE INDEX "message_images_cloudflare_image_id_key"
  ON "message_images" ("cloudflare_image_id");

CREATE UNIQUE INDEX "message_images_message_sort_key"
  ON "message_images" ("message_id", "sort_order")
  WHERE "status" = 'attached';

CREATE INDEX "idx_message_images_message_status_sort"
  ON "message_images" ("message_id", "status", "sort_order");

CREATE INDEX "idx_message_images_tribe_uploaded_by_status"
  ON "message_images" ("tribe_id", "uploaded_by", "status");

CREATE INDEX "idx_message_images_pending_delete"
  ON "message_images" ("status", "updated_at")
  WHERE "status" = 'pending_delete';

CREATE INDEX "idx_message_images_deleted_message_status"
  ON "message_images" ("deleted_message_id", "status")
  WHERE "deleted_message_id" IS NOT NULL;

CREATE FUNCTION public.mark_message_images_pending_delete_on_message_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.message_images
  SET message_id = NULL,
      deleted_message_id = OLD.id,
      status = 'pending_delete',
      sort_order = NULL,
      updated_at = timezone('utc', now())
  WHERE message_images.message_id = OLD.id
    AND message_images.status <> 'deleted';

  RETURN OLD;
END;
$$;

CREATE TRIGGER message_images_mark_pending_delete_before_message_delete
BEFORE DELETE ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.mark_message_images_pending_delete_on_message_delete();

ALTER TABLE public.message_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_images FORCE ROW LEVEL SECURITY;

CREATE POLICY "Tribemates can read message images"
ON public.message_images
FOR SELECT
USING (
  (
    "status" = 'attached'
    AND public.can_read_tribe_content(tribe_id)
  )
  OR (
    uploaded_by = public.current_app_user_id()
    AND public.is_active_tribe_member(tribe_id)
  )
  OR (
    "status" IN ('pending_delete', 'deleted')
    AND public.can_pin_tribe_messages(tribe_id)
  )
);

CREATE POLICY "Active tribemates can create draft message images"
ON public.message_images
FOR INSERT
WITH CHECK (
  uploaded_by = public.current_app_user_id()
  AND public.is_active_tribe_member(tribe_id)
  AND "status" = 'draft'
  AND message_id IS NULL
);

CREATE POLICY "Authors and uploaders can update message images"
ON public.message_images
FOR UPDATE
USING (
  public.is_active_tribe_member(tribe_id)
  AND (
    uploaded_by = public.current_app_user_id()
    OR EXISTS (
      SELECT 1
      FROM public.messages
      WHERE messages.id = message_images.message_id
        AND messages.tribe_id = message_images.tribe_id
        AND messages.author_id = public.current_app_user_id()
    )
    OR (
      "status" IN ('attached', 'pending_delete')
      AND public.can_pin_tribe_messages(tribe_id)
    )
  )
)
WITH CHECK (
  public.is_active_tribe_member(tribe_id)
  AND (
    (
      uploaded_by = public.current_app_user_id()
      AND message_id IS NULL
    )
    OR EXISTS (
      SELECT 1
      FROM public.messages
      WHERE messages.id = message_images.message_id
        AND messages.tribe_id = message_images.tribe_id
        AND messages.author_id = public.current_app_user_id()
    )
    OR (
      "status" IN ('pending_delete', 'deleted')
      AND public.can_pin_tribe_messages(tribe_id)
    )
  )
);
