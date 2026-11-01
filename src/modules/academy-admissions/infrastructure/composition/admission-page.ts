/** Resolves Next runtime input once before native page composition and guards safe own SSR props. @module admission-page */
import "server-only";
import type { GetAdmissionPageUseCase } from "@/src/modules/academy-admissions/application/use-cases/get-admission-page-use-case";
import { z } from "zod";
import { ADMISSION_NAVIGATION } from "@/src/modules/academy-admissions/constants/admission-navigation";
import { LEGACY_ADMISSION_ARRIVAL } from "@/src/modules/academy-admissions/constants/legacy-admission-arrival";
import { buildOwnAdmissionRequestRoute } from "@/lib/academy-admissions/admission-routes";
import { type AdmissionPageState, admissionPageStateSchema  } from "@/src/modules/academy-admissions/application/results/admission-page-state";
import { admissionTribeParamsSchema } from "../api/admission-request-schemas";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { createAdmissionPageDiagnostics, loadAdmissionPageRead, unavailableAdmissionPage } from "./admission-page-diagnostics";

/**
 * Only a public slug selects the tribe; an exact request id never selects another account.
 * A shared link often carries tracking parameters (`utm_*`, `fbclid`): the page query drops unknown keys and keeps validating
 * the ones it reads, while the admission APIs stay strict.
 */
const admissionPageInputSchema = z.union([
  z.strictObject({ params: admissionTribeParamsSchema, query: z.object({}), mode: z.literal("entry") }),
  z.strictObject({ params: admissionTribeParamsSchema.extend({ token: z.string().regex(LEGACY_ADMISSION_ARRIVAL.canonicalTokenPattern) }), query: z.object({}), mode: z.literal("legacy") }),
  z.strictObject({ params: z.strictObject({ requestId: z.uuid() }), query: z.object({ tribe: admissionTribeParamsSchema.shape.slug }), mode: z.literal("request") }),
]);
type PageModule = { page: Pick<GetAdmissionPageUseCase, "execute"> };
/** Fixed diagnostics of the admission page loader; never the slug, token or request id values beyond the safe request id. */
const ADMISSION_PAGE_DIAGNOSTIC = { operation: "load_admission_page", readFailed: "Admission page application read failed", contractRejected: "Admission page returned an unusable own state", loadFailed: "Admission page could not load safe state" } as const;

/**
 * @param input - Untrusted resolved route params/query and fixed server page kind.
 * @param open - Native read-only framework composition.
 * @param requestHeaders - Incoming request headers, for native correlation.
 * @returns Safe SSR state, with no internal diagnostics or membership prerequisite; every failure is logged with its cause chain.
 */
export async function loadAdmissionPageState(input: unknown, open: () => Promise<PageModule>, requestHeaders?: Pick<Headers, "get">): Promise<AdmissionPageState> {
  const parsed = admissionPageInputSchema.safeParse(input);
  if (!parsed.success) return unavailableAdmissionPage(ADMISSION_ERROR_CODE.invalidInput);
  const returnPath = parsed.data.mode !== "request" ? `${ADMISSION_NAVIGATION.publicPrefix}/${encodeURIComponent(parsed.data.params.slug)}` : buildOwnAdmissionRequestRoute(parsed.data.query.tribe, parsed.data.params.requestId);
  const diagnostics = createAdmissionPageDiagnostics(ADMISSION_PAGE_DIAGNOSTIC.operation, requestHeaders, { metadata: { mode: parsed.data.mode } });
  const requestId = diagnostics.context.requestId;
  const state = await loadAdmissionPageRead({
    diagnostics, stateSchema: admissionPageStateSchema, messages: ADMISSION_PAGE_DIAGNOSTIC,
    read: async () => {
      const pageModule = await open();
      const query = parsed.data.mode !== "request" ? { slug: parsed.data.params.slug, requestId, ...(parsed.data.mode === "legacy" ? { legacyInvitationToken: parsed.data.params.token } : {}) } : { slug: parsed.data.query.tribe, admissionRequestId: parsed.data.params.requestId, requestId };
      return pageModule.page.execute(query);
    },
  });
  // Any failure after the address was validated keeps the way back to that tribe or request.
  return state.kind === "unavailable" ? { ...state, returnPath } : state;
}
