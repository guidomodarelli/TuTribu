import type {
  CourseModuleCreationResult as DomainCourseModuleCreationResult,
  CourseModuleDeletionResult as DomainCourseModuleDeletionResult,
  CourseModuleResult as DomainCourseModuleResult,
  CourseModuleUpdateResult as DomainCourseModuleUpdateResult,
  CourseModuleWithLessonsResult as DomainCourseModuleWithLessonsResult,
  CourseTreeResult as DomainCourseTreeResult,
  CourseTreeViewerPermissionsResult as DomainCourseTreeViewerPermissionsResult,
  LessonCreationResult as DomainLessonCreationResult,
  LessonDeletionResult as DomainLessonDeletionResult,
  LessonResult as DomainLessonResult,
  LessonUpdateResult as DomainLessonUpdateResult,
} from "@/src/modules/courses/domain/repositories/course-repository";

export type CourseModuleResult = DomainCourseModuleResult;

export type LessonResult = DomainLessonResult;

export type CourseModuleWithLessonsResult = DomainCourseModuleWithLessonsResult;

export type CourseTreeViewerPermissionsResult =
  DomainCourseTreeViewerPermissionsResult;

export type CourseTreeResult = DomainCourseTreeResult;

export type CourseModuleCreationResult = DomainCourseModuleCreationResult;

export type CourseModuleUpdateResult = DomainCourseModuleUpdateResult;

export type CourseModuleDeletionResult = DomainCourseModuleDeletionResult;

export type LessonCreationResult = DomainLessonCreationResult;

export type LessonUpdateResult = DomainLessonUpdateResult;

export type LessonDeletionResult = DomainLessonDeletionResult;
