/** Owns bounded current-reviewer inbox DTOs independently of own-request responses. @module admission-review-page-result */
import { z } from "zod";
import { admissionReviewSchema } from "./admission-flow-result-schemas";
import { ADMISSION_QUERY_LIMIT } from "@/src/modules/academy-admissions/constants/admission-public-contract";
import { PLATFORM_SECURITY_REQUIREMENT } from "@/src/modules/shared/constants/platform-security";

/**
 * Only the server-authorized reviewer use case may publish these items and their opaque continuation. `platformRequirement` is the
 * closed reason, read in the same reviewer transaction, why the platform cannot protect a decision now; while it is present no item
 * offers a decision.
 */
export const admissionReviewPageSchema = z.object({
  items: z.array(admissionReviewSchema).max(ADMISSION_QUERY_LIMIT.maximumPageSize),
  nextCursor: z.string().min(1).max(ADMISSION_QUERY_LIMIT.cursorCharacters).nullable(),
  platformRequirement: z.enum(PLATFORM_SECURITY_REQUIREMENT).nullable(),
}).refine((page) => page.platformRequirement === null || page.items.every((item) => item.eligibleActions.length === 0));
