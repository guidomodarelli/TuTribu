import "server-only";

import { sql } from "drizzle-orm";

import {
  COURSE_MUTATION_STATUS,
  LESSON_FILE_PREPARATION_STATUS,
  LESSON_FILE_STATUS,
} from "@/src/modules/courses/constants/courses";
import type {
  CleanupOrphanLessonFilesCommand,
  CleanupOrphanLessonFilesResult,
  CreateLessonFileDownloadUrlCommand,
  CreateLessonFileUploadCommand,
  DeleteLessonFileCommand,
  DeletePendingLessonFilesCommand,
  LessonFileDeletionResult,
  LessonFileDownloadUrlResult,
  LessonFileRepository,
  LessonFileUploadCreationResult,
  PrepareLessonFilesForAttachmentCommand,
  PreparedLessonFileAttachmentResult,
} from "@/src/modules/courses/domain/repositories/lesson-file-repository";
import { selectBooleanResult } from "@/src/modules/shared/infrastructure/database/database-executor";
import {
  R2AttachmentFileRepository,
  type PendingRemoteAttachmentFileRow,
} from "@/src/modules/shared/infrastructure/storage/r2-attachment-file-repository";
import { verifyUploadedDraftFileSizes } from "@/src/modules/shared/infrastructure/storage/r2-attachment-file-storage";

type ManageableTribeRow = {
  can_manage: boolean;
  tribe_id: string;
};

type InsertedLessonFileRow = {
  file_id: string;
};

type AttachableLessonFileRow = {
  file_size_bytes: number | string;
  id: string;
  lesson_id: string | null;
  status: string;
  storage_key: string;
};

type DeletableLessonFileRow = {
  can_delete: boolean;
  id: string;
  sort_order: number | null;
  status: string;
  storage_key: string;
};

type DownloadableLessonFileRow = {
  file_name: string;
  id: string;
  storage_key: string;
};

type MarkedLessonFileRow = {
  file_id: string;
};

type ReclaimedDraftsRow = {
  reclaimed: number | string;
};

const LESSON_FILE_LOG = {
  fileIdKey: "fileId",
  localDeleteMarkFailed: "Lesson file local delete mark failed",
  pendingCleanupFailed: "Lesson file remote cleanup failed",
  remoteDeleteFailed: "Lesson file remote delete failed",
} as const;

const LESSON_FILE_STORAGE_KEY_PREFIX = "course-lesson-files";

function buildLessonFileStorageKey(tribeId: string, fileId: string): string {
  return `${LESSON_FILE_STORAGE_KEY_PREFIX}/${tribeId}/${fileId}`;
}

/**
 * R2-backed implementation of {@link LessonFileRepository}.
 *
 * Same lifecycle as message attachments: a leader-reserved draft row owns the
 * storage key before the browser uploads through a presigned PUT, attachment
 * happens with the lesson mutation, and the scheduled sweep deletes any object
 * whose row was abandoned or removed. Database access runs through the
 * request-scoped executor so RLS stays the authorization boundary.
 */
