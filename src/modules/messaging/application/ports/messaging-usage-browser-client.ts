/** Owns early usage browser transport without provider or session DTOs. @module messaging-usage-browser-client */
import type { MessagingErrorCode } from "../results/messaging-errors";
import type { MessagingUsagePolicyDto, MessagingUsagePolicyStateDto } from "../results/messaging-public-result-schemas";
import type { MessagingUsageOperationRecoveryDto } from "../results/messaging-usage-operation-result";
import type { AdmissionOperationResult } from "@/src/modules/academy-admissions/domain/entities/admission-operation";
import type { MessagingUsageUpdate } from "../../domain/repositories/messaging-usage-operations";
/** An ambiguous write retains its immutable local identity; cancellation never asserts rollback. */
export type MessagingUsageBrowserResult<Value> = { status: "ready"; value: Value } | { status: "failed"; code: MessagingErrorCode; message: string; uncertain: boolean } | { status: "aborted" };
export interface MessagingUsageBrowserClient {
  viewer(signal: AbortSignal): Promise<MessagingUsageBrowserResult<{ id: string } | null>>;
  read(slug: string, signal: AbortSignal): Promise<MessagingUsageBrowserResult<MessagingUsagePolicyStateDto>>;
  initialize(slug: string, input: { operationId: string; confirmed: true }, signal: AbortSignal): Promise<MessagingUsageBrowserResult<AdmissionOperationResult<MessagingUsagePolicyDto>>>;
  update(slug: string, input: MessagingUsageUpdate, signal: AbortSignal): Promise<MessagingUsageBrowserResult<AdmissionOperationResult<MessagingUsagePolicyDto>>>;
  operation(slug: string, operationId: string, signal: AbortSignal): Promise<MessagingUsageBrowserResult<MessagingUsageOperationRecoveryDto>>;
}
