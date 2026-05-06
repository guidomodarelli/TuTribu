export {
  CREATE_TRIBE_ERROR_CODE,
  CREATE_TRIBE_ERROR_MESSAGE,
  CREATE_TRIBE_MEMBER_ROLE,
  CREATE_TRIBE_STATUS,
} from "@/src/modules/tribes/constants/create-tribe";

import {
  CREATE_TRIBE_MEMBER_ROLE,
  CREATE_TRIBE_STATUS,
} from "@/src/modules/tribes/constants/create-tribe";

export type CreateTribeCreatedResult = {
  status: typeof CREATE_TRIBE_STATUS.created;
  tribeId: string;
  name: string;
  slug: string;
  ownerMemberRole: typeof CREATE_TRIBE_MEMBER_ROLE.owner;
};

export type CreateTribeConflictResult = {
  status: typeof CREATE_TRIBE_STATUS.slugConflict;
  message: string;
  suggestedSlug: string;
};

export type CreateTribeInvalidResult = {
  status:
    | typeof CREATE_TRIBE_STATUS.invalidName
    | typeof CREATE_TRIBE_STATUS.invalidSlug;
  message: string;
};

export type CreateTribeNotAllowedResult = {
  status: typeof CREATE_TRIBE_STATUS.notAllowed;
};

export type CreateTribeResult =
  | CreateTribeCreatedResult
  | CreateTribeConflictResult
  | CreateTribeInvalidResult
  | CreateTribeNotAllowedResult;
