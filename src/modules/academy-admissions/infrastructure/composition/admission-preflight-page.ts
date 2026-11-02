/** Loads the informational activation preflight of the current leader for SSR, without granting activation. @module admission-preflight-page */
import "server-only";
import { z } from "zod";
import type { AdmissionPreflightServices } from "../api/admission-preflight-query-handler";
import type { AdmissionPolicyPreflightDto } from "../../application/ports/admission-policy-browser-client";
import { admissionPreflightResultSchema } from "../../application/results/admission-preflight-result-schema";
import { admissionTribeParamsSchema } from "../api/admission-request-schemas";
import { readWithinAdmissionTribe } from "./admission-page-loading";
import { createAdmissionPageDiagnostics } from "./admission-page-diagnostics";
import { loadServerPageState } from "@/src/modules/shared/infrastructure/observability/server-page-diagnostics";
import { ADMISSION_ERROR_CODE, type AdmissionErrorCode } from "../../constants/admission-errors";

const pageInputSchema = z.strictObject({ params: admissionTribeParamsSchema });
/** Fixed diagnostics of the informational preflight read. */
const ADMISSION_PREFLIGHT_PAGE_DIAGNOSTIC = { operation: "load_admission_preflight", readFailed: "Admission preflight read failed", contractRejected: "Admission preflight returned an unusable own state", loadFailed: "Admission preflight could not load safe state" } as const;

/**
 * @param input - Untrusted resolved route params.
 * @param open - Server-selected composition.
 * @param requestHeaders - Incoming request headers, for native correlation.
 * @returns The current preflight, or null when it cannot be read for this viewer (logged with its cause chain); the browser checks
 * again before activating.
 */
export async function loadAdmissionPreflightState(input: unknown, open: () => Promise<AdmissionPreflightServices>, requestHeaders?: Pick<Headers, "get">): Promise<AdmissionPolicyPreflightDto | null> {
  const parsed = pageInputSchema.safeParse(input);
  if (!parsed.success) return null;
  const diagnostics = createAdmissionPageDiagnostics(ADMISSION_PREFLIGHT_PAGE_DIAGNOSTIC.operation, requestHeaders);
  return loadServerPageState<AdmissionErrorCode, AdmissionPolicyPreflightDto, null>({
    diagnostics, stateSchema: admissionPreflightResultSchema, messages: ADMISSION_PREFLIGHT_PAGE_DIAGNOSTIC, unavailable: () => null,
    codes: { contractUnusable: ADMISSION_ERROR_CODE.publicContractUnusable, unexpectedFailure: ADMISSION_ERROR_CODE.unexpectedFailure },
    read: () => readWithinAdmissionTribe(open, { slug: parsed.data.params.slug, requestId: diagnostics.context.requestId }, (services, scope) => services.preflight.execute(scope)),
  });
}
