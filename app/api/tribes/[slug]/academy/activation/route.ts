/**
 * POST /api/tribes/[slug]/academy/activation — the active leader switches the
 * tribe to academy mode from the tribe settings. Current members keep full
 * access; admissions and sales start closed. A stale config version returns
 * 409 with the current settings.
 *
 * @module academy-activation-route
 */

import {
  createAcademyFailureResponse,
  handleAcademyRoute,
  type AcademyTribeRouteContext,
} from "@/app/api/tribes/[slug]/academy-route-scope";
import { toAcademySettingsDto } from "@/src/modules/product-access/application/results/academy-dto-mappers";
import { academySettingsDtoSchema } from "@/src/modules/product-access/application/results/academy-public-dto-schemas";
import { ACADEMY_HTTP_STATUS } from "@/src/modules/product-access/infrastructure/api/academy-route-http";
import {
  academyActivationBodySchema,
  academyTribeParamsSchema,
} from "@/src/modules/product-access/infrastructure/api/academy-request-schemas";

const OPERATION = "academy-activation";

const ACTIVATION_STATUS = {
  activated: ACADEMY_HTTP_STATUS.ok,
  already_academy: ACADEMY_HTTP_STATUS.ok,
  conflict: ACADEMY_HTTP_STATUS.conflict,
} as const;

export async function POST(request: Request, context: AcademyTribeRouteContext) {
  return handleAcademyRoute(
    request,
    context,
    {
      failureMessage: "Academy activation failed",
      operation: OPERATION,
      schemas: { body: academyActivationBodySchema, params: academyTribeParamsSchema },
    },
    async ({ body, logger, metadata, modules, params, respond }) => {
      const result = await modules.productAccess.useCases.activateAcademy({
        expectedConfigVersion: body.expectedConfigVersion,
        tribeSlug: params.slug,
      });

      if (
        result.status === "activated" ||
        result.status === "already_academy" ||
        result.status === "conflict"
      ) {
        logger.info({
          message: "Academy activation processed",
          metadata: { ...metadata, result: result.status },
        });

        return respond(
          toAcademySettingsDto(result.settings),
          academySettingsDtoSchema,
          ACTIVATION_STATUS[result.status]
        );
      }

      return createAcademyFailureResponse(result.status);
    }
  );
}
