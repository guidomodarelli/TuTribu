/** Shared SSR loading steps of admission pages: closed unavailable states, tribe-scoped reads and one contained leader page loader. @module admission-page-loading */
import "server-only";
import type { z } from "zod";
import type { AdmissionFailure } from "../../application/results/admission-errors";
import { resolveAdmissionTribeScope, type AdmissionTribeRouting, type AdmissionTribeScope } from "../../application/use-cases/admission-tribe-scope";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import type { ServerPageDiagnosticMessages } from "@/src/modules/shared/infrastructure/observability/server-page-diagnostics";
import { createAdmissionPageDiagnostics, loadAdmissionPageRead, unavailableAdmissionPage, type UnavailableAdmissionPage } from "./admission-page-diagnostics";

/** Application result of one page read. */
type AdmissionPageRead = { ok: true; value: unknown } | { ok: false; failure: AdmissionFailure };

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
 * Loads one leader page: invalid input is a closed failure; every other failure and unloadable state is logged with its cause chain,
 * never serialized.
 * @param page - Untrusted input with its own schema, lazy page composition and its read, own state schema, fixed diagnostics and the
 * incoming request headers (native correlation).
 * @returns The own ready state or a closed unavailable state with read copy.
 */
export async function loadAdmissionLeaderPageState<Input, Page, State>(page: {
  input: unknown; inputSchema: z.ZodType<Input>;
  open: () => Promise<Page>; read: (page: Page, input: Input, requestId: string) => Promise<AdmissionPageRead>;
  stateSchema: z.ZodType<State>;
  diagnostic: { operation: string } & ServerPageDiagnosticMessages;
  requestHeaders?: Pick<Headers, "get">;
}): Promise<State | UnavailableAdmissionPage> {
  const parsed = page.inputSchema.safeParse(page.input);
  if (!parsed.success) return unavailableAdmissionPage(ADMISSION_ERROR_CODE.invalidInput);
  const diagnostics = createAdmissionPageDiagnostics(page.diagnostic.operation, page.requestHeaders);
  return loadAdmissionPageRead({
    diagnostics, stateSchema: page.stateSchema, messages: page.diagnostic,
    read: async () => page.read(await page.open(), parsed.data, diagnostics.context.requestId),
  });
}
