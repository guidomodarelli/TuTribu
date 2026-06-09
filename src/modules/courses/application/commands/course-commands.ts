export type GetTribeCoursesQuery = {
  tribeSlug: string;
};

export type CreateCourseModuleCommand = {
  sortOrder: number;
  title: string;
  tribeSlug: string;
};

export type UpdateCourseModuleCommand = {
  courseModuleId: string;
  isActive: boolean;
  sortOrder: number;
  title: string;
  tribeSlug: string;
};

export type DeleteCourseModuleCommand = {
  courseModuleId: string;
  tribeSlug: string;
};

/**
 * A single file attachment draft for a lesson. The array index expresses the
 * leader-chosen slot (`sortOrder`) within the lesson material list.
 */
export type LessonFileDraftCommand = {
  assetId: string;
};

export type CreateLessonCommand = {
  courseModuleId: string;
  description: string;
  externalVideoUrl: string;
  files?: LessonFileDraftCommand[];
  sortOrder: number;
  title: string;
  tribeSlug: string;
  userId: string;
};

export type UpdateLessonCommand = {
  courseModuleId: string;
  description: string;
  externalVideoUrl: string;
  files?: LessonFileDraftCommand[];
  isActive: boolean;
  lessonId: string;
  sortOrder: number;
  title: string;
  tribeSlug: string;
  userId: string;
};

export type DeleteLessonCommand = {
  lessonId: string;
  tribeSlug: string;
  userId: string;
};
