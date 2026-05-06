export type MemberTribeListItemResult = {
  tribeId: string;
  name: string;
  role: "guardian" | "leader" | "tribemate";
  slug: string;
};
