import type { CommunityResult } from "./community-result";

export {
  COMMUNITY_MEMBERSHIP_STATUS,
  COMMUNITY_PAGE_ACCESS_REASON,
  COMMUNITY_PAGE_ACCESS_STATUS,
} from "@/src/modules/communities/constants/community-page-access";

import {
  COMMUNITY_PAGE_ACCESS_REASON,
  COMMUNITY_PAGE_ACCESS_STATUS,
} from "@/src/modules/communities/constants/community-page-access";

export type CommunityPageAccessResult =
  | {
      status: typeof COMMUNITY_PAGE_ACCESS_STATUS.visible;
      community: CommunityResult;
    }
  | {
      status: typeof COMMUNITY_PAGE_ACCESS_STATUS.hidden;
      reason:
        | typeof COMMUNITY_PAGE_ACCESS_REASON.unauthenticatedHidden
        | typeof COMMUNITY_PAGE_ACCESS_REASON.blockedHidden
        | typeof COMMUNITY_PAGE_ACCESS_REASON.notFoundOrNotVisible;
    };
