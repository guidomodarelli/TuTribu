/** Resolves Next runtime input once before native page composition and guards safe own SSR props. @module admission-page */
import "server-only";
import type { GetAdmissionPageUseCase } from "@/src/modules/academy-admissions/application/use-cases/get-admission-page-use-case";
import { z } from "zod";
import { ADMISSION_NAVIGATION } from "@/src/modules/academy-admissions/constants/admission-navigation";
import { LEGACY_ADMISSION_ARRIVAL } from "@/src/modules/academy-admissions/constants/legacy-admission-arrival";
import { buildOwnAdmissionRequestRoute } from "@/lib/academy-admissions/admission-routes";
import { type AdmissionPageState, admissionPageStateSchema  } from "@/src/modules/academy-admissions/application/results/admission-page-state";
import { admissionTribeParamsSchema } from "../api/admission-request-schemas";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

/**
 * Only a public slug selects the tribe; an exact request id never selects another account.
 * A shared link often carries tracking parameters (`utm_*`, `fbclid`): the page query drops unknown keys and keeps validating
 * the ones it reads, while the admission APIs stay strict. A request link may lack its tribe (request emails sealed before the tribe joined
 * that address): the page then resolves the tribe from the account own request.
 */
const admissionPageInputSchema = z.union([
  z.strictObject({ params: admissionTribeParamsSchema, query: z.object({}), mode: z.literal("entry") }),
  z.strictObject({ params: admissionTribeParamsSchema.extend({ token: z.string().regex(LEGACY_ADMISSION_ARRIVAL.canonicalTokenPattern) }), query: z.object({}), mode: z.literal("legacy") }),
  z.strictObject({ params: z.strictObject({ requestId: z.uuid() }), query: z.object({ tribe: admissionTribeParamsSchema.shape.slug.optional() }), mode: z.literal("request") }),
]);
type PageModule = { page: Pick<GetAdmissionPageUseCase, "execute" | "resolveOwnRequestTribe"> };
/** Validated page input, before the request mode knows its tribe. */
type AdmissionPageInput = z.infer<typeof admissionPageInputSchema>;
/** Validated page input whose request mode already names its tribe. */
type ResolvedAdmissionPageInput = Exclude<AdmissionPageInput, { mode: "request" }> | (Extract<AdmissionPageInput, { mode: "request" }> & { query: { tribe: string } });

/**
 * @param input - Validated input. @param pageModule - Native read-only composition. @param requestId - Safe correlation.
 * @returns The input with the tribe of an own request link that lacked it, or the safe failure (signed out, or not this account request)
 * with that same link as the return path, which resolves its tribe once the account is known.
 */
async function resolveRequestTribe(input: AdmissionPageInput, pageModule: PageModule, requestId: string): Promise<ResolvedAdmissionPageInput | { code: (typeof ADMISSION_ERROR_CODE)[keyof typeof ADMISSION_ERROR_CODE]; returnPath: string }> {
  if (input.mode !== "request") return input;
  const tribe = input.query.tribe;
  if (tribe) return { ...input, query: { ...input.query, tribe } };
  const resolved = await pageModule.page.resolveOwnRequestTribe({ requestId, admissionRequestId: input.params.requestId });
  return resolved.ok ? { ...input, query: { ...input.query, tribe: resolved.value } } : { code: resolved.failure.code, returnPath: `${ADMISSION_NAVIGATION.publicPrefix}/${ADMISSION_NAVIGATION.requestSegment}/${encodeURIComponent(input.params.requestId)}` };
}
/** @param input - Untrusted resolved route params/query and fixed server page kind. @param open - Native read-only framework composition. @returns Safe SSR state, with no internal diagnostics or membership prerequisite. */
export async function loadAdmissionPageState(input: unknown, open: () => Promise<PageModule>): Promise<AdmissionPageState> {
  const failed = (code: typeof ADMISSION_ERROR_CODE[keyof typeof ADMISSION_ERROR_CODE]): Extract<AdmissionPageState, { kind: "unavailable" }> => ({ kind: "unavailable", code, message: ADMISSION_ERROR_MESSAGE[code] });
  const parsed = admissionPageInputSchema.safeParse(input);
  if (!parsed.success) return failed(ADMISSION_ERROR_CODE.invalidInput);
  const context = resolveRequestContext(new Headers());
  try {
    const pageModule = await open();
    const pageInput = await resolveRequestTribe(parsed.data, pageModule, context.requestId);
    if ("code" in pageInput) return { ...failed(pageInput.code), returnPath: pageInput.returnPath };
    const returnPath = pageInput.mode !== "request" ? `${ADMISSION_NAVIGATION.publicPrefix}/${encodeURIComponent(pageInput.params.slug)}` : buildOwnAdmissionRequestRoute(pageInput.query.tribe, pageInput.params.requestId);
    const query = pageInput.mode !== "request" ? { slug: pageInput.params.slug, requestId: context.requestId, ...(pageInput.mode === "legacy" ? { legacyInvitationToken: pageInput.params.token } : {}) } : { slug: pageInput.query.tribe, admissionRequestId: pageInput.params.requestId, requestId: context.requestId };
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
