/** Owns browser proposal identity without exposing server cryptographic keys. @module personal-invitation-browser-constants */
import { z } from "zod";
import { ADMISSION_PERSONAL_CONTACT_SCOPE_PATTERN } from "./admission-contact-browser";

export const PERSONAL_INVITATION_BROWSER_HASH = { algorithm: "SHA-256", domain: "tutribu:personal-admission-browser-scope:", radix: 16, byteWidth: 2 } as const;
/** Personal previews stay same-origin and carry no token in diagnostics or persisted drafts. */
export const PERSONAL_INVITATION_BROWSER_ROUTE = { prefix: "/api/admissions/invitations", overview: "overview", publicPrefix: "/admissions/invitations" } as const;
/** Local storage preserves only original operation metadata, never token, code or consent. */
export const PERSONAL_INVITATION_SUBMISSION_STORAGE_PREFIX = "tutribu-personal-admission-submission";
/** The server registry resolves the original result; this reference claims no accepted progress. */
export const personalInvitationSubmissionIntentSchema = z.strictObject({ viewerId: z.string().min(1), slug: z.string().min(1), personalScope: z.string().regex(ADMISSION_PERSONAL_CONTACT_SCOPE_PATTERN), operationId: z.uuid().transform((operationId) => operationId.toLowerCase()) });
