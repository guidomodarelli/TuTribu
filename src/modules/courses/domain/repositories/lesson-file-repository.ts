import type {
  COURSE_MUTATION_STATUS,
  LESSON_FILE_PREPARATION_STATUS,
} from "@/src/modules/courses/constants/courses";

export type LessonFileAttachmentDraft = {
  assetId: string;
  sortOrder: number;
};

export type PreparedLessonFileAttachmentResult =
  | {
      files: LessonFileAttachmentDraft[];
      status: typeof LESSON_FILE_PREPARATION_STATUS.ready;
    }
  | {
      status: typeof COURSE_MUTATION_STATUS.invalidFile;
    };

export type PrepareLessonFilesForAttachmentCommand = {
  files: LessonFileAttachmentDraft[];
  lessonId?: string;
  tribeSlug: string;
  userId: string;
};

export type DeletePendingLessonFilesCommand = {
  lessonId: string;
  tribeSlug: string;
  userId: string;
};

export type CleanupOrphanLessonFilesCommand = {
  abandonedDraftTtlHours: number;
  batchLimit: number;
  interactiveDeleteGraceMinutes: number;
};

export type CleanupOrphanLessonFilesResult = {
  reclaimedDrafts: number;
  remoteDeletedPending: number;
  remoteFailures: number;
};

export type LessonFileUploadCreationResult =
  | {
      assetId: string;
      status: typeof COURSE_MUTATION_STATUS.created;
      uploadHeaders: Record<string, string>;
      uploadUrl: string;
    }
  | {
      status:
        | typeof COURSE_MUTATION_STATUS.forbidden
        | typeof COURSE_MUTATION_STATUS.notFound
        | typeof COURSE_MUTATION_STATUS.invalidFile;
    };

export type CreateLessonFileUploadCommand = {
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  tribeSlug: string;
  userId: string;
};

export type DeleteLessonFileCommand = {
  fileId: string;
  tribeSlug: string;
  userId: string;
};

export type LessonFileDeletionResult = {
  status:
    | typeof COURSE_MUTATION_STATUS.deleted
    | typeof COURSE_MUTATION_STATUS.forbidden
    | typeof COURSE_MUTATION_STATUS.notFound
    | typeof COURSE_MUTATION_STATUS.invalidFile;
};

export type CreateLessonFileDownloadUrlCommand = {
  fileId: string;
  tribeSlug: string;
  userId: string;
};

export type LessonFileDownloadUrlResult =
  | {
      downloadUrl: string;
      status: typeof COURSE_MUTATION_STATUS.created;
    }
  | {
      status:
        | typeof COURSE_MUTATION_STATUS.notFound
        | typeof COURSE_MUTATION_STATUS.invalidFile;
    };

export interface LessonFileRepository {
  cleanupOrphanFiles(
    command: CleanupOrphanLessonFilesCommand
  ): Promise<CleanupOrphanLessonFilesResult>;
  createDownloadUrl(
    command: CreateLessonFileDownloadUrlCommand
  ): Promise<LessonFileDownloadUrlResult>;
  createUpload(
    command: CreateLessonFileUploadCommand
  ): Promise<LessonFileUploadCreationResult>;
  deleteFile(
    command: DeleteLessonFileCommand
  ): Promise<LessonFileDeletionResult>;
  deletePendingFiles(command: DeletePendingLessonFilesCommand): Promise<void>;
  prepareForAttachment(
    command: PrepareLessonFilesForAttachmentCommand
  ): Promise<PreparedLessonFileAttachmentResult>;
}
