/** Queries only a genuine original operation through current account/owner authorization. @module admission-operation-handler */
import "server-only";
import type { AdmissionFailure } from "@/src/modules/academy-admissions/application/results/admission-errors";
import { admissionOperationRecoverySchema } from "@/src/modules/academy-admissions/application/results/admission-operation-recovery";
import type { AdmissionTribeRouting } from "@/src/modules/academy-admissions/application/use-cases/admission-tribe-scope";
import { createAdmissionRouteBoundary } from "./admission-route-http";
import { openAdmissionTribeRoute } from "./admission-route-steps";
import { admissionOperationParamsSchema, admissionEmptyQuerySchema } from "./admission-request-schemas";
import { ADMISSION_HTTP_OPERATION } from "@/src/modules/academy-admissions/constants/admission-http";
import { PERSONAL_INVITATION_VIEWER_HEADER, personalInvitationViewerMetadataSchema } from "../../constants/personal-invitation-browser";

type OperationServices = {
  resolveTribe: AdmissionTribeRouting;
  operation: { execute(query: { tribeId: string; operationId: string; requestId: string }, options?: { includeViewer: true }): Promise<{ ok: true; value: unknown; viewerId?: string } | { ok: false; failure: AdmissionFailure }> };
};

/** @param open - Server composition of current identity and readonly application ports. @returns Native GET handler, without claim/lease/crypto or mutation dependencies. */
export function createAdmissionOperationHandler(open: () => Promise<OperationServices>) {
  return async function GET(request: Request, context: { params: Promise<{ slug: string; operationId: string }> }): Promise<Response> {
    const boundary = createAdmissionRouteBoundary({ request, operation: ADMISSION_HTTP_OPERATION.operation });
    try {
      const route = await openAdmissionTribeRoute(boundary, { request, params: context.params }, { params: admissionOperationParamsSchema, query: admissionEmptyQuerySchema }, open);
      if ("response" in route) return route.response;
      const { tribeId, requestId } = route.scope;
      const result = await route.services.operation.execute({ tribeId, operationId: route.params.operationId, requestId }, { includeViewer: true });
      if (!result.ok) return boundary.failure(result.failure);
      const response = boundary.success(admissionOperationRecoverySchema, result.value);
      if (result.viewerId !== undefined) response.headers.set(PERSONAL_INVITATION_VIEWER_HEADER, JSON.stringify(personalInvitationViewerMetadataSchema.parse({ viewerId: result.viewerId })));
      return response;
    } catch (error) { return boundary.unexpected(error); }
  };
}
