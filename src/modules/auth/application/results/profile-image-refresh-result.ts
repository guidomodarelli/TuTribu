/**
 * Possible outcomes of a member profile image refresh.
 */
export const PROFILE_IMAGE_REFRESH_OUTCOME = {
  aborted: "aborted",
  failed: "failed",
  skipped: "skipped",
  updated: "updated",
} as const;

export type ProfileImageRefreshOutcome =
  (typeof PROFILE_IMAGE_REFRESH_OUTCOME)[keyof typeof PROFILE_IMAGE_REFRESH_OUTCOME];

/**
 * Result returned by the refresh-member-profile-image use case.
 */
export type ProfileImageRefreshResult = {
  outcome: ProfileImageRefreshOutcome;
};
