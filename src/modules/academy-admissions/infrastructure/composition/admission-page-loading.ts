/** Shared SSR loading steps of admission pages: closed unavailable states, tribe-scoped reads and one contained leader page loader. @module admission-page-loading */
import "server-only";
import type { z } from "zod";
import type { AdmissionFailure } from "../../application/results/admission-errors";
import { resolveAdmissionTribeScope, type AdmissionTribeRouting, type AdmissionTribeScope } from "../../application/use-cases/admission-tribe-scope";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE, type AdmissionErrorCode } from "../../constants/admission-errors";
import { ADMISSION_DIAGNOSTIC_FEATURE } from "../../constants/admission-diagnostics";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

/** Closed page state for a failure, with its own Spanish copy and no private cause. */
type UnavailableAdmissionPage = { kind: "unavailable"; code: AdmissionErrorCode; message: string };
/** Application result of one page read. */
type AdmissionPageRead = { ok: true; value: unknown } | { ok: false; failure: AdmissionFailure };

/**
 * @param code - Semantic failure.
 * @returns The closed unavailable page state with the own message of the code.
 */
function unavailableAdmissionPage(code: AdmissionErrorCode): UnavailableAdmissionPage {
  return { kind: "unavailable", code, message: ADMISSION_ERROR_MESSAGE[code] };
}

/**
 * Opens the native composition, resolves the tribe, then runs one read inside its scope.
 * @param open - Server-selected composition.
 * @param query - Validated slug and safe correlation.
 * @param read - Read of the scoped services.
 * @returns The read result, or the routing failure unchanged.
 */
export async function readWithinAdmissionTribe<Services extends { resolveTribe: AdmissionTribeRouting }, Result extends AdmissionPageRead>(open: () => Promise<Services>, query: { slug: string; requestId: string }, read: (services: Services, scope: AdmissionTribeScope) => Promise<Result>): Promise<Result | { ok: false; failure: AdmissionFailure }> {
  const services = await open();
  const scope = await resolveAdmissionTribeScope(services.resolveTribe, query);
  if (!scope.ok) return scope;
  return read(services, scope.value);
}

/**
 * Loads one leader page: invalid input is a closed failure; private/unusable failures and unloadable states are logged, never serialized.
 * @param page - Untrusted input with its own schema, lazy page composition and its read, own state schema and fixed diagnostics.
 * @returns The own ready state or a closed unavailable state.
 */
export async function loadAdmissionLeaderPageState<Input, Page, State>(page: {
  input: unknown; inputSchema: z.ZodType<Input>;
  open: () => Promise<Page>; read: (page: Page, input: Input, requestId: string) => Promise<AdmissionPageRead>;
  stateSchema: z.ZodType<State>;
  diagnostic: { operation: string; readFailed: string; loadFailed: string };
}): Promise<State | UnavailableAdmissionPage> {
  const parsed = page.inputSchema.safeParse(page.input);
  if (!parsed.success) return unavailableAdmissionPage(ADMISSION_ERROR_CODE.invalidInput);
  const context = resolveRequestContext(new Headers());
  try {
    const opened = await page.open(), result = await page.read(opened, parsed.data, context.requestId);
    if (!result.ok) {
      if (result.failure.code === ADMISSION_ERROR_CODE.unexpectedFailure || result.failure.code === ADMISSION_ERROR_CODE.publicContractUnusable) createServerLogger({ feature: ADMISSION_DIAGNOSTIC_FEATURE, operation: page.diagnostic.operation, ...context }).error({ message: page.diagnostic.readFailed, metadata: { code: result.failure.code } });
      return unavailableAdmissionPage(result.failure.code);
    }
    const projected = page.stateSchema.safeParse(result.value);
    if (projected.success) return projected.data;
    throw new Error("Admission page returned an unusable own state");
  } catch {
    createServerLogger({ feature: ADMISSION_DIAGNOSTIC_FEATURE, operation: page.diagnostic.operation, ...context }).error({ message: page.diagnostic.loadFailed, metadata: { code: ADMISSION_ERROR_CODE.unexpectedFailure } });
    return unavailableAdmissionPage(ADMISSION_ERROR_CODE.unexpectedFailure);
  }
}
