-- File attachments for fogon messages and course lessons, stored in
-- Cloudflare R2 (S3-compatible) instead of Cloudflare Images.
--
-- Two owning tables mirror the message_images lifecycle
-- (draft -> attached -> pending_delete -> deleted):
--   * public.message_files: attachments a tribemate uploads for a fogon
--     message. A draft row reserves the R2 storage key before the browser
--     uploads through a presigned PUT; attaching a message flips it to
--     attached with a sort_order.
--   * public.course_lesson_files: attachments a tribe leader uploads for a
--     course lesson, with the same reservation flow.
--
-- The remote asset must never outlive its row, so this migration also mirrors
-- the orphan-image cleanup design (20260609120000..150000) for R2 objects:
--   * BEFORE DELETE triggers on messages and course_lessons detach rows into
--     pending_delete so the scheduled sweep deletes the R2 object.
--   * Deleting a tribe or user CASCADE-wipes the owning rows, so BEFORE DELETE
--     triggers snapshot the storage keys into a decoupled queue
--     (public.pending_remote_file_deletions) that carries no foreign keys.
--     One queue serves both tables: a queued entry is just an R2 key to delete.
--   * SECURITY DEFINER maintenance functions are the only sanctioned crossing
--     for the cron sweep. Each one REVOKEs EXECUTE FROM PUBLIC (owner-only) and
--     self-authorizes as maintenance by refusing to act inside an app user
--     context (`app.current_user_id`), exactly like the image primitives.
--   * Owner-exception policies (current_user = table owner via
--     pg_class.relowner) keep every crossing working on deployments whose
--     owner does NOT carry BYPASSRLS, mirroring 20260609140000/150000.

-- ---------------------------------------------------------------------------
-- message_files
-- ---------------------------------------------------------------------------

CREATE TABLE public.message_files (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tribe_id" uuid NOT NULL REFERENCES public.tribes("id") ON DELETE CASCADE,
  "message_id" uuid REFERENCES public.messages("id") ON DELETE SET NULL,
  "deleted_message_id" uuid,
  "uploaded_by" text NOT NULL REFERENCES public."user"("id") ON DELETE CASCADE,
  "storage_key" text NOT NULL,
  "file_name" text NOT NULL,
  "mime_type" text NOT NULL,
  "file_size_bytes" bigint NOT NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "sort_order" integer,
  "created_at" timestamptz NOT NULL DEFAULT timezone('utc', now()),
  "updated_at" timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT "message_files_status_check" CHECK (
    "status" IN ('draft', 'attached', 'pending_delete', 'deleted')
  ),
  CONSTRAINT "message_files_storage_key_not_blank_check" CHECK (
    btrim("storage_key") <> ''
  ),
  CONSTRAINT "message_files_file_name_check" CHECK (
    btrim("file_name") <> '' AND char_length("file_name") <= 160
  ),
  CONSTRAINT "message_files_mime_type_check" CHECK (
    btrim("mime_type") <> '' AND char_length("mime_type") <= 255
  ),
  CONSTRAINT "message_files_file_size_positive_check" CHECK (
    "file_size_bytes" > 0
  ),
  CONSTRAINT "message_files_attached_shape_check" CHECK (
    (
      "status" = 'attached'
      AND "message_id" IS NOT NULL
      AND "sort_order" IS NOT NULL
      AND "sort_order" BETWEEN 0 AND 4
    )
    OR (
      "status" <> 'attached'
      AND ("sort_order" IS NULL OR "sort_order" BETWEEN 0 AND 4)
    )
  )
);

CREATE UNIQUE INDEX "message_files_storage_key_key"
  ON public.message_files ("storage_key");

CREATE UNIQUE INDEX "message_files_message_sort_key"
  ON public.message_files ("message_id", "sort_order")
  WHERE "status" = 'attached';

CREATE INDEX "idx_message_files_message_status_sort"
  ON public.message_files ("message_id", "status", "sort_order");

CREATE INDEX "idx_message_files_tribe_uploaded_by_status"
  ON public.message_files ("tribe_id", "uploaded_by", "status");

CREATE INDEX "idx_message_files_pending_delete"
  ON public.message_files ("status", "updated_at")
  WHERE "status" = 'pending_delete';

