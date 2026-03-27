export {
  CREATE_COMMUNITY_ERROR_CODE,
  CREATE_COMMUNITY_ERROR_MESSAGE,
  CREATE_COMMUNITY_MEMBER_ROLE,
  CREATE_COMMUNITY_STATUS,
} from "@/src/modules/communities/constants/create-community";

import {
  CREATE_COMMUNITY_MEMBER_ROLE,
  CREATE_COMMUNITY_STATUS,
} from "@/src/modules/communities/constants/create-community";

export type CreateCommunityCreatedResult = {
  status: typeof CREATE_COMMUNITY_STATUS.created;
  communityId: string;
  name: string;
  slug: string;
  ownerMemberRole: typeof CREATE_COMMUNITY_MEMBER_ROLE.owner;
};

export type CreateCommunityConflictResult = {
  status: typeof CREATE_COMMUNITY_STATUS.slugConflict;
  message: string;
  suggestedSlug: string;
};

export type CreateCommunityInvalidResult = {
  status:
    | typeof CREATE_COMMUNITY_STATUS.invalidName
    | typeof CREATE_COMMUNITY_STATUS.invalidSlug;
  message: string;
};

export type CreateCommunityNotAllowedResult = {
  status: typeof CREATE_COMMUNITY_STATUS.notAllowed;
};

export type CreateCommunityResult =
  | CreateCommunityCreatedResult
  | CreateCommunityConflictResult
  | CreateCommunityInvalidResult
  | CreateCommunityNotAllowedResult;
