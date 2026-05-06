export type MemberTribeListItemResult = {
  tribeId: string;
  name: string;
  role: "admin" | "member" | "owner";
  slug: string;
};
