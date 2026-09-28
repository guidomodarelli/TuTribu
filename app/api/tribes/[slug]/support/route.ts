import { parsePhoneNumberFromString } from "libphonenumber-js";

import { createRequestModules } from "@/src/modules/setup";
import {
  TRIBE_SUPPORT_CHANNEL,
  TRIBE_SUPPORT_SAVE_STATUS,
} from "@/src/modules/tribes/constants/tribe-support";
import {
  WHATSAPP_PHONE_NON_DIGIT_PATTERN,
  WHATSAPP_VALIDATION_MESSAGE,
} from "@/src/modules/tribes/constants/whatsapp-validation";
import {
  TRIBE_PAGE_ACCESS_REASON,
  TRIBE_PAGE_ACCESS_STATUS,
} from "@/src/modules/tribes/application/results/tribe-page-access-result";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";
import type {
  TribeSupportChannel,
  TribeSupportSettings,
} from "@/src/modules/tribes/domain/repositories/tribe-support-repository";

const SUPPORT_ROUTE_LOG = {
  feature: "tribes",
  getFailureMessage: "Tribe support loading failed",
  operation: "manage-tribe-support",
  saveFailureMessage: "Tribe support save failed",
} as const;

const SUPPORT_ROUTE_RESPONSE = {
  accessForbiddenMessage: "No tenés acceso a esta tribu.",
  forbiddenMessage: "Solo el líder puede configurar el botón de soporte.",
  invalidBodyMessage: "Revisá los campos del botón de soporte antes de guardar.",
  invalidChannelMessage:
    "Por ahora el botón de soporte solo admite WhatsApp.",
  invalidPhoneMessage: WHATSAPP_VALIDATION_MESSAGE.invalidPhone,
  messageTooLongMessage:
    "El mensaje no puede superar los 1000 caracteres.",
  missingPhoneMessage: WHATSAPP_VALIDATION_MESSAGE.missingPhone,
  notFoundMessage: "No pudimos encontrar la tribu.",
  savedMessage: "Botón de soporte actualizado.",
  unauthorizedMessage: "Iniciá sesión para gestionar el botón de soporte.",
  unexpectedGetMessage:
    "No pudimos cargar el botón de soporte. Intentá de nuevo.",
  unexpectedSaveMessage:
    "No pudimos guardar el botón de soporte. Intentá de nuevo.",
} as const;

const HTTP_STATUS = {
  badRequest: 400,
  forbidden: 403,
  notFound: 404,
  ok: 200,
  serverError: 500,
  unauthorized: 401,
} as const;

const SUPPORT_MESSAGE_MAX_LENGTH = 1000;

function createJsonResponse(
  body: Record<string, unknown>,
  status: number
): Response {
  return Response.json(body, { status });
}

function createHiddenSupportResponse(reason: string): Response {
  if (reason === TRIBE_PAGE_ACCESS_REASON.blockedHidden) {
    return createJsonResponse(
      { message: SUPPORT_ROUTE_RESPONSE.accessForbiddenMessage },
      HTTP_STATUS.forbidden
    );
  }

  return createJsonResponse(
    { message: SUPPORT_ROUTE_RESPONSE.notFoundMessage },
    HTTP_STATUS.notFound
  );
}

function isPayloadObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readRequiredText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function readOptionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function isSupportChannel(value: unknown): value is TribeSupportChannel {
  return Object.values(TRIBE_SUPPORT_CHANNEL).includes(
    value as TribeSupportChannel
  );
}

function hasPhoneDigits(value: string): boolean {
  return Boolean(value.replace(WHATSAPP_PHONE_NON_DIGIT_PATTERN, ""));
}

function normalizeWhatsappPhoneNumber(value: string): string | null {
  const parsedPhoneNumber = parsePhoneNumberFromString(value);

  if (!parsedPhoneNumber || parsedPhoneNumber.ext || !parsedPhoneNumber.isValid()) {
    return null;
  }

  return parsedPhoneNumber.number;
}

function serializeSettings(settings: TribeSupportSettings) {
  return {
    channel: settings.channel,
    message: settings.message,
    phoneNumber: settings.phoneNumber,
  };
}

