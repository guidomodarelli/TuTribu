import type { Community } from "@/src/modules/communities/domain/entities/community";

export interface CommunityCreationRepository {
  createCommunityWithOwnerMembership(input: {
    name: string;
    ownerId: string;
    slug: string;
    visibility: "private";
  }): Promise<Community>;
  isSlugTaken(slug: string): Promise<boolean>;
}
