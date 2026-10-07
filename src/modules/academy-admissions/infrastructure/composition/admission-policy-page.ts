/** Validates policy page runtime input before native composition and own safe SSR projection. @module admission-policy-page */
import "server-only";
import { z } from "zod";
import type { GetAdmissionPolicyPageUseCase } from "../../application/use-cases/get-admission-policy-page-use-case";
import { admissionPolicyPageStateSchema, type AdmissionPolicyPageState } from "../../application/results/admission-policy-page-state";
import { admissionTribeParamsSchema, admissionEmptyQuerySchema } from "../api/admission-request-schemas";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "../../constants/admission-errors";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

/** Browser input cannot supply actor, role, operational readiness or an alternative country owner. */
const pageInputSchema = z.strictObject({ params: admissionTribeParamsSchema, query: admissionEmptyQuerySchema });
/** @param input - Untrusted resolved framework input. @param open - Server-selected inward use case. @returns Safe current leader state or a contained Spanish failure. */
export async function loadAdmissionPolicyPageState(input: unknown, open: () => Promise<Pick<GetAdmissionPolicyPageUseCase, "execute">>): Promise<AdmissionPolicyPageState> {
  const failure = (code: typeof ADMISSION_ERROR_CODE[keyof typeof ADMISSION_ERROR_CODE]): AdmissionPolicyPageState => ({ kind: "unavailable", code, message: ADMISSION_ERROR_MESSAGE[code] });
  const parsed = pageInputSchema.safeParse(input);
  if (!parsed.success) return failure(ADMISSION_ERROR_CODE.invalidInput);
  const context = resolveRequestContext(new Headers());
  try {
    const page = await open(), result = await page.execute({ slug: parsed.data.params.slug, requestId: context.requestId });
    if (!result.ok) {
      if (result.failure.code === ADMISSION_ERROR_CODE.unexpectedFailure || result.failure.code === ADMISSION_ERROR_CODE.publicContractUnusable) createServerLogger({ feature: "academy-admissions", operation: "load_admission_policy_page", ...context }).error({ message: "Admission policy page read failed", metadata: { code: result.failure.code } });
      return failure(result.failure.code);
    }
    const projected = admissionPolicyPageStateSchema.safeParse(result.value);
    if (projected.success) return projected.data;
    throw new Error("Admission policy page returned an unusable own state");
  } catch {
    createServerLogger({ feature: "academy-admissions", operation: "load_admission_policy_page", ...context }).error({ message: "Admission policy page could not load safe state", metadata: { code: ADMISSION_ERROR_CODE.unexpectedFailure } });
    return failure(ADMISSION_ERROR_CODE.unexpectedFailure);
  }
}
