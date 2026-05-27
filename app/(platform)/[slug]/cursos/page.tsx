import { notFound } from "next/navigation";

import { TribeCoursesView } from "@/components/courses/tribe-courses-view";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";
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

export default async function TribeCoursesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ leccion?: string }>;
}) {
  const [{ slug }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const { authenticatedMember, logger, modules, tribe } =
    await resolveVisibleTribePageAccess({
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

  return (
    <TribeCoursesView
      modules={courseTree.modules}
      selectedLessonId={resolvedSearchParams?.leccion ?? null}
      tribeSlug={tribe.slug}
      viewerPermissions={{
        ...courseTree.viewerPermissions,
        canManageCourses:
          courseTree.viewerPermissions.canManageCourses || canManageCourses,
      }}
    />
  );
}
