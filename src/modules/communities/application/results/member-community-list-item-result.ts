export type MemberCommunityListItemResult = {
  communityId: string;
  name: string;
  role: "admin" | "member" | "owner";
  slug: string;
};
