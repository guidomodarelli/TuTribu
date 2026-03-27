export type CreateCommunityCreatedResult = {
  status: "created";
  communityId: string;
  name: string;
  slug: string;
  ownerMemberRole: "owner";
};

export type CreateCommunityConflictResult = {
  status: "slug-conflict";
  message: string;
  suggestedSlug: string;
};

export type CreateCommunityInvalidResult = {
  status: "invalid-name" | "invalid-slug";
  message: string;
};

export type CreateCommunityNotAllowedResult = {
  status: "not-allowed";
};

export type CreateCommunityResult =
  | CreateCommunityCreatedResult
  | CreateCommunityConflictResult
  | CreateCommunityInvalidResult
  | CreateCommunityNotAllowedResult;
