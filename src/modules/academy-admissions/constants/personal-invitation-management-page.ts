/** Owns private management SSR input/state and deterministic initial form configuration. @module personal-invitation-management-page */
import { z } from "zod";
import { personalInvitationPageSchema } from "./personal-invitation-http-schemas";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "./admission-errors";
import { ADMISSION_CONTACT_TYPE } from "./admission-contact";
import { ADMISSION_INVITATION_STATUS } from "./admission-eligibility";
import { ADMISSION_QUERY_LIMIT } from "./admission-public-contract";
import { TRIBE_SLUG_PATTERN } from "@/src/modules/tribes/domain/value-objects/tribe-slug";

/** Server diagnostics do not include recipient, raw query, session or initial URL. */
export const PERSONAL_INVITATION_MANAGEMENT_PAGE_OPERATION = "load_personal_invitation_management_page";
/** Diagnostic copy identifies only this server operation, never private input or native failure text. */
export const PERSONAL_INVITATION_MANAGEMENT_PAGE_DIAGNOSTIC = { readFailure: "Personal invitation management page read failed", contractFailure: "Personal invitation management page returned an unusable own state", loadFailure: "Personal invitation management page could not load current private state" } as const;
/** Navigation stays separate from API routing and never carries token material. */
export const PERSONAL_INVITATION_MANAGEMENT_SETTINGS_SEGMENT = "academia/admissions/invitations";
/** Browser queries preserve the opaque cursor; the native API owns its tuple parsing. */
export const personalInvitationManagementBrowserQuerySchema = z.strictObject({ limit: z.int().min(1).max(ADMISSION_QUERY_LIMIT.maximumPageSize), status: z.enum(ADMISSION_INVITATION_STATUS).optional(), cursor: z.string().max(ADMISSION_QUERY_LIMIT.cursorCharacters).optional() });
/** Safe page identity and real list/policy facts; no field creates permission or a write. */
export const personalInvitationManagementPageStateSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("ready"), slug: z.string().regex(TRIBE_SLUG_PATTERN), tribeId: z.uuid(), viewerId: z.string().min(1), renderedAt: z.iso.datetime({ offset: true }), contactType: z.enum(ADMISSION_CONTACT_TYPE).nullable(), requiresAdditionalVerification: z.boolean(), allowedCountries: z.array(z.string().min(1)), hasUsableAllowlist: z.boolean(), page: personalInvitationPageSchema, query: personalInvitationManagementBrowserQuerySchema }),
  z.strictObject({ kind: z.literal("unavailable"), code: z.enum(ADMISSION_ERROR_CODE), message: z.string() }).refine((state) => state.message === ADMISSION_ERROR_MESSAGE[state.code]),
]);
