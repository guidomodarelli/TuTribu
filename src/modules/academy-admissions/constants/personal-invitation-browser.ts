/** Owns browser proposal identity without exposing server cryptographic keys. @module personal-invitation-browser-constants */
import { z } from "zod";
import { ADMISSION_PERSONAL_CONTACT_SCOPE_PATTERN } from "./admission-contact-browser";
import { personalInvitationOverviewSchema } from "./personal-invitation-overview-schemas";
import { PERSONAL_INVITATION_OVERVIEW_STATE } from "./personal-invitation-overview";

export const PERSONAL_INVITATION_BROWSER_HASH = { algorithm: "SHA-256", domain: "tutribu:personal-admission-browser-scope:", radix: 16, byteWidth: 2 } as const;
/** Personal previews stay same-origin and carry no token in diagnostics or persisted drafts. */
export const PERSONAL_INVITATION_BROWSER_ROUTE = { prefix: "/api/admissions/invitations", overview: "overview", publicPrefix: "/admissions/invitations" } as const;
/** Own response metadata binds a preview to the native viewer that actually produced it; no request may select this authority. */
export const PERSONAL_INVITATION_VIEWER_HEADER = "x-tutribu-admission-viewer";
/** JSON encoding keeps opaque native ids safe in an HTTP header without a session/recipient claim. */
export const personalInvitationViewerMetadataSchema = z.strictObject({ viewerId: z.string().min(1).nullable() });
/** Browser results bind the public projection to the response's actual viewer scope. */
export const personalInvitationBrowserOverviewSchema = z.strictObject({ preview: personalInvitationOverviewSchema, viewerId: z.string().min(1).nullable() }).refine((result) => result.preview.state === PERSONAL_INVITATION_OVERVIEW_STATE.signInRequired ? result.viewerId === null : result.viewerId !== null);
/** Local storage preserves only original operation metadata, never token, code or consent. */
export const PERSONAL_INVITATION_SUBMISSION_STORAGE_PREFIX = "tutribu-personal-admission-submission";
/** A transient empty probe cannot be confused with an original server-operation reference. */
export const PERSONAL_INVITATION_STORAGE_PROBE_PREFIX = "tutribu-personal-admission-storage-probe";
/** The server registry resolves the original result; this reference claims no accepted progress. */
export const personalInvitationSubmissionIntentSchema = z.strictObject({ viewerId: z.string().min(1), slug: z.string().min(1), personalScope: z.string().regex(ADMISSION_PERSONAL_CONTACT_SCOPE_PATTERN), operationId: z.uuid().transform((operationId) => operationId.toLowerCase()) });
