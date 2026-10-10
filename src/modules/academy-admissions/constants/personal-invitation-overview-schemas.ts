/** Guards own personal preview DTOs so anonymous/unavailable states cannot carry private resource hints. @module personal-invitation-overview-schemas */
import { z } from "zod";
import { admissionOverviewSchema } from "../application/results/admission-flow-result-schemas";
import { ADMISSION_OUTCOME } from "./admission-eligibility";
import { PERSONAL_INVITATION_OVERVIEW_STATE, PERSONAL_INVITATION_OVERVIEW_MESSAGE } from "./personal-invitation-overview";

/** Valid previews contain only the own admission view, restriction and expected confirmation outcome. */
export const personalInvitationOverviewSchema = z.union([
  z.strictObject({ state: z.literal(PERSONAL_INVITATION_OVERVIEW_STATE.signInRequired), safeMessage: z.literal(PERSONAL_INVITATION_OVERVIEW_MESSAGE.signIn) }),
  z.strictObject({ state: z.literal(PERSONAL_INVITATION_OVERVIEW_STATE.unavailable), safeMessage: z.literal(PERSONAL_INVITATION_OVERVIEW_MESSAGE.unavailable) }),
  z.strictObject({ state: z.literal(PERSONAL_INVITATION_OVERVIEW_STATE.available), overview: admissionOverviewSchema.strict(), requiresAllowlist: z.boolean(), expectedOutcome: z.enum([ADMISSION_OUTCOME.admitted, ADMISSION_OUTCOME.pending]) }),
]);
