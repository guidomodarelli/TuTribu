import type { TRIBE_IMAGE_SAVE_STATUS } from "@/src/modules/tribes/constants/tribe-images";

export type TribeIdentity = {
  coverUrl: string | null;
  logoUrl: string | null;
};

export type TribeIdentitySaveStatus =
  (typeof TRIBE_IMAGE_SAVE_STATUS)[keyof typeof TRIBE_IMAGE_SAVE_STATUS];

export type TribeIdentitySaveResult = {
  identity: TribeIdentity | null;
  status: TribeIdentitySaveStatus;
};

export type GetTribeIdentityQuery = {
  tribeSlug: string;
};

export type SaveTribeIdentityCommand = {
  coverUrl: string | null;
  logoUrl: string | null;
  tribeSlug: string;
};

/**
 * Visual identity of a tribe (logo and cover). It belongs to the tribe itself,
 * not to its story: the logo renders in the app chrome and both feed the
 * shareable Open Graph card.
 */
export type TribeIdentityRepository = {
  getByTribeSlug(query: GetTribeIdentityQuery): Promise<TribeIdentity | null>;
  save(command: SaveTribeIdentityCommand): Promise<TribeIdentitySaveResult>;
};
