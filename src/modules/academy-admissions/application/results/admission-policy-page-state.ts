/** Guards minimum current leader policy SSR props without native sessions or credentials. @module admission-policy-page-state */
import { z } from "zod";
import { admissionPolicyStateResultSchema } from "./admission-policy-result-schemas";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "../../constants/admission-errors";

/** Public owner/viewer ids scope UI intentions only; every write repeats current server authorization. */
export const admissionPolicyPageStateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ready"), slug: z.string().min(1), tribeId: z.uuid(), viewerId: z.string().min(1), renderedAt: z.iso.datetime({ offset: true }), policy: admissionPolicyStateResultSchema }),
  z.object({ kind: z.literal("unavailable"), code: z.enum(ADMISSION_ERROR_CODE), message: z.string() }).refine((state) => state.message === ADMISSION_ERROR_MESSAGE[state.code]),
]);
export type AdmissionPolicyPageState = z.infer<typeof admissionPolicyPageStateSchema>;
