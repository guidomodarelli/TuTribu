/** Defines current list reads and recoverable browser commands over owned middleend contracts only. @module allowlist-browser-client */
import type { z } from "zod";
import type { allowlistPageSchema } from "../results/allowlist-query-schemas";
import type { AllowlistEntryResult } from "../results/admission-resource-result";
import type { AllowlistBrowserQuery } from "../results/allowlist-page-state";
import type { AllowlistBrowserIntent } from "../commands/allowlist-browser-intent";
import type { AdmissionOperationRecoveryDto } from "../results/admission-operation-recovery";
import type { AllowlistMutationResult } from "../../domain/repositories/allowlist-management";
import type { AdmissionOperationResult } from "../../domain/entities/admission-operation";
import type { AdmissionErrorCode } from "../results/admission-errors";

export type AllowlistBrowserResult<Value> = { status: "ready"; value: Value } | { status: "failed"; code: AdmissionErrorCode; message: string; uncertain: boolean } | { status: "aborted" };
export interface AllowlistBrowserClient {
  viewer(signal: AbortSignal): Promise<AllowlistBrowserResult<{ id: string } | null>>;
  list(slug: string, query: AllowlistBrowserQuery, signal: AbortSignal): Promise<AllowlistBrowserResult<z.infer<typeof allowlistPageSchema>>>;
  read(slug: string, entryId: string, signal: AbortSignal): Promise<AllowlistBrowserResult<AllowlistEntryResult>>;
  write(slug: string, intent: AllowlistBrowserIntent, signal: AbortSignal): Promise<AllowlistBrowserResult<AdmissionOperationResult<AllowlistMutationResult>>>;
  operation(slug: string, operationId: string, signal: AbortSignal): Promise<AllowlistBrowserResult<AdmissionOperationRecoveryDto>>;
}
