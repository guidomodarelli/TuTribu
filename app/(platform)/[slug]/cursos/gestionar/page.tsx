import { notFound } from "next/navigation";

import { TribeCoursesManagement } from "@/components/courses/tribe-courses-management";
import { resolveVisibleTribePageAccess } from "../../tribe-page-access";

const TRIBE_COURSES_MANAGE_PAGE = {
  operation: "tribe-courses-manage-page",
  resolveCoursesFailureMessage: "Failed to resolve editable tribe courses",
} as const;

export default async function TribeCoursesManagePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { authenticatedMember, logger, modules, tribe } =
    await resolveVisibleTribePageAccess({
      operation: TRIBE_COURSES_MANAGE_PAGE.operation,
      slug,
    });

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

  if (!courseTree.viewerPermissions.canManageCourses) {
    notFound();
  }

  return (
    <TribeCoursesManagement
      initialModules={courseTree.modules}
      tribeSlug={tribe.slug}
    />
  );
}
