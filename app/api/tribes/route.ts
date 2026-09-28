import { QUERY_PARAMS } from "@/src/constants/query-params";
import { ROUTES } from "@/src/constants/routes";
import { createTribePublicResponseSchema } from "@/src/modules/tribes/application/results/create-tribe-public-dto-schemas";
import {
  CREATE_TRIBE_ERROR_CODE,
  CREATE_TRIBE_ERROR_MESSAGE,
  CREATE_TRIBE_STATUS,
  type CreateTribePublicResponse,
  type CreateTribeResult,
} from "@/src/modules/tribes/application/results/create-tribe-result";
import { createRequestModules } from "@/src/modules/setup";
import {
  attachRequestIdToResponse,
  resolveRequestContext,
} from "@/src/modules/shared/infrastructure/observability/request-context";
import { createRedirectResponse } from "@/src/modules/shared/infrastructure/observability/route-response";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";
import { summarizeValidationIssues } from "@/src/modules/shared/infrastructure/validation/validation-issue-summary";

const TRIBE_FORM_FIELD = {
  name: "name",
  slug: "slug",
} as const;

const TRIBE_CREATE_ROUTE_LOG = {
  createFailureMessage: "Tribe creation failed",
  feature: "tribes",
  operation: "create-tribe",
  publicDtoRejectedMessage: "Tribe creation response rejected by its public contract",
  publicDtoRejectedReason: "public_dto_rejected",
} as const;

/**
 * Content negotiation of the enhanced form: the browser adapter asks for JSON,
 * while a native (no JavaScript) form post keeps the redirect flow.
 */
const TRIBE_CREATE_CONTENT_NEGOTIATION = {
  acceptHeader: "accept",
  jsonMediaType: "application/json",
} as const;

const TRIBE_CREATE_HTTP_STATUS = {
  created: 201,
  forbidden: 403,
  serverError: 500,
  slugConflict: 409,
  unauthenticated: 401,
  unprocessable: 422,
} as const;

type TribeCreateLogger = ReturnType<typeof createServerLogger>;

const UNEXPECTED_CREATE_TRIBE_RESPONSE = {
  message: CREATE_TRIBE_ERROR_MESSAGE[CREATE_TRIBE_ERROR_CODE.unexpected],
  status: CREATE_TRIBE_ERROR_CODE.unexpected,
} as const satisfies CreateTribePublicResponse;

function readStringFormValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function acceptsJsonResponse(request: Request): boolean {
  const acceptHeader =
    request.headers.get(TRIBE_CREATE_CONTENT_NEGOTIATION.acceptHeader) ?? "";

  return acceptHeader.includes(TRIBE_CREATE_CONTENT_NEGOTIATION.jsonMediaType);
}

function buildRedirectUrl(
  requestUrl: string,
  pathname: string,
  params?: Record<string, string | null | undefined>
): URL {
  const redirectUrl = new URL(pathname, requestUrl);

  if (!params) {
    return redirectUrl;
  }

  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      redirectUrl.searchParams.set(key, value);
    }
  });

  return redirectUrl;
}

function toSameOriginPath(url: URL): string {
  return url.pathname + url.search;
}

/**
 * Sends a JSON body after checking it against the public DTO schema. A body
 * that breaks the contract is logged without its values and replaced with the
 * safe unexpected-failure body.
 */
function createPublicJsonResponse(input: {
  body: CreateTribePublicResponse;
  logger: TribeCreateLogger;
  metadata: Record<string, unknown>;
  requestId: string;
  status: number;
}): Response {
  const parsedBody = createTribePublicResponseSchema.safeParse(input.body);

  if (!parsedBody.success) {
    input.logger.error({
      message: TRIBE_CREATE_ROUTE_LOG.publicDtoRejectedMessage,
      error: parsedBody.error,
      metadata: {
        ...input.metadata,
        issues: summarizeValidationIssues(parsedBody.error.issues),
        reason: TRIBE_CREATE_ROUTE_LOG.publicDtoRejectedReason,
      },
    });

    return attachRequestIdToResponse(
      Response.json(UNEXPECTED_CREATE_TRIBE_RESPONSE, {
        status: TRIBE_CREATE_HTTP_STATUS.serverError,
      }),
      input.requestId
    );
  }

  return attachRequestIdToResponse(
    Response.json(parsedBody.data, { status: input.status }),
    input.requestId
  );
}

/**
 * Maps the use-case result to the public JSON body and HTTP status of an
 * enhanced submission. Messages come from the module copy, never from the
 * use case, so the browser only receives safe Spanish text.
 */
function mapCreateTribeResultToPublicResponse(result: CreateTribeResult): {
  body: CreateTribePublicResponse;
  status: number;
} {
  switch (result.status) {
    case CREATE_TRIBE_STATUS.created:
      return {
        body: {
          redirectUrl: ROUTES.tribes.bySlug(result.slug),
          status: CREATE_TRIBE_STATUS.created,
        },
        status: TRIBE_CREATE_HTTP_STATUS.created,
      };
    case CREATE_TRIBE_STATUS.slugConflict:
      return {
        body: {
          message: CREATE_TRIBE_ERROR_MESSAGE[CREATE_TRIBE_STATUS.slugConflict],
          status: CREATE_TRIBE_STATUS.slugConflict,
          suggestedSlug: result.suggestedSlug,
        },
        status: TRIBE_CREATE_HTTP_STATUS.slugConflict,
      };
    case CREATE_TRIBE_STATUS.invalidName:
    case CREATE_TRIBE_STATUS.invalidSlug:
      return {
        body: {
          message: CREATE_TRIBE_ERROR_MESSAGE[result.status],
          status: result.status,
        },
        status: TRIBE_CREATE_HTTP_STATUS.unprocessable,
      };
    case CREATE_TRIBE_STATUS.notAllowed:
      return {
        body: {
          message: CREATE_TRIBE_ERROR_MESSAGE[CREATE_TRIBE_STATUS.notAllowed],
          status: CREATE_TRIBE_STATUS.notAllowed,
        },
        status: TRIBE_CREATE_HTTP_STATUS.forbidden,
      };
    default:
      return {
        body: UNEXPECTED_CREATE_TRIBE_RESPONSE,
        status: TRIBE_CREATE_HTTP_STATUS.serverError,
      };
  }
}

