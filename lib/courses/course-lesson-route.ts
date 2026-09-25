import { ROUTES } from "@/src/constants/routes";
import { TRIBE_COURSES_ROUTE_QUERY } from "@/src/modules/courses/constants/courses";

/**
 * Builds the link that opens one lesson inside its course view.
 *
 * @param tribeSlug - Tribe slug of the route.
 * @param courseId - Course that owns the lesson.
 * @param lessonId - Lesson to open.
 * @returns Relative URL such as `/slug/cursos?curso=<id>&leccion=<id>`.
 */
export function buildCourseLessonRoute(
  tribeSlug: string,
  courseId: string,
  lessonId: string
): string {
  const searchParams = new URLSearchParams({
    [TRIBE_COURSES_ROUTE_QUERY.course]: courseId,
    [TRIBE_COURSES_ROUTE_QUERY.lesson]: lessonId,
  });

  return ROUTES.tribes.courses(tribeSlug) + "?" + searchParams.toString();
}
