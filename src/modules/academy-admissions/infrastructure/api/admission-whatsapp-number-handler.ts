/** Validates the own declared-number action once and guards its minimal original result. @module admission-whatsapp-number-handler */
import "server-only";
import type { UpdateAdmissionWhatsappNumberUseCase } from "../../application/use-cases/update-admission-whatsapp-number-use-case";
import type { ResolveAdmissionTribeUseCase } from "../../application/use-cases/resolve-admission-tribe-use-case";
import { createAdmissionOperationStateSchema } from "../../application/results/admission-flow-result-schemas";
import { admissionWhatsappNumberResultSchema } from "../../application/results/admission-writer-result-schemas";
import { admissionFailure } from "../../application/results/admission-errors";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { ADMISSION_WHATSAPP_HTTP_OPERATION } from "../../constants/admission-whatsapp-number";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { HTTP_STATUS } from "@/src/constants/http-status";
import { createAdmissionRouteBoundary } from "./admission-route-http";
import { openAdmissionTribeCommand } from "./admission-route-steps";
import { admissionRequestParamsSchema, admissionEmptyQuerySchema, admissionWhatsappNumberUpdateSchema } from "./admission-request-schemas";

/** Composition exposes only application operations, with no infrastructure or body-supplied actor. */
export type AdmissionWhatsappNumberServices = { resolveTribe: Pick<ResolveAdmissionTribeUseCase, "execute">; updateWhatsappNumber: Pick<UpdateAdmissionWhatsappNumberUseCase, "execute"> };

/** @param open - Native server composition selected after input and origin validation. @returns A same-origin handler that never dispatches a code or returns the private number. */
export function createAdmissionWhatsappNumberHandler(open: () => Promise<AdmissionWhatsappNumberServices>) {
  return async (request: Request, context: { params: Promise<{ slug: string; requestId: string }> }): Promise<Response> => {
    const boundary = createAdmissionRouteBoundary({ request, operation: ADMISSION_WHATSAPP_HTTP_OPERATION });
    try {
      const route = await openAdmissionTribeCommand(boundary, { request, params: context.params }, { params: admissionRequestParamsSchema, query: admissionEmptyQuerySchema, body: admissionWhatsappNumberUpdateSchema }, open);
      if ("response" in route) return route.response;
      const { body, params } = route, { tribeId, requestId } = route.scope;
      const result = await route.services.updateWhatsappNumber.execute({ ...body, tribeId, admissionRequestId: params.requestId, requestId });
      if (!result.ok) return boundary.failure(result.failure);
      const schema = createAdmissionOperationStateSchema(admissionWhatsappNumberResultSchema);
      const parsed = schema.safeParse(result.value);
      if (!parsed.success || parsed.data.operationId !== body.operationId || parsed.data.state === OPERATION_STATE.completed && (parsed.data.result.admissionRequestId.toLowerCase() !== params.requestId.toLowerCase() || parsed.data.result.version !== body.expectedVersion + (parsed.data.result.changed ? 1 : 0))) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.publicContractUnusable));
      return boundary.success(schema, parsed.data, parsed.data.state === OPERATION_STATE.started ? HTTP_STATUS.accepted : HTTP_STATUS.ok);
    } catch (error) { return boundary.unexpected(error); }
  };
}
