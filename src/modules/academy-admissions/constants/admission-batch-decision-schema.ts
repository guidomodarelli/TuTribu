/** Guards only the minimal application-owned committed batch snapshot. @module admission-batch-decision-schema */
import { z } from "zod";
import type { AdmissionBatchDecisionSnapshot } from "../domain/repositories/admission-batch-decision-writer";
import { ADMISSION_BATCH_ITEM_STATUS } from "./admission-public-contract";
import { ADMISSION_COMMAND_DENIAL_CODES } from "./admission-command-denial";
import { ADMISSION_ERROR_CODE } from "./admission-errors";
import { ADMISSION_LIMIT } from "./admission-limits";

/** A batch never publishes an uncommitted success, internal note or provider payload. */
export const admissionBatchDecisionSnapshotSchema = z.strictObject({
  results: z.array(z.union([
    z.strictObject({ admissionRequestId: z.uuid(), status: z.enum([ADMISSION_BATCH_ITEM_STATUS.approved, ADMISSION_BATCH_ITEM_STATUS.rejected]), version: z.int().positive() }),
    z.strictObject({ admissionRequestId: z.uuid(), status: z.enum([ADMISSION_BATCH_ITEM_STATUS.conflict, ADMISSION_BATCH_ITEM_STATUS.denied]), code: z.enum([...ADMISSION_COMMAND_DENIAL_CODES, ADMISSION_ERROR_CODE.permissionDenied]) }),
  ])).min(1).max(ADMISSION_LIMIT.batchRequestCount),
}).refine((snapshot) => new Set(snapshot.results.map((result) => result.admissionRequestId)).size === snapshot.results.length) satisfies z.ZodType<AdmissionBatchDecisionSnapshot>;
