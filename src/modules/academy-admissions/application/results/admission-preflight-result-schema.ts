/** Guards own informational cutover readiness without exposing metadata names, members or provider state. @module admission-preflight-result-schema */
import { z } from "zod";
import { ADMISSION_PREFLIGHT_REASON } from "../../constants/admission-preflight";

/** Readiness and its safe reasons; a prepared result carries no reason. */
export const admissionPreflightResultSchema = z.object({
  prepared: z.boolean(), reasons: z.array(z.enum(ADMISSION_PREFLIGHT_REASON)),
}).refine((result) => { const hasNoReasons = result.reasons.length === 0; return result.prepared === hasNoReasons; });
