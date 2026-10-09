/** Owns personal invitation page discriminators and token-free diagnostics. @module personal-invitation-page-constants */
import { z } from "zod";
import { personalInvitationPreviewParamsSchema } from "./personal-invitation-preview-input";
import { personalInvitationOverviewSchema } from "./personal-invitation-overview-schemas";
import { PERSONAL_INVITATION_OVERVIEW_STATE } from "./personal-invitation-overview";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "./admission-errors";
import type { PersonalInvitationPageState } from "../application/results/personal-invitation-page-state";

export const PERSONAL_INVITATION_PAGE_KIND = { ready: "ready", unavailable: "unavailable" } as const;
/** Runtime failures use a fixed operation instead of the secret route path. */
export const PERSONAL_INVITATION_PAGE_OPERATION = "load_personal_invitation_page";
/** No public query can assert a proof, account, permission or successful redemption. */
export const personalInvitationPageInputSchema = z.strictObject({ params: personalInvitationPreviewParamsSchema, query: z.strictObject({}) });
/** A viewer reference scopes browser recovery and never grants authority or exposes a session. */
export const personalInvitationPageStateSchema = z.union([
  z.strictObject({ kind: z.literal(PERSONAL_INVITATION_PAGE_KIND.ready), preview: personalInvitationOverviewSchema, viewerId: z.string().min(1).nullable(), renderedAt: z.iso.datetime() }).refine((state) => state.preview.state === PERSONAL_INVITATION_OVERVIEW_STATE.signInRequired ? state.viewerId === null : state.viewerId !== null),
  z.strictObject({ kind: z.literal(PERSONAL_INVITATION_PAGE_KIND.unavailable), code: z.enum(ADMISSION_ERROR_CODE), message: z.string().min(1) }).refine((state) => state.message === ADMISSION_ERROR_MESSAGE[state.code]),
]) satisfies z.ZodType<PersonalInvitationPageState>;