CREATE INDEX "idx_message_files_deleted_message_status"
  ON public.message_files ("deleted_message_id", "status")
  WHERE "deleted_message_id" IS NOT NULL;

CREATE FUNCTION public.mark_message_files_pending_delete_on_message_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.message_files
  SET message_id = NULL,
      deleted_message_id = OLD.id,
      status = 'pending_delete',
      sort_order = NULL,
      updated_at = timezone('utc', now())
  WHERE message_files.message_id = OLD.id
    AND message_files.status <> 'deleted';

  RETURN OLD;
END;
$$;

CREATE TRIGGER message_files_mark_pending_delete_before_message_delete
BEFORE DELETE ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.mark_message_files_pending_delete_on_message_delete();

-- Trigger functions fire with the owner's rights regardless of the caller's
-- EXECUTE privilege; revoke PUBLIC so this is never a directly callable
-- definer primitive.
REVOKE EXECUTE ON FUNCTION public.mark_message_files_pending_delete_on_message_delete()
  FROM PUBLIC;

ALTER TABLE public.message_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_files FORCE ROW LEVEL SECURITY;

CREATE POLICY "Tribemates can read message files"
ON public.message_files
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

CREATE POLICY "Active tribemates can create draft message files"
ON public.message_files
FOR INSERT
WITH CHECK (
  uploaded_by = public.current_app_user_id()
  AND public.is_active_tribe_member(tribe_id)
  AND "status" = 'draft'
  AND message_id IS NULL
);

CREATE POLICY "Authors and uploaders can update message files"
ON public.message_files
FOR UPDATE
USING (
  public.is_active_tribe_member(tribe_id)
  AND (
    uploaded_by = public.current_app_user_id()
    OR EXISTS (
      SELECT 1
      FROM public.messages
      WHERE messages.id = message_files.message_id
        AND messages.tribe_id = message_files.tribe_id
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
      WHERE messages.id = message_files.message_id
        AND messages.tribe_id = message_files.tribe_id
        AND messages.author_id = public.current_app_user_id()
    )
    OR (
      "status" IN ('pending_delete', 'deleted')
      AND public.can_pin_tribe_messages(tribe_id)
    )
  )
);

-- Owner-exception crossings for deployments whose table owner does not carry
-- BYPASSRLS, mirroring 20260609150000: the enqueue triggers' snapshot reads,
-- the reclaim subquery and pending-row listing need SELECT; reclaim, confirm
-- and the message-delete trigger need UPDATE. Request-scoped roles never match
-- current_user = table owner, so they stay bound to the policies above.
CREATE POLICY "Owner maintenance can read message files"
ON public.message_files
FOR SELECT
USING (
  current_user = (
    SELECT pg_get_userbyid(pg_class.relowner)
    FROM pg_class
    WHERE pg_class.oid = 'public.message_files'::regclass
  )
);

CREATE POLICY "Owner maintenance can update message files"
ON public.message_files
FOR UPDATE
USING (
  current_user = (
    SELECT pg_get_userbyid(pg_class.relowner)
    FROM pg_class
    WHERE pg_class.oid = 'public.message_files'::regclass
  )
)
WITH CHECK (
  current_user = (
    SELECT pg_get_userbyid(pg_class.relowner)
    FROM pg_class
    WHERE pg_class.oid = 'public.message_files'::regclass
  )
);

-- ---------------------------------------------------------------------------
-- course_lesson_files
-- ---------------------------------------------------------------------------

