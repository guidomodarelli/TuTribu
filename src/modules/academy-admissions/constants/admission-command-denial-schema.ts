/** Guards the minimal own original denial independently of trusted PostgreSQL rows. @module admission-command-denial-schema */
import { z } from "zod";
import { ADMISSION_OUTCOME } from "./admission-eligibility";
import { ADMISSION_COMMAND_DENIAL_CODES, type AdmissionCommandDenial } from "./admission-command-denial";

/** Public command rejection is closed and cannot contain tokens, contacts, diagnostics or unconfirmed access. */
export const admissionCommandDenialSchema = z.strictObject({ outcome: z.literal(ADMISSION_OUTCOME.denied), code: z.enum(ADMISSION_COMMAND_DENIAL_CODES), admissionRequestId: z.uuid().nullable() }) satisfies z.ZodType<AdmissionCommandDenial>;
