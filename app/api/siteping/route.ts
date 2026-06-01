import { createRequestModules } from "@/src/modules/setup";
import {
  SITEPING_FEEDBACK_STATUS,
  SITEPING_FEEDBACK_TYPE,
} from "@/src/modules/siteping/constants/siteping";
import type { SitepingDiagnosticsSnapshot } from "@/src/modules/siteping/domain/entities/siteping-diagnostics";
import { createRouteObservation } from "@/src/modules/shared/infrastructure/observability/route-observation";
import type {
  SitepingAnnotationCommand,
  SitepingFeedbackCommand,
} from "@/src/modules/siteping/application/commands/siteping-feedback-command";
import type {
  SitepingFeedbackStatus,
  SitepingFeedbackType,
} from "@/src/modules/siteping/domain/entities/siteping-feedback";

const SITEPING_ROUTE = {
  feature: "siteping",
  operation: "siteping-feedback",
} as const;

const SITEPING_ROUTE_RESPONSE = {
  forbiddenMessage: "No tenés permiso para usar SitePing.",
  invalidBodyMessage: "Revisá el feedback antes de enviarlo.",
  invalidQueryMessage: "Revisá los filtros de SitePing.",
  okMessage: "OK",
  unauthorizedMessage: "Iniciá sesión para enviar feedback.",
  unexpectedMessage: "No pudimos procesar el feedback. Intentá de nuevo.",
} as const;

const SITEPING_ROUTE_OUTCOME = {
  error: "error",
} as const;

const SITEPING_DIAGNOSTIC_LEVEL = {
  error: "error",
  info: "info",
  log: "log",
  warn: "warn",
} as const;

const HTTP_STATUS = {
  badRequest: 400,
  created: 201,
  forbidden: 403,
  ok: 200,
  serverError: 500,
  unauthorized: 401,
} as const;

