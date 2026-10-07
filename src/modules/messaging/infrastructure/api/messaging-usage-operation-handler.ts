/** Exposes only original usage recovery for current leaders, independently of current policy and recency. @module messaging-usage-operation-handler */
import "server-only";
import { z } from "zod";
import type { ReadMessagingUsageOperationUseCase } from "../../application/use-cases/read-messaging-usage-operation-use-case";
import type { MessagingUsagePolicyServices } from "./messaging-usage-policy-handlers";
import { messagingTribeParamsSchema } from "./messaging-request-schemas";
import { messagingUsageOperationRecoverySchema } from "../../application/results/messaging-usage-operation-result";
import { createMessagingRouteBoundary } from "./messaging-route-http";
import { MESSAGING_ERROR_CODE } from "../../constants/messaging-errors";
import { messagingFailure } from "../../application/results/messaging-errors";
import { MESSAGING_HTTP_OPERATION } from "../../constants/messaging-http";

/** This boundary accepts an exact original UUID; caller actor, namespace and lease are forbidden. */
const operationParamsSchema = messagingTribeParamsSchema.extend({ operationId: z.uuid() }), emptyQuerySchema = z.strictObject({});
/** @param open - Native read-only services after input validation. @returns The actual original state, genuine absence or a closed current audience failure. */
export function createMessagingUsageOperationHandler(open: () => Promise<{ resolveTribe: MessagingUsagePolicyServices["resolveTribe"]; operation: Pick<ReadMessagingUsageOperationUseCase, "execute"> }>) {
  return async function GET(request: Request, context: { params: Promise<{ slug: string; operationId: string }> }): Promise<Response> {
    const boundary = createMessagingRouteBoundary({ request, operation: MESSAGING_HTTP_OPERATION.usageOperationRead });
    try {
      const params = boundary.input("params", operationParamsSchema, await context.params);
      if (!params.usable) return params.response;
      const query = boundary.input("query", emptyQuerySchema, Object.fromEntries(new URL(request.url).searchParams));
      if (!query.usable) return query.response;
      const services = await open(), requestId = boundary.requestContext.requestId;
      const tribe = await services.resolveTribe.execute({ slug: params.value.slug, requestId });
      if (!tribe.ok) return boundary.failure(messagingFailure(Object.values(MESSAGING_ERROR_CODE).find((code) => code === tribe.failure.code) ?? MESSAGING_ERROR_CODE.unexpectedFailure, { cause: tribe.failure }));
      const result = await services.operation.execute({ tribeId: tribe.value.tribeId, operationId: params.value.operationId, requestId });
      if (!result.ok) return boundary.failure(result.failure);
      return boundary.success(messagingUsageOperationRecoverySchema, result.value);
    } catch (error) { return boundary.unexpected(error); }
  };
}
