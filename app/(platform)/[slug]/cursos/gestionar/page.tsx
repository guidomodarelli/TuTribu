import { notFound } from "next/navigation";

import { TribeCoursesCatalogManagement } from "@/components/courses/tribe-courses-catalog-management";
import { TribeCoursesManagement } from "@/components/courses/tribe-courses-management";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";
import { resolveVisibleTribePageAccess } from "../../tribe-page-access";

const TRIBE_COURSES_MANAGE_PAGE = {
  operation: "tribe-courses-manage-page",
  resolveCoursesFailureMessage: "Failed to resolve editable tribe courses",
} as const;

const COURSE_MANAGER_ROLE = {
  leader: "leader",
} as const;

export default async function TribeCoursesManagePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ curso?: string }>;
}) {
  const [{ slug }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const { authenticatedMember, logger, modules, tribe } =
    await resolveVisibleTribePageAccess({
      operation: TRIBE_COURSES_MANAGE_PAGE.operation,
      slug,
    });
  const currentMembership = (
    await modules.tribes.useCases.getMemberTribes()
  ).find((tribeListItem) => tribeListItem.slug === tribe.slug);
  const canManageCourses =
    currentMembership?.role === COURSE_MANAGER_ROLE.leader &&
    currentMembership.membershipStatus === TRIBE_MEMBERSHIP_STATUS.active;

  if (!canManageCourses) {
    notFound();
  }

  const courseTree = await modules.courses.useCases
    .getEditableTribeCourses({ tribeSlug: tribe.slug })
    .catch((error: unknown) => {
      logger.error({
        error,
        message: TRIBE_COURSES_MANAGE_PAGE.resolveCoursesFailureMessage,
        metadata: { slug, viewerId: authenticatedMember.id },
      });
      notFound();
    });

  const requestedCourseId = resolvedSearchParams?.curso ?? null;
  const selectedCourse = requestedCourseId
    ? (courseTree.courses.find((course) => course.id === requestedCourseId) ??
      null)
    : null;

  if (requestedCourseId && !selectedCourse) {
    notFound();
  }

  if (selectedCourse) {
    return (
      <TribeCoursesManagement
        courseId={selectedCourse.id}
        courseTitle={selectedCourse.title}
        initialModules={selectedCourse.modules}
        tribeSlug={tribe.slug}
      />
    );
  }

  return (
    <TribeCoursesCatalogManagement
      initialCourses={courseTree.courses}
      tribeSlug={tribe.slug}
    />
  );
}
