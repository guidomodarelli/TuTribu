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

export type CreateLessonCommand = {
  courseModuleId: string;
  description: string;
  externalVideoUrl: string;
  sortOrder: number;
  title: string;
  tribeSlug: string;
};

export type UpdateLessonCommand = {
  courseModuleId: string;
  description: string;
  externalVideoUrl: string;
  isActive: boolean;
  lessonId: string;
  sortOrder: number;
  title: string;
  tribeSlug: string;
};

export type DeleteLessonCommand = {
  lessonId: string;
  tribeSlug: string;
};
