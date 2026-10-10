/** Defines import interactions over own safe middleend contracts. @module allowlist-import-browser-client */
import type { AllowlistBrowserResult, AllowlistBrowserClient } from "./allowlist-browser-client";
import type { AdmissionOperationResult } from "../../domain/entities/admission-operation";
import type { AllowlistImportReference, AllowlistImportConfirmationResult } from "../../domain/repositories/allowlist-import-repository";
import type { AllowlistImportDto } from "../results/admission-management-result-schemas";
import type { AdmissionPolicyStateDto } from "../results/admission-policy-result-schemas";
import type { AllowlistImportBrowserIntent, AllowlistImportDraft } from "../commands/allowlist-import-browser-intent";

export interface AllowlistImportBrowserClient {
  viewer: AllowlistBrowserClient["viewer"];
  operation: AllowlistBrowserClient["operation"];
  policy(slug: string, signal: AbortSignal): Promise<AllowlistBrowserResult<AdmissionPolicyStateDto>>;
  read(slug: string, importId: string, signal: AbortSignal): Promise<AllowlistBrowserResult<AllowlistImportDto>>;
  write(slug: string, intent: AllowlistImportBrowserIntent, draft: AllowlistImportDraft | null, signal: AbortSignal): Promise<AllowlistBrowserResult<AdmissionOperationResult<AllowlistImportReference | AllowlistImportConfirmationResult>>>;
  file(slug: string, kind: "template" | "report", importId: string | null, signal: AbortSignal): Promise<AllowlistBrowserResult<{ blob: Blob; fileName: string }>>;
}
