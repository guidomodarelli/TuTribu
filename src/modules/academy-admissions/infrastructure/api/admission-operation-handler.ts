/** Queries only a genuine original operation through current account/owner authorization. @module admission-operation-handler */
import "server-only";
import type { AdmissionFailure } from "@/src/modules/academy-admissions/application/results/admission-errors";
import { admissionOperationRecoverySchema } from "@/src/modules/academy-admissions/application/results/admission-operation-recovery";
import { createAdmissionRouteBoundary } from "./admission-route-http";
import { admissionOperationParamsSchema, admissionEmptyQuerySchema } from "./admission-request-schemas";
import { ADMISSION_HTTP_OPERATION } from "@/src/modules/academy-admissions/constants/admission-http";
import { PERSONAL_INVITATION_VIEWER_HEADER, personalInvitationViewerMetadataSchema } from "../../constants/personal-invitation-browser";

type OperationServices = {
  resolveTribe: { execute(query: { slug: string; requestId: string }): Promise<{ ok: true; value: { tribeId: string } } | { ok: false; failure: AdmissionFailure }> };
  operation: { execute(query: { tribeId: string; operationId: string; requestId: string }, options?: { includeViewer: true }): Promise<{ ok: true; value: unknown; viewerId?: string } | { ok: false; failure: AdmissionFailure }> };
};

/** @param open - Server composition of current identity and readonly application ports. @returns Native GET handler, without claim/lease/crypto or mutation dependencies. */
export function createAdmissionOperationHandler(open: () => Promise<OperationServices>) {
  return async function GET(request: Request, context: { params: Promise<{ slug: string; operationId: string }> }): Promise<Response> {
    const boundary = createAdmissionRouteBoundary({ request, operation: ADMISSION_HTTP_OPERATION.operation });
    try {
      const params = boundary.input("params", admissionOperationParamsSchema, await context.params);
      if (!params.usable) return params.response;
      const query = boundary.input("query", admissionEmptyQuerySchema, Object.fromEntries(new URL(request.url).searchParams));
      if (!query.usable) return query.response;
      const services = await open(), requestId = boundary.requestContext.requestId;
      const identity = await services.resolveTribe.execute({ slug: params.value.slug, requestId });
      if (!identity.ok) return boundary.failure(identity.failure);
      const result = await services.operation.execute({ tribeId: identity.value.tribeId, operationId: params.value.operationId, requestId }, { includeViewer: true });
      if (!result.ok) return boundary.failure(result.failure);
      const response = boundary.success(admissionOperationRecoverySchema, result.value);
      if (result.viewerId !== undefined) response.headers.set(PERSONAL_INVITATION_VIEWER_HEADER, JSON.stringify(personalInvitationViewerMetadataSchema.parse({ viewerId: result.viewerId })));
      return response;
    } catch (error) { return boundary.unexpected(error); }
  };
}
