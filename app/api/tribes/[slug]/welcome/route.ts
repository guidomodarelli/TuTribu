import { randomUUID } from "crypto";
import { isValidPhoneNumber } from "libphonenumber-js";

import {
  TRIBE_WELCOME_LINK_TYPE,
  TRIBE_WELCOME_SAVE_STATUS,
} from "@/src/modules/tribes/constants/tribe-welcome";
import {
  WHATSAPP_PHONE_NON_DIGIT_PATTERN,
  WHATSAPP_VALIDATION_MESSAGE,
} from "@/src/modules/tribes/constants/whatsapp-validation";
import type {
  TribeWelcomeLinkResult,
  TribeWelcomeRuleResult,
} from "@/src/modules/tribes/application/results/tribe-welcome-result";
import {
  TRIBE_PAGE_ACCESS_REASON,
  TRIBE_PAGE_ACCESS_STATUS,
} from "@/src/modules/tribes/application/results/tribe-page-access-result";
import { createRequestModules } from "@/src/modules/setup";
import { resolveRequestContext } from "@/src/modules/shared/infrastructure/observability/request-context";
import { createServerLogger } from "@/src/modules/shared/infrastructure/observability/server-logger";

const WELCOME_ROUTE_LOG = {
  feature: "tribes",
  getFailureMessage: "Tribe welcome loading failed",
  operation: "manage-tribe-welcome",
  saveFailureMessage: "Tribe welcome save failed",
} as const;

const WELCOME_ROUTE_RESPONSE = {
  accessForbiddenMessage: "No tenés acceso a esta bienvenida.",
  forbiddenMessage: "Solo el líder puede editar la bienvenida.",
  invalidBodyMessage: "Revisá los campos de la bienvenida antes de guardar.",
  invalidUrlMessage: "Usá una URL válida para guardar ese botón.",
  invalidWhatsappPhoneMessage: WHATSAPP_VALIDATION_MESSAGE.invalidPhone,
  missingWhatsappPhoneMessage: WHATSAPP_VALIDATION_MESSAGE.missingPhone,
  notFoundMessage: "No pudimos encontrar la tribu.",
  savedMessage: "Bienvenida actualizada.",
  unauthorizedMessage: "Iniciá sesión para gestionar la bienvenida.",
  unexpectedGetMessage: "No pudimos cargar la bienvenida. Intentá de nuevo.",
  unexpectedSaveMessage: "No pudimos guardar la bienvenida. Intentá de nuevo.",
} as const;

const HTTP_STATUS = {
  badRequest: 400,
  forbidden: 403,
  notFound: 404,
  ok: 200,
  serverError: 500,
  unauthorized: 401,
} as const;

const ALLOWED_EXTERNAL_URL_PROTOCOL = {
  http: "http:",
  https: "https:",
} as const;

const BADGE_LABEL_MAX_LENGTH = 30;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createJsonResponse(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, { status });
}

function createHiddenWelcomeResponse(reason: string): Response {
  if (reason === TRIBE_PAGE_ACCESS_REASON.blockedHidden) {
    return createJsonResponse(
      { message: WELCOME_ROUTE_RESPONSE.accessForbiddenMessage },
      HTTP_STATUS.forbidden
    );
  }

  return createJsonResponse(
    { message: WELCOME_ROUTE_RESPONSE.notFoundMessage },
    HTTP_STATUS.notFound
  );
}

function isWelcomeLinkType(
  value: unknown
): value is TribeWelcomeLinkResult["type"] {
  return Object.values(TRIBE_WELCOME_LINK_TYPE).includes(
    value as TribeWelcomeLinkResult["type"]
  );
}

function isValidExternalUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return (
      url.protocol === ALLOWED_EXTERNAL_URL_PROTOCOL.https ||
      url.protocol === ALLOWED_EXTERNAL_URL_PROTOCOL.http
    );
  } catch {
    return false;
  }
}

function readOptionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function readRequiredText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function readSortOrder(value: unknown, fallback: number): number {
  return Number.isInteger(value) ? Number(value) : fallback;
}

function readPayloadId(value: unknown): string | null {
  const existingId = readRequiredText(value);

  if (!existingId) {
    return randomUUID();
  }

  return UUID_PATTERN.test(existingId) ? existingId : null;
}

function hasPhoneNumberDigits(value: string | null): boolean {
  return Boolean(value?.replace(WHATSAPP_PHONE_NON_DIGIT_PATTERN, ""));
}

