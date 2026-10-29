/**
 * Opens the request scope of the academy and verification route handlers
 * and runs their shared flow (input validation, safe log metadata, logged
 * 500).
 * It lives in the app layer because it composes the request modules
 * (composition root); module code never imports `@/src/modules/setup`.
 *
 * @module academy-route-scope
 */

import type { z } from "zod";

import { toAcademySettingsDto } from "@/src/modules/product-access/application/results/academy-dto-mappers";
import { academySettingsDtoSchema } from "@/src/modules/product-access/application/results/academy-public-dto-schemas";
import { ACADEMY_ROUTE_COPY } from "@/src/modules/product-access/constants/academy-route-copy";
import type { AcademySettingsMutationResult } from "@/src/modules/product-access/domain/repositories/product-access-repository";
import { createRequestModules } from "@/src/modules/setup";
import {
  ACADEMY_HTTP_STATUS,
  ACADEMY_ROUTE_LOG,
  ACADEMY_ROUTE_MESSAGE,
  createAcademyJsonResponse,
  createAcademyPublicResponse,
  createAcademyUnexpectedResponse,
  parseAcademyRouteInput,
  readAcademyJsonBody,
  readAcademyQuery,
  type ServerLogger,
} from "@/src/modules/product-access/infrastructure/api/academy-route-http";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

type RequestModules = Awaited<ReturnType<typeof createRequestModules>>;

export type AcademyRouteScope =
  | {
      isOpen: true;
      logger: ServerLogger;
      memberId: string;
      modules: RequestModules;
      requestId: string;
    }
  | { isOpen: false; response: Response };

/**
 * Opens the request scope of an academy route. Composition or session
 * failures (pool, configuration, auth outage) become a safe 500.
 *
 * @param input - Request and operation name for logs.
 * @returns The open scope or the response to return as is.
 */
export async function openAcademyRouteScope(input: {
  operation: string;
  request: Request;
}): Promise<AcademyRouteScope> {
  const { requestId } = resolveRequestContext(input.request.headers);
  const logger = createServerLogger({
    feature: ACADEMY_ROUTE_LOG.feature,
    operation: input.operation,
    requestId,
  });

  try {
    const modules = await createRequestModules({ requestId });
    const member = await modules.auth.useCases.getAuthenticatedMember();

    if (!member) {
      return {
        isOpen: false,
        response: createAcademyJsonResponse(
          { message: ACADEMY_ROUTE_MESSAGE.unauthorized },
          ACADEMY_HTTP_STATUS.unauthorized
        ),
      };
    }

    return { isOpen: true, logger, memberId: member.id, modules, requestId };
  } catch (error) {
    logger.error({ error, message: ACADEMY_ROUTE_LOG.scopeFailed, metadata: { requestId } });

    return {
      isOpen: false,
      response: createAcademyJsonResponse(
        { message: ACADEMY_ROUTE_MESSAGE.unexpected },
        ACADEMY_HTTP_STATUS.serverError
      ),
    };
  }
}

type OpenAcademyRouteScope = Extract<AcademyRouteScope, { isOpen: true }>;

/** Route context of the academy handlers keyed by the tribe slug. */
export type AcademyTribeRouteContext = { params: Promise<{ slug: string }> };

/** Typed input, scope and responders an academy route body receives. */
export type AcademyRouteBody<TParams, TQuery, TBody> = OpenAcademyRouteScope & {
  body: TBody;
  /** Safe log metadata: request id, tribe slug and the route ids. */
  metadata: Record<string, unknown>;
  params: TParams;
  query: TQuery;
  /**
   * Validates a success body against its public DTO schema and answers it,
   * logged (when unusable) with the route metadata plus the extra fields.
   */
  respond: <TDto>(
    body: unknown,
    schema: z.ZodType<TDto>,
    status: number,
    extraMetadata?: Record<string, unknown>
  ) => Response;
};

/** Description of one academy route handler. */
export type AcademyRouteDefinition<TParams, TQuery, TBody> = {
  /** Log message of an unexpected failure. */
  failureMessage: string;
  operation: string;
  /** Route ids logged after the request id and the tribe slug. */
  readMetadata?: (params: TParams) => Record<string, unknown>;
  schemas: {
    body?: z.ZodType<TBody>;
    params: z.ZodType<TParams>;
    query?: z.ZodType<TQuery>;
  };
};

const ACADEMY_FAILURE_STATUS_RESPONSE: Partial<
  Record<string, { message: string; status: number }>
