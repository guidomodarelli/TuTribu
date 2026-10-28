/** Exposes one explicit DB-only batch through a scoped, private HTTP boundary. @module admission-batch-decision-handler */
import "server-only";
import type { z } from "zod";
import type { DecideAdmissionRequestsBatchUseCase } from "../../application/use-cases/decide-admission-requests-batch-use-case";
import type { ResolveAdmissionTribeUseCase } from "../../application/use-cases/resolve-admission-tribe-use-case";
import { admissionFailure } from "../../application/results/admission-errors";
import { admissionBatchResultSchema } from "../../application/results/admission-flow-result-schemas";
import { ADMISSION_HTTP_OPERATION } from "../../constants/admission-http";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { ADMISSION_BATCH_ITEM_STATUS, ADMISSION_DECISION } from "../../constants/admission-public-contract";
import { HTTP_STATUS } from "@/src/constants/http-status";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { createAdmissionRouteBoundary } from "./admission-route-http";
import { hasAllowedAdmissionOrigin } from "./admission-request-origin";
import { admissionTribeParamsSchema, admissionEmptyQuerySchema, admissionBatchDecisionSchema } from "./admission-request-schemas";

/** Composition supplies only canonical tenant routing and the atomic application owner. */
export type AdmissionBatchDecisionServices = {
  resolveTribe: Pick<ResolveAdmissionTribeUseCase, "execute">;
  decideBatch: Pick<DecideAdmissionRequestsBatchUseCase, "execute">;
};

/** Only the URL selects a tribe; request ids and expected versions belong to the explicit body selection. */
type AdmissionBatchDecisionContext = { params: Promise<{ slug: string }> };

/**
 * Creates the POST boundary without composing providers or accepting browser authority.
 * @param open - Lazy server composition, invoked only after the actual input boundary accepts all fields.
 * @returns A handler preserving confirmed, conflicting or genuinely unresolved original rows.
 */
export function createAdmissionBatchDecisionHandler(open: () => Promise<AdmissionBatchDecisionServices>) {
  /** @param request - Native same-origin explicit batch confirmation. @param context - Framework tenant params. @returns A minimal no-store original result or a safe Spanish failure. */
  return async (request: Request, context: AdmissionBatchDecisionContext): Promise<Response> => {
    const boundary = createAdmissionRouteBoundary({ request, operation: ADMISSION_HTTP_OPERATION.decideBatch });
    /** @returns A safe contract failure without publishing any row from an unrelated original. */
    const unusable = () => boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.publicContractUnusable));
    try {
      if (!hasAllowedAdmissionOrigin(request)) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.permissionDenied));
      const params = boundary.input("params", admissionTribeParamsSchema, await context.params);
      if (!params.usable) return params.response;
      const query = boundary.input("query", admissionEmptyQuerySchema, Object.fromEntries(new URL(request.url).searchParams));
      if (!query.usable) return query.response;
      const body = await boundary.readBody(admissionBatchDecisionSchema);
      if (!body.usable) return body.response;
      const services = await open(), requestId = boundary.requestContext.requestId;
      const tribe = await services.resolveTribe.execute({ slug: params.value.slug, requestId });
      if (!tribe.ok) return boundary.failure(tribe.failure);
      const result = await services.decideBatch.execute({
        operationId: body.value.operationId.toLowerCase(), confirmed: body.value.confirmed, decision: body.value.decision,
        internalReason: body.value.internalReason, externalMessage: body.value.externalMessage ?? null,
        tribeId: tribe.value.tribeId, requestId,
        items: body.value.items.map((item) => ({ admissionRequestId: item.requestId, expectedVersion: item.expectedVersion })),
      });
      if (!result.ok) return boundary.failure(result.failure);
      const parsed = admissionBatchResultSchema.safeParse(result.value);
      if (!parsed.success || !matchesBatchSelection(parsed.data, body.value)) return unusable();
      return boundary.success(admissionBatchResultSchema, parsed.data, parsed.data.state === OPERATION_STATE.started ? HTTP_STATUS.accepted : HTTP_STATUS.ok);
    } catch (error) { return boundary.unexpected(error); }
  };
}

/** @param result - Parsed own original. @param selection - Explicit confirmed body. @returns Whether the original names this operation and exactly the selected rows, each with the confirmed decision or a closed failure. */
function matchesBatchSelection(result: z.infer<typeof admissionBatchResultSchema>, selection: z.infer<typeof admissionBatchDecisionSchema>): boolean {
  if (result.operationId.toLowerCase() !== selection.operationId.toLowerCase() || result.items.length !== selection.items.length) return false;
  const remaining = new Set(selection.items.map((item) => item.requestId));
  for (const item of result.items) {
    if (!remaining.delete(item.requestId.toLowerCase()) || item.status === ADMISSION_BATCH_ITEM_STATUS.cancelled) return false;
    if (item.status === ADMISSION_BATCH_ITEM_STATUS.approved && selection.decision !== ADMISSION_DECISION.approve) return false;
    if (item.status === ADMISSION_BATCH_ITEM_STATUS.rejected && selection.decision !== ADMISSION_DECISION.reject) return false;
  }
  // A DB-only original either committed its complete row snapshot or has no confirmed row result yet.
  return result.state !== OPERATION_STATE.started || result.unresolvedCount === selection.items.length;
}
