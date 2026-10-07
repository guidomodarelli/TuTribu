/** Keeps historical direct entry closed after cutover and routes explicit requests through admission. @module academy-join-handler */
import "server-only";
import { z } from "zod";
import type { RequestAcademyAdmissionCommand } from "@/src/modules/tribes/domain/repositories/academy-admission-entry";
import type { TribeAcademyAdmissionStatus } from "@/src/modules/tribes/domain/repositories/tribe-academy-admission-repository";
import type { AcademyPublicOffer } from "@/src/modules/product-access/domain/repositories/product-access-repository";
import type { AdmissionMutationServices } from "./admission-mutation-handlers";
import { admissionTribeParamsSchema, admissionEmptyQuerySchema, admissionSubmissionSchema } from "./admission-request-schemas";
import { createAdmissionRouteBoundary } from "./admission-route-http";
import { hasAllowedAdmissionOrigin } from "./admission-request-origin";
import { respondToAdmissionSubmission } from "./admission-submission-response";
import { admissionFailure } from "@/src/modules/academy-admissions/application/results/admission-errors";
import { ADMISSION_HTTP_OPERATION } from "@/src/modules/academy-admissions/constants/admission-http";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { ACADEMY_ROUTE_COPY } from "@/src/modules/product-access/constants/academy-route-copy";
import { HTTP_STATUS } from "@/src/constants/http-status";
import { legacyAcademyJoinSchema } from "@/src/modules/academy-admissions/application/results/academy-entry-result";

/** An empty historical body does not authorize a new admission request. */
const joinBodySchema = z.union([
  admissionSubmissionSchema.transform((intent) => ({ explicit: true as const, intent })),
  z.strictObject({}).transform(() => ({ explicit: false as const })),
]);
const legacyResponse = {
  admission_closed: { message: ACADEMY_ROUTE_COPY.admissionClosed, status: HTTP_STATUS.forbidden },
  already_member: { message: ACADEMY_ROUTE_COPY.alreadyMember, status: HTTP_STATUS.ok },
  blocked: { message: ACADEMY_ROUTE_COPY.blocked, status: HTTP_STATUS.forbidden },
  joined: { message: ACADEMY_ROUTE_COPY.joined, status: HTTP_STATUS.created },
} as const;

/** Composition binds both paths to the current native actor, never a body role/account. */
export type AcademyJoinServices = {
  getViewer(): Promise<{ id: string } | null>;
  offer(query: { tribeSlug: string }): Promise<AcademyPublicOffer | null>;
  joinEntry(command: RequestAcademyAdmissionCommand): ReturnType<AdmissionMutationServices["submit"]["execute"]>;
  joinLegacy(command: { tribeSlug: string }): Promise<{ status: TribeAcademyAdmissionStatus }>;
};

/** @param open - Native server-selected application wiring. @returns One validated historical/explicit admission handler with no fictitious membership. */
export function createAcademyJoinHandler(open: () => Promise<AcademyJoinServices>) {
  return async (request: Request, context: { params: Promise<{ slug: string }> }): Promise<Response> => {
    const boundary = createAdmissionRouteBoundary({ request, operation: ADMISSION_HTTP_OPERATION.legacyJoin });
    try {
      if (!hasAllowedAdmissionOrigin(request)) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.permissionDenied));
      const params = boundary.input("params", admissionTribeParamsSchema, await context.params);
      if (!params.usable) return params.response;
      const query = boundary.input("query", admissionEmptyQuerySchema, Object.fromEntries(new URL(request.url).searchParams));
      if (!query.usable) return query.response;
      const body = await boundary.readBody(joinBodySchema, { emptyBodyValue: {} });
      if (!body.usable) return body.response;
      const services = await open();
      if (!await services.getViewer()) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.authenticationRequired));
      if (body.value.explicit) {
        const result = await services.joinEntry({ ...body.value.intent, tribeSlug: params.value.slug, requestId: boundary.requestContext.requestId });
        return respondToAdmissionSubmission(boundary, params.value.slug, body.value.intent.operationId, result);
      }
      const offer = await services.offer({ tribeSlug: params.value.slug });
      if (offer?.admissionRequiresRequest) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.invalidInput));
      const result = await services.joinLegacy({ tribeSlug: params.value.slug });
      const response = legacyResponse[result.status];
      return boundary.success(legacyAcademyJoinSchema, { status: result.status, message: response.message }, response.status);
    } catch (error) { return boundary.unexpected(error); }
  };
}
