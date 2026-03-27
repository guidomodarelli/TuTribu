import type { Community } from "@/src/modules/communities/domain/entities/community";
import type { MemberCommunityListItemResult } from "@/src/modules/communities/application/results/member-community-list-item-result";

export interface CommunityReadRepository {
  findBySlug(slug: string): Promise<Community | null>;
  findCurrentMembershipStatusBySlug(slug: string): Promise<"active" | "muted" | "blocked" | null>;
  listVisibleMembershipCommunities(): Promise<MemberCommunityListItemResult[]>;
}
