export type MemberTribeListItemResult = {
  tribeId: string;
  membershipStatus: "active" | "muted";
  name: string;
  role: "guardian" | "leader" | "tribemate";
  slug: string;
};
