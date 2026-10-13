/** Owns bounded current-reviewer inbox DTOs independently of own-request responses. @module admission-review-page-result */
import { z } from "zod";
import { admissionReviewSchema } from "./admission-flow-result-schemas";
import { ADMISSION_QUERY_LIMIT } from "@/src/modules/academy-admissions/constants/admission-public-contract";

/** Only the server-authorized reviewer use case may publish these items and their opaque continuation. */
export const admissionReviewPageSchema = z.object({
  items: z.array(admissionReviewSchema).max(ADMISSION_QUERY_LIMIT.maximumPageSize),
  nextCursor: z.string().min(1).max(ADMISSION_QUERY_LIMIT.cursorCharacters).nullable(),
});
export type AdmissionReviewPageDto = z.infer<typeof admissionReviewPageSchema>;
