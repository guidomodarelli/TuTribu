/** Validates list page runtime input before native composition and safe current SSR projection. @module allowlist-page */
import "server-only";
import { z } from "zod";
import type { GetAllowlistPageUseCase } from "../../application/use-cases/get-allowlist-page-use-case";
import { allowlistPageStateSchema, type AllowlistPageState } from "../../application/results/allowlist-page-state";
import { admissionTribeParamsSchema, admissionAllowlistQuerySchema } from "../api/admission-request-schemas";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "../../constants/admission-errors";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const pageInputSchema = z.strictObject({ params: admissionTribeParamsSchema, query: admissionAllowlistQuerySchema });
/** @param input - Untrusted resolved framework values. @param open - Server-selected inward loader. @returns Current leader state or safe Spanish failure without raw diagnostics. */
export async function loadAllowlistPageState(input: unknown, open: () => Promise<Pick<GetAllowlistPageUseCase, "execute">>): Promise<AllowlistPageState> {
  const failure = (code: typeof ADMISSION_ERROR_CODE[keyof typeof ADMISSION_ERROR_CODE]): AllowlistPageState => ({ kind: "unavailable", code, message: ADMISSION_ERROR_MESSAGE[code] });
  const parsed = pageInputSchema.safeParse(input);
  if (!parsed.success) return failure(ADMISSION_ERROR_CODE.invalidInput);
  const context = resolveRequestContext(new Headers());
  try {
    const page = await open(), result = await page.execute({ slug: parsed.data.params.slug, filters: parsed.data.query, requestId: context.requestId });
    if (!result.ok) {
      if (result.failure.code === ADMISSION_ERROR_CODE.unexpectedFailure || result.failure.code === ADMISSION_ERROR_CODE.publicContractUnusable) createServerLogger({ feature: "academy-admissions", operation: "load_allowlist_page", ...context }).error({ message: "Allowlist page read failed", metadata: { code: result.failure.code } });
      return failure(result.failure.code);
    }
    const projected = allowlistPageStateSchema.safeParse(result.value);
    if (projected.success) return projected.data;
    throw new Error("Allowlist page returned an unusable own state");
  } catch {
    createServerLogger({ feature: "academy-admissions", operation: "load_allowlist_page", ...context }).error({ message: "Allowlist page could not load safe current state", metadata: { code: ADMISSION_ERROR_CODE.unexpectedFailure } });
    return failure(ADMISSION_ERROR_CODE.unexpectedFailure);
  }
}
