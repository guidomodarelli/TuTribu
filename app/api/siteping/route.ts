import { createRequestModules } from "@/src/modules/setup";
import {
  SITEPING_FEEDBACK_STATUS,
  SITEPING_FEEDBACK_TYPE,
  SITEPING_WIDGET_CAPABILITIES,
  SITEPING_WIDGET_LIST_PERMISSIONS,
} from "@/src/modules/siteping/constants/siteping";
import type { SitepingDiagnosticsSnapshot } from "@/src/modules/siteping/domain/entities/siteping-diagnostics";
import { createRouteObservation } from "@/src/modules/shared/infrastructure/observability/route-observation";
import type { SitepingAnnotationCommand, SitepingFeedbackCommand } from "@/src/modules/siteping/application/commands/siteping-feedback-command";
import type {
  SitepingFeedbackStatus,
  SitepingFeedbackType,
} from "@/src/modules/siteping/domain/entities/siteping-feedback";
import { HTTP_STATUS } from "@/app/api/route-http-status";
import { isPayloadObject, readTrimmedText } from "@/app/api/request-body-fields";

const SITEPING_ROUTE = {
  feature: "siteping",
  operation: "siteping-feedback",
} as const;

const SITEPING_ROUTE_RESPONSE = {
  forbiddenMessage: "No tenés permiso para usar SitePing.",
  invalidBodyMessage: "Revisá el feedback antes de enviarlo.",
  invalidQueryMessage: "Revisá los filtros de SitePing.",
  notFoundMessage: "El feedback ya no está disponible.",
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

const SITEPING_QUERY_PARAM = {
  limit: "limit",
  page: "page",
  search: "search",
  status: "status",
  type: "type",
  url: "url",
  urlPattern: "urlPattern",
} as const;

type SitepingAnnotationRequestPayload = SitepingAnnotationCommand;

function isTextValue(value: unknown): value is string {
  return typeof value === "string";
}

const SITEPING_SCREENSHOT = {
  // SitePing captures the annotated area as a base64 image `data:` URL.
  dataUrlPrefix: "data:image/",
  // Cap the persisted data URL length so an oversized capture is dropped
  // instead of bloating the database or the panel list response.
  maxLength: 2_000_000,
} as const;

/**
 * Accepts the SitePing screenshot only when it is a base64 image `data:` URL
 * within the size cap; otherwise drops it so the feedback still saves without it.
 */
function readScreenshotDataUrl(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  const isImageDataUrl = trimmed.startsWith(SITEPING_SCREENSHOT.dataUrlPrefix);
  const isWithinSizeCap = trimmed.length <= SITEPING_SCREENSHOT.maxLength;
  return isImageDataUrl && isWithinSizeCap ? trimmed : null;
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
    isPayloadObject(value) &&
    isConsoleDiagnosticLevel(value.level) &&
    Boolean(readTrimmedText(value.message)) &&
    Boolean(readTrimmedText(value.timestamp))
  );
}

function isNetworkDiagnosticEntry(value: unknown): boolean {
  return (
    isPayloadObject(value) &&
    Boolean(readTrimmedText(value.url)) &&
    Boolean(readTrimmedText(value.method)) &&
    Boolean(readTrimmedText(value.timestamp)) &&
    readRequiredNumber(value.status) !== null &&
    readRequiredNumber(value.durationMs) !== null
  );
}

function isDiagnosticsPayload(value: unknown): value is SitepingDiagnosticsSnapshot {
  return (
    isPayloadObject(value) &&
    Array.isArray(value.console) &&
    Array.isArray(value.network) &&
    value.console.every(isConsoleDiagnosticEntry) &&
    value.network.every(isNetworkDiagnosticEntry)
  );
}

