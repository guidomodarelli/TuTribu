export const COURSE_LESSON_DESCRIPTION = {
  maxLength: 2000,
  minLength: 0,
} as const;

export const COURSE_TITLE = {
  maxLength: 120,
} as const;

export const COURSE_DESCRIPTION = {
  maxLength: 500,
} as const;

export const COURSE_COVER_IMAGE_URL = {
  maxLength: 2048,
} as const;

export const COURSE_MODULE_UNLOCK_AFTER_DAYS = {
  max: 3650,
  min: 0,
} as const;

export const LESSON_COMMENT_CONTENT = {
  maxLength: 2000,
  minLength: 1,
} as const;

export const COURSE_ENGAGEMENT_STATUS = {
  completed: "completed",
  ok: "ok",
  recorded: "recorded",
  uncompleted: "uncompleted",
} as const;

export const COURSE_MUTATION_STATUS = {
  created: "created",
  deleted: "deleted",
  forbidden: "forbidden",
  invalidFile: "invalid_file",
  invalidInput: "invalid_input",
  invalidVideoUrl: "invalid_video_url",
  notFound: "not_found",
  updated: "updated",
} as const;

export type CourseMutationStatus =
  (typeof COURSE_MUTATION_STATUS)[keyof typeof COURSE_MUTATION_STATUS];

/**
 * Ceiling for file attachments per course lesson. Type and size limits come
 * from the shared attachment contract in `src/constants/attachment-files.ts`.
 */
export const LESSON_FILES = {
  maxCount: 10,
} as const;

export const LESSON_FILE_STATUS = {
  attached: "attached",
  deleted: "deleted",
  draft: "draft",
  pendingDelete: "pending_delete",
} as const;

/**
 * Bounds the scheduled orphan lesson-file cleanup, with the same semantics as
 * the message attachment sweep: drafts past the TTL are reclaimed, batches are
 * bounded, and `pending_delete` rows inside the interactive delete grace
 * window are left to the in-flight request that marked them.
 */
export const LESSON_FILE_CLEANUP = {
  abandonedDraftTtlHours: 24,
  batchLimit: 100,
  interactiveDeleteGraceMinutes: 15,
} as const;

export const LESSON_FILE_PREPARATION_STATUS = {
  ready: "ready",
} as const;
