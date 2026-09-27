import { ROUTES } from "@/src/constants/routes";
import { TRIBE_COURSES_ROUTE_QUERY } from "@/src/modules/courses/constants/courses";

/** Optional selection of the tribe courses page. */
export type TribeCoursesRouteQuery = {
  courseId?: string;
  lessonId?: string;
};

/**
 * Builds the tribe courses page URL, adding only the selection provided.
 *
 * @param tribeSlug - Tribe slug of the route.
 * @param query - Optional course to open and lesson inside it.
 * @returns Relative URL such as `/slug/cursos?curso=<id>`.
 */
export function buildTribeCoursesRoute(
  tribeSlug: string,
  query: TribeCoursesRouteQuery = {}
): string {
  const searchParams = new URLSearchParams();

  if (query.courseId) {
    searchParams.set(TRIBE_COURSES_ROUTE_QUERY.course, query.courseId);
  }

  if (query.lessonId) {
    searchParams.set(TRIBE_COURSES_ROUTE_QUERY.lesson, query.lessonId);
  }

  const queryString = searchParams.toString();

  return queryString
    ? ROUTES.tribes.courses(tribeSlug) + "?" + queryString
    : ROUTES.tribes.courses(tribeSlug);
}

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
  return buildTribeCoursesRoute(tribeSlug, { courseId, lessonId });
}