CREATE TABLE public.course_lesson_files (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tribe_id" uuid NOT NULL REFERENCES public.tribes("id") ON DELETE CASCADE,
  "lesson_id" uuid REFERENCES public.course_lessons("id") ON DELETE SET NULL,
  "deleted_lesson_id" uuid,
  "uploaded_by" text NOT NULL REFERENCES public."user"("id") ON DELETE CASCADE,
  "storage_key" text NOT NULL,
  "file_name" text NOT NULL,
  "mime_type" text NOT NULL,
  "file_size_bytes" bigint NOT NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "sort_order" integer,
  "created_at" timestamptz NOT NULL DEFAULT timezone('utc', now()),
  "updated_at" timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT "course_lesson_files_status_check" CHECK (
    "status" IN ('draft', 'attached', 'pending_delete', 'deleted')
  ),
  CONSTRAINT "course_lesson_files_storage_key_not_blank_check" CHECK (
    btrim("storage_key") <> ''
  ),
  CONSTRAINT "course_lesson_files_file_name_check" CHECK (
    btrim("file_name") <> '' AND char_length("file_name") <= 160
  ),
  CONSTRAINT "course_lesson_files_mime_type_check" CHECK (
    btrim("mime_type") <> '' AND char_length("mime_type") <= 255
  ),
  CONSTRAINT "course_lesson_files_file_size_positive_check" CHECK (
    "file_size_bytes" > 0
  ),
  CONSTRAINT "course_lesson_files_attached_shape_check" CHECK (
    (
      "status" = 'attached'
      AND "lesson_id" IS NOT NULL
      AND "sort_order" IS NOT NULL
      AND "sort_order" BETWEEN 0 AND 9
    )
    OR (
      "status" <> 'attached'
      AND ("sort_order" IS NULL OR "sort_order" BETWEEN 0 AND 9)
    )
  )
);

CREATE UNIQUE INDEX "course_lesson_files_storage_key_key"
  ON public.course_lesson_files ("storage_key");

CREATE UNIQUE INDEX "course_lesson_files_lesson_sort_key"
  ON public.course_lesson_files ("lesson_id", "sort_order")
  WHERE "status" = 'attached';

CREATE INDEX "idx_course_lesson_files_lesson_status_sort"
  ON public.course_lesson_files ("lesson_id", "status", "sort_order");

CREATE INDEX "idx_course_lesson_files_tribe_uploaded_by_status"
  ON public.course_lesson_files ("tribe_id", "uploaded_by", "status");

CREATE INDEX "idx_course_lesson_files_pending_delete"
  ON public.course_lesson_files ("status", "updated_at")
  WHERE "status" = 'pending_delete';

CREATE INDEX "idx_course_lesson_files_deleted_lesson_status"
  ON public.course_lesson_files ("deleted_lesson_id", "status")
  WHERE "deleted_lesson_id" IS NOT NULL;

-- Lessons are hard-deleted (directly and through the module CASCADE), and a
-- row-level BEFORE DELETE trigger also fires for every row a CASCADE removes,
-- so each deleted lesson detaches its files into pending_delete for the sweep.
CREATE FUNCTION public.mark_lesson_files_pending_delete_on_lesson_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.course_lesson_files
  SET lesson_id = NULL,
      deleted_lesson_id = OLD.id,
      status = 'pending_delete',
      sort_order = NULL,
      updated_at = timezone('utc', now())
  WHERE course_lesson_files.lesson_id = OLD.id
    AND course_lesson_files.status <> 'deleted';

  RETURN OLD;
END;
$$;

CREATE TRIGGER course_lesson_files_mark_pending_delete_before_lesson_delete
BEFORE DELETE ON public.course_lessons
FOR EACH ROW
EXECUTE FUNCTION public.mark_lesson_files_pending_delete_on_lesson_delete();

REVOKE EXECUTE ON FUNCTION public.mark_lesson_files_pending_delete_on_lesson_delete()
  FROM PUBLIC;

ALTER TABLE public.course_lesson_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_lesson_files FORCE ROW LEVEL SECURITY;

-- Members only ever see attached files of an active lesson inside an active
-- module, so material of a hidden lesson never leaks. Leaders see everything
-- they manage, including their own drafts during the lesson editor flow.
CREATE POLICY "Members can read course lesson files"
ON public.course_lesson_files
FOR SELECT
USING (
  (
    "status" = 'attached'
    AND public.can_read_tribe_courses(tribe_id)
    AND (
      public.can_manage_tribe_courses(tribe_id)
      OR EXISTS (
        SELECT 1
        FROM public.course_lessons
        INNER JOIN public.course_modules
          ON course_modules.id = course_lessons.course_module_id
        WHERE course_lessons.id = course_lesson_files.lesson_id
          AND course_lessons.is_active = true
          AND course_modules.is_active = true
      )
    )
  )
  OR (
    uploaded_by = public.current_app_user_id()
    AND public.can_manage_tribe_courses(tribe_id)
  )
  OR (
    "status" IN ('pending_delete', 'deleted')
    AND public.can_manage_tribe_courses(tribe_id)
  )
);

