-- Tribe channel access rule (replaces RF-09 for channels).
--
-- Who reads and who writes a channel is decided in one place: the channel's
-- policy. The campfire (fogón) is a channel like any other. Every channel uses
-- the default policy today, stored in tribe_channels.access_scope =
-- 'tribemates':
--
-- - read: any member with a readable membership (active or muted), including
--   the free members of an academy-mode tribe;
-- - write: active members with community access (academy access in academy
--   mode, every active member in legacy tribes);
-- - active leaders and guardians always read and write.
--
-- A future policy (read only, academy only, combined) adds a value to the
-- access_scope check and one branch to each CASE below; nothing else changes.
-- Events, directory, merits and community notifications keep the academy
-- boundary (can_read_tribe_content / is_active_tribe_member).
--
-- Attachments follow the message they belong to. Draft uploads have no
-- channel yet and keep the tribe write boundary (is_active_tribe_member).

-- 1. The rule, evaluated for any user. Owner-only: it reveals another
-- user's access, like can_user_access_tribe_community.
CREATE OR REPLACE FUNCTION public.can_user_read_tribe_channel(
  target_channel_id uuid,
  target_user_id text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tribe_channels
    INNER JOIN public.tribe_members
      ON tribe_members.tribe_id = tribe_channels.tribe_id
    WHERE tribe_channels.id = target_channel_id
      AND tribe_members.user_id = target_user_id
      AND tribe_members.status IN ('active', 'muted')
      AND (
        (tribe_members.status = 'active' AND tribe_members.role IN ('leader', 'guardian'))
        OR CASE tribe_channels.access_scope
          WHEN 'tribemates' THEN true
          ELSE false
        END
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_user_write_tribe_channel(
  target_channel_id uuid,
  target_user_id text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tribe_channels
    INNER JOIN public.tribe_members
      ON tribe_members.tribe_id = tribe_channels.tribe_id
    WHERE tribe_channels.id = target_channel_id
      AND tribe_members.user_id = target_user_id
      AND tribe_members.status = 'active'
      AND (
        tribe_members.role IN ('leader', 'guardian')
        OR CASE tribe_channels.access_scope
          WHEN 'tribemates' THEN public.can_user_access_tribe_community(
            tribe_channels.tribe_id,
            target_user_id
          )
          ELSE false
        END
      )
  );
$$;

-- 2. Current-user wrappers used by policies and repositories.
CREATE OR REPLACE FUNCTION public.can_read_tribe_channel(target_channel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.current_app_user_id() IS NOT NULL
    AND public.can_user_read_tribe_channel(target_channel_id, public.current_app_user_id());
$$;

CREATE OR REPLACE FUNCTION public.can_write_tribe_channel(target_channel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.current_app_user_id() IS NOT NULL
    AND public.can_user_write_tribe_channel(target_channel_id, public.current_app_user_id());
$$;

-- A message (and everything attached to it) follows its channel.
CREATE OR REPLACE FUNCTION public.can_read_tribe_message(target_message_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.messages
    WHERE messages.id = target_message_id
      AND public.can_read_tribe_channel(messages.channel_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.can_write_tribe_message(target_message_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.messages
    WHERE messages.id = target_message_id
      AND public.can_write_tribe_channel(messages.channel_id)
  );
$$;

-- Tribe-level questions asked by page access and navigation.
CREATE OR REPLACE FUNCTION public.can_read_any_tribe_channel(target_tribe_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tribe_channels
    WHERE tribe_channels.tribe_id = target_tribe_id
      AND public.can_read_tribe_channel(tribe_channels.id)
  );
$$;

CREATE OR REPLACE FUNCTION public.can_write_any_tribe_channel(target_tribe_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tribe_channels
    WHERE tribe_channels.tribe_id = target_tribe_id
      AND public.can_write_tribe_channel(tribe_channels.id)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.can_user_read_tribe_channel(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_user_write_tribe_channel(uuid, text) FROM PUBLIC;

-- 3. Channels and messages.
DROP POLICY IF EXISTS "Tribemates can read tribe channels" ON public.tribe_channels;
CREATE POLICY "Tribemates can read tribe channels"
ON public.tribe_channels
FOR SELECT
USING (public.can_read_tribe_channel(id));

DROP POLICY IF EXISTS "Tribemates can read tribe messages" ON public.messages;
CREATE POLICY "Tribemates can read tribe messages"
ON public.messages
FOR SELECT
USING (public.can_read_tribe_channel(channel_id));

DROP POLICY IF EXISTS "Active tribemates can create tribe messages" ON public.messages;
CREATE POLICY "Active tribemates can create tribe messages"
ON public.messages
FOR INSERT
WITH CHECK (
  author_id = public.current_app_user_id()
  AND public.can_write_tribe_channel(channel_id)
);

DROP POLICY IF EXISTS "Authors can update own tribe messages" ON public.messages;
CREATE POLICY "Authors can update own tribe messages"
ON public.messages
FOR UPDATE
USING (
  author_id = public.current_app_user_id()
  AND public.can_write_tribe_channel(channel_id)
)
WITH CHECK (
  author_id = public.current_app_user_id()
  AND public.can_write_tribe_channel(channel_id)
);

DROP POLICY IF EXISTS "Authors leaders and guardians can delete tribe messages" ON public.messages;
CREATE POLICY "Authors leaders and guardians can delete tribe messages"
ON public.messages
FOR DELETE
USING (
  (
    author_id = public.current_app_user_id()
    AND public.can_write_tribe_channel(channel_id)
  )
  OR public.can_pin_tribe_messages(tribe_id)
);

-- 4. Replies, likes, pins and polls follow their message.
DROP POLICY IF EXISTS "Tribemates can read tribe message replies" ON public.message_replies;
CREATE POLICY "Tribemates can read tribe message replies"
ON public.message_replies
FOR SELECT
USING (public.can_read_tribe_message(message_id));

DROP POLICY IF EXISTS "Active tribemates can create tribe message replies" ON public.message_replies;
CREATE POLICY "Active tribemates can create tribe message replies"
ON public.message_replies
FOR INSERT
WITH CHECK (
  author_id = public.current_app_user_id()
  AND public.can_write_tribe_message(message_id)
);

DROP POLICY IF EXISTS "Tribemates can read tribe message reactions" ON public.message_reactions;
CREATE POLICY "Tribemates can read tribe message reactions"
ON public.message_reactions
FOR SELECT
USING (public.can_read_tribe_message(message_id));

DROP POLICY IF EXISTS "Active tribemates can manage own message reactions" ON public.message_reactions;
CREATE POLICY "Active tribemates can manage own message reactions"
ON public.message_reactions
FOR ALL
USING (
  user_id = public.current_app_user_id()
  AND public.can_write_tribe_message(message_id)
)
WITH CHECK (
  user_id = public.current_app_user_id()
  AND public.can_write_tribe_message(message_id)
);

DROP POLICY IF EXISTS "Tribemates can read message pins" ON public.message_pins;
CREATE POLICY "Tribemates can read message pins"
ON public.message_pins
FOR SELECT
USING (public.can_read_tribe_message(message_id));

DROP POLICY IF EXISTS "Tribemates can read message polls" ON public.message_polls;
CREATE POLICY "Tribemates can read message polls"
ON public.message_polls
FOR SELECT
USING (public.can_read_tribe_message(message_id));

DROP POLICY IF EXISTS "Tribemates can read message poll options" ON public.message_poll_options;
CREATE POLICY "Tribemates can read message poll options"
ON public.message_poll_options
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.message_polls
    WHERE message_polls.id = message_poll_options.poll_id
      AND public.can_read_tribe_message(message_polls.message_id)
  )
);

DROP POLICY IF EXISTS "Tribemates can read message poll votes" ON public.message_poll_votes;
CREATE POLICY "Tribemates can read message poll votes"
ON public.message_poll_votes
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.message_polls
    WHERE message_polls.id = message_poll_votes.poll_id
      AND public.can_read_tribe_message(message_polls.message_id)
  )
);

DROP POLICY IF EXISTS "Active tribemates can manage own message poll votes" ON public.message_poll_votes;
CREATE POLICY "Active tribemates can manage own message poll votes"
ON public.message_poll_votes
FOR ALL
USING (
  user_id = public.current_app_user_id()
  AND EXISTS (
    SELECT 1
    FROM public.message_polls
    WHERE message_polls.id = message_poll_votes.poll_id
      AND public.can_write_tribe_message(message_polls.message_id)
  )
)
WITH CHECK (
  user_id = public.current_app_user_id()
  AND EXISTS (
    SELECT 1
    FROM public.message_polls
    WHERE message_polls.id = message_poll_votes.poll_id
      AND public.can_write_tribe_message(message_polls.message_id)
  )
);

-- 5. Attachments: attached assets follow their message; drafts and
-- moderation branches keep their previous rules.
DROP POLICY IF EXISTS "Tribemates can read message images" ON public.message_images;
CREATE POLICY "Tribemates can read message images"
ON public.message_images
FOR SELECT
USING (
  (status = 'attached' AND public.can_read_tribe_message(message_id))
  OR (uploaded_by = public.current_app_user_id() AND public.is_active_tribe_member(tribe_id))
  OR (status IN ('pending_delete', 'deleted') AND public.can_pin_tribe_messages(tribe_id))
);

DROP POLICY IF EXISTS "Tribemates can read message files" ON public.message_files;
CREATE POLICY "Tribemates can read message files"
ON public.message_files
FOR SELECT
USING (
  (status = 'attached' AND public.can_read_tribe_message(message_id))
  OR (uploaded_by = public.current_app_user_id() AND public.is_active_tribe_member(tribe_id))
  OR (status IN ('pending_delete', 'deleted') AND public.can_pin_tribe_messages(tribe_id))
);

DROP POLICY IF EXISTS "Tribemates can read message videos" ON public.message_videos;
CREATE POLICY "Tribemates can read message videos"
ON public.message_videos
FOR SELECT
USING (public.can_read_tribe_message(message_id));

-- A reader who opens a video without a thumbnail may resolve it, as before.
CREATE OR REPLACE FUNCTION public.set_message_video_thumbnail(
  target_video_id uuid,
  resolved_thumbnail_url text,
  max_attempts integer,
  retry_cooldown_minutes integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  updated_count integer;
  now_utc timestamptz := timezone('utc', now());
BEGIN
  UPDATE public.message_videos
  SET
    thumbnail_url = resolved_thumbnail_url,
    thumbnail_attempts = message_videos.thumbnail_attempts + 1,
    thumbnail_last_attempt_at = now_utc,
    thumbnail_resolved_at = CASE
      WHEN resolved_thumbnail_url IS NOT NULL THEN now_utc
      WHEN message_videos.thumbnail_attempts + 1 >= max_attempts THEN now_utc
      ELSE NULL
    END,
    updated_at = now_utc
  WHERE message_videos.id = target_video_id
    AND message_videos.thumbnail_resolved_at IS NULL
    AND public.can_read_tribe_message(message_videos.message_id)
    AND (
      resolved_thumbnail_url IS NOT NULL
      OR message_videos.thumbnail_last_attempt_at IS NULL
      OR message_videos.thumbnail_last_attempt_at
        < now_utc - make_interval(mins => retry_cooldown_minutes)
    );

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count > 0;
END;
$function$;
