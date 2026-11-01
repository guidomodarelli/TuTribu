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
/** Fixed diagnostics of the admission page loader; never the slug, token or request id values beyond the safe request id. */
const ADMISSION_PAGE_DIAGNOSTIC = { operation: "load_admission_page", readFailed: "Admission page application read failed", contractRejected: "Admission page returned an unusable own state", loadFailed: "Admission page could not load safe state" } as const;

/**
 * @param input - Validated input. @param pageModule - Native read-only composition. @param requestId - Safe correlation.
 * @returns The input with the tribe of an own request link that lacked it, or the safe failure (signed out, or not this account request)
 * with that same link as the return path, which resolves its tribe once the account is known.
 */
async function resolveRequestTribe(input: AdmissionPageInput, pageModule: PageModule, requestId: string): Promise<ResolvedAdmissionPageInput | { failure: { code: (typeof ADMISSION_ERROR_CODE)[keyof typeof ADMISSION_ERROR_CODE]; cause?: unknown }; returnPath: string }> {
  if (input.mode !== "request") return input;
  const tribe = input.query.tribe;
  if (tribe) return { ...input, query: { ...input.query, tribe } };
  const resolved = await pageModule.page.resolveOwnRequestTribe({ requestId, admissionRequestId: input.params.requestId });
  return resolved.ok ? { ...input, query: { ...input.query, tribe: resolved.value } } : { failure: resolved.failure, returnPath: `${ADMISSION_NAVIGATION.publicPrefix}/${ADMISSION_NAVIGATION.requestSegment}/${encodeURIComponent(input.params.requestId)}` };
}

/** @param input - Validated input whose tribe is known. @returns The way back to that tribe entry or to that own request. */
function readReturnPath(input: ResolvedAdmissionPageInput): string {
  return input.mode !== "request" ? `${ADMISSION_NAVIGATION.publicPrefix}/${encodeURIComponent(input.params.slug)}` : buildOwnAdmissionRequestRoute(input.query.tribe, input.params.requestId);
}

/**
 * @param input - Untrusted resolved route params/query and fixed server page kind.
 * @param open - Native read-only framework composition.
 * @param requestHeaders - Incoming request headers, for native correlation.
 * @returns Safe SSR state, with no internal diagnostics or membership prerequisite; every failure is logged with its cause chain.
 */
export async function loadAdmissionPageState(input: unknown, open: () => Promise<PageModule>, requestHeaders?: Pick<Headers, "get">): Promise<AdmissionPageState> {
  const parsed = admissionPageInputSchema.safeParse(input);
  if (!parsed.success) return unavailableAdmissionPage(ADMISSION_ERROR_CODE.invalidInput);
  const diagnostics = createAdmissionPageDiagnostics(ADMISSION_PAGE_DIAGNOSTIC.operation, requestHeaders, { metadata: { mode: parsed.data.mode } });
  const requestId = diagnostics.context.requestId;
  /** Set once the address names its tribe (or the own request link that resolves it), so a failure keeps the way back. */
  const way: { returnPath: string | null } = { returnPath: null };
  const state = await loadAdmissionPageRead({
    diagnostics, stateSchema: admissionPageStateSchema, messages: ADMISSION_PAGE_DIAGNOSTIC,
    read: async () => {
      const pageModule = await open();
      const pageInput = await resolveRequestTribe(parsed.data, pageModule, requestId);
      if ("failure" in pageInput) { way.returnPath = pageInput.returnPath; return { ok: false as const, failure: pageInput.failure }; }
      way.returnPath = readReturnPath(pageInput);
      const query = pageInput.mode !== "request" ? { slug: pageInput.params.slug, requestId, ...(pageInput.mode === "legacy" ? { legacyInvitationToken: pageInput.params.token } : {}) } : { slug: pageInput.query.tribe, admissionRequestId: pageInput.params.requestId, requestId };
      return pageModule.page.execute(query);
    },
  });
  return state.kind === "unavailable" && way.returnPath !== null ? { ...state, returnPath: way.returnPath } : state;
}