CREATE POLICY "Leaders can create draft course lesson files"
ON public.course_lesson_files
FOR INSERT
WITH CHECK (
  uploaded_by = public.current_app_user_id()
  AND public.can_manage_tribe_courses(tribe_id)
  AND "status" = 'draft'
  AND lesson_id IS NULL
);

CREATE POLICY "Leaders can update course lesson files"
ON public.course_lesson_files
FOR UPDATE
USING (public.can_manage_tribe_courses(tribe_id))
WITH CHECK (public.can_manage_tribe_courses(tribe_id));

CREATE POLICY "Owner maintenance can read course lesson files"
ON public.course_lesson_files
FOR SELECT
USING (
  current_user = (
    SELECT pg_get_userbyid(pg_class.relowner)
    FROM pg_class
    WHERE pg_class.oid = 'public.course_lesson_files'::regclass
  )
);

CREATE POLICY "Owner maintenance can update course lesson files"
ON public.course_lesson_files
FOR UPDATE
USING (
  current_user = (
    SELECT pg_get_userbyid(pg_class.relowner)
    FROM pg_class
    WHERE pg_class.oid = 'public.course_lesson_files'::regclass
  )
)
WITH CHECK (
  current_user = (
    SELECT pg_get_userbyid(pg_class.relowner)
    FROM pg_class
    WHERE pg_class.oid = 'public.course_lesson_files'::regclass
  )
);

-- ---------------------------------------------------------------------------
-- Decoupled remote-deletion queue (shared by both tables)
-- ---------------------------------------------------------------------------

-- No foreign keys: it must outlive the tribe or user rows whose CASCADE wipes
-- the owning message_files / course_lesson_files rows. A queued entry is just
-- an R2 storage key the sweep still has to delete.
CREATE TABLE public.pending_remote_file_deletions (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "storage_key" text NOT NULL,
  "origin" text NOT NULL,
  "enqueued_at" timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT "pending_remote_file_deletions_storage_key_key" UNIQUE ("storage_key"),
  CONSTRAINT "pending_remote_file_deletions_origin_check" CHECK (
    "origin" IN ('tribe_deleted', 'user_deleted')
  )
);

CREATE INDEX "idx_pending_remote_file_deletions_enqueued_at"
  ON public.pending_remote_file_deletions ("enqueued_at");

ALTER TABLE public.pending_remote_file_deletions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_remote_file_deletions FORCE ROW LEVEL SECURITY;

-- Owner-exception policies are the only access: request-scoped roles get no
-- policy at all, so the SECURITY DEFINER maintenance functions (running as the
-- table owner) remain the single sanctioned crossing, even when the owner does
-- not carry BYPASSRLS (mirrors 20260609140000).
CREATE POLICY "Owner maintenance can enqueue remote file deletions"
ON public.pending_remote_file_deletions
FOR INSERT
WITH CHECK (
  current_user = (
    SELECT pg_get_userbyid(pg_class.relowner)
    FROM pg_class
    WHERE pg_class.oid = 'public.pending_remote_file_deletions'::regclass
  )
);

CREATE POLICY "Owner maintenance can read remote file deletions"
ON public.pending_remote_file_deletions
FOR SELECT
USING (
  current_user = (
    SELECT pg_get_userbyid(pg_class.relowner)
    FROM pg_class
    WHERE pg_class.oid = 'public.pending_remote_file_deletions'::regclass
  )
);

CREATE POLICY "Owner maintenance can delete remote file deletions"
ON public.pending_remote_file_deletions
FOR DELETE
USING (
  current_user = (
    SELECT pg_get_userbyid(pg_class.relowner)
    FROM pg_class
    WHERE pg_class.oid = 'public.pending_remote_file_deletions'::regclass
  )
);

-- BEFORE DELETE on a tribe: snapshot the still-live storage keys of both file
-- tables into the queue before the tribe_id CASCADE removes the rows.
CREATE FUNCTION public.enqueue_tribe_files_for_remote_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.pending_remote_file_deletions (storage_key, origin)
  SELECT message_files.storage_key, 'tribe_deleted'
  FROM public.message_files
  WHERE message_files.tribe_id = OLD.id
    AND message_files.status <> 'deleted'
  ON CONFLICT (storage_key) DO NOTHING;

  INSERT INTO public.pending_remote_file_deletions (storage_key, origin)
  SELECT course_lesson_files.storage_key, 'tribe_deleted'
  FROM public.course_lesson_files
  WHERE course_lesson_files.tribe_id = OLD.id
    AND course_lesson_files.status <> 'deleted'
  ON CONFLICT (storage_key) DO NOTHING;

  RETURN OLD;