function isAnnotationPayload(value: unknown): value is SitepingAnnotationRequestPayload {
  if (!isPayloadObject(value) || !isPayloadObject(value.anchor) || !isPayloadObject(value.rect)) {
    return false;
  }

  return (
    Boolean(readTrimmedText(value.anchor.cssSelector)) &&
    Boolean(readTrimmedText(value.anchor.xpath)) &&
    isTextValue(value.anchor.textSnippet) &&
    Boolean(readTrimmedText(value.anchor.elementTag)) &&
    Boolean(readTrimmedText(value.anchor.fingerprint)) &&
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

function normalizeAnnotationPayload(
  annotation: SitepingAnnotationRequestPayload
): SitepingAnnotationCommand {
  const { elementId, ...anchor } = annotation.anchor;

  return {
    ...annotation,
    anchor: {
      ...anchor,
      ...(typeof elementId === "string" ? { elementId } : {}),
    },
  };
}

/**
 * Optional diagnostics snapshot: `null` when absent, `undefined` when present
 * but malformed (the command is then rejected).
 */
function readDiagnostics(value: unknown): SitepingDiagnosticsSnapshot | null | undefined {
  if (value === undefined || value === null) {
    return null;
  }

  return isDiagnosticsPayload(value) ? value : undefined;
}

function parseFeedbackCommand(body: unknown): SitepingFeedbackCommand | null {
  if (!isPayloadObject(body)) {
    return null;
  }

  const projectName = readTrimmedText(body.projectName);
  const type = body.type;
  const message = readTrimmedText(body.message);
  const url = readTrimmedText(body.url);
  const viewport = readTrimmedText(body.viewport);
  const userAgent = readTrimmedText(body.userAgent);
  const authorName = readTrimmedText(body.authorName);
  const authorEmail = readTrimmedText(body.authorEmail);
  const clientId = readTrimmedText(body.clientId);
  const diagnostics = readDiagnostics(body.diagnostics);

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
    annotations: body.annotations.map(normalizeAnnotationPayload),
    authorEmail,
    authorName,
    clientId,
    diagnostics,
    message,
    projectName,
    screenshotDataUrl: readScreenshotDataUrl(body.screenshotDataUrl),
    type,
    url,
    urlPattern: readTrimmedText(body.urlPattern),
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

/** How a siteping route answers a viewer without widget access. */
const SITEPING_SESSION_GUARD = {
  /** 403 for both missing session and disabled widget. */
  forbidden: "forbidden",
  /** 401 without session, 403 when the widget is disabled. */
  splitUnauthorized: "split-unauthorized",
} as const;

type SitepingSessionGuard = (typeof SITEPING_SESSION_GUARD)[keyof typeof SITEPING_SESSION_GUARD];
type AuthorizedSitepingScope = Awaited<ReturnType<typeof resolveAuthorizedModules>>;

/**
 * Runs one siteping handler: observed request, widget access guard, the
 * route body and the logged safe 500 when anything throws.
 */
async function handleSitepingRoute(
  request: Request,
  route: { failureLogMessage: string; guard: SitepingSessionGuard },
  handle: (
    scope: AuthorizedSitepingScope & {
      authenticatedMember: NonNullable<AuthorizedSitepingScope["authenticatedMember"]>;
      respond: (body: unknown, status: number) => Response;
    }
  ) => Promise<Response>
): Promise<Response> {
  const observation = createRouteObservation({
    feature: SITEPING_ROUTE.feature,
    operation: SITEPING_ROUTE.operation,
    request,
  });
  const respond = (body: unknown, status: number) =>
    observation.createJsonResponse(body, status);

  try {
    const { authenticatedMember, identity, modules } = await resolveAuthorizedModules();

    if (!authenticatedMember && route.guard === SITEPING_SESSION_GUARD.splitUnauthorized) {
      return respond(
        { message: SITEPING_ROUTE_RESPONSE.unauthorizedMessage },
        HTTP_STATUS.unauthorized
      );
    }

    if (!authenticatedMember || !identity.enabled) {
      return respond({ message: SITEPING_ROUTE_RESPONSE.forbiddenMessage }, HTTP_STATUS.forbidden);
    }

    return await handle({ authenticatedMember, identity, modules, respond });
  } catch (error) {
    observation.logRouteError({
      error,
      message: route.failureLogMessage,
      outcome: SITEPING_ROUTE_OUTCOME.error,
      status: HTTP_STATUS.serverError,
    });

    return respond(
      { message: SITEPING_ROUTE_RESPONSE.unexpectedMessage },
      HTTP_STATUS.serverError
    );
  }
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
  return handleSitepingRoute(
    request,
    {
      failureLogMessage: "Siteping feedback creation failed",
      guard: SITEPING_SESSION_GUARD.splitUnauthorized,
    },
    async ({ authenticatedMember, identity, modules, respond }) => {
      const command = parseFeedbackCommand(await request.json().catch(() => null));

      if (!command) {
        return respond(
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

      return respond(feedback, HTTP_STATUS.created);
    }
  );
}

export async function GET(request: Request) {
  return handleSitepingRoute(
    request,
    {
      failureLogMessage: "Siteping feedback listing failed",
      guard: SITEPING_SESSION_GUARD.splitUnauthorized,
    },
    async ({ identity, modules, respond }) => {
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
        return respond(
          { message: SITEPING_ROUTE_RESPONSE.invalidQueryMessage },
          HTTP_STATUS.badRequest
        );
      }

      const feedbackPage = await modules.siteping.useCases.listFeedback({
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

      return respond({ ...feedbackPage, capabilities: SITEPING_WIDGET_CAPABILITIES, permissions: SITEPING_WIDGET_LIST_PERMISSIONS }, HTTP_STATUS.ok);
    }
  );
}

export async function PATCH(request: Request) {
  return handleSitepingRoute(
    request,
    {
      failureLogMessage: "Siteping feedback status update failed",
      guard: SITEPING_SESSION_GUARD.forbidden,
    },
    async ({ identity, modules, respond }) => {
      const body: unknown = await request.json().catch(() => null);

      if (!isPayloadObject(body) || !readTrimmedText(body.id) || !isFeedbackStatus(body.status)) {
        return respond(
          { message: SITEPING_ROUTE_RESPONSE.invalidBodyMessage },
          HTTP_STATUS.badRequest
        );
      }

      const feedback = await modules.siteping.useCases.updateFeedbackStatus({
        feedbackId: readTrimmedText(body.id) as string,
        projectName: identity.projectName,
        status: body.status,
      });

      if (!feedback) {
        return respond(
          { message: SITEPING_ROUTE_RESPONSE.notFoundMessage },
          HTTP_STATUS.notFound
        );
      }

      return respond(feedback, HTTP_STATUS.ok);
    }
  );
}

export async function DELETE(request: Request) {
  return handleSitepingRoute(
    request,
    {
      failureLogMessage: "Siteping feedback deletion failed",
      guard: SITEPING_SESSION_GUARD.forbidden,
    },
    async ({ identity, modules, respond }) => {
      const body: unknown = await request.json().catch(() => null);

      if (!isPayloadObject(body)) {
        return respond(
          { message: SITEPING_ROUTE_RESPONSE.invalidBodyMessage },
          HTTP_STATUS.badRequest
        );
      }

      const feedbackId = readTrimmedText(body.id);

      if (!feedbackId) {
        return respond(
          { message: SITEPING_ROUTE_RESPONSE.invalidBodyMessage },
          HTTP_STATUS.badRequest
        );
      }

      await modules.siteping.useCases.deleteFeedback({
        feedbackId,
        projectName: identity.projectName,
      });

      return respond(
        { message: SITEPING_ROUTE_RESPONSE.okMessage },
        HTTP_STATUS.ok
      );
    }
  );
}
