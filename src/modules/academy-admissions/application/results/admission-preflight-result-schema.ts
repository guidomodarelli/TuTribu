/** Guards own informational cutover readiness without exposing metadata names, members or provider state. @module admission-preflight-result-schema */
import { z } from "zod";
import { ADMISSION_PREFLIGHT_REASON } from "../../constants/admission-preflight";

/** Aggregate counts describe unresolved owner work; they never authorize reconstructing a snapshot. */
export const admissionPreflightResultSchema = z.object({
  prepared: z.boolean(), reasons: z.array(z.enum(ADMISSION_PREFLIGHT_REASON)),
  impact: z.object({ unknownCommercialMemberCount: z.int().nonnegative(), privilegedCommercialMemberCount: z.int().nonnegative() }),
}).refine((result) => result.prepared === (result.reasons.length === 0)
  && (!result.prepared || result.impact.unknownCommercialMemberCount === 0 && result.impact.privilegedCommercialMemberCount === 0));
