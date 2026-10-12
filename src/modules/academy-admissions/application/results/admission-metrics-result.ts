/** Guards the application's own public aggregate DTO; provider/PostgreSQL payloads remain owned by their adapters. @module admission-metrics-result */
import type { z } from "zod";
import { admissionMetricsResultSchema } from "../../constants/admission-metrics-schemas";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";

export type { AdmissionMetricPhase, AdmissionMetricRunOperation } from "../../domain/entities/admission-metric-dimensions";
export { admissionMetricsResultSchema } from "../../constants/admission-metrics-schemas";

/** Application-owned public result, distinct from a provider DTO or persistence record. */
export type AdmissionMetricsResult = z.infer<typeof admissionMetricsResultSchema>;

/**
 * Validates an own public result and binds it to the current server-authorized tribe.
 * @param value - Application public DTO about to cross a server/client boundary.
 * @param expectedTribeId - Current authorized scope, never a client permission marker.
 * @returns Only the safe closed aggregate for that exact tribe.
 * @throws AdmissionOperationError when the public contract or scope cannot be consumed.
 */
export function parseAdmissionMetricsResult(value: unknown, expectedTribeId: string): AdmissionMetricsResult {
  const parsed = admissionMetricsResultSchema.safeParse(value);
  if (!parsed.success || parsed.data.tribeId !== expectedTribeId) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable);
  return parsed.data;
}
