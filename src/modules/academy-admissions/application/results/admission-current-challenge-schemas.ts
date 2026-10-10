/** Owns the minimal public exact-contact selection, with no verification or sending permission. @module admission-current-challenge-schemas */
import { z } from "zod";
import { admissionChallengeSnapshotSchema } from "./admission-contact-verification-schemas";
import type { AdmissionCurrentChallengeSelection } from "../../domain/repositories/admission-current-challenge-reader";

/** Current ownership is rechecked when the user confirms resend; this DTO only identifies the original. */
export const admissionCurrentChallengeSelectionSchema = z.object({ current: z.object({ operationId: z.uuid(), challenge: admissionChallengeSnapshotSchema, requiresReplacement: z.boolean() }).nullable() }) satisfies z.ZodType<AdmissionCurrentChallengeSelection>;
