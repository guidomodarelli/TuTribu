/** Reads one original messaging operation by its exact UUID through the owned no-store boundary, without retry, leases or provider requests. @module messaging-operation-read-handler */
import "server-only";
import { z } from "zod";
import { messagingTribeRoutingFailure, type MessagingFailure } from "../../application/results/messaging-errors";
import type { MessagingUsagePolicyServices } from "./messaging-usage-policy-handlers";
import { messagingTribeParamsSchema } from "./messaging-request-schemas";
import { createMessagingRouteBoundary } from "./messaging-route-http";

type MessagingRouteBoundary = ReturnType<typeof createMessagingRouteBoundary>;
type TribeRouting = MessagingUsagePolicyServices["resolveTribe"];
type RoutingFailure = Extract<Awaited<ReturnType<TribeRouting["execute"]>>, { ok: false }>["failure"];

/** Native readonly services: canonical tribe routing and the original operation reader. */
type MessagingOperationReadServices<Value> = {
  resolveTribe: TribeRouting;
  operation: { execute(query: { tribeId: string; operationId: string; requestId: string }): Promise<{ ok: true; value: Value } | { ok: false; failure: MessagingFailure }> };
};

/** Route contract of one operation read: diagnostic operation, input schemas, routing denial and the guarded projection of the original. */
type MessagingOperationReadRoute<Value> = {
  operation: string;
  paramsSchema: z.ZodType<{ slug: string; operationId: string }>;
  querySchema: z.ZodType;
  routingFailure: (failure: RoutingFailure) => MessagingFailure;
  respond: (boundary: MessagingRouteBoundary, value: Value, operationId: string) => Response;
};

/** Input of the connection and usage operation reads: canonical route identity and an exact original UUID only (role, actor, namespace and lease filters are forbidden); an unroutable tribe keeps its cause. */
export const MESSAGING_OPERATION_READ_INPUT = {
  paramsSchema: messagingTribeParamsSchema.extend({ operationId: z.uuid() }),
  querySchema: z.strictObject({}),
  routingFailure: messagingTribeRoutingFailure,
};

/** @param route - Own route contract. @param open - Native readonly services after own route validation. @returns The GET handler answering the original state or a safe current denial. */
export function createMessagingOperationReadHandler<Value>(route: MessagingOperationReadRoute<Value>, open: () => Promise<MessagingOperationReadServices<Value>>) {
  /** @param request - Exact original UUID with no authority query. @param context - Own unresolved framework route. @returns No-store original state; even an own service cannot cross the requested UUID. */
  return async function GET(request: Request, context: { params: Promise<{ slug: string; operationId: string }> }): Promise<Response> {
    const boundary = createMessagingRouteBoundary({ request, operation: route.operation });
    try {
      const params = boundary.input("params", route.paramsSchema, await context.params);
      if (!params.usable) return params.response;
      const query = boundary.input("query", route.querySchema, Object.fromEntries(new URL(request.url).searchParams));
      if (!query.usable) return query.response;
      const services = await open(), requestId = boundary.requestContext.requestId;
      const tribe = await services.resolveTribe.execute({ slug: params.value.slug, requestId });
      if (!tribe.ok) return boundary.failure(route.routingFailure(tribe.failure));
      const outcome = await services.operation.execute({ tribeId: tribe.value.tribeId, operationId: params.value.operationId, requestId });
      if (!outcome.ok) return boundary.failure(outcome.failure);
      return route.respond(boundary, outcome.value, params.value.operationId);
    } catch (error) { return boundary.unexpected(error); }
  };
}
