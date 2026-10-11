/** Defines the minimal public result of a membership lifecycle command. @module tribe-membership-lifecycle-result */
import { z } from "zod";
import { TRIBE_MEMBERSHIP_LIFECYCLE_ACTIONS, TRIBE_MEMBERSHIP_LIFECYCLE_OUTCOME, TRIBE_MEMBERSHIP_LIFECYCLE_DENIAL_CODES } from "../../constants/tribe-membership-lifecycle";
import { TRIBE_MEMBERSHIP_STATUS } from "../../constants/tribe-page-access";
/** Own result schema prevents private membership, request, session and moderation details from entering the client. */
export const tribeMembershipLifecycleResultSchema = z.discriminatedUnion("outcome", [
  z.strictObject({ outcome: z.literal(TRIBE_MEMBERSHIP_LIFECYCLE_OUTCOME.changed), memberId: z.uuid(), action: z.enum(TRIBE_MEMBERSHIP_LIFECYCLE_ACTIONS), status: z.enum([TRIBE_MEMBERSHIP_STATUS.blocked, TRIBE_MEMBERSHIP_STATUS.removed]), deleted: z.boolean() }),
  z.strictObject({ outcome: z.literal(TRIBE_MEMBERSHIP_LIFECYCLE_OUTCOME.denied), code: z.enum(TRIBE_MEMBERSHIP_LIFECYCLE_DENIAL_CODES) }),
]);
