import type { CourseWithModulesResult } from "@/src/modules/courses/application/results/course-results";

const PERCENT_MAX = 100;

/**
 * Counts the lessons the viewer can see across every module of a course.
 */
export function countCourseLessons(course: CourseWithModulesResult): number {
  return course.modules.reduce(
    (total, courseModule) => total + courseModule.lessons.length,
    0
  );
}

/**
 * Counts the visible lessons the viewer already marked as completed.
 */
export function countCompletedCourseLessons(
  course: CourseWithModulesResult
): number {
  return course.modules.reduce(
    (total, courseModule) =>
      total +
      courseModule.lessons.filter((lesson) => lesson.completed).length,
    0
  );
}

/**
 * Progress percentage (0-100, rounded) over the lessons visible to the
 * viewer. Courses without lessons report 0 so the UI never divides by zero.
 */
export function getCourseProgressPercent(
  course: CourseWithModulesResult
): number {
  const lessonCount = countCourseLessons(course);

  if (lessonCount === 0) {
    return 0;
  }

  return Math.round(
    (countCompletedCourseLessons(course) / lessonCount) * PERCENT_MAX
  );
}
