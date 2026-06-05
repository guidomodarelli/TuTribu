-- Create the message_videos table so a message can carry several external
-- video links (YouTube, Vimeo, Wistia, Loom) alongside its images. Videos share
-- the same global sort_order slot space as message_images (0..9), so the unified
-- gallery can render every attachment in the author-chosen order.

CREATE TABLE "message_videos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tribe_id" uuid NOT NULL REFERENCES "tribes"("id") ON DELETE CASCADE,
  "message_id" uuid NOT NULL REFERENCES "messages"("id") ON DELETE CASCADE,
  "external_video_provider" text NOT NULL,
  "external_video_id" text NOT NULL,
  "sort_order" integer NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT timezone('utc', now()),
  "updated_at" timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT "message_videos_provider_check" CHECK (
    "external_video_provider" IN ('vimeo', 'wistia', 'loom', 'youtube')
  ),
  CONSTRAINT "message_videos_external_id_not_blank_check" CHECK (
    btrim("external_video_id") <> ''
  ),
  CONSTRAINT "message_videos_sort_order_range_check" CHECK (
    "sort_order" BETWEEN 0 AND 9
  )
);

CREATE UNIQUE INDEX "message_videos_message_sort_key"
  ON "message_videos" ("message_id", "sort_order");

CREATE INDEX "idx_message_videos_message_sort"
  ON "message_videos" ("message_id", "sort_order");

-- Backfill the single external video each message used to store inline, placing
-- it right after the message's existing attached images. This runs before RLS
-- is forced so the migration is not blocked by the per-row write policies.
INSERT INTO public.message_videos (
  tribe_id,
  message_id,
  external_video_provider,
  external_video_id,
  sort_order,
  created_at,
  updated_at
)
SELECT
  messages.tribe_id,
  messages.id,
  messages.external_video_provider,
  messages.external_video_id,
  COALESCE(
    (
      SELECT max(image_assets.sort_order) + 1
      FROM public.message_images image_assets
      WHERE image_assets.message_id = messages.id
        AND image_assets.status = 'attached'
    ),
    0
  ),
  timezone('utc', now()),
  timezone('utc', now())
FROM public.messages
WHERE messages.external_video_provider IS NOT NULL
  AND messages.external_video_id IS NOT NULL;

ALTER TABLE public.message_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_videos FORCE ROW LEVEL SECURITY;

CREATE POLICY "Tribemates can read message videos"
ON public.message_videos
FOR SELECT
USING (
  public.can_read_tribe_content(tribe_id)
);

CREATE POLICY "Authors can attach message videos"
ON public.message_videos
FOR INSERT
WITH CHECK (
  public.is_active_tribe_member(tribe_id)
  AND EXISTS (
    SELECT 1
    FROM public.messages
    WHERE messages.id = message_videos.message_id
      AND messages.tribe_id = message_videos.tribe_id
      AND messages.author_id = public.current_app_user_id()
  )
);

CREATE POLICY "Authors can update message videos"
ON public.message_videos
FOR UPDATE
USING (
  public.is_active_tribe_member(tribe_id)
  AND EXISTS (
    SELECT 1
    FROM public.messages
    WHERE messages.id = message_videos.message_id
      AND messages.tribe_id = message_videos.tribe_id
      AND messages.author_id = public.current_app_user_id()
  )
)
WITH CHECK (
  public.is_active_tribe_member(tribe_id)
  AND EXISTS (
    SELECT 1
    FROM public.messages
    WHERE messages.id = message_videos.message_id
      AND messages.tribe_id = message_videos.tribe_id
      AND messages.author_id = public.current_app_user_id()
  )
);

CREATE POLICY "Authors can remove message videos"
ON public.message_videos
FOR DELETE
USING (
  public.is_active_tribe_member(tribe_id)
  AND EXISTS (
    SELECT 1
    FROM public.messages
    WHERE messages.id = message_videos.message_id
      AND messages.tribe_id = message_videos.tribe_id
      AND messages.author_id = public.current_app_user_id()
  )
);