function hasValidWhatsappPhoneFormat(value: string | null): boolean {
  return Boolean(value && isValidPhoneNumber(value));
}

function isPayloadObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mapPayloadRules(rules: unknown): TribeWelcomeRuleResult[] | null {
  if (!Array.isArray(rules)) {
    return null;
  }

  if (!rules.every(isPayloadObject)) {
    return null;
  }

  const mappedRules: TribeWelcomeRuleResult[] = [];

  for (const [index, rule] of rules.entries()) {
    const id = readPayloadId(rule.id);

    if (!id) {
      return null;
    }

    mappedRules.push({
      id,
      isActive: rule.isActive !== false,
      label: readRequiredText(rule.label) ?? "",
      sortOrder: readSortOrder(rule.sortOrder, index + 1),
    });
  }

  return mappedRules;
}

function mapPayloadLinks(links: unknown): TribeWelcomeLinkResult[] | null {
  if (!Array.isArray(links)) {
    return null;
  }

  if (!links.every(isPayloadObject)) {
    return null;
  }

  const mappedLinks: TribeWelcomeLinkResult[] = [];

  for (const [index, link] of links.entries()) {
    const id = readPayloadId(link.id);

    if (!id) {
      return null;
    }

    mappedLinks.push({
      badgeLabel: readRequiredText(link.badgeLabel) ?? "",
      description: readOptionalText(link.description),
      id,
      isActive: link.isActive !== false,
      label: readRequiredText(link.label) ?? "",
      message: readOptionalText(link.message),
      phoneNumber: readOptionalText(link.phoneNumber),
      sortOrder: readSortOrder(link.sortOrder, index + 1),
      type: isWelcomeLinkType(link.type)
        ? link.type
        : TRIBE_WELCOME_LINK_TYPE.customButton,
      url: readOptionalText(link.url),
    });
  }

  return mappedLinks;
}

/**
 * Validates welcome payload fields before persistence constraints can reject them.
 *
 * @param input - Normalized welcome payload collected from the route request.
 * @returns A safe Spanish validation message when the payload is invalid, otherwise null.
 */
