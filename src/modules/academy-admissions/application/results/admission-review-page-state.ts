/** Owns reviewer SSR props without native session/provider identity or credentials. @module admission-review-page-state */
import { z } from "zod";
import { admissionReviewPageSchema } from "./admission-review-page-result";
import { admissionReviewSchema } from "./admission-flow-result-schemas";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { admissionReviewSelectionSchema } from "@/src/modules/academy-admissions/constants/admission-review-selection";
import { admissionReadErrorMessage } from "@/src/modules/academy-admissions/constants/admission-read-errors";

/** An id scopes local drafts; server use cases reauthorize every private read and decision. */
export const admissionReviewPageStateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ready"), slug: z.string().min(1), viewerId: z.string().min(1), renderedAt: z.iso.datetime({ offset: true }), filters: admissionReviewSelectionSchema.optional(), page: admissionReviewPageSchema, selected: admissionReviewSchema.nullable(),
    /** The address selected a request this tribe does not have: the inbox renders without it and says so. */
    selectionUnavailable: z.literal(true).optional() }),
  z.object({ kind: z.literal("unavailable"), code: z.enum(ADMISSION_ERROR_CODE), message: z.string() }).refine((state) => state.message === admissionReadErrorMessage(state.code)),
]);
export type AdmissionReviewPageState = z.infer<typeof admissionReviewPageStateSchema>;
