import type { VideoProvider } from "@/src/modules/shared/domain/value-objects/video-provider";
import type { CourseModule } from "@/src/modules/courses/domain/entities/course-module";
import type { Lesson } from "@/src/modules/courses/domain/entities/lesson";

export type GetTribeCoursesQuery = {
  tribeSlug: string;
};

export type CreateCourseModuleRepositoryCommand = {
  sortOrder: number;
  title: string;
  tribeSlug: string;
};

export type UpdateCourseModuleRepositoryCommand =
  CreateCourseModuleRepositoryCommand & {
    courseModuleId: string;
    isActive: boolean;
  };

export type DeleteCourseModuleRepositoryCommand = {
  courseModuleId: string;
  tribeSlug: string;
};

type LessonRepositoryCommandBase = {
  courseModuleId: string;
  description: string | null;
  externalVideoId: string;
  sortOrder: number;
  title: string;
  tribeSlug: string;
  videoProvider: VideoProvider;
};

export type CreateLessonRepositoryCommand = LessonRepositoryCommandBase;

export type UpdateLessonRepositoryCommand = LessonRepositoryCommandBase & {
  isActive: boolean;
  lessonId: string;
};

export type DeleteLessonRepositoryCommand = {
  lessonId: string;
  tribeSlug: string;
};

export type CourseModuleResult = CourseModule;

export type LessonResult = Lesson;

export type CourseModuleWithLessonsResult = CourseModuleResult & {
  lessons: LessonResult[];
};

export type CourseTreeViewerPermissionsResult = {
  canManageCourses: boolean;
};

export type CourseTreeResult = {
  modules: CourseModuleWithLessonsResult[];
  viewerPermissions: CourseTreeViewerPermissionsResult;
};

export type CourseModuleCreationResult =
  | {
      courseModule: CourseModuleResult;
      status: "created";
    }
  | {
      status: "forbidden" | "invalid_input" | "not_found";
    };

export type CourseModuleUpdateResult =
  | {
      courseModule: CourseModuleResult;
      status: "updated";
    }
  | {
      status: "forbidden" | "invalid_input" | "not_found";
    };

export type CourseModuleDeletionResult = {
  status: "deleted" | "forbidden" | "not_found";
};

export type LessonCreationResult =
  | {
      lesson: LessonResult;
      status: "created";
    }
  | {
      status: "forbidden" | "invalid_input" | "invalid_video_url" | "not_found";
    };

export type LessonUpdateResult =
  | {
      lesson: LessonResult;
      status: "updated";
    }
  | {
      status: "forbidden" | "invalid_input" | "invalid_video_url" | "not_found";
    };

export type LessonDeletionResult = {
  status: "deleted" | "forbidden" | "not_found";
};

/**
 * Domain-owned repository port for reading and mutating tribe course content.
 */
export type CourseRepository = {
  createCourseModule: (
    command: CreateCourseModuleRepositoryCommand
  ) => Promise<CourseModuleCreationResult>;
  createLesson: (
    command: CreateLessonRepositoryCommand
  ) => Promise<LessonCreationResult>;
  deleteCourseModule: (
    command: DeleteCourseModuleRepositoryCommand
  ) => Promise<CourseModuleDeletionResult>;
  deleteLesson: (
    command: DeleteLessonRepositoryCommand
  ) => Promise<LessonDeletionResult>;
  getEditableTreeByTribeSlug: (
    query: GetTribeCoursesQuery
  ) => Promise<CourseTreeResult>;
  getTreeByTribeSlug: (query: GetTribeCoursesQuery) => Promise<CourseTreeResult>;
  updateCourseModule: (
    command: UpdateCourseModuleRepositoryCommand
  ) => Promise<CourseModuleUpdateResult>;
  updateLesson: (
    command: UpdateLessonRepositoryCommand
  ) => Promise<LessonUpdateResult>;
};
