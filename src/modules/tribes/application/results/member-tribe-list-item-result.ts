export type MemberTribeListItemResult = {
  tribeId: string;
  logoUrl: string | null;
  membershipStatus: "active" | "muted";
  name: string;
  role: "guardian" | "leader" | "tribemate";
  slug: string;
};
