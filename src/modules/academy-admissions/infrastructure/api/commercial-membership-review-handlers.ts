/** Validates the commercial membership review routes once and emits only own guarded DTOs. @module commercial-membership-review-handlers */
import "server-only";
import { z } from "zod";
import { type AdmissionFailure, admissionFailure  } from "../../application/results/admission-errors";
import type { ManageCommercialMembershipReviewsUseCases } from "../../application/use-cases/manage-commercial-membership-reviews-use-cases";
import { createAdmissionOperationStateSchema } from "../../application/results/admission-flow-result-schemas";
import { commercialMembershipResolutionResultSchema, commercialMembershipReviewListSchema } from "../../application/results/commercial-membership-review-schemas";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { ADMISSION_INPUT_CATEGORY } from "../../constants/admission-resources";
import { COMMERCIAL_MEMBERSHIP_DECISION, COMMERCIAL_MEMBERSHIP_REASON_MAX_CHARACTERS, COMMERCIAL_MEMBERSHIP_RECOVERY_STATUSES, COMMERCIAL_MEMBERSHIP_REVIEW_HTTP_OPERATION, COMMERCIAL_MEMBERSHIP_REVIEW_ROLES, COMMERCIAL_MEMBERSHIP_REVIEW_STATUSES, COMMERCIAL_MEMBERSHIP_REVIEW_STATUS_REASONS } from "../../constants/commercial-membership-review";
import { OPERATION_STATE } from "@/src/constants/operation-state";
import { HTTP_STATUS } from "@/src/constants/http-status";
import { createAdmissionRouteBoundary } from "./admission-route-http";
import { hasAllowedAdmissionOrigin } from "./admission-request-origin";
import { admissionTribeParamsSchema, admissionEmptyQuerySchema } from "./admission-request-schemas";

/** Route params of one membership decision; the member id is data, never authority. */
export const commercialMembershipParamsSchema = admissionTribeParamsSchema.extend({ memberId: z.uuid().transform((memberId) => memberId.toLowerCase()) });
/** One confirmed decision with the membership facts the leader saw; the server compares them under lock. */
export const commercialMembershipResolutionBodySchema = z.strictObject({
  operationId: z.uuid({ error: ADMISSION_INPUT_CATEGORY.operation }).transform((operationId) => operationId.toLowerCase()),
  confirmed: z.literal(true, { error: ADMISSION_INPUT_CATEGORY.confirmation }),
  decision: z.enum(COMMERCIAL_MEMBERSHIP_DECISION),
  expected: z.strictObject({
    role: z.enum(COMMERCIAL_MEMBERSHIP_REVIEW_ROLES), status: z.enum(COMMERCIAL_MEMBERSHIP_REVIEW_STATUSES),
    statusReason: z.enum(COMMERCIAL_MEMBERSHIP_REVIEW_STATUS_REASONS), recoveryStatus: z.enum(COMMERCIAL_MEMBERSHIP_RECOVERY_STATUSES).nullable(),
  }),
  reason: z.string().trim().max(COMMERCIAL_MEMBERSHIP_REASON_MAX_CHARACTERS).transform((reason) => reason || null).nullable().default(null),
});

/** Framework composition supplies only application ports. */
export type CommercialMembershipReviewServices = {
  resolveTribe: { execute(query: { slug: string; requestId: string }): Promise<{ ok: true; value: { tribeId: string } } | { ok: false; failure: AdmissionFailure }> };
  reviews: Pick<ManageCommercialMembershipReviewsUseCases, "read" | "resolve">;
};
const resolutionStateSchema = createAdmissionOperationStateSchema(commercialMembershipResolutionResultSchema);

/** @param open - Native server composition, after input/origin validation. @returns GET of pending cases and POST of one decision. */
export function createCommercialMembershipReviewHandlers(open: () => Promise<CommercialMembershipReviewServices>) {
  return {
    /** @param request - Native leader read. @param context - Framework params. @returns Pending cases without contact data. */
    async list(request: Request, context: { params: Promise<{ slug: string }> }): Promise<Response> {
      const boundary = createAdmissionRouteBoundary({ request, operation: COMMERCIAL_MEMBERSHIP_REVIEW_HTTP_OPERATION.list });
      try {
        const params = boundary.input("params", admissionTribeParamsSchema, await context.params);
        if (!params.usable) return params.response;
        const query = boundary.input("query", admissionEmptyQuerySchema, Object.fromEntries(new URL(request.url).searchParams));
        if (!query.usable) return query.response;
        const services = await open(), requestId = boundary.requestContext.requestId;
        const identity = await services.resolveTribe.execute({ slug: params.value.slug, requestId });
        if (!identity.ok) return boundary.failure(identity.failure);
        const result = await services.reviews.read({ tribeId: identity.value.tribeId, requestId });
        return result.ok ? boundary.success(commercialMembershipReviewListSchema, result.value) : boundary.failure(result.failure);
      } catch (error) { return boundary.unexpected(error); }
    },
    /** @param request - Same-origin confirmed decision. @param context - Framework params. @returns The original confirmed result or registered progress for this exact member. */
    async resolve(request: Request, context: { params: Promise<{ slug: string; memberId: string }> }): Promise<Response> {
      const boundary = createAdmissionRouteBoundary({ request, operation: COMMERCIAL_MEMBERSHIP_REVIEW_HTTP_OPERATION.resolve });
      try {
        if (!hasAllowedAdmissionOrigin(request)) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.permissionDenied));
        const params = boundary.input("params", commercialMembershipParamsSchema, await context.params);
        if (!params.usable) return params.response;
        const query = boundary.input("query", admissionEmptyQuerySchema, Object.fromEntries(new URL(request.url).searchParams));
        if (!query.usable) return query.response;
        const body = await boundary.readBody(commercialMembershipResolutionBodySchema);
        if (!body.usable) return body.response;
        const services = await open(), requestId = boundary.requestContext.requestId;
        const identity = await services.resolveTribe.execute({ slug: params.value.slug, requestId });
        if (!identity.ok) return boundary.failure(identity.failure);
        const result = await services.reviews.resolve({ ...body.value, memberId: params.value.memberId, tribeId: identity.value.tribeId, requestId });
        if (!result.ok) return boundary.failure(result.failure);
        const parsed = resolutionStateSchema.safeParse(result.value);
        if (!parsed.success || parsed.data.operationId !== body.value.operationId || parsed.data.state === OPERATION_STATE.completed && parsed.data.result.memberId !== params.value.memberId) return boundary.failure(admissionFailure(ADMISSION_ERROR_CODE.publicContractUnusable));
        return boundary.success(resolutionStateSchema, parsed.data, parsed.data.state === OPERATION_STATE.started ? HTTP_STATUS.accepted : HTTP_STATUS.ok);
      } catch (error) { return boundary.unexpected(error); }
    },
  };
}
