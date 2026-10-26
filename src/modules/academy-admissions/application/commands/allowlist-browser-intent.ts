/** Guards scoped list drafts and exact original commands without restoring user confirmation or authority. @module allowlist-browser-intent */
import { z } from "zod";
import { ADMISSION_LIMIT } from "../../constants/admission-limits";
import { ALLOWLIST_ENTRY_STATUS } from "../../constants/admission-resources";
import { ADMISSION_CONTACT_TYPE } from "../../constants/admission-contact";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";

export const allowlistDraftSchema = z.strictObject({ identity: z.string(), country: z.string(), displayName: z.string().max(ADMISSION_LIMIT.displayNameCharacters), status: z.enum(ALLOWLIST_ENTRY_STATUS), entryId: z.uuid().nullable(), expectedVersion: z.int().positive().nullable() }).refine((draft) => (draft.entryId === null) === (draft.expectedVersion === null));
const confirmed = { operationId: z.uuid(), confirmed: z.literal(true) };
/** The original proposal stays unchanged while its response is uncertain. */
export const allowlistBrowserIntentSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal(REAUTHENTICATION_OPERATION.createAllowlistEntry), input: z.strictObject({ ...confirmed, contactType: z.enum(ADMISSION_CONTACT_TYPE), identity: z.string().min(1), country: z.string().optional(), displayName: z.string().max(ADMISSION_LIMIT.displayNameCharacters).nullable() }) }),
  z.strictObject({ type: z.literal(REAUTHENTICATION_OPERATION.updateAllowlistEntry), entryId: z.uuid(), input: z.strictObject({ ...confirmed, expectedVersion: z.int().positive(), displayName: z.string().max(ADMISSION_LIMIT.displayNameCharacters).nullable(), status: z.enum(ALLOWLIST_ENTRY_STATUS) }) }),
]);
export type AllowlistDraft = z.infer<typeof allowlistDraftSchema>;
export type AllowlistBrowserIntent = z.infer<typeof allowlistBrowserIntentSchema>;
