import type { TribeResult } from "./tribe-result";

export {
  TRIBE_MEMBERSHIP_STATUS,
  TRIBE_MEMBERSHIP_STATUS_REASON,
  TRIBE_PAGE_ACCESS_REASON,
  TRIBE_PAGE_ACCESS_STATUS,
} from "@/src/modules/tribes/constants/tribe-page-access";

import {
  TRIBE_MEMBERSHIP_STATUS_REASON,
  TRIBE_PAGE_ACCESS_REASON,
  TRIBE_PAGE_ACCESS_STATUS,
} from "@/src/modules/tribes/constants/tribe-page-access";

export type TribePageAccessResult =
  | {
      status: typeof TRIBE_PAGE_ACCESS_STATUS.visible;
      /**
       * False only for academy-mode basic members on allowlisted surfaces
       * (academy, courses, billing); community surfaces never see it false.
       */
      communityAccess: boolean;
      tribe: TribeResult;
    }
  | {
      status: typeof TRIBE_PAGE_ACCESS_STATUS.hidden;
      reason: typeof TRIBE_PAGE_ACCESS_REASON.academyAccessRequired;
    }
  | {
      status: typeof TRIBE_PAGE_ACCESS_STATUS.hidden;
      reason: typeof TRIBE_PAGE_ACCESS_REASON.blockedHidden;
      blockedReason:
        | typeof TRIBE_MEMBERSHIP_STATUS_REASON.conductBlocked
        | typeof TRIBE_MEMBERSHIP_STATUS_REASON.none
        | typeof TRIBE_MEMBERSHIP_STATUS_REASON.paymentBlocked
        | typeof TRIBE_MEMBERSHIP_STATUS_REASON.subscriptionInactive;
    }
  | {
      status: typeof TRIBE_PAGE_ACCESS_STATUS.hidden;
      reason:
        | typeof TRIBE_PAGE_ACCESS_REASON.unauthenticatedHidden
        | typeof TRIBE_PAGE_ACCESS_REASON.notFoundOrNotVisible;
    };
