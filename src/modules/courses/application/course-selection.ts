import type { CourseWithModulesResult } from "@/src/modules/courses/application/results/course-results";

/** Course and lesson requested through the tribe courses URL. */
export type CourseSelectionQuery = {
  courseId: string | null;
  lessonId: string | null;
};

/**
 * Finds a visible course by its identifier.
 *
 * @param courses - Visible course tree of the tribe.
 * @param courseId - Requested course identifier.
 * @returns The matching course, or `null` when it is not visible.
 */
export function findCourseById(
  courses: readonly CourseWithModulesResult[],
  courseId: string
): CourseWithModulesResult | null {
  return courses.find((course) => course.id === courseId) ?? null;
}

/**
 * Finds the visible course that owns a lesson, for legacy lesson-only links.
 *
 * @param courses - Visible course tree of the tribe.
 * @param lessonId - Requested lesson identifier.
 * @returns The owning course, or `null` when no visible course has the lesson.
 */
export function findCourseByLessonId(
  courses: readonly CourseWithModulesResult[],
  lessonId: string
): CourseWithModulesResult | null {
  return (
    courses.find((course) =>
      course.modules.some((courseModule) =>
        courseModule.lessons.some((lesson) => lesson.id === lessonId)
      )
    ) ?? null
  );
}

/**
 * Resolves which course the tribe courses page shows: the requested course
 * wins, a lesson-only request opens the course that owns the lesson, and no
 * selection shows the catalog.
 *
 * @param courses - Visible course tree of the tribe.
 * @param query - Requested course and lesson.
 * @returns The course to open, or `null` for the catalog (or an unknown course).
 */
export function resolveSelectedCourse(
  courses: readonly CourseWithModulesResult[],
  query: CourseSelectionQuery
): CourseWithModulesResult | null {
  if (query.courseId) {
    return findCourseById(courses, query.courseId);
  }

  if (query.lessonId) {
    return findCourseByLessonId(courses, query.lessonId);
  }

  return null;
}
