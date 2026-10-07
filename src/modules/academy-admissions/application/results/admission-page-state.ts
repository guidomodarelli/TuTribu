/** Owns safe SSR state without cookies, session ids, provider accounts or permission tokens. @module admission-page-state */
import { z } from "zod";
import { admissionOverviewSchema, admissionRequestSchema } from "./admission-flow-result-schemas";
import { admissionLocalHrefSchema } from "./admission-contract-fields";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";

/** The viewer id scopes browser drafts only; every action still derives its native actor on the server. */
export const admissionPageStateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ready"), overview: admissionOverviewSchema, viewerId: z.string().min(1).nullable(), request: admissionRequestSchema.nullable(), renderedAt: z.iso.datetime({ offset: true }) }),
  z.object({ kind: z.literal("unavailable"), code: z.enum(ADMISSION_ERROR_CODE), message: z.string(), returnPath: admissionLocalHrefSchema.optional() }).refine((state) => state.message === ADMISSION_ERROR_MESSAGE[state.code]),
]);
export type AdmissionPageState = z.infer<typeof admissionPageStateSchema>;
