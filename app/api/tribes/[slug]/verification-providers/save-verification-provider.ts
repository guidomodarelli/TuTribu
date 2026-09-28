/**
 * Shared create/update handler of verification providers (leader only).
 *
 * @module verification-provider-route-http
 */

import { openAcademyRouteScope } from "@/app/api/tribes/[slug]/academy-route-scope";
import type { z } from "zod";

import { toVerificationProviderDto } from "@/src/modules/member-verifications/application/results/member-verification-dto-mappers";
import { ACADEMY_ROUTE_COPY } from "@/src/modules/product-access/constants/academy-route-copy";
import {
  ACADEMY_HTTP_STATUS,
  ACADEMY_ROUTE_MESSAGE,
  createAcademyJsonResponse,
  createAcademyPublicResponse,
  createAcademyUnexpectedResponse,
  parseAcademyRouteInput,
  readAcademyJsonBody,
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
  const scope = await openAcademyRouteScope({ operation: OPERATION, request: input.request });

  if (!scope.isOpen) {
    return scope.response;
  }

  const params = parseAcademyRouteInput({
    logger: scope.logger,
    part: "params",
    schema: verificationProviderParamsSchema,
    value: await input.context.params,
  });

  if (!params.isValid) {
    return params.response;
  }

  const body = parseAcademyRouteInput({
    logger: scope.logger,
    part: "body",
    schema: verificationProviderBodySchema,
    value: await readAcademyJsonBody(input.request),
  });

  if (!body.isValid) {
    return body.response;
  }

  const metadata = { requestId: scope.requestId, tribeSlug: params.data.slug };

  try {
    const result = await scope.modules.memberVerifications.useCases.saveVerificationProvider({
      ...body.data,
      correlationId: scope.requestId,
      providerId: params.data.providerId,
      tribeSlug: params.data.slug,
    });

    if (result.status === "created" || result.status === "updated") {
      return createAcademyPublicResponse({
        body: toVerificationProviderDto(result.provider),
        logger: scope.logger,
        metadata,
        schema: input.dtoSchema,
        status: result.status === "created" ? ACADEMY_HTTP_STATUS.created : ACADEMY_HTTP_STATUS.ok,
      });
    }

    const failure = SAVE_FAILURE_RESPONSE[result.status];

    return createAcademyJsonResponse({ message: failure.message }, failure.status);
  } catch (error) {
    return createAcademyUnexpectedResponse({
      error,
      logger: scope.logger,
      message: "Verification provider save failed",
      metadata,
    });
  }
}