export class R2LessonFileRepository
  extends R2AttachmentFileRepository<DeletePendingLessonFilesCommand>
  implements LessonFileRepository
{
  protected readonly logCopy = LESSON_FILE_LOG;

  async createUpload(
    command: CreateLessonFileUploadCommand
  ): Promise<LessonFileUploadCreationResult> {
    const storage = this.resolveStorage();

    if (!storage) {
      return { status: COURSE_MUTATION_STATUS.invalidFile };
    }

    const targetTribe = await this.findManageableTribe(command.tribeSlug);

    if (!targetTribe) {
      return { status: COURSE_MUTATION_STATUS.notFound };
    }

    if (!targetTribe.can_manage) {
      return { status: COURSE_MUTATION_STATUS.forbidden };
    }

    const fileId = crypto.randomUUID();
    const storageKey = buildLessonFileStorageKey(targetTribe.tribe_id, fileId);
    const signedUpload = await storage.createSignedUploadUrl({
      contentType: command.mimeType,
      storageKey,
    });
    const insertedFile = await this.insertDraftFile({
      fileId,
      fileName: command.fileName,
      fileSizeBytes: command.fileSizeBytes,
      mimeType: command.mimeType,
      storageKey,
      tribeId: targetTribe.tribe_id,
      userId: command.userId,
    });

    if (!insertedFile) {
      return { status: COURSE_MUTATION_STATUS.invalidFile };
    }

    return {
      assetId: insertedFile.file_id,
      status: COURSE_MUTATION_STATUS.created,
      uploadHeaders: signedUpload.headers,
      uploadUrl: signedUpload.uploadUrl,
    };
  }

  async createDownloadUrl(
    command: CreateLessonFileDownloadUrlCommand
  ): Promise<LessonFileDownloadUrlResult> {
    // Visibility is decided before storage is required, so a missing or
    // hidden file answers `notFound` even when R2 is not configured.
    const file = await this.findDownloadableFile(command);

    if (!file) {
      return { status: COURSE_MUTATION_STATUS.notFound };
    }

    const storage = this.resolveStorage();

    if (!storage) {
      return { status: COURSE_MUTATION_STATUS.invalidFile };
    }

    return {
      downloadUrl: await storage.createSignedDownloadUrl({
        fileName: file.file_name,
        storageKey: file.storage_key,
      }),
      status: COURSE_MUTATION_STATUS.created,
    };
  }

  async deleteFile(
    command: DeleteLessonFileCommand
  ): Promise<LessonFileDeletionResult> {
    // Existence and permission are read-only checks, so they run before
    // storage is required; nothing is marked until R2 is available.
    const file = await this.findDeletableFile(command);

    if (!file) {
      return { status: COURSE_MUTATION_STATUS.notFound };
    }

    if (!file.can_delete) {
      return { status: COURSE_MUTATION_STATUS.forbidden };
    }

    const storage = this.resolveStorage();

    if (!storage) {
      return { status: COURSE_MUTATION_STATUS.invalidFile };
    }

    if (!(await this.markFilePendingDelete(file.id))) {
      this.warnFileFailure(
        "Lesson file local pending delete mark failed",
        file.id,
        command.tribeSlug
      );

      return { status: COURSE_MUTATION_STATUS.invalidFile };
    }

    if (!(await storage.deleteObject(file.storage_key))) {
      const wasRestored = await this.restoreFileDeletionState({
        fileId: file.id,
        sortOrder: file.sort_order,
        status: file.status,
      });

      if (!wasRestored) {
        this.warnFileFailure(
          "Lesson file local delete rollback failed",
          file.id,
          command.tribeSlug
        );
      }

      return { status: COURSE_MUTATION_STATUS.invalidFile };
    }

    if (!(await this.markFileDeleted(file.id))) {
      this.warnFileFailure(
        LESSON_FILE_LOG.localDeleteMarkFailed,
        file.id,
        command.tribeSlug
      );

      return { status: COURSE_MUTATION_STATUS.invalidFile };
    }

    return { status: COURSE_MUTATION_STATUS.deleted };
  }

  /**
   * Scheduled sweep over lesson attachment files: reclaims abandoned drafts
   * past their TTL into `pending_delete` and drains the `pending_delete` rows
   * outside the interactive delete grace window. The decoupled CASCADE queue
   * (shared with message files) is drained by the message-file sweep.
   *
   * @param command - Abandoned-draft TTL, per-source batch size, and
   *   interactive delete grace window.
   * @returns Counters describing the work performed in this sweep.
   */
  async cleanupOrphanFiles(
    command: CleanupOrphanLessonFilesCommand
  ): Promise<CleanupOrphanLessonFilesResult> {
    const storage = this.resolveStorage();

    if (!storage) {
      return { reclaimedDrafts: 0, remoteDeletedPending: 0, remoteFailures: 0 };
    }

    return this.sweepPendingFiles(storage, command);
  }

  async prepareForAttachment(
    command: PrepareLessonFilesForAttachmentCommand
  ): Promise<PreparedLessonFileAttachmentResult> {
    const storage = this.resolveStorage();

    if (!storage) {
      return { status: COURSE_MUTATION_STATUS.invalidFile };
    }

    const files = await this.findAttachableFiles(command);

    if (files.length !== command.files.length) {
      return { status: COURSE_MUTATION_STATUS.invalidFile };
    }

    const areUploadsValid = await verifyUploadedDraftFileSizes(
      storage,
      files,
      LESSON_FILE_STATUS.draft,
      (fileId, sizeBytes) => this.updateFileSize(fileId, sizeBytes)
    );

    if (!areUploadsValid) {
      return { status: COURSE_MUTATION_STATUS.invalidFile };
    }

    return {
      files: command.files,
      status: LESSON_FILE_PREPARATION_STATUS.ready,
    };
  }

  protected async confirmRemoteDeleted(fileId: string): Promise<boolean> {
    return selectBooleanResult(
      this.executeWithDatabase,
      sql`
        select public.confirm_course_lesson_file_remote_deleted(${fileId}) as result
      `
    );
  }

  protected async listPendingRemoteDeletions(
    batchLimit: number,
    interactiveDeleteGraceMinutes: number
  ): Promise<PendingRemoteAttachmentFileRow[]> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select asset_id, storage_key
        from public.list_course_lesson_files_pending_remote_deletion(
          ${batchLimit},
          make_interval(mins => ${interactiveDeleteGraceMinutes})
        )
      `);

      return result.rows as PendingRemoteAttachmentFileRow[];
    });
  }

  protected async reclaimAbandonedDrafts(
    ttlHours: number,
    batchLimit: number
  ): Promise<number> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select public.reclaim_abandoned_draft_course_lesson_files(
          make_interval(hours => ${ttlHours}),
          ${batchLimit}
        ) as reclaimed
      `);
      const reclaimed = ((result.rows[0] ?? null) as ReclaimedDraftsRow | null)
        ?.reclaimed;

      return Number(reclaimed ?? 0);
    });
  }

  private async findAttachableFiles(
    command: PrepareLessonFilesForAttachmentCommand
  ): Promise<AttachableLessonFileRow[]> {
    if (command.files.length === 0) {
      return [];
    }

    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select
          course_lesson_files.id,
          course_lesson_files.file_size_bytes,
          course_lesson_files.lesson_id,
          course_lesson_files.status,
          course_lesson_files.storage_key
        from public.course_lesson_files
        inner join public.tribes
          on tribes.id = course_lesson_files.tribe_id
        where course_lesson_files.id = any(${sql.param(command.files.map((file) => file.assetId))}::uuid[])
          and tribes.slug = ${command.tribeSlug}
          and public.can_manage_tribe_courses(course_lesson_files.tribe_id)
          and (
            course_lesson_files.status = ${LESSON_FILE_STATUS.draft}
            or (
              ${command.lessonId ?? null}::uuid is not null
              and course_lesson_files.status = ${LESSON_FILE_STATUS.attached}
              and course_lesson_files.lesson_id = ${command.lessonId ?? null}
            )
          )
      `);

      return result.rows as AttachableLessonFileRow[];
    });
  }

  private async findDeletableFile(
    command: DeleteLessonFileCommand
  ): Promise<DeletableLessonFileRow | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select
          course_lesson_files.id,
          course_lesson_files.storage_key,
          course_lesson_files.sort_order,
          course_lesson_files.status,
          public.can_manage_tribe_courses(course_lesson_files.tribe_id) as can_delete
        from public.course_lesson_files
        inner join public.tribes
          on tribes.id = course_lesson_files.tribe_id
        where course_lesson_files.id = ${command.fileId}
          and tribes.slug = ${command.tribeSlug}
          and course_lesson_files.status in (
            ${LESSON_FILE_STATUS.draft},
            ${LESSON_FILE_STATUS.attached},
            ${LESSON_FILE_STATUS.pendingDelete}
          )
        limit 1
      `);

      return (result.rows[0] ?? null) as DeletableLessonFileRow | null;
    });
  }

  private async findDownloadableFile(
    command: CreateLessonFileDownloadUrlCommand
  ): Promise<DownloadableLessonFileRow | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select
          course_lesson_files.id,
          course_lesson_files.file_name,
          course_lesson_files.storage_key
        from public.course_lesson_files
        inner join public.tribes
          on tribes.id = course_lesson_files.tribe_id
        where course_lesson_files.id = ${command.fileId}
          and tribes.slug = ${command.tribeSlug}
          and (
            -- The runtime role bypasses RLS: repeat the lesson read rule
            -- (membership, drip and the course access requirement) before a
            -- signed URL is issued.
            (
              course_lesson_files.status = ${LESSON_FILE_STATUS.attached}
              and course_lesson_files.lesson_id is not null
              and public.can_read_course_lesson(course_lesson_files.lesson_id)
            )
            or (
              course_lesson_files.status = ${LESSON_FILE_STATUS.draft}
              and course_lesson_files.uploaded_by = ${command.userId}
              and public.can_manage_tribe_courses(course_lesson_files.tribe_id)
            )
          )
        limit 1
      `);

      return (result.rows[0] ?? null) as DownloadableLessonFileRow | null;
    });
  }

  protected async findPendingDeleteFiles(
    command: DeletePendingLessonFilesCommand
  ): Promise<DeletableLessonFileRow[]> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select
          course_lesson_files.id,
          course_lesson_files.storage_key,
          course_lesson_files.sort_order,
          course_lesson_files.status,
          true as can_delete
        from public.course_lesson_files
        inner join public.tribes
          on tribes.id = course_lesson_files.tribe_id
        where (
            course_lesson_files.lesson_id = ${command.lessonId}
            or course_lesson_files.deleted_lesson_id = ${command.lessonId}
          )
          and tribes.slug = ${command.tribeSlug}
          and public.can_manage_tribe_courses(course_lesson_files.tribe_id)
          and course_lesson_files.status = ${LESSON_FILE_STATUS.pendingDelete}
      `);

      return result.rows as DeletableLessonFileRow[];
    });
  }

  private async findManageableTribe(
    tribeSlug: string
  ): Promise<ManageableTribeRow | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select
          tribes.id as tribe_id,
          public.can_manage_tribe_courses(tribes.id) as can_manage
        from public.tribes
        where tribes.slug = ${tribeSlug}
        limit 1
      `);

      return (result.rows[0] ?? null) as ManageableTribeRow | null;
    });
  }

  private async insertDraftFile({
    fileId,
    fileName,
    fileSizeBytes,
    mimeType,
    storageKey,
    tribeId,
    userId,
  }: {
    fileId: string;
    fileName: string;
    fileSizeBytes: number;
    mimeType: string;
    storageKey: string;
    tribeId: string;
    userId: string;
  }): Promise<InsertedLessonFileRow | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        insert into public.course_lesson_files (
          id,
          tribe_id,
          uploaded_by,
          storage_key,
          file_name,
          mime_type,
          file_size_bytes,
          status,
          created_at,
          updated_at
        )
        values (
          ${fileId},
          ${tribeId},
          ${userId},
          ${storageKey},
          ${fileName},
          ${mimeType},
          ${fileSizeBytes},
          ${LESSON_FILE_STATUS.draft},
          timezone('utc', now()),
          timezone('utc', now())
        )
        returning course_lesson_files.id as file_id
      `);

      return (result.rows[0] ?? null) as InsertedLessonFileRow | null;
    });
  }

  protected async markFileDeleted(fileId: string): Promise<boolean> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        update public.course_lesson_files
        set status = ${LESSON_FILE_STATUS.deleted},
            updated_at = timezone('utc', now())
        where course_lesson_files.id = ${fileId}
        returning course_lesson_files.id as file_id
      `);

      return Boolean(
        ((result.rows[0] ?? null) as MarkedLessonFileRow | null)?.file_id
      );
    });
  }

  private async markFilePendingDelete(fileId: string): Promise<boolean> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        update public.course_lesson_files
        set status = ${LESSON_FILE_STATUS.pendingDelete},
            sort_order = null,
            updated_at = timezone('utc', now())
        where course_lesson_files.id = ${fileId}
        returning course_lesson_files.id as file_id
      `);

      return Boolean(
        ((result.rows[0] ?? null) as MarkedLessonFileRow | null)?.file_id
      );
    });
  }

  /**
   * Rolls a lesson file back to its pre-deletion state after a transient
   * remote delete failure, but only while the row is still `pending_delete`,
   * so a concurrent sweep that already confirmed the remote delete is never
   * overwritten with a visible row pointing at a deleted object.
   *
   * @returns Whether the row was still `pending_delete` and was restored.
   */
  private async restoreFileDeletionState({
    fileId,
    sortOrder,
    status,
  }: {
    fileId: string;
    sortOrder: number | null;
    status: string;
  }): Promise<boolean> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        update public.course_lesson_files
        set status = ${status},
            sort_order = ${sortOrder},
            updated_at = timezone('utc', now())
        where course_lesson_files.id = ${fileId}
          and course_lesson_files.status = ${LESSON_FILE_STATUS.pendingDelete}
        returning course_lesson_files.id as file_id
      `);

      return Boolean(
        ((result.rows[0] ?? null) as MarkedLessonFileRow | null)?.file_id
      );
    });
  }

  private async updateFileSize(
    fileId: string,
    fileSizeBytes: number
  ): Promise<void> {
    await this.executeWithDatabase(async (database) => {
      await database.execute(sql`
        update public.course_lesson_files
        set file_size_bytes = ${fileSizeBytes},
            updated_at = timezone('utc', now())
        where course_lesson_files.id = ${fileId}
      `);
    });
  }
}
