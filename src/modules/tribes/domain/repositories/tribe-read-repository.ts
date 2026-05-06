import type { Tribe } from "@/src/modules/tribes/domain/entities/tribe";
import type { MemberTribeListItemResult } from "@/src/modules/tribes/application/results/member-tribe-list-item-result";
import type { TribeMemberResult } from "@/src/modules/tribes/application/results/tribe-member-result";

export interface TribeReadRepository {
  findBySlug(slug: string): Promise<Tribe | null>;
  findCurrentMembershipStatusBySlug(slug: string): Promise<"active" | "muted" | "blocked" | null>;
  listVisibleMembershipTribes(): Promise<MemberTribeListItemResult[]>;
  listVisibleTribeMembersBySlug(slug: string): Promise<TribeMemberResult[]>;
}
