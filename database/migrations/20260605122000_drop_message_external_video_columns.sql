-- Drop the legacy single-video columns from messages now that external videos
-- live in message_videos (backfilled in 20260605121000_create_message_videos).

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_external_video_complete_check;

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_external_video_provider_check;

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_external_video_id_not_blank_check;

ALTER TABLE public.messages
  DROP COLUMN IF EXISTS external_video_provider,
  DROP COLUMN IF EXISTS external_video_id;
