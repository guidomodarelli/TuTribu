import type { VideoProvider } from "@/src/modules/shared/domain/value-objects/video-provider";
import type {
  CourseAccessRequirement,
  CourseViewerAccessStatus,
} from "@/src/modules/courses/constants/courses";
import type { Course } from "@/src/modules/courses/domain/entities/course";
import type { CourseModule } from "@/src/modules/courses/domain/entities/course-module";
import type { Lesson } from "@/src/modules/courses/domain/entities/lesson";
import type { LessonFileAttachmentDraft } from "@/src/modules/courses/domain/repositories/lesson-file-repository";

export type GetTribeCoursesQuery = {
  tribeSlug: string;
};

export type CreateCourseRepositoryCommand = {
  accessRequirement: CourseAccessRequirement;
  coverImageUrl: string | null;
  description: string | null;
  sortOrder: number;
  title: string;
  tribeSlug: string;
};

export type UpdateCourseRepositoryCommand = Omit<
  CreateCourseRepositoryCommand,
  "accessRequirement"
> & {
  /** Null keeps the stored requirement. */
  accessRequirement: CourseAccessRequirement | null;
  courseId: string;
  isActive: boolean;
};

export type DeleteCourseRepositoryCommand = {
  courseId: string;
  tribeSlug: string;
};

export type CreateCourseModuleRepositoryCommand = {
  courseId: string;
  sortOrder: number;
  title: string;
  tribeSlug: string;
  unlockAfterDays: number | null;
};

export type UpdateCourseModuleRepositoryCommand = {
  courseModuleId: string;
  isActive: boolean;
  sortOrder: number;
  title: string;
  tribeSlug: string;
  unlockAfterDays: number | null;
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

export type CreateLessonRepositoryCommand = LessonRepositoryCommandBase & {
  files?: LessonFileAttachmentDraft[];
};

export type UpdateLessonRepositoryCommand = LessonRepositoryCommandBase & {
  files?: LessonFileAttachmentDraft[];
  isActive: boolean;
  lessonId: string;
};

export type DeleteLessonRepositoryCommand = {
  lessonId: string;
  tribeSlug: string;
};

export type SetLessonCompletionRepositoryCommand = {
  completed: boolean;
  lessonId: string;
  tribeSlug: string;
};

export type RecordLastViewedLessonRepositoryCommand = {
  courseId: string;
  lessonId: string;
  tribeSlug: string;
};

export type CourseResult = Course;

export type CourseModuleResult = CourseModule;

export type LessonResult = Lesson;

export type LessonWithViewerStateResult = LessonResult & {
  /** Whether the current viewer marked the lesson as completed. */
  completed: boolean;
};

export type CourseModuleViewerAccessResult = {
  /** True when the drip window keeps the module locked for the viewer. */
  isLocked: boolean;
  /** ISO-8601 unlock timestamp for locked modules, otherwise `null`. */
  unlocksAt: string | null;
};

export type CourseModuleWithLessonsResult = CourseModuleResult & {
  lessons: LessonWithViewerStateResult[];
  viewerAccess: CourseModuleViewerAccessResult;
};

export type CourseViewerAccessResult = {
  /** Own completed lessons; readable even after academy access ends. */
  completedLessonCount: number;
  /**
   * `academy_required` courses only carry catalog metadata: no modules,
   * lessons, videos, files or last viewed lesson are serialized.
   */
  status: CourseViewerAccessStatus;
};

export type CourseWithModulesResult = CourseResult & {
  /** Last lesson the viewer opened inside this course, when any. */
  lastViewedLessonId: string | null;
  modules: CourseModuleWithLessonsResult[];
  viewerAccess: CourseViewerAccessResult;
};

export type CourseTreeViewerPermissionsResult = {
  canManageCourses: boolean;
};

export type CourseTreeResult = {
  courses: CourseWithModulesResult[];
  viewerPermissions: CourseTreeViewerPermissionsResult;
};

export type CourseCreationResult =
  | {
      course: CourseResult;
      status: "created";
    }
  | {
      status: "forbidden" | "invalid_input" | "not_found";
    };

export type CourseUpdateResult =
  | {
      course: CourseResult;
      status: "updated";
    }
  | {
      status: "forbidden" | "invalid_input" | "not_found";
    };

export type CourseDeletionResult = {
  status: "deleted" | "forbidden" | "not_found";
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
      status:
        | "forbidden"
        | "invalid_file"
        | "invalid_input"
        | "invalid_video_url"
        | "not_found";
    };

export type LessonUpdateResult =
  | {
      lesson: LessonResult;
      status: "updated";
    }
  | {
      status:
        | "forbidden"
        | "invalid_file"
        | "invalid_input"
        | "invalid_video_url"
        | "not_found";
    };

export type LessonDeletionResult = {
  status: "deleted" | "forbidden" | "not_found";
};

export type LessonCompletionResult = {
  status: "completed" | "forbidden" | "not_found" | "uncompleted";
};

export type LastViewedLessonRecordingResult = {
  status: "forbidden" | "not_found" | "recorded";
};

/**
 * Domain-owned repository port for reading and mutating tribe course content.
 */
export type CourseRepository = {
  createCourse: (
    command: CreateCourseRepositoryCommand
  ) => Promise<CourseCreationResult>;
  createCourseModule: (
    command: CreateCourseModuleRepositoryCommand
  ) => Promise<CourseModuleCreationResult>;
  createLesson: (
    command: CreateLessonRepositoryCommand
  ) => Promise<LessonCreationResult>;
  deleteCourse: (
    command: DeleteCourseRepositoryCommand
  ) => Promise<CourseDeletionResult>;
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
  recordLastViewedLesson: (
    command: RecordLastViewedLessonRepositoryCommand
  ) => Promise<LastViewedLessonRecordingResult>;
  setLessonCompletion: (
    command: SetLessonCompletionRepositoryCommand
  ) => Promise<LessonCompletionResult>;
  updateCourse: (
    command: UpdateCourseRepositoryCommand
  ) => Promise<CourseUpdateResult>;
  updateCourseModule: (
    command: UpdateCourseModuleRepositoryCommand
  ) => Promise<CourseModuleUpdateResult>;
  updateLesson: (
    command: UpdateLessonRepositoryCommand
  ) => Promise<LessonUpdateResult>;
};
