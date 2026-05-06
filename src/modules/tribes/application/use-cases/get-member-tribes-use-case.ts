import type { TribeReadRepository } from "@/src/modules/tribes/domain/repositories/tribe-read-repository";

import type { MemberTribeListItemResult } from "../results/member-tribe-list-item-result";

const MEMBER_TRIBES_SORT_LOCALE = "es";
const MEMBER_TRIBES_SORT_OPTIONS = {
  sensitivity: "base",
} as const;

type GetMemberTribesDependencies = {
  tribeReadRepository: TribeReadRepository;
};

export function getMemberTribes({
  tribeReadRepository,
}: GetMemberTribesDependencies) {
  return async (): Promise<MemberTribeListItemResult[]> => {
    const tribes =
      await tribeReadRepository.listVisibleMembershipTribes();

    return [...tribes].sort((left, right) =>
      left.name.localeCompare(
        right.name,
        MEMBER_TRIBES_SORT_LOCALE,
        MEMBER_TRIBES_SORT_OPTIONS
      )
    );
  };
}
