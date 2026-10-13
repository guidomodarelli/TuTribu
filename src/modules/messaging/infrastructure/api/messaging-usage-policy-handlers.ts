/** Adapts early usage configuration independently of connections, providers and admission policy. @module messaging-usage-policy-handlers */
import "server-only";
import { z } from "zod";
import type { ManageMessagingUsageUseCases } from "../../application/use-cases/manage-messaging-usage-use-cases";
import type { AdmissionFailure } from "@/src/modules/academy-admissions/application/results/admission-errors";
import { messagingFailure } from "../../application/results/messaging-errors";
import { messagingUsagePolicyStateSchema, messagingUsagePolicySchema } from "../../application/results/messaging-public-result-schemas";
import { createAdmissionOperationStateSchema } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";
import { createMessagingRouteBoundary } from "./messaging-route-http";
import { messagingTribeParamsSchema, messagingUsagePolicyCreateSchema, messagingUsagePolicyUpdateSchema } from "./messaging-request-schemas";
import { hasAllowedRequestOrigin } from "@/src/modules/shared/infrastructure/http/has-allowed-request-origin";
import { MESSAGING_ERROR_CODE } from "../../constants/messaging-errors";
import { MESSAGING_HTTP_OPERATION } from "../../constants/messaging-http";
import { HTTP_STATUS } from "@/src/constants/http-status";
import { OPERATION_STATE } from "@/src/constants/operation-state";

/** The resolver is read-only; usage derives account, canonical leadership and exact recency server-side. */
export type MessagingUsagePolicyServices = {
  resolveTribe: { execute(query: { slug: string; requestId: string }): Promise<{ ok: true; value: { tribeId: string } } | { ok: false; failure: AdmissionFailure }> };
  usage: Pick<ManageMessagingUsageUseCases, "read" | "initialize" | "update">;
};
type UsageRouteContext = { params: Promise<{ slug: string }> };
type UsageCommandScope = { tribeId: string; requestId: string };
type UsageCommandResult = Awaited<ReturnType<ManageMessagingUsageUseCases["initialize"]>>;
/** Own input has no filtering, browser actor or operational authority. */
const emptyQuerySchema = z.strictObject({});

/** @param open - Native request composition after validation. @returns Read and explicit initialize/update boundaries without provider calls or implicit writes. */
export function createMessagingUsagePolicyHandlers(open: () => Promise<MessagingUsagePolicyServices>) {
  /** Resolves only canonical routing identity and maps its closed failure to this feature's public vocabulary. */
  async function resolveScope(services: MessagingUsagePolicyServices, slug: string, requestId: string) {
    const identity = await services.resolveTribe.execute({ slug, requestId });
    if (identity.ok) return identity;
    const code = Object.values(MESSAGING_ERROR_CODE).find((candidate) => candidate === identity.failure.code) ?? MESSAGING_ERROR_CODE.unexpectedFailure;
    return { ok: false as const, failure: messagingFailure(code, { cause: identity.failure }) };
  }

  /** Writes preserve original operation identity; version CAS and replay remain owned by persistence. */
  async function command<Input extends { operationId: string }>(request: Request, context: UsageRouteContext, operation: string, schema: z.ZodType<Input>, execute: (services: MessagingUsagePolicyServices, input: Input & UsageCommandScope) => Promise<UsageCommandResult>): Promise<Response> {
    const boundary = createMessagingRouteBoundary({ request, operation });
    try {
      if (!hasAllowedRequestOrigin(request)) return boundary.failure(messagingFailure(MESSAGING_ERROR_CODE.permissionDenied));
      const params = boundary.input("params", messagingTribeParamsSchema, await context.params);
      if (!params.usable) return params.response;
      const query = boundary.input("query", emptyQuerySchema, Object.fromEntries(new URL(request.url).searchParams));
      if (!query.usable) return query.response;
      const body = await boundary.readBody(schema);
      if (!body.usable) return body.response;
      const services = await open(), requestId = boundary.requestContext.requestId;
      const identity = await resolveScope(services, params.value.slug, requestId);
      if (!identity.ok) return boundary.failure(identity.failure);
      const result = await execute(services, { ...body.value, tribeId: identity.value.tribeId, requestId });
      if (!result.ok) return boundary.failure(result.failure);
      const resultSchema = createAdmissionOperationStateSchema(messagingUsagePolicySchema), projected = resultSchema.safeParse(result.value);
      if (!projected.success || projected.data.operationId.toLowerCase() !== body.value.operationId.toLowerCase()) return boundary.failure(messagingFailure(MESSAGING_ERROR_CODE.publicContractUnusable));
      if (projected.data.state === OPERATION_STATE.completed && "expectedVersion" in body.value && typeof body.value.expectedVersion === "number"
        && projected.data.result.version !== body.value.expectedVersion && projected.data.result.version !== body.value.expectedVersion + 1) return boundary.failure(messagingFailure(MESSAGING_ERROR_CODE.publicContractUnusable));
      return boundary.success(resultSchema, projected.data, projected.data.state === OPERATION_STATE.started ? HTTP_STATUS.accepted : HTTP_STATUS.ok);
    } catch (error) { return boundary.unexpected(error); }
  }

  return {
    /** @param request - Native input. @param context - Current framework params. @returns True absence or the current own DTO, with no initialization or recency requirement. */
    async read(request: Request, context: UsageRouteContext): Promise<Response> {
      const boundary = createMessagingRouteBoundary({ request, operation: MESSAGING_HTTP_OPERATION.usageRead });
      try {
        const params = boundary.input("params", messagingTribeParamsSchema, await context.params);
        if (!params.usable) return params.response;
        const query = boundary.input("query", emptyQuerySchema, Object.fromEntries(new URL(request.url).searchParams));
        if (!query.usable) return query.response;
        const services = await open(), requestId = boundary.requestContext.requestId;
        const identity = await resolveScope(services, params.value.slug, requestId);
        if (!identity.ok) return boundary.failure(identity.failure);
        const result = await services.usage.read({ tribeId: identity.value.tribeId, requestId });
        return result.ok ? boundary.success(messagingUsagePolicyStateSchema, result.value) : boundary.failure(result.failure);
      } catch (error) { return boundary.unexpected(error); }
    },
    /** @param request - Explicit confirmed initialization. @param context - Canonical framework params. @returns Original defaults/existing resource without a caller-chosen version or reset. */
    initialize: (request: Request, context: UsageRouteContext) => command(request, context, MESSAGING_HTTP_OPERATION.usageInitialize, messagingUsagePolicyCreateSchema, (services, input) => services.usage.initialize(input)),
    /** @param request - Once-validated countries/quotas/version. @param context - Canonical framework params. @returns Original CAS/no-op outcome or registered progress; quota history is never reset. */
    update: (request: Request, context: UsageRouteContext) => command(request, context, MESSAGING_HTTP_OPERATION.usageUpdate, messagingUsagePolicyUpdateSchema, (services, input) => services.usage.update(input)),
  };
}
