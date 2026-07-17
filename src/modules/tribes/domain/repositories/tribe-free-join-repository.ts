import type { TRIBE_FREE_JOIN_STATUS } from "@/src/modules/tribes/constants/tribe-story";

export type TribeFreeJoinStatus =
  (typeof TRIBE_FREE_JOIN_STATUS)[keyof typeof TRIBE_FREE_JOIN_STATUS];

export type JoinTribeFreeCommand = {
  tribeSlug: string;
};

export type TribeFreeJoinResult = {
  status: TribeFreeJoinStatus;
};

export type TribeFreeJoinRepository = {
  join(command: JoinTribeFreeCommand): Promise<TribeFreeJoinResult>;
};
