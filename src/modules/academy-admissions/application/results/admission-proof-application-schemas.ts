/** Defines safe incremental proof attachment and confirmed denial snapshots. @module admission-proof-application-schemas */
import { z } from "zod";
import type { AdmissionProofApplicationResult } from "../../domain/repositories/admission-verification-proof-repository";
import { ADMISSION_PROOF_APPLICATION_OUTCOME } from "../../constants/admission-proof";
import { ADMISSION_REQUEST_STATUS } from "../../constants/admission-request";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { createAdmissionOperationStateSchema } from "./admission-flow-result-schemas";

/** A completed attachment returns only the original pending version, never contact, binding owner or membership authority. */
export const admissionProofApplicationSnapshotSchema = z.union([
  z.object({ outcome: z.literal(ADMISSION_PROOF_APPLICATION_OUTCOME.applied), requestId: z.uuid(), requestVersion: z.int().positive(), status: z.literal(ADMISSION_REQUEST_STATUS.pending), proofId: z.uuid() }),
  z.object({ outcome: z.literal(ADMISSION_PROOF_APPLICATION_OUTCOME.denied), code: z.enum(ADMISSION_ERROR_CODE) }),
]) satisfies z.ZodType<AdmissionProofApplicationResult>;
/** Progress exists only when the original writer registered it. */
export const admissionProofApplicationOperationSchema = createAdmissionOperationStateSchema(admissionProofApplicationSnapshotSchema);
