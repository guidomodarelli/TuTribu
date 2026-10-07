/** Resolves Next runtime input once before native page composition and guards safe own SSR props. @module admission-page */
import "server-only";
import type { GetAdmissionPageUseCase } from "@/src/modules/academy-admissions/application/use-cases/get-admission-page-use-case";
import { z } from "zod";
import { ADMISSION_NAVIGATION } from "@/src/modules/academy-admissions/constants/admission-navigation";
import { buildOwnAdmissionRequestRoute } from "@/lib/academy-admissions/admission-routes";
import type { AdmissionPageState } from "@/src/modules/academy-admissions/application/results/admission-page-state";
import { admissionPageStateSchema } from "@/src/modules/academy-admissions/application/results/admission-page-state";
import { admissionTribeParamsSchema } from "../api/admission-request-schemas";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

/** Only a public slug selects the tribe; an exact request id never selects another account. */
const admissionPageInputSchema = z.union([
  z.strictObject({ params: admissionTribeParamsSchema, query: z.strictObject({}), mode: z.literal("entry") }),
  z.strictObject({ params: z.strictObject({ requestId: z.uuid() }), query: z.strictObject({ tribe: admissionTribeParamsSchema.shape.slug }), mode: z.literal("request") }),
]);
type PageModule = { page: Pick<GetAdmissionPageUseCase, "execute"> };
/** @param input - Untrusted resolved route params/query and fixed server page kind. @param open - Native read-only framework composition. @returns Safe SSR state, with no internal diagnostics or membership prerequisite. */
export async function loadAdmissionPageState(input: unknown, open: () => Promise<PageModule>): Promise<AdmissionPageState> {
  const failed = (code: typeof ADMISSION_ERROR_CODE[keyof typeof ADMISSION_ERROR_CODE]): Extract<AdmissionPageState, { kind: "unavailable" }> => ({ kind: "unavailable", code, message: ADMISSION_ERROR_MESSAGE[code] });
  const parsed = admissionPageInputSchema.safeParse(input);
  if (!parsed.success) return failed(ADMISSION_ERROR_CODE.invalidInput);
  const returnPath = parsed.data.mode === "entry" ? `${ADMISSION_NAVIGATION.publicPrefix}/${encodeURIComponent(parsed.data.params.slug)}` : buildOwnAdmissionRequestRoute(parsed.data.query.tribe, parsed.data.params.requestId);
  const context = resolveRequestContext(new Headers());
  try {
    const pageModule = await open();
    const query = parsed.data.mode === "entry" ? { slug: parsed.data.params.slug, requestId: context.requestId } : { slug: parsed.data.query.tribe, admissionRequestId: parsed.data.params.requestId, requestId: context.requestId };
    const loaded = await pageModule.page.execute(query);
    if (!loaded.ok) {
      if (loaded.failure.code === ADMISSION_ERROR_CODE.unexpectedFailure || loaded.failure.code === ADMISSION_ERROR_CODE.publicContractUnusable) createServerLogger({ feature: "academy-admissions", operation: "load_admission_page", ...context }).error({ message: "Admission page application read failed", metadata: { code: loaded.failure.code } });
      return { ...failed(loaded.failure.code), returnPath };
    }
    const result = admissionPageStateSchema.safeParse(loaded.value);
    if (result.success) return result.data;
    throw new Error("Admission page returned an unusable own state");
  } catch {
    createServerLogger({ feature: "academy-admissions", operation: "load_admission_page", ...context }).error({ message: "Admission page could not load safe state", metadata: { code: ADMISSION_ERROR_CODE.unexpectedFailure } });
    return failed(ADMISSION_ERROR_CODE.unexpectedFailure);
  }
}
