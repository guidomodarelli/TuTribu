import { notFound } from "next/navigation";

import { PostCategoryManagement } from "@/components/tribe-feed/post-category-management";
import { TRIBE_MEMBERSHIP_STATUS } from "@/src/modules/tribes/constants/tribe-page-access";
import { resolveVisibleTribePageAccess } from "../tribe-page-access";

const CATEGORY_MANAGEMENT_PAGE_LOG = {
  operation: "tribe-category-management-page",
  resolveCategoriesFailureMessage: "Failed to resolve tribe post categories",
} as const;

const CATEGORY_MANAGER_ROLE = {
  admin: "admin",
  owner: "owner",
} as const;

export default async function TribeCategoriesPage({
  params,
}: {
  params: Promise<{
    slug: string;
  }>;
}) {
  const { slug } = await params;
  const { authenticatedMember, tribe, logger, modules } =
    await resolveVisibleTribePageAccess({
      operation: CATEGORY_MANAGEMENT_PAGE_LOG.operation,
      slug,
    });

  const currentMembership = (
    await modules.tribes.useCases.getMemberTribes()
  ).find((tribeListItem) => tribeListItem.slug === tribe.slug);

  if (
    currentMembership?.role !== CATEGORY_MANAGER_ROLE.owner &&
    currentMembership?.role !== CATEGORY_MANAGER_ROLE.admin
  ) {
    notFound();
  }

  const membershipStatus =
    await modules.tribes.useCases.getCurrentTribeMembershipStatus(
      tribe.slug
    );

  if (membershipStatus !== TRIBE_MEMBERSHIP_STATUS.active) {
    notFound();
  }

  const categoryResult = await modules.posts.useCases
    .listTribePostCategories({
      tribeSlug: tribe.slug,
      viewerId: authenticatedMember.id,
    })
    .catch((error: unknown) => {
      logger.error({
        message: CATEGORY_MANAGEMENT_PAGE_LOG.resolveCategoriesFailureMessage,
        error,
        metadata: {
          slug,
          viewerId: authenticatedMember.id,
        },
      });
      notFound();
    });

  return (
    <main>
      <PostCategoryManagement
        categories={categoryResult.categories}
        tribeSlug={tribe.slug}
      />
    </main>
  );
}
