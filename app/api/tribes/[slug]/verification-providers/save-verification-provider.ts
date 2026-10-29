/**
 * Shared create/update handler of verification providers (leader only).
 *
 * @module verification-provider-route-http
 */

import { handleAcademyRoute } from "@/app/api/tribes/[slug]/academy-route-scope";
import type { z } from "zod";

import { toVerificationProviderDto } from "@/src/modules/member-verifications/application/results/member-verification-dto-mappers";
import { ACADEMY_ROUTE_COPY } from "@/src/modules/product-access/constants/academy-route-copy";
import {
  ACADEMY_HTTP_STATUS,
  ACADEMY_ROUTE_MESSAGE,
  createAcademyJsonResponse,
} from "@/src/modules/product-access/infrastructure/api/academy-route-http";
import {
  verificationProviderBodySchema,
  verificationProviderParamsSchema,
} from "@/src/modules/product-access/infrastructure/api/academy-request-schemas";

const OPERATION = "verification-provider-save";

const SAVE_FAILURE_RESPONSE = {
  duplicate_key: { message: ACADEMY_ROUTE_COPY.duplicateProviderKey, status: ACADEMY_HTTP_STATUS.conflict },
  forbidden: { message: ACADEMY_ROUTE_MESSAGE.forbidden, status: ACADEMY_HTTP_STATUS.forbidden },
  invalid_input: { message: ACADEMY_ROUTE_MESSAGE.invalidInput, status: ACADEMY_HTTP_STATUS.badRequest },
  limit_reached: { message: ACADEMY_ROUTE_COPY.providerLimitReached, status: ACADEMY_HTTP_STATUS.conflict },
  not_found: { message: ACADEMY_ROUTE_MESSAGE.notFound, status: ACADEMY_HTTP_STATUS.notFound },
} as const;

export async function saveVerificationProviderFromRoute<TDto>(input: {
  context: { params: Promise<{ providerId: string | null; slug: string }> };
  dtoSchema: z.ZodType<TDto>;
  request: Request;
}): Promise<Response> {
  return handleAcademyRoute(
    input.request,
    input.context,
    {
      failureMessage: "Verification provider save failed",
      operation: OPERATION,
      schemas: { body: verificationProviderBodySchema, params: verificationProviderParamsSchema },
    },
    async ({ body, modules, params, requestId, respond }) => {
      const result = await modules.memberVerifications.useCases.saveVerificationProvider({
        ...body,
        correlationId: requestId,
        providerId: params.providerId,
        tribeSlug: params.slug,
      });

      if (result.status === "created" || result.status === "updated") {
        return respond(
          toVerificationProviderDto(result.provider),
          input.dtoSchema,
          result.status === "created" ? ACADEMY_HTTP_STATUS.created : ACADEMY_HTTP_STATUS.ok
        );
      }

      const failure = SAVE_FAILURE_RESPONSE[result.status];

      return createAcademyJsonResponse({ message: failure.message }, failure.status);
    }
  );
}