END;
$$;

CREATE TRIGGER tribes_enqueue_files_before_delete
BEFORE DELETE ON public.tribes
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_tribe_files_for_remote_deletion();

REVOKE EXECUTE ON FUNCTION public.enqueue_tribe_files_for_remote_deletion()
  FROM PUBLIC;

-- BEFORE DELETE on a user: snapshot the storage keys it uploaded before the
-- uploaded_by CASCADE removes the rows.
CREATE FUNCTION public.enqueue_user_files_for_remote_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.pending_remote_file_deletions (storage_key, origin)
  SELECT message_files.storage_key, 'user_deleted'
  FROM public.message_files
  WHERE message_files.uploaded_by = OLD.id
    AND message_files.status <> 'deleted'
  ON CONFLICT (storage_key) DO NOTHING;

  INSERT INTO public.pending_remote_file_deletions (storage_key, origin)
  SELECT course_lesson_files.storage_key, 'user_deleted'
  FROM public.course_lesson_files
  WHERE course_lesson_files.uploaded_by = OLD.id
    AND course_lesson_files.status <> 'deleted'
  ON CONFLICT (storage_key) DO NOTHING;

  RETURN OLD;
END;
$$;

CREATE TRIGGER user_enqueue_files_before_delete
BEFORE DELETE ON public."user"
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_user_files_for_remote_deletion();

REVOKE EXECUTE ON FUNCTION public.enqueue_user_files_for_remote_deletion()
  FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Maintenance primitives for the scheduled sweep (owner-only, GUC-guarded)
-- ---------------------------------------------------------------------------