const SITEPING_QUERY_PARAM = {
  limit: "limit",
  page: "page",
  search: "search",
  status: "status",
  type: "type",
  url: "url",
  urlPattern: "urlPattern",
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readRequiredText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isTextValue(value: unknown): value is string {
  return typeof value === "string";
}

function readOptionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isFeedbackType(value: unknown): value is SitepingFeedbackType {
  return Object.values(SITEPING_FEEDBACK_TYPE).includes(value as SitepingFeedbackType);
}

function isFeedbackStatus(value: unknown): value is SitepingFeedbackStatus {
  return Object.values(SITEPING_FEEDBACK_STATUS).includes(
    value as SitepingFeedbackStatus
  );
}

function isInvalidOptionalFeedbackType(value: string | null): boolean {
  return value !== null && !isFeedbackType(value);
}

function isInvalidOptionalFeedbackStatus(value: string | null): boolean {
  return value !== null && !isFeedbackStatus(value);
}

function readOptionalInteger(value: string | null): number | null | undefined {
  if (!value) {
    return undefined;
  }

  const parsedValue = Number(value);

  return Number.isFinite(parsedValue) && Number.isInteger(parsedValue)
    ? parsedValue
    : null;
}

function readRequiredNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isConsoleDiagnosticLevel(value: unknown): boolean {
  return Object.values(SITEPING_DIAGNOSTIC_LEVEL).includes(
    value as typeof SITEPING_DIAGNOSTIC_LEVEL[keyof typeof SITEPING_DIAGNOSTIC_LEVEL]
  );
}

function isConsoleDiagnosticEntry(value: unknown): boolean {
  return (
    isRecord(value) &&
    isConsoleDiagnosticLevel(value.level) &&
    Boolean(readRequiredText(value.message)) &&
    Boolean(readRequiredText(value.timestamp))
  );
}

function isNetworkDiagnosticEntry(value: unknown): boolean {
  return (
    isRecord(value) &&
    Boolean(readRequiredText(value.url)) &&
    Boolean(readRequiredText(value.method)) &&
    Boolean(readRequiredText(value.timestamp)) &&
    readRequiredNumber(value.status) !== null &&
    readRequiredNumber(value.durationMs) !== null
  );
}

function isDiagnosticsPayload(value: unknown): value is SitepingDiagnosticsSnapshot {
  return (
    isRecord(value) &&
    Array.isArray(value.console) &&
    Array.isArray(value.network) &&
    value.console.every(isConsoleDiagnosticEntry) &&
    value.network.every(isNetworkDiagnosticEntry)
  );
}

function isAnnotationPayload(value: unknown): value is SitepingAnnotationCommand {
  if (!isRecord(value) || !isRecord(value.anchor) || !isRecord(value.rect)) {
    return false;
  }

  return (
    Boolean(readRequiredText(value.anchor.cssSelector)) &&
    Boolean(readRequiredText(value.anchor.xpath)) &&
    isTextValue(value.anchor.textSnippet) &&
    Boolean(readRequiredText(value.anchor.elementTag)) &&
    Boolean(readRequiredText(value.anchor.fingerprint)) &&
    isTextValue(value.anchor.neighborText) &&
    isTextValue(value.anchor.textPrefix) &&
    isTextValue(value.anchor.textSuffix) &&
    readRequiredNumber(value.rect.xPct) !== null &&
    readRequiredNumber(value.rect.yPct) !== null &&
    readRequiredNumber(value.rect.wPct) !== null &&
    readRequiredNumber(value.rect.hPct) !== null &&
    readRequiredNumber(value.scrollX) !== null &&
    readRequiredNumber(value.scrollY) !== null &&
    readRequiredNumber(value.viewportW) !== null &&
    readRequiredNumber(value.viewportH) !== null &&
    readRequiredNumber(value.devicePixelRatio) !== null
  );
}

function parseFeedbackCommand(body: unknown): SitepingFeedbackCommand | null {
  if (!isRecord(body)) {
    return null;
  }

  const projectName = readRequiredText(body.projectName);
  const type = body.type;
  const message = readRequiredText(body.message);
  const url = readRequiredText(body.url);
  const viewport = readRequiredText(body.viewport);
  const userAgent = readRequiredText(body.userAgent);
  const authorName = readRequiredText(body.authorName);
  const authorEmail = readRequiredText(body.authorEmail);
  const clientId = readRequiredText(body.clientId);
  const diagnostics =
    body.diagnostics === undefined || body.diagnostics === null
      ? null
      : isDiagnosticsPayload(body.diagnostics)
        ? body.diagnostics
        : undefined;

  if (
    !projectName ||
    !isFeedbackType(type) ||
    !message ||
    !url ||
    !viewport ||
    !userAgent ||
    !authorName ||
    !authorEmail ||
    !clientId ||
    diagnostics === undefined ||
    !Array.isArray(body.annotations) ||
    !body.annotations.every(isAnnotationPayload)
  ) {
    return null;
  }

  return {
    annotations: body.annotations,
    authorEmail,
    authorName,
    clientId,
    diagnostics,
    message,
    projectName,
    screenshotDataUrl: readOptionalText(body.screenshotDataUrl),
    type,
    url,
    urlPattern: readOptionalText(body.urlPattern),
    userAgent,
    viewport,
  };
}

async function resolveAuthorizedModules() {
  const modules = await createRequestModules();
  const authenticatedMember = await modules.auth.useCases.getAuthenticatedMember();
  const memberTribes = authenticatedMember
    ? await modules.tribes.useCases.getMemberTribes()
    : [];
  const identity = modules.siteping.useCases.getIdentity({
    authenticatedMember,
    memberTribes,
  });

  return {
    authenticatedMember,
    identity,
    modules,
  };
}

async function createSitepingProjectModules(projectName: string) {
  return createRequestModules({
    sitepingProjectAdmin: true,
    sitepingProjectName: projectName,
  });
}

export function OPTIONS(request: Request) {
  const observation = createRouteObservation({
    feature: SITEPING_ROUTE.feature,
    operation: SITEPING_ROUTE.operation,
    request,
  });

  return observation.createJsonResponse(
    { message: SITEPING_ROUTE_RESPONSE.okMessage },
    HTTP_STATUS.ok
  );
}

export async function POST(request: Request) {
  const observation = createRouteObservation({
    feature: SITEPING_ROUTE.feature,
    operation: SITEPING_ROUTE.operation,
    request,
  });

  try {
    const { authenticatedMember, identity, modules } = await resolveAuthorizedModules();

    if (!authenticatedMember) {
      return observation.createJsonResponse(
        { message: SITEPING_ROUTE_RESPONSE.unauthorizedMessage },
        HTTP_STATUS.unauthorized
      );
    }

    if (!identity.enabled) {
      return observation.createJsonResponse(
        { message: SITEPING_ROUTE_RESPONSE.forbiddenMessage },
        HTTP_STATUS.forbidden
      );
    }

    const command = parseFeedbackCommand(await request.json().catch(() => null));

    if (!command) {
      return observation.createJsonResponse(
        { message: SITEPING_ROUTE_RESPONSE.invalidBodyMessage },
        HTTP_STATUS.badRequest
      );
    }

    const feedback = await modules.siteping.useCases.createFeedback({
      authenticatedMember,
      command: {
        ...command,
        projectName: identity.projectName,
      },
      requestUrl: request.url,
    });

    return observation.createJsonResponse(feedback, HTTP_STATUS.created);
  } catch (error) {
    observation.logRouteError({
      error,
      message: "Siteping feedback creation failed",
      outcome: SITEPING_ROUTE_OUTCOME.error,
      status: HTTP_STATUS.serverError,
    });

    return observation.createJsonResponse(
      { message: SITEPING_ROUTE_RESPONSE.unexpectedMessage },
      HTTP_STATUS.serverError
    );
  }
}

export async function GET(request: Request) {
  const observation = createRouteObservation({
    feature: SITEPING_ROUTE.feature,
    operation: SITEPING_ROUTE.operation,
    request,
  });

  try {
    const { authenticatedMember, identity } = await resolveAuthorizedModules();

    if (!authenticatedMember) {
      return observation.createJsonResponse(
        { message: SITEPING_ROUTE_RESPONSE.unauthorizedMessage },
        HTTP_STATUS.unauthorized
      );
    }

    if (!identity.enabled) {
      return observation.createJsonResponse(
        { message: SITEPING_ROUTE_RESPONSE.forbiddenMessage },
        HTTP_STATUS.forbidden
      );
    }

    const requestUrl = new URL(request.url);
    const type = requestUrl.searchParams.get(SITEPING_QUERY_PARAM.type);
    const status = requestUrl.searchParams.get(SITEPING_QUERY_PARAM.status);
    const limit = readOptionalInteger(
      requestUrl.searchParams.get(SITEPING_QUERY_PARAM.limit)
    );
    const page = readOptionalInteger(
      requestUrl.searchParams.get(SITEPING_QUERY_PARAM.page)
    );

    if (
      limit === null ||
      page === null ||
      isInvalidOptionalFeedbackStatus(status) ||
      isInvalidOptionalFeedbackType(type)
    ) {
      return observation.createJsonResponse(
        { message: SITEPING_ROUTE_RESPONSE.invalidQueryMessage },
        HTTP_STATUS.badRequest
      );
    }

    const projectModules = await createSitepingProjectModules(identity.projectName);
    const feedbackPage = await projectModules.siteping.useCases.listFeedback({
      limit,
      page,
      projectName: identity.projectName,
      search: requestUrl.searchParams.get(SITEPING_QUERY_PARAM.search) ?? undefined,
      status: isFeedbackStatus(status) ? status : undefined,
      type: isFeedbackType(type) ? type : undefined,
      url: requestUrl.searchParams.get(SITEPING_QUERY_PARAM.url) ?? undefined,
      urlPattern:
        requestUrl.searchParams.get(SITEPING_QUERY_PARAM.urlPattern) ?? undefined,
    });

    return observation.createJsonResponse(feedbackPage, HTTP_STATUS.ok);
  } catch (error) {
    observation.logRouteError({
      error,
      message: "Siteping feedback listing failed",
      outcome: SITEPING_ROUTE_OUTCOME.error,
      status: HTTP_STATUS.serverError,
    });

    return observation.createJsonResponse(
      { message: SITEPING_ROUTE_RESPONSE.unexpectedMessage },
      HTTP_STATUS.serverError
    );
  }
}

export async function PATCH(request: Request) {
  const observation = createRouteObservation({
    feature: SITEPING_ROUTE.feature,
    operation: SITEPING_ROUTE.operation,
    request,
  });

  try {
    const { authenticatedMember, identity } = await resolveAuthorizedModules();

    if (!authenticatedMember || !identity.enabled) {
      return observation.createJsonResponse(
        { message: SITEPING_ROUTE_RESPONSE.forbiddenMessage },
        HTTP_STATUS.forbidden
      );
    }

    const body: unknown = await request.json().catch(() => null);

    if (!isRecord(body) || !readRequiredText(body.id) || !isFeedbackStatus(body.status)) {
      return observation.createJsonResponse(
        { message: SITEPING_ROUTE_RESPONSE.invalidBodyMessage },
        HTTP_STATUS.badRequest
      );
    }

    const projectModules = await createSitepingProjectModules(identity.projectName);
    const feedback = await projectModules.siteping.useCases.updateFeedbackStatus({
      feedbackId: readRequiredText(body.id) as string,
      projectName: identity.projectName,
      status: body.status,
    });

    return observation.createJsonResponse(feedback, HTTP_STATUS.ok);
  } catch (error) {
    observation.logRouteError({
      error,
      message: "Siteping feedback status update failed",
      outcome: SITEPING_ROUTE_OUTCOME.error,
      status: HTTP_STATUS.serverError,
    });

    return observation.createJsonResponse(
      { message: SITEPING_ROUTE_RESPONSE.unexpectedMessage },
      HTTP_STATUS.serverError
    );
  }
}

export async function DELETE(request: Request) {
  const observation = createRouteObservation({
    feature: SITEPING_ROUTE.feature,
    operation: SITEPING_ROUTE.operation,
    request,
  });

  try {
    const { authenticatedMember, identity } = await resolveAuthorizedModules();

    if (!authenticatedMember || !identity.enabled) {
      return observation.createJsonResponse(
        { message: SITEPING_ROUTE_RESPONSE.forbiddenMessage },
        HTTP_STATUS.forbidden
      );
    }

    const body: unknown = await request.json().catch(() => null);

    if (!isRecord(body)) {
      return observation.createJsonResponse(
        { message: SITEPING_ROUTE_RESPONSE.invalidBodyMessage },
        HTTP_STATUS.badRequest
      );
    }

    if (body.deleteAll === true) {
      const projectModules = await createSitepingProjectModules(identity.projectName);

      await projectModules.siteping.useCases.deleteAllFeedback(identity.projectName);

      return observation.createJsonResponse(
        { message: SITEPING_ROUTE_RESPONSE.okMessage },
        HTTP_STATUS.ok
      );
    }

    const feedbackId = readRequiredText(body.id);

    if (!feedbackId) {
      return observation.createJsonResponse(
        { message: SITEPING_ROUTE_RESPONSE.invalidBodyMessage },
        HTTP_STATUS.badRequest
      );
    }

    const projectModules = await createSitepingProjectModules(identity.projectName);

    await projectModules.siteping.useCases.deleteFeedback({
      feedbackId,
      projectName: identity.projectName,
    });

    return observation.createJsonResponse(
      { message: SITEPING_ROUTE_RESPONSE.okMessage },
      HTTP_STATUS.ok
    );
  } catch (error) {
    observation.logRouteError({
      error,
      message: "Siteping feedback deletion failed",
      outcome: SITEPING_ROUTE_OUTCOME.error,
      status: HTTP_STATUS.serverError,
    });

    return observation.createJsonResponse(
      { message: SITEPING_ROUTE_RESPONSE.unexpectedMessage },
      HTTP_STATUS.serverError
    );
  }
}
