import {
  COURSE_MUTATION_STATUS,
  LESSON_FILES, LESSON_FILE_CLEANUP 
} from "@/src/modules/courses/constants/courses";
import type { LessonFileDraftCommand } from "@/src/modules/courses/application/commands/course-commands";
import type {
  CleanupOrphanLessonFilesResult,
  CreateLessonFileDownloadUrlCommand,
  CreateLessonFileUploadCommand,
  DeleteLessonFileCommand,
  LessonFileAttachmentDraft,
  LessonFileDeletionResult,
  LessonFileDownloadUrlResult,
  LessonFileRepository,
  LessonFileUploadCreationResult,
} from "@/src/modules/courses/domain/repositories/lesson-file-repository";
import {
  isAttachmentAssetId,
  normalizeAttachmentFileDrafts,
  normalizeAttachmentUploadRequest,
} from "@/src/modules/shared/application/attachments/attachment-upload-validation";

type CreateLessonFileUploadDependencies = {
  lessonFileRepository: Pick<LessonFileRepository, "createUpload">;
};

type DeleteLessonFileDependencies = {
  lessonFileRepository: Pick<LessonFileRepository, "deleteFile">;
};

type CreateLessonFileDownloadUrlDependencies = {
  lessonFileRepository: Pick<LessonFileRepository, "createDownloadUrl">;
};

type CleanupOrphanLessonFilesDependencies = {
  lessonFileRepository: Pick<LessonFileRepository, "cleanupOrphanFiles">;
};

export const NORMALIZED_LESSON_FILES_STATUS = {
  valid: "valid",
} as const;

export type NormalizedLessonFileDrafts =
  | {
      files: LessonFileAttachmentDraft[];
      status: typeof NORMALIZED_LESSON_FILES_STATUS.valid;
    }
  | {
      status: typeof COURSE_MUTATION_STATUS.invalidFile;
    };

/**
 * Normalizes the lesson editor's file draft list into attachment drafts:
 * bounded count, unique well-formed asset ids, and `sortOrder` derived from
 * the array index the leader arranged.
 *
 * @param drafts - Raw file drafts from the lesson payload.
 * @returns The normalized drafts, or an invalid-file status.
 */
export function normalizeLessonFileDrafts(
  drafts: LessonFileDraftCommand[] | null | undefined
): NormalizedLessonFileDrafts {
  const files = normalizeAttachmentFileDrafts(drafts, LESSON_FILES.maxCount);

  return files
    ? { files, status: NORMALIZED_LESSON_FILES_STATUS.valid }
    : { status: COURSE_MUTATION_STATUS.invalidFile };
}

export function createLessonFileUpload({
  lessonFileRepository,
}: CreateLessonFileUploadDependencies) {
  return async (
    command: CreateLessonFileUploadCommand
  ): Promise<LessonFileUploadCreationResult> => {
    const upload = normalizeAttachmentUploadRequest(command);

    if (!upload) {
      return { status: COURSE_MUTATION_STATUS.invalidFile };
    }

    return lessonFileRepository.createUpload(upload);
  };
}

export function deleteLessonFile({
  lessonFileRepository,
}: DeleteLessonFileDependencies) {
  return async (
    command: DeleteLessonFileCommand
  ): Promise<LessonFileDeletionResult> =>
    lessonFileRepository.deleteFile({
      fileId: command.fileId.trim(),
      tribeSlug: command.tribeSlug.trim(),
      userId: command.userId.trim(),
    });
}

export function createLessonFileDownloadUrl({
  lessonFileRepository,
}: CreateLessonFileDownloadUrlDependencies) {
  return async (
    command: CreateLessonFileDownloadUrlCommand
  ): Promise<LessonFileDownloadUrlResult> => {
    const fileId = command.fileId.trim();

    if (!isAttachmentAssetId(fileId)) {
      return { status: COURSE_MUTATION_STATUS.notFound };
    }

    return lessonFileRepository.createDownloadUrl({
      fileId,
      tribeSlug: command.tribeSlug.trim(),
      userId: command.userId.trim(),
    });
  };
}

/**
 * Builds the use case that sweeps orphaned lesson attachment files out of R2:
 * abandoned drafts past their TTL and `pending_delete` rows outside the
 * interactive delete grace window. The shared CASCADE queue is drained by the
 * message-file sweep, which owns the queue drainer.
 *
 * @param dependencies - Lesson file repository dependency.
 * @returns Use case function that runs one cleanup sweep.
 */
export function cleanupOrphanLessonFiles({
  lessonFileRepository,
}: CleanupOrphanLessonFilesDependencies) {
  return async (): Promise<CleanupOrphanLessonFilesResult> =>
    lessonFileRepository.cleanupOrphanFiles({
      abandonedDraftTtlHours: LESSON_FILE_CLEANUP.abandonedDraftTtlHours,
      batchLimit: LESSON_FILE_CLEANUP.batchLimit,
      interactiveDeleteGraceMinutes:
        LESSON_FILE_CLEANUP.interactiveDeleteGraceMinutes,
    });
}
