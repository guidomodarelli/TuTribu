/** Publishes an application read only through its own snapshot schema. @module own-admission-snapshot */
import type { z } from "zod";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";

/**
 * @param schema - Own snapshot contract of the read.
 * @param candidate - Assembled facts.
 * @returns The parsed snapshot as a successful application result.
 * @throws AdmissionOperationError when the facts do not satisfy the own contract.
 */
export function ownAdmissionSnapshot<Value>(schema: z.ZodType<Value>, candidate: unknown): { ok: true; value: Value } {
  const parsed = schema.safeParse(candidate);
  if (!parsed.success) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable);
  return { ok: true as const, value: parsed.data };
}
