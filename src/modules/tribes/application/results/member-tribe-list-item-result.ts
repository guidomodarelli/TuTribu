export type MemberTribeListItemResult = {
  /**
   * Access model of the tribe. Missing means `legacy` (the historical
   * behavior); the repository always sets it.
   */
  accessModel?: "academy" | "legacy";
  /**
   * Whether the member can read the private community content. False only for
   * basic members of an academy-mode tribe. Missing means true (legacy).
   */
  hasCommunityAccess?: boolean;
  tribeId: string;
  logoUrl: string | null;
  membershipStatus: "active" | "muted";
  name: string;
  role: "guardian" | "leader" | "tribemate";
  slug: string;
};