export async function GET(
  request: Request,
  context: {
    params: Promise<{
      slug: string;
    }>;
  }
) {
  const { slug } = await context.params;
  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: SUPPORT_ROUTE_LOG.feature,
    operation: SUPPORT_ROUTE_LOG.operation,
    requestId,
  });
  const modules = await createRequestModules();
  const authenticatedMember =
    await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createJsonResponse(
      { message: SUPPORT_ROUTE_RESPONSE.unauthorizedMessage },
      HTTP_STATUS.unauthorized
    );
  }

  try {
    const accessResult = await modules.tribes.useCases.getTribePageAccess({
      // Support contact stays reachable for basic academy members.
      allowWithoutCommunityAccess: true,
      isAuthenticated: true,
      slug,
    });

    if (accessResult.status === TRIBE_PAGE_ACCESS_STATUS.hidden) {
      return createHiddenSupportResponse(accessResult.reason);
    }

    const settings = await modules.tribes.useCases.getTribeSupport({
      tribeSlug: slug,
    });

    return createJsonResponse(
      { settings: settings ? serializeSettings(settings) : null },
      HTTP_STATUS.ok
    );
  } catch (error) {
    logger.error({
      error,
      message: SUPPORT_ROUTE_LOG.getFailureMessage,
      metadata: {
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: SUPPORT_ROUTE_RESPONSE.unexpectedGetMessage },
      HTTP_STATUS.serverError
    );
  }
}

export async function PUT(
  request: Request,
  context: {
    params: Promise<{
      slug: string;
    }>;
  }
) {
  const { slug } = await context.params;
  const { requestId } = resolveRequestContext(request.headers);
  const logger = createServerLogger({
    feature: SUPPORT_ROUTE_LOG.feature,
    operation: SUPPORT_ROUTE_LOG.operation,
    requestId,
  });
  const modules = await createRequestModules();
  const authenticatedMember =
    await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    return createJsonResponse(
      { message: SUPPORT_ROUTE_RESPONSE.unauthorizedMessage },
      HTTP_STATUS.unauthorized
    );
  }

  try {
    const parsedBody = await request.json().catch(() => ({}));

    if (!isPayloadObject(parsedBody)) {
      return createJsonResponse(
        { message: SUPPORT_ROUTE_RESPONSE.invalidBodyMessage },
        HTTP_STATUS.badRequest
      );
    }

    const channel = parsedBody.channel;

    if (!isSupportChannel(channel)) {
      return createJsonResponse(
        { message: SUPPORT_ROUTE_RESPONSE.invalidChannelMessage },
        HTTP_STATUS.badRequest
      );
    }

    const phoneNumber = readRequiredText(parsedBody.phoneNumber);
    const message = readOptionalText(parsedBody.message);

    if (!phoneNumber || !hasPhoneDigits(phoneNumber)) {
      return createJsonResponse(
        { message: SUPPORT_ROUTE_RESPONSE.missingPhoneMessage },
        HTTP_STATUS.badRequest
      );
    }

    const normalizedPhoneNumber = normalizeWhatsappPhoneNumber(phoneNumber);

    if (!normalizedPhoneNumber) {
      return createJsonResponse(
        { message: SUPPORT_ROUTE_RESPONSE.invalidPhoneMessage },
        HTTP_STATUS.badRequest
      );
    }

    if (message && message.length > SUPPORT_MESSAGE_MAX_LENGTH) {
      return createJsonResponse(
        { message: SUPPORT_ROUTE_RESPONSE.messageTooLongMessage },
        HTTP_STATUS.badRequest
      );
    }

    const result = await modules.tribes.useCases.saveTribeSupport({
      channel,
      message,
      phoneNumber: normalizedPhoneNumber,
      tribeSlug: slug,
    });

    switch (result.status) {
      case TRIBE_SUPPORT_SAVE_STATUS.updated:
        return createJsonResponse(
          {
            message: SUPPORT_ROUTE_RESPONSE.savedMessage,
            settings: result.settings
              ? serializeSettings(result.settings)
              : null,
          },
          HTTP_STATUS.ok
        );
      case TRIBE_SUPPORT_SAVE_STATUS.notFound:
        return createJsonResponse(
          { message: SUPPORT_ROUTE_RESPONSE.notFoundMessage },
          HTTP_STATUS.notFound
        );
      case TRIBE_SUPPORT_SAVE_STATUS.forbidden:
      default:
        return createJsonResponse(
          { message: SUPPORT_ROUTE_RESPONSE.forbiddenMessage },
          HTTP_STATUS.forbidden
        );
    }
  } catch (error) {
    logger.error({
      error,
      message: SUPPORT_ROUTE_LOG.saveFailureMessage,
      metadata: {
        slug,
        viewerId: authenticatedMember.id,
      },
    });

    return createJsonResponse(
      { message: SUPPORT_ROUTE_RESPONSE.unexpectedSaveMessage },
      HTTP_STATUS.serverError
    );
  }
}
