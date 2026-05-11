import type { Tribe } from "@/src/modules/tribes/domain/entities/tribe";
import type { MemberTribeListItemResult } from "@/src/modules/tribes/application/results/member-tribe-list-item-result";
import type { TribeMemberResult } from "@/src/modules/tribes/application/results/tribe-member-result";

export type TribeMembershipStatus = "active" | "muted" | "blocked" | "removed";
export type TribeMembershipStatusReason =
  | "none"
  | "conduct_blocked"
  | "payment_blocked"
  | "subscription_inactive";

export type TribeMembershipAccess = {
  status: TribeMembershipStatus;
  statusReason: TribeMembershipStatusReason;
};

export interface TribeReadRepository {
  findBySlug(slug: string): Promise<Tribe | null>;
  findCurrentMembershipAccessBySlug?(
    slug: string
  ): Promise<TribeMembershipAccess | null>;
  findCurrentMembershipStatusBySlug(slug: string): Promise<TribeMembershipStatus | null>;
  listVisibleMembershipTribes(): Promise<MemberTribeListItemResult[]>;
  listVisibleTribeMembersBySlug(slug: string): Promise<TribeMemberResult[]>;
}
