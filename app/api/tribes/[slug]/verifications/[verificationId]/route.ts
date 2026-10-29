/**
 * PATCH /api/tribes/[slug]/verifications/[verificationId] — reviewer decision
 * with the expected version (compare-and-swap). A decision taken on a state
 * that already changed returns 409 with the current state.
 *
 * @module tribe-verification-decision-route
 */

import {
  createAcademyFailureResponse,
  handleAcademyRoute,
  type AcademyRouteBody,
} from "@/app/api/tribes/[slug]/academy-route-scope";
import { toReviewQueueItemDto } from "@/src/modules/member-verifications/application/results/member-verification-dto-mappers";
import { reviewQueueItemDtoSchema } from "@/src/modules/member-verifications/application/results/member-verification-public-dto-schemas";
import { ACADEMY_ROUTE_COPY } from "@/src/modules/product-access/constants/academy-route-copy";
import {
  ACADEMY_HTTP_STATUS,
  createAcademyJsonResponse,
} from "@/src/modules/product-access/infrastructure/api/academy-route-http";
import {
  verificationDecisionBodySchema,
  verificationParamsSchema,
} from "@/src/modules/product-access/infrastructure/api/academy-request-schemas";

const OPERATION = "member-verification-decision";

const DECISION_STATUS = {
  conflict: ACADEMY_HTTP_STATUS.conflict,
  invalid_transition: ACADEMY_HTTP_STATUS.conflict,
  updated: ACADEMY_HTTP_STATUS.ok,
} as const;

type ReviewMemberVerificationResult = Awaited<
  ReturnType<
    AcademyRouteBody<unknown, unknown, unknown>["modules"]["memberVerifications"]["useCases"]["reviewMemberVerification"]
  >
>;

function createDecisionResultResponse(
  result: ReviewMemberVerificationResult,
  route: Pick<AcademyRouteBody<unknown, unknown, unknown>, "respond">
): Response {
  if (
    result.status === "updated" ||
    result.status === "conflict" ||
    result.status === "invalid_transition"
  ) {
    return route.respond(
      toReviewQueueItemDto(result.verification),
      reviewQueueItemDtoSchema,
      DECISION_STATUS[result.status],
      { result: result.status }
    );
  }

  if (result.status === "reason_required") {
    return createAcademyJsonResponse(
      { message: ACADEMY_ROUTE_COPY.reasonRequired },
      ACADEMY_HTTP_STATUS.unprocessable
    );
  }

  return createAcademyFailureResponse(result.status);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ slug: string; verificationId: string }> }
) {
  return handleAcademyRoute(
    request,
    context,
    {
      failureMessage: "Member verification decision failed",
      operation: OPERATION,
      readMetadata: ({ verificationId }) => ({ verificationId }),
      schemas: { body: verificationDecisionBodySchema, params: verificationParamsSchema },
    },
    async (route) => {
      const result = await route.modules.memberVerifications.useCases.reviewMemberVerification({
        correlationId: route.requestId,
        decision: route.body.decision,
        expectedVersion: route.body.expectedVersion,
        reason: route.body.reason,
        tribeSlug: route.params.slug,
        verificationId: route.params.verificationId,
      });

      return createDecisionResultResponse(result, route);
    }
  );
}