-- Reclaim abandoned draft message files past their TTL into pending_delete,
-- oldest-first and bounded by batch_limit.
CREATE FUNCTION public.reclaim_abandoned_draft_message_files(
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
  UPDATE public.message_files
  SET status = 'pending_delete',
      message_id = NULL,
      sort_order = NULL,
      updated_at = timezone('utc', now())
  WHERE id IN (
    SELECT id
    FROM public.message_files
    WHERE status = 'draft'
      AND created_at < timezone('utc', now()) - abandoned_draft_ttl
      -- Maintenance-only: never reclaim drafts inside an app user context.
      AND nullif(current_setting('app.current_user_id', true), '') IS NULL
    ORDER BY created_at ASC
    LIMIT batch_limit
  );

  GET DIAGNOSTICS reclaimed_count = ROW_COUNT;
  RETURN reclaimed_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reclaim_abandoned_draft_message_files(interval, integer)
  FROM PUBLIC;

-- Oldest-first batch of message files awaiting a remote delete, skipping rows
-- still inside the interactive delete grace window (see 20260609130000 for the
-- race this guards against).
CREATE FUNCTION public.list_message_files_pending_remote_deletion(
  batch_limit integer,
  interactive_delete_grace interval
)
RETURNS TABLE (asset_id uuid, storage_key text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT message_files.id, message_files.storage_key
  FROM public.message_files
  WHERE message_files.status = 'pending_delete'
    AND message_files.updated_at
      < timezone('utc', now()) - interactive_delete_grace
    -- Maintenance-only: return nothing inside an app user context so this
    -- never leaks pending storage keys to a request-scoped role.
    AND nullif(current_setting('app.current_user_id', true), '') IS NULL
  ORDER BY message_files.updated_at ASC
  LIMIT batch_limit;
$$;

REVOKE EXECUTE ON FUNCTION public.list_message_files_pending_remote_deletion(integer, interval)
  FROM PUBLIC;

-- Confirm a message file as remotely deleted once the R2 DELETE succeeded.
CREATE FUNCTION public.confirm_message_file_remote_deleted(target_asset_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  affected_count integer;
BEGIN
  UPDATE public.message_files
  SET status = 'deleted',
      updated_at = timezone('utc', now())
  WHERE id = target_asset_id
    -- Only confirm rows already slated for deletion, so this can never hide an
    -- attached or draft file while leaving the R2 object alive.
    AND status = 'pending_delete'
    -- Maintenance-only: a request-scoped role cannot drive remote-deletion state.
    AND nullif(current_setting('app.current_user_id', true), '') IS NULL;

  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RETURN affected_count > 0;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_message_file_remote_deleted(uuid)
  FROM PUBLIC;

-- Same trio for course lesson files.
CREATE FUNCTION public.reclaim_abandoned_draft_course_lesson_files(
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
  UPDATE public.course_lesson_files
  SET status = 'pending_delete',
      lesson_id = NULL,
      sort_order = NULL,
      updated_at = timezone('utc', now())
  WHERE id IN (
    SELECT id
    FROM public.course_lesson_files
    WHERE status = 'draft'
      AND created_at < timezone('utc', now()) - abandoned_draft_ttl
      -- Maintenance-only: never reclaim drafts inside an app user context.
      AND nullif(current_setting('app.current_user_id', true), '') IS NULL
    ORDER BY created_at ASC
    LIMIT batch_limit
  );

  GET DIAGNOSTICS reclaimed_count = ROW_COUNT;
  RETURN reclaimed_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reclaim_abandoned_draft_course_lesson_files(interval, integer)
  FROM PUBLIC;

CREATE FUNCTION public.list_course_lesson_files_pending_remote_deletion(
  batch_limit integer,
  interactive_delete_grace interval
)
RETURNS TABLE (asset_id uuid, storage_key text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT course_lesson_files.id, course_lesson_files.storage_key
  FROM public.course_lesson_files
  WHERE course_lesson_files.status = 'pending_delete'
    AND course_lesson_files.updated_at
      < timezone('utc', now()) - interactive_delete_grace
    -- Maintenance-only: return nothing inside an app user context.
    AND nullif(current_setting('app.current_user_id', true), '') IS NULL
  ORDER BY course_lesson_files.updated_at ASC
  LIMIT batch_limit;
$$;

REVOKE EXECUTE ON FUNCTION public.list_course_lesson_files_pending_remote_deletion(integer, interval)
  FROM PUBLIC;

CREATE FUNCTION public.confirm_course_lesson_file_remote_deleted(target_asset_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  affected_count integer;
BEGIN
  UPDATE public.course_lesson_files
  SET status = 'deleted',
      updated_at = timezone('utc', now())
  WHERE id = target_asset_id
    AND status = 'pending_delete'
    AND nullif(current_setting('app.current_user_id', true), '') IS NULL;

  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RETURN affected_count > 0;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_course_lesson_file_remote_deleted(uuid)
  FROM PUBLIC;

-- Oldest-first batch of queued (CASCADE-orphaned) storage keys.
CREATE FUNCTION public.list_queued_remote_file_deletions(batch_limit integer)
RETURNS TABLE (queue_id uuid, storage_key text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT id, storage_key
  FROM public.pending_remote_file_deletions
  -- Maintenance-only: return nothing inside an app user context.
  WHERE nullif(current_setting('app.current_user_id', true), '') IS NULL
  ORDER BY enqueued_at ASC
  LIMIT batch_limit;
$$;

REVOKE EXECUTE ON FUNCTION public.list_queued_remote_file_deletions(integer)
  FROM PUBLIC;

-- Remove a queued entry once its R2 DELETE succeeded.
CREATE FUNCTION public.delete_queued_remote_file_deletion(target_queue_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  affected_count integer;
BEGIN
  DELETE FROM public.pending_remote_file_deletions
  WHERE id = target_queue_id
    -- Maintenance-only: a request-scoped role cannot drop queued entries.
    AND nullif(current_setting('app.current_user_id', true), '') IS NULL;

  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RETURN affected_count > 0;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_queued_remote_file_deletion(uuid)
  FROM PUBLIC;

-- No EXECUTE grant to a general request role: the cron sweep runs as the
-- function owner, which keeps EXECUTE after the PUBLIC revoke. Granting these
-- to a shared request/Data API role such as `authenticated` would re-expose
-- the RLS bypass (that role never sets `app.current_user_id`, so the
-- maintenance guard would treat it as maintenance context).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_files TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_lesson_files TO authenticated;
  END IF;
END $$;
