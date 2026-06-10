/**
 * A file attachment of a course lesson. The binary lives in R2 and is only
 * reachable through the authorized download route, so no storage URL is ever
 * part of the entity.
 */
export type LessonFile = {
  fileName: string;
  fileSizeBytes: number;
  id: string;
  mimeType: string;
  sortOrder: number;
};
