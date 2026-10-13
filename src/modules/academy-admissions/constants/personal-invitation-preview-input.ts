/** Validates the personal preview route and optional own proof once before native composition. @module personal-invitation-preview-input */
import { z } from "zod";
import { PERSONAL_INVITATION_TOKEN } from "./personal-invitation-token";

/** Only canonical opaque material belongs in the token segment; no authority or recipient is accepted. */
export const personalInvitationPreviewParamsSchema = z.strictObject({ token: z.string().regex(PERSONAL_INVITATION_TOKEN.canonicalPattern) });
/** A proof reference remains account-scoped in the reader and never claims that verification succeeded. */
export const personalInvitationPreviewQuerySchema = z.strictObject({ proofId: z.uuid().transform((proofId) => proofId.toLowerCase()).optional() });
