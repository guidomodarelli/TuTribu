import type { TribeReadRepository } from "@/src/modules/tribes/domain/repositories/tribe-read-repository";

import type {
  TribeMemberResult,
  TribeMemberRole,
} from "../results/tribe-member-result";

const TRIBE_MEMBER_SORT_LOCALE = "es";
const TRIBE_MEMBER_SORT_OPTIONS = {
  sensitivity: "base",
} as const;

const TRIBE_MEMBER_ROLE_PRIORITY: Record<TribeMemberRole, number> = {
  leader: 0,
  guardian: 1,
  tribemate: 2,
};

type ListVisibleTribeMembersDependencies = {
  tribeReadRepository: TribeReadRepository;
};

type ListVisibleTribeMembersQuery = {
  tribeSlug: string;
  viewerCanViewMemberEmails: boolean;
};

export function listVisibleTribeMembers({
  tribeReadRepository,
}: ListVisibleTribeMembersDependencies) {
  return async ({
    tribeSlug,
    viewerCanViewMemberEmails,
  }: ListVisibleTribeMembersQuery): Promise<TribeMemberResult[]> => {
    const tribeMembers =
      await tribeReadRepository.listVisibleTribeMembersBySlug(tribeSlug);
    const uniqueTribeMembersById = new Map<string, TribeMemberResult>();

    tribeMembers.forEach((tribeMember) => {
      if (!uniqueTribeMembersById.has(tribeMember.id)) {
        uniqueTribeMembersById.set(tribeMember.id, tribeMember);
      }
    });

    const sortedMembers = Array.from(uniqueTribeMembersById.values()).toSorted(
      (left, right) => {
        const rolePriorityDifference =
          TRIBE_MEMBER_ROLE_PRIORITY[left.role] -
          TRIBE_MEMBER_ROLE_PRIORITY[right.role];

        return rolePriorityDifference === 0
          ? left.name.localeCompare(
              right.name,
              TRIBE_MEMBER_SORT_LOCALE,
              TRIBE_MEMBER_SORT_OPTIONS
            )
          : rolePriorityDifference;
      }
    );

    return viewerCanViewMemberEmails
      ? sortedMembers
      : sortedMembers.map((member) => ({ ...member, email: null }));
  };
}