function validateWelcomePayload(input: {
  linksHeading: string;
  links: TribeWelcomeLinkResult[];
  rules: TribeWelcomeRuleResult[];
  selectionModalDescription: string;
  selectionModalTitle: string;
  welcomeMessage: string;
}): string | null {
  if (!input.welcomeMessage.trim()) {
    return WELCOME_ROUTE_RESPONSE.invalidBodyMessage;
  }

  if (
    !input.selectionModalTitle.trim() ||
    !input.selectionModalDescription.trim() ||
    !input.linksHeading.trim()
  ) {
    return WELCOME_ROUTE_RESPONSE.invalidBodyMessage;
  }

  if (input.rules.some((rule) => rule.label.trim().length === 0)) {
    return WELCOME_ROUTE_RESPONSE.invalidBodyMessage;
  }

  for (const link of input.links) {
    if (link.label.trim().length === 0) {
      return WELCOME_ROUTE_RESPONSE.invalidBodyMessage;
    }

    if (
      link.badgeLabel.trim().length === 0 ||
      link.badgeLabel.length > BADGE_LABEL_MAX_LENGTH
    ) {
      return WELCOME_ROUTE_RESPONSE.invalidBodyMessage;
    }

    if (link.type === TRIBE_WELCOME_LINK_TYPE.whatsappButton) {
      if (!hasPhoneNumberDigits(link.phoneNumber)) {
        return WELCOME_ROUTE_RESPONSE.missingWhatsappPhoneMessage;
      }

      if (!hasValidWhatsappPhoneFormat(link.phoneNumber)) {
        return WELCOME_ROUTE_RESPONSE.invalidWhatsappPhoneMessage;
      }

      continue;
    }

    if (!link.url?.trim() || !isValidExternalUrl(link.url)) {
      return WELCOME_ROUTE_RESPONSE.invalidUrlMessage;
    }
  }

  return null;
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
    feature: WELCOME_ROUTE_LOG.feature,
    operation: WELCOME_ROUTE_LOG.operation,
    requestId,
  });
  let viewerId: string | null = null;

  try {
    const modules = await createRequestModules();
    const authenticatedMember =
      await modules.auth.useCases.getAuthenticatedMember();

    if (!authenticatedMember) {
      return createJsonResponse(
        { message: WELCOME_ROUTE_RESPONSE.unauthorizedMessage },
        HTTP_STATUS.unauthorized
      );
    }

    viewerId = authenticatedMember.id;
    const accessResult = await modules.tribes.useCases.getTribePageAccess({
      isAuthenticated: true,
      slug,
    });

    if (accessResult.status === TRIBE_PAGE_ACCESS_STATUS.hidden) {
      return createHiddenWelcomeResponse(accessResult.reason);
    }

    return createJsonResponse(
      {
        welcome: await modules.tribes.useCases.getTribeWelcome({
          tribeSlug: slug,
        }),
      },
      HTTP_STATUS.ok
    );
  } catch (error) {
    logger.error({
      error,
      message: WELCOME_ROUTE_LOG.getFailureMessage,
      metadata: {
        slug,
        viewerId,
      },
    });

    return createJsonResponse(
      { message: WELCOME_ROUTE_RESPONSE.unexpectedGetMessage },
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
    feature: WELCOME_ROUTE_LOG.feature,
    operation: WELCOME_ROUTE_LOG.operation,
    requestId,
  });
  let viewerId: string | null = null;

  try {
    const modules = await createRequestModules();
    const authenticatedMember =
      await modules.auth.useCases.getAuthenticatedMember();

    if (!authenticatedMember) {
      return createJsonResponse(
        { message: WELCOME_ROUTE_RESPONSE.unauthorizedMessage },
        HTTP_STATUS.unauthorized
      );
    }

    viewerId = authenticatedMember.id;
    const parsedBody = await request.json().catch(() => ({}));

    if (!isPayloadObject(parsedBody)) {
      return createJsonResponse(
        { message: WELCOME_ROUTE_RESPONSE.invalidBodyMessage },
        HTTP_STATUS.badRequest
      );
    }

    const body = parsedBody;
    const welcomeMessage = readRequiredText(body.welcomeMessage);
    const selectionModalTitle = readRequiredText(body.selectionModalTitle);
    const selectionModalDescription = readRequiredText(
      body.selectionModalDescription
    );
    const selectionModalBenefit = readOptionalText(body.selectionModalBenefit);
    const linksHeading = readRequiredText(body.linksHeading);
    const rules = mapPayloadRules(body.rules);
    const links = mapPayloadLinks(body.links);

    if (
      !welcomeMessage ||
      !selectionModalTitle ||
      !selectionModalDescription ||
      !linksHeading ||
      !rules ||
      !links
    ) {
      return createJsonResponse(
        { message: WELCOME_ROUTE_RESPONSE.invalidBodyMessage },
        HTTP_STATUS.badRequest
      );
    }

    const validationMessage = validateWelcomePayload({
      linksHeading,
      links,
      rules,
      selectionModalDescription,
      selectionModalTitle,
      welcomeMessage,
    });

    if (validationMessage) {
      return createJsonResponse(
        { message: validationMessage },
        HTTP_STATUS.badRequest
      );
    }

    const result = await modules.tribes.useCases.saveTribeWelcome({
      linksHeading,
      links,
      rules,
      selectionModalBenefit,
      selectionModalDescription,
      selectionModalTitle,
      tribeSlug: slug,
      welcomeMessage,
    });

    switch (result.status) {
      case TRIBE_WELCOME_SAVE_STATUS.updated:
        return createJsonResponse(
          { message: WELCOME_ROUTE_RESPONSE.savedMessage },
          HTTP_STATUS.ok
        );
      case TRIBE_WELCOME_SAVE_STATUS.notFound:
        return createJsonResponse(
          { message: WELCOME_ROUTE_RESPONSE.notFoundMessage },
          HTTP_STATUS.notFound
        );
      case TRIBE_WELCOME_SAVE_STATUS.forbidden:
      default:
        return createJsonResponse(
          { message: WELCOME_ROUTE_RESPONSE.forbiddenMessage },
          HTTP_STATUS.forbidden
        );
    }
  } catch (error) {
    logger.error({
      error,
      message: WELCOME_ROUTE_LOG.saveFailureMessage,
      metadata: {
        slug,
        viewerId,
      },
    });

    return createJsonResponse(
      { message: WELCOME_ROUTE_RESPONSE.unexpectedSaveMessage },
      HTTP_STATUS.serverError
    );
  }
}
