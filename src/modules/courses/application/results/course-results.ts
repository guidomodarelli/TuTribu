import type {
  CourseCreationResult as DomainCourseCreationResult,
  CourseDeletionResult as DomainCourseDeletionResult,
  CourseModuleCreationResult as DomainCourseModuleCreationResult,
  CourseModuleDeletionResult as DomainCourseModuleDeletionResult,
  CourseModuleResult as DomainCourseModuleResult,
  CourseModuleUpdateResult as DomainCourseModuleUpdateResult,
  CourseModuleViewerAccessResult as DomainCourseModuleViewerAccessResult,
  CourseModuleWithLessonsResult as DomainCourseModuleWithLessonsResult,
  CourseResult as DomainCourseResult,
  CourseTreeResult as DomainCourseTreeResult,
  CourseTreeViewerPermissionsResult as DomainCourseTreeViewerPermissionsResult,
  CourseUpdateResult as DomainCourseUpdateResult,
  CourseWithModulesResult as DomainCourseWithModulesResult,
  LastViewedLessonRecordingResult as DomainLastViewedLessonRecordingResult,
  LessonCompletionResult as DomainLessonCompletionResult,
  LessonCreationResult as DomainLessonCreationResult,
  LessonDeletionResult as DomainLessonDeletionResult,
  LessonResult as DomainLessonResult,
  LessonUpdateResult as DomainLessonUpdateResult,
  LessonWithViewerStateResult as DomainLessonWithViewerStateResult,
} from "@/src/modules/courses/domain/repositories/course-repository";
import type {
  LessonCommentCreationResult as DomainLessonCommentCreationResult,
  LessonCommentDeletionResult as DomainLessonCommentDeletionResult,
  LessonCommentListResult as DomainLessonCommentListResult,
  LessonCommentResult as DomainLessonCommentResult,
} from "@/src/modules/courses/domain/repositories/lesson-comment-repository";

export type CourseResult = DomainCourseResult;

export type CourseWithModulesResult = DomainCourseWithModulesResult;

export type CourseModuleResult = DomainCourseModuleResult;

export type CourseModuleViewerAccessResult =
  DomainCourseModuleViewerAccessResult;

export type LessonResult = DomainLessonResult;

export type LessonWithViewerStateResult = DomainLessonWithViewerStateResult;

export type CourseModuleWithLessonsResult = DomainCourseModuleWithLessonsResult;

export type CourseTreeViewerPermissionsResult =
  DomainCourseTreeViewerPermissionsResult;

export type CourseTreeResult = DomainCourseTreeResult;

export type CourseCreationResult = DomainCourseCreationResult;

export type CourseUpdateResult = DomainCourseUpdateResult;

export type CourseDeletionResult = DomainCourseDeletionResult;

export type CourseModuleCreationResult = DomainCourseModuleCreationResult;

export type CourseModuleUpdateResult = DomainCourseModuleUpdateResult;

export type CourseModuleDeletionResult = DomainCourseModuleDeletionResult;

export type LessonCreationResult = DomainLessonCreationResult;

export type LessonUpdateResult = DomainLessonUpdateResult;

export type LessonDeletionResult = DomainLessonDeletionResult;

export type LessonCompletionResult = DomainLessonCompletionResult;

export type LastViewedLessonRecordingResult =
  DomainLastViewedLessonRecordingResult;

export type LessonCommentResult = DomainLessonCommentResult;

export type LessonCommentListResult = DomainLessonCommentListResult;

export type LessonCommentCreationResult = DomainLessonCommentCreationResult;

export type LessonCommentDeletionResult = DomainLessonCommentDeletionResult;
