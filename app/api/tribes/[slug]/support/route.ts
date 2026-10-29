import { parsePhoneNumberFromString } from "libphonenumber-js";

import {
  TRIBE_SUPPORT_CHANNEL,
  TRIBE_SUPPORT_SAVE_STATUS,
} from "@/src/modules/tribes/constants/tribe-support";
import {
  WHATSAPP_PHONE_NON_DIGIT_PATTERN,
  WHATSAPP_VALIDATION_MESSAGE,
} from "@/src/modules/tribes/constants/whatsapp-validation";
import type {
  TribeSupportChannel,
  TribeSupportSettings,
} from "@/src/modules/tribes/domain/repositories/tribe-support-repository";
import {
  createRouteJsonResponse,
  handleMemberRoute,
  type RequestModules,
  type TribeRouteContext,
} from "@/app/api/member-route-scope";
import { HTTP_STATUS } from "@/app/api/route-http-status";
import { respondToHiddenAcademyFreePage } from "../academy-free-page-access";
import { readPayloadObjectBody } from "@/app/api/request-body-fields";

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

const SUPPORT_MESSAGE_MAX_LENGTH = 1000;

function readTrimmedText(value: unknown): string | null {
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

const MEMBER_ROUTE_SCOPE = {
  feature: SUPPORT_ROUTE_LOG.feature,
  operation: SUPPORT_ROUTE_LOG.operation,
  unauthorizedMessage: SUPPORT_ROUTE_RESPONSE.unauthorizedMessage,
} as const;

export async function GET(
  request: Request,
  context: TribeRouteContext
) {
  const { slug } = await context.params;

  return handleMemberRoute(
    request,
    MEMBER_ROUTE_SCOPE,
    {
      logMessage: SUPPORT_ROUTE_LOG.getFailureMessage,
      metadata: { slug },
      responseMessage: SUPPORT_ROUTE_RESPONSE.unexpectedGetMessage,
    },
    async ({ modules }) => {
      // Support contact stays reachable for basic academy members.
      const hiddenResponse = await respondToHiddenAcademyFreePage(
        modules,
        slug,
        SUPPORT_ROUTE_RESPONSE
      );

      if (hiddenResponse) {
        return hiddenResponse;
      }

      const settings = await modules.tribes.useCases.getTribeSupport({
        tribeSlug: slug,
      });

      return createRouteJsonResponse(
        { settings: settings ? serializeSettings(settings) : null },
        HTTP_STATUS.ok
      );
    }
  );
}

type SaveTribeSupportResult = Awaited<
  ReturnType<RequestModules["tribes"]["useCases"]["saveTribeSupport"]>
>;

function createPutResultResponse(result: SaveTribeSupportResult): Response {
  switch (result.status) {
    case TRIBE_SUPPORT_SAVE_STATUS.updated:
      return createRouteJsonResponse(
        {
          message: SUPPORT_ROUTE_RESPONSE.savedMessage,
          settings: result.settings
            ? serializeSettings(result.settings)
            : null,
        },
        HTTP_STATUS.ok
      );
    case TRIBE_SUPPORT_SAVE_STATUS.notFound:
      return createRouteJsonResponse(
        { message: SUPPORT_ROUTE_RESPONSE.notFoundMessage },
        HTTP_STATUS.notFound
      );
    case TRIBE_SUPPORT_SAVE_STATUS.forbidden:
    default:
      return createRouteJsonResponse(
        { message: SUPPORT_ROUTE_RESPONSE.forbiddenMessage },
        HTTP_STATUS.forbidden
      );
  }
}

type SupportContact = { message: string | null; phoneNumber: string };

/**
 * Validates the WhatsApp number and the optional message in the order the
 * route reports their errors.
 *
 * @param parsedBody - JSON body object.
 * @returns The normalized contact, or the first validation message.
 */
function readSupportContact(
  parsedBody: Record<string, unknown>
): SupportContact | { errorMessage: string } {
  const phoneNumber = readTrimmedText(parsedBody.phoneNumber);
  const message = readTrimmedText(parsedBody.message);

  if (!phoneNumber || !hasPhoneDigits(phoneNumber)) {
    return { errorMessage: SUPPORT_ROUTE_RESPONSE.missingPhoneMessage };
  }

  const normalizedPhoneNumber = normalizeWhatsappPhoneNumber(phoneNumber);

  if (!normalizedPhoneNumber) {
    return { errorMessage: SUPPORT_ROUTE_RESPONSE.invalidPhoneMessage };
  }

  if (message && message.length > SUPPORT_MESSAGE_MAX_LENGTH) {
    return { errorMessage: SUPPORT_ROUTE_RESPONSE.messageTooLongMessage };
  }

  return { message, phoneNumber: normalizedPhoneNumber };
}

export async function PUT(
  request: Request,
  context: TribeRouteContext
) {
  const { slug } = await context.params;

  return handleMemberRoute(
    request,
    MEMBER_ROUTE_SCOPE,
    {
      logMessage: SUPPORT_ROUTE_LOG.saveFailureMessage,
      metadata: { slug },
      responseMessage: SUPPORT_ROUTE_RESPONSE.unexpectedSaveMessage,
    },
    async ({ modules }) => {
      const parsedBody = await readPayloadObjectBody(request);

      if (!parsedBody) {
        return createRouteJsonResponse(
          { message: SUPPORT_ROUTE_RESPONSE.invalidBodyMessage },
          HTTP_STATUS.badRequest
        );
      }

      const channel = parsedBody.channel;

      if (!isSupportChannel(channel)) {
        return createRouteJsonResponse(
          { message: SUPPORT_ROUTE_RESPONSE.invalidChannelMessage },
          HTTP_STATUS.badRequest
        );
      }

      const contact = readSupportContact(parsedBody);

      if ("errorMessage" in contact) {
        return createRouteJsonResponse(
          { message: contact.errorMessage },
          HTTP_STATUS.badRequest
        );
      }

      const result = await modules.tribes.useCases.saveTribeSupport({
        channel,
        message: contact.message,
        phoneNumber: contact.phoneNumber,
        tribeSlug: slug,
      });

      return createPutResultResponse(result);
    }
  );
}
