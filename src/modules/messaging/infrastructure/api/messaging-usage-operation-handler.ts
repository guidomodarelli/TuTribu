/** Exposes only original usage recovery for current leaders, independently of current policy. @module messaging-usage-operation-handler */
import "server-only";
import type { ReadMessagingUsageOperationUseCase } from "../../application/use-cases/read-messaging-usage-operation-use-case";
import type { MessagingUsagePolicyServices } from "./messaging-usage-policy-handlers";
import { messagingUsageOperationRecoverySchema } from "../../application/results/messaging-usage-operation-result";
import { createMessagingOperationReadHandler, MESSAGING_OPERATION_READ_INPUT } from "./messaging-operation-read-handler";
import { MESSAGING_HTTP_OPERATION } from "../../constants/messaging-http";

/** @param open - Native read-only services after input validation. @returns The actual original state, genuine absence or a closed current audience failure. */
export function createMessagingUsageOperationHandler(open: () => Promise<{ resolveTribe: MessagingUsagePolicyServices["resolveTribe"]; operation: Pick<ReadMessagingUsageOperationUseCase, "execute"> }>) {
  return createMessagingOperationReadHandler({
    ...MESSAGING_OPERATION_READ_INPUT, operation: MESSAGING_HTTP_OPERATION.usageOperationRead,
    respond: (boundary, value) => boundary.success(messagingUsageOperationRecoverySchema, value),
  }, open);
}