> = {
  forbidden: { message: ACADEMY_ROUTE_MESSAGE.forbidden, status: ACADEMY_HTTP_STATUS.forbidden },
  invalid_input: {
    message: ACADEMY_ROUTE_MESSAGE.invalidInput,
    status: ACADEMY_HTTP_STATUS.badRequest,
  },
  not_academy: { message: ACADEMY_ROUTE_COPY.notAcademy, status: ACADEMY_HTTP_STATUS.conflict },
  sales_activation_disabled: {
    message: ACADEMY_ROUTE_COPY.salesActivationDisabled,
    status: ACADEMY_HTTP_STATUS.conflict,
  },
};

/**
 * Answers the shared failure statuses of the academy use cases (invalid
 * input, forbidden, not an academy, sales activation disabled); any other
 * status is a 404.
 *
 * @param status - Failure status of the use case.
 * @returns The private JSON response.
 */
export function createAcademyFailureResponse(status: string): Response {
  const failure = ACADEMY_FAILURE_STATUS_RESPONSE[status] ?? {
    message: ACADEMY_ROUTE_MESSAGE.notFound,
    status: ACADEMY_HTTP_STATUS.notFound,
  };

  return createAcademyJsonResponse({ message: failure.message }, failure.status);
}

/** 404 answered when the academy resource does not exist. */
export function createAcademyNotFoundResponse(): Response {
  return createAcademyJsonResponse(
    { message: ACADEMY_ROUTE_MESSAGE.notFound },
    ACADEMY_HTTP_STATUS.notFound
  );
}

/**
 * Answers an academy settings mutation: the settings DTO (200 when updated,
 * 409 on a version conflict) or the shared failure response.
 *
 * @param route - Academy route body (responder).
 * @param result - Settings mutation result of the use case.
 * @returns The route response.
 */
export function createAcademySettingsMutationResponse(
  route: Pick<AcademyRouteBody<unknown, unknown, unknown>, "respond">,
  result:
    | AcademySettingsMutationResult
    | { status: "invalid_input" | "sales_activation_disabled" }
): Response {
  if (result.status === "updated" || result.status === "conflict") {
    return route.respond(
      toAcademySettingsDto(result.settings),
      academySettingsDtoSchema,
      result.status === "updated" ? ACADEMY_HTTP_STATUS.ok : ACADEMY_HTTP_STATUS.conflict
    );
  }

  return createAcademyFailureResponse(result.status);
}

/**
 * Runs one academy route handler: scope (401/500), params, query and body
 * validation (400), the route body, and the logged safe 500 when it throws.
 *
 * @param request - Incoming request.
 * @param context - Route context with the raw params.
 * @param route - Operation, schemas, log metadata and failure message.
 * @param handle - Route body run with the typed input and scope.
 * @returns The route response.
 */
export async function handleAcademyRoute<
  TParams extends { slug: string },
  TQuery = undefined,
  TBody = undefined,
>(
  request: Request,
  context: { params: Promise<unknown> },
  route: AcademyRouteDefinition<TParams, TQuery, TBody>,
  handle: (route: AcademyRouteBody<TParams, TQuery, TBody>) => Promise<Response>
): Promise<Response> {
  const scope = await openAcademyRouteScope({ operation: route.operation, request });

  if (!scope.isOpen) {
    return scope.response;
  }

  const { logger } = scope;
  const params = parseAcademyRouteInput({
    logger,
    part: "params",
    schema: route.schemas.params,
    value: await context.params,
  });

  if (!params.isValid) {
    return params.response;
  }

  const query = route.schemas.query
    ? parseAcademyRouteInput({
        logger,
        part: "query",
        schema: route.schemas.query,
        value: readAcademyQuery(request),
      })
    : { data: undefined as TQuery, isValid: true as const };

  if (!query.isValid) {
    return query.response;
  }

  const body = route.schemas.body
    ? parseAcademyRouteInput({
        logger,
        part: "body",
        schema: route.schemas.body,
        value: await readAcademyJsonBody(request),
      })
    : { data: undefined as TBody, isValid: true as const };

  if (!body.isValid) {
    return body.response;
  }

  const metadata = {
    requestId: scope.requestId,
    tribeSlug: params.data.slug,
    ...route.readMetadata?.(params.data),
  };

  try {
    return await handle({
      ...scope,
      body: body.data,
      metadata,
      params: params.data,
      query: query.data,
      respond: (dto, schema, status, extraMetadata) =>
        createAcademyPublicResponse({
          body: dto,
          logger,
          metadata: extraMetadata ? { ...metadata, ...extraMetadata } : metadata,
          schema,
          status,
        }),
    });
  } catch (error) {
    return createAcademyUnexpectedResponse({
      error,
      logger,
      message: route.failureMessage,
      metadata,
    });
  }
}
