import { notFound } from "next/navigation";

import { PostCategoryManagement } from "@/components/community-feed/post-category-management";
import { COMMUNITY_MEMBERSHIP_STATUS } from "@/src/modules/communities/constants/community-page-access";
import { resolveVisibleCommunityPageAccess } from "../community-page-access";

const CATEGORY_MANAGEMENT_PAGE_LOG = {
  operation: "community-category-management-page",
  resolveCategoriesFailureMessage: "Failed to resolve community post categories",
} as const;

const CATEGORY_MANAGER_ROLE = {
  admin: "admin",
  owner: "owner",
} as const;

export default async function CommunityCategoriesPage({
  params,
}: {
  params: Promise<{
    slug: string;
  }>;
}) {
  const { slug } = await params;
  const { authenticatedMember, community, logger, modules } =
    await resolveVisibleCommunityPageAccess({
      operation: CATEGORY_MANAGEMENT_PAGE_LOG.operation,
      slug,
    });

  const currentMembership = (
    await modules.communities.useCases.getMemberCommunities()
  ).find((communityListItem) => communityListItem.slug === community.slug);

  if (
    currentMembership?.role !== CATEGORY_MANAGER_ROLE.owner &&
    currentMembership?.role !== CATEGORY_MANAGER_ROLE.admin
  ) {
    notFound();
  }

  const membershipStatus =
    await modules.communities.useCases.getCurrentCommunityMembershipStatus(
      community.slug
    );

  if (membershipStatus !== COMMUNITY_MEMBERSHIP_STATUS.active) {
    notFound();
  }

  const categoryResult = await modules.posts.useCases
    .listCommunityPostCategories({
      communitySlug: community.slug,
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
        communitySlug={community.slug}
      />
    </main>
  );
}
