/** Guards original minimal diagnostic issuance without recipient/code/key/provider payloads. @module connection-diagnostic-issuance-result */
import {z} from "zod";
import type {ConnectionDiagnosticIssueResult} from "@/src/modules/messaging/domain/repositories/connection-diagnostic-issuance";
import {MESSAGING_ERROR_CODE} from "@/src/modules/messaging/constants/messaging-errors";
import {MESSAGING_PUBLIC_CHANNEL} from "@/src/modules/messaging/constants/messaging-public-contract";
import {ADMISSION_MASK_MARKER_PATTERN} from "@/src/modules/academy-admissions/constants/admission-public-contract";
/** This own DTO is validated at ledger, HTTP and browser boundaries; it is never an upstream schema. */
export const connectionDiagnosticIssuanceSchema=z.discriminatedUnion("outcome",[
  z.strictObject({outcome:z.literal("issued"),diagnosticId:z.uuid(),challengeId:z.uuid(),deliveryId:z.uuid(),connectionId:z.uuid(),connectionVersion:z.int().positive(),channel:z.enum(MESSAGING_PUBLIC_CHANNEL),maskedDestination:z.string().min(1).regex(ADMISSION_MASK_MARKER_PATTERN),expiresAt:z.iso.datetime({offset:true}),resendAllowedAt:z.iso.datetime({offset:true})}),
  z.strictObject({outcome:z.literal("denied"),code:z.enum(MESSAGING_ERROR_CODE)}),
]) satisfies z.ZodType<ConnectionDiagnosticIssueResult>;