function createRedirectResponseForResult(input: {
  name: string;
  requestId: string;
  requestUrl: string;
  result: CreateTribeResult;
  slug: string;
}): Response {
  const { name, requestId, requestUrl, result, slug } = input;

  switch (result.status) {
    case CREATE_TRIBE_STATUS.created:
      return createRedirectResponse(
        buildRedirectUrl(requestUrl, ROUTES.tribes.bySlug(result.slug)),
        requestId
      );
    case CREATE_TRIBE_STATUS.slugConflict:
      return createRedirectResponse(
        buildRedirectUrl(requestUrl, ROUTES.tribes.create, {
          [QUERY_PARAMS.tribes.name]: name,
          [QUERY_PARAMS.tribes.slug]: slug,
          [QUERY_PARAMS.tribes.error]: result.status,
          [QUERY_PARAMS.tribes.suggestedSlug]: result.suggestedSlug,
        }),
        requestId
      );
    case CREATE_TRIBE_STATUS.invalidName:
    case CREATE_TRIBE_STATUS.invalidSlug:
    case CREATE_TRIBE_STATUS.notAllowed:
      return createRedirectResponse(
        buildRedirectUrl(requestUrl, ROUTES.tribes.create, {
          [QUERY_PARAMS.tribes.name]: name,
          [QUERY_PARAMS.tribes.slug]: slug,
          [QUERY_PARAMS.tribes.error]: result.status,
        }),
        requestId
      );
    default:
      return createRedirectResponse(
        buildRedirectUrl(requestUrl, ROUTES.tribes.create, {
          [QUERY_PARAMS.tribes.name]: name,
          [QUERY_PARAMS.tribes.slug]: slug,
          [QUERY_PARAMS.tribes.error]: CREATE_TRIBE_ERROR_CODE.unexpected,
        }),
        requestId
      );
  }
}

/**
 * Creates a tribe from the create-tribe form. A native form post (no
 * JavaScript) is answered with redirects; an enhanced submission that accepts
 * JSON gets a validated public DTO so the form can show errors inline.
 */
export async function POST(request: Request) {
  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: TRIBE_CREATE_ROUTE_LOG.feature,
    operation: TRIBE_CREATE_ROUTE_LOG.operation,
    requestId,
  });
  const respondsWithJson = acceptsJsonResponse(request);
  const formData = await request.formData();
  const name = readStringFormValue(formData.get(TRIBE_FORM_FIELD.name));
  const slug = readStringFormValue(formData.get(TRIBE_FORM_FIELD.slug));
  const modules = await createRequestModules();
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    const signInUrl = buildRedirectUrl(request.url, ROUTES.auth.signIn, {
      [QUERY_PARAMS.auth.callbackUrl]: ROUTES.tribes.create,
    });

    if (respondsWithJson) {
      return createPublicJsonResponse({
        body: {
          redirectUrl: toSameOriginPath(signInUrl),
          status: CREATE_TRIBE_ERROR_CODE.unauthenticated,
        },
        logger,
        metadata: {},
        requestId,
        status: TRIBE_CREATE_HTTP_STATUS.unauthenticated,
      });
    }

    return createRedirectResponse(signInUrl, requestId);
  }

  try {
    const result = await modules.tribes.useCases.createTribe({
      creatorEmail: authenticatedMember.email,
      creatorId: authenticatedMember.id,
      name,
      slug,
    });

    if (respondsWithJson) {
      const publicResponse = mapCreateTribeResultToPublicResponse(result);

      return createPublicJsonResponse({
        ...publicResponse,
        logger,
        metadata: { creatorId: authenticatedMember.id, slug },
        requestId,
      });
    }

    return createRedirectResponseForResult({
      name,
      requestId,
      requestUrl: request.url,
      result,
      slug,
    });
  } catch (error) {
    logger.error({
      message: TRIBE_CREATE_ROUTE_LOG.createFailureMessage,
      error,
      metadata: {
        creatorId: authenticatedMember.id,
        slug,
      },
    });

    if (respondsWithJson) {
      return attachRequestIdToResponse(
        Response.json(UNEXPECTED_CREATE_TRIBE_RESPONSE, {
          status: TRIBE_CREATE_HTTP_STATUS.serverError,
        }),
        requestId
      );
    }

    return createRedirectResponse(
      buildRedirectUrl(request.url, ROUTES.tribes.create, {
        [QUERY_PARAMS.tribes.name]: name,
        [QUERY_PARAMS.tribes.slug]: slug,
        [QUERY_PARAMS.tribes.error]: CREATE_TRIBE_ERROR_CODE.unexpected,
      }),
      requestId
    );
  }
}
