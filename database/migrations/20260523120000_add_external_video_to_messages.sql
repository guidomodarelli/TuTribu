ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS external_video_provider text,
  ADD COLUMN IF NOT EXISTS external_video_id text;

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_external_video_complete_check;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_external_video_complete_check
  CHECK (
    (external_video_provider IS NULL AND external_video_id IS NULL)
    OR (external_video_provider IS NOT NULL AND external_video_id IS NOT NULL)
  );

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_external_video_provider_check;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_external_video_provider_check
  CHECK (
    external_video_provider IS NULL
    OR external_video_provider IN ('vimeo', 'wistia', 'loom', 'youtube')
  );

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_external_video_id_not_blank_check;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_external_video_id_not_blank_check
  CHECK (external_video_id IS NULL OR btrim(external_video_id) <> '');
