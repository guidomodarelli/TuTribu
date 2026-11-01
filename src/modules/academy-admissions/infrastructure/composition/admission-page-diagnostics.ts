/** Admission SSR loaders share one diagnostics shape and one unavailable state with read copy. @module admission-page-diagnostics */
import "server-only";
import type { z } from "zod";
import { HTTP_STATUS } from "@/src/constants/http-status";
import { createServerPageDiagnostics, loadServerPageState, type ServerPageDiagnosticMessages, type ServerPageDiagnostics } from "@/src/modules/shared/infrastructure/observability/server-page-diagnostics";
import { ADMISSION_ERROR_HTTP_STATUS } from "../api/admission-error-status";
import { ADMISSION_DIAGNOSTIC_FEATURE } from "../../constants/admission-diagnostics";
import { ADMISSION_ERROR_CODE, type AdmissionErrorCode } from "../../constants/admission-errors";
import { admissionReadErrorMessage } from "../../constants/admission-read-errors";
import type { AdmissionFailure } from "../../application/results/admission-errors";

/** Closed page state for a failure, with read copy and no private cause. */
export type UnavailableAdmissionPage = { kind: "unavailable"; code: AdmissionErrorCode; message: string };

/** @param code - Semantic failure. @returns The closed unavailable page state with the read copy of the code. */
export function unavailableAdmissionPage(code: AdmissionErrorCode): UnavailableAdmissionPage {
  return { kind: "unavailable", code, message: admissionReadErrorMessage(code) };
}

/**
 * @param operation - Fixed loader operation.
 * @param requestHeaders - Incoming request headers, for native correlation.
 * @param options - Another owning feature (notifications) and safe identifiers of the page.
 * @returns Diagnostics that log server failures at error level, as the admission HTTP boundary does.
 */
export function createAdmissionPageDiagnostics(operation: string, requestHeaders?: Pick<Headers, "get">, options: { feature?: string; metadata?: Record<string, string> } = {}): ServerPageDiagnostics {
  return createServerPageDiagnostics({ feature: options.feature ?? ADMISSION_DIAGNOSTIC_FEATURE, operation, requestHeaders, metadata: options.metadata, isServerFailure: (code) => (ADMISSION_ERROR_HTTP_STATUS[code as AdmissionErrorCode] ?? HTTP_STATUS.serverError) >= HTTP_STATUS.serverError });
}

/**
 * @param page - Diagnostics, the read, its page contract, an optional projection and the fixed log messages.
 * @returns The own ready state, or an unavailable state with read copy; every failure is logged with its cause chain.
 */
export function loadAdmissionPageRead<State>(page: {
  diagnostics: ServerPageDiagnostics;
  read: () => Promise<{ ok: true; value: unknown } | { ok: false; failure: AdmissionFailure }>;
  stateSchema: z.ZodType<State>;
  project?: (value: unknown) => unknown;
  messages: ServerPageDiagnosticMessages;
}): Promise<State | UnavailableAdmissionPage> {
  return loadServerPageState<AdmissionErrorCode, State, UnavailableAdmissionPage>({
    ...page, unavailable: unavailableAdmissionPage,
    codes: { contractUnusable: ADMISSION_ERROR_CODE.publicContractUnusable, unexpectedFailure: ADMISSION_ERROR_CODE.unexpectedFailure },
  });
}
