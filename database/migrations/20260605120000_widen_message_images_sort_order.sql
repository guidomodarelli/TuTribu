-- Widen the attached message image slot range from 0..3 to 0..9 so a single
-- message can carry up to ten media attachments (images + external videos)
-- sharing one global slot space.

ALTER TABLE public.message_images
  DROP CONSTRAINT IF EXISTS "message_images_attached_shape_check";

ALTER TABLE public.message_images
  ADD CONSTRAINT "message_images_attached_shape_check" CHECK (
    (
      "status" = 'attached'
      AND "message_id" IS NOT NULL
      AND "sort_order" IS NOT NULL
      AND "sort_order" BETWEEN 0 AND 9
    )
    OR (
      "status" <> 'attached'
      AND ("sort_order" IS NULL OR "sort_order" BETWEEN 0 AND 9)
    )
  );
