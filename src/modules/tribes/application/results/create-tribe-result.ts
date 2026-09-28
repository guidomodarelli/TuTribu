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

type CreateTribeCreatedResult = {
  status: typeof CREATE_TRIBE_STATUS.created;
  tribeId: string;
  name: string;
  slug: string;
  leaderMemberRole: typeof CREATE_TRIBE_MEMBER_ROLE.leader;
};

type CreateTribeConflictResult = {
  status: typeof CREATE_TRIBE_STATUS.slugConflict;
  message: string;
  suggestedSlug: string;
};

type CreateTribeInvalidResult = {
  status:
    | typeof CREATE_TRIBE_STATUS.invalidName
    | typeof CREATE_TRIBE_STATUS.invalidSlug;
  message: string;
};

type CreateTribeNotAllowedResult = {
  status: typeof CREATE_TRIBE_STATUS.notAllowed;
};

export type CreateTribeResult =
  | CreateTribeCreatedResult
  | CreateTribeConflictResult
  | CreateTribeInvalidResult
  | CreateTribeNotAllowedResult;

/**
 * Public JSON body of `POST /api/tribes` for enhanced (JavaScript) form
 * submissions. Success and sign-in outcomes carry the same-origin path the
 * native redirect flow would have used; failures carry a safe Spanish
 * message, plus the suggested slug on a conflict.
 */
export type CreateTribePublicResponse =
  | { status: "created"; redirectUrl: string }
  | { status: "unauthenticated"; redirectUrl: string }
  | { status: "slug-conflict"; message: string; suggestedSlug: string }
  | {
      status: "invalid-name" | "invalid-slug" | "not-allowed" | "unexpected";
      message: string;
    };
