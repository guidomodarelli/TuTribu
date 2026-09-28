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
  /**
   * Whether the member may read the private community content. In academy
   * mode it requires academy access (or an active leader or guardian role);
   * in legacy tribes it always matches the membership. Missing means legacy.
   */
  communityAccess?: boolean;
  status: TribeMembershipStatus;
  statusReason: TribeMembershipStatusReason;
};

export type TribeMembershipAccessWithTribe = {
  membershipAccess: TribeMembershipAccess;
  tribe: Tribe | null;
};

export interface TribeReadRepository {
  findBySlug(slug: string): Promise<Tribe | null>;
  findCurrentMembershipAccessWithTribeBySlug?(
    slug: string
  ): Promise<TribeMembershipAccessWithTribe | null>;
  findCurrentMembershipAccessBySlug?(
    slug: string
  ): Promise<TribeMembershipAccess | null>;
  findCurrentMembershipStatusBySlug(slug: string): Promise<TribeMembershipStatus | null>;
  listVisibleMembershipTribes(): Promise<MemberTribeListItemResult[]>;
  listVisibleTribeMembersBySlug(slug: string): Promise<TribeMemberResult[]>;
}
