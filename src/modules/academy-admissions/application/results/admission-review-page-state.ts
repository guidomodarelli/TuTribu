/** Owns reviewer SSR props without native session/provider identity or credentials. @module admission-review-page-state */
import { z } from "zod";
import { admissionReviewPageSchema } from "./admission-review-page-result";
import { admissionReviewSchema } from "./admission-flow-result-schemas";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";

/** An id scopes local drafts; server use cases reauthorize every private read and decision. */
export const admissionReviewPageStateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ready"), slug: z.string().min(1), viewerId: z.string().min(1), renderedAt: z.iso.datetime({ offset: true }), page: admissionReviewPageSchema, selected: admissionReviewSchema.nullable() }),
  z.object({ kind: z.literal("unavailable"), code: z.enum(ADMISSION_ERROR_CODE), message: z.string() }).refine((state) => state.message === ADMISSION_ERROR_MESSAGE[state.code]),
]);
export type AdmissionReviewPageState = z.infer<typeof admissionReviewPageStateSchema>;
