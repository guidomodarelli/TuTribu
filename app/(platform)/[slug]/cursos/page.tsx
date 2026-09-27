import { notFound } from "next/navigation";

import { TribeCoursesCatalog } from "@/components/courses/tribe-courses-catalog";
import { TribeCoursesView } from "@/components/courses/tribe-courses-view";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";
import type { CourseWithModulesResult } from "@/src/modules/courses/application/results/course-results";
import { buildTribeCoursesRoute } from "@/lib/courses/course-lesson-route";
import { resolveVisibleTribePageAccess } from "../tribe-page-access";

const TRIBE_COURSES_PAGE = {
  operation: "tribe-courses-page",
  resolveCoursesFailureMessage: "Failed to resolve tribe courses",
} as const;

const COURSE_MANAGER_ROLE = {
  leader: "leader",
} as const;

function canReadTribeCourses(membershipStatus: string | null): boolean {
  return (
    membershipStatus === TRIBE_MEMBERSHIP_STATUS.active ||
    membershipStatus === TRIBE_MEMBERSHIP_STATUS.muted
  );
}

function findCourseById(
  courses: CourseWithModulesResult[],
  courseId: string
): CourseWithModulesResult | null {
  return courses.find((course) => course.id === courseId) ?? null;
}

function findCourseByLessonId(
  courses: CourseWithModulesResult[],
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

export default async function TribeCoursesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ curso?: string; leccion?: string }>;
}) {
  const [{ slug }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const { authenticatedMember, logger, modules, tribe } =
    await resolveVisibleTribePageAccess({
      // Keeps the open course and lesson so sign-in returns to the same view.
      callbackPath: buildTribeCoursesRoute(slug, {
        courseId: resolvedSearchParams?.curso,
        lessonId: resolvedSearchParams?.leccion,
      }),
      operation: TRIBE_COURSES_PAGE.operation,
      slug,
    });
  const membershipStatus =
    await modules.tribes.useCases.getCurrentTribeMembershipStatus(tribe.slug);

  if (!canReadTribeCourses(membershipStatus)) {
    notFound();
  }

  const currentMembership = (
    await modules.tribes.useCases.getMemberTribes()
  ).find((tribeListItem) => tribeListItem.slug === tribe.slug);
  const canManageCourses =
    membershipStatus === TRIBE_MEMBERSHIP_STATUS.active &&
    currentMembership?.role === COURSE_MANAGER_ROLE.leader;
  const courseTree = await modules.courses.useCases
    .getTribeCourses({ tribeSlug: tribe.slug })
    .catch((error: unknown) => {
      logger.error({
        error,
        message: TRIBE_COURSES_PAGE.resolveCoursesFailureMessage,
        metadata: { slug, viewerId: authenticatedMember.id },
      });
      notFound();
    });
  const viewerPermissions = {
    ...courseTree.viewerPermissions,
    canManageCourses:
      courseTree.viewerPermissions.canManageCourses || canManageCourses,
  };
  const requestedCourseId = resolvedSearchParams?.curso ?? null;
  const requestedLessonId = resolvedSearchParams?.leccion ?? null;
  const selectedCourse = requestedCourseId
    ? findCourseById(courseTree.courses, requestedCourseId)
    : requestedLessonId
      ? findCourseByLessonId(courseTree.courses, requestedLessonId)
      : null;

  if (requestedCourseId && !selectedCourse) {
    notFound();
  }

  if (selectedCourse) {
    return (
      <TribeCoursesView
        course={selectedCourse}
        selectedLessonId={requestedLessonId}
        tribeSlug={tribe.slug}
        viewerPermissions={viewerPermissions}
      />
    );
  }

  return (
    <TribeCoursesCatalog
      courses={courseTree.courses}
      tribeSlug={tribe.slug}
      viewerPermissions={viewerPermissions}
    />
  );
}
