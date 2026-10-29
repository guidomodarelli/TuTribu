import type { TribeWelcomeLinkResult } from "@/src/modules/tribes/application/results/tribe-welcome-result";
import { TRIBE_WELCOME_LINK_TYPE } from "@/src/modules/tribes/constants/tribe-welcome";

const WHATSAPP_LINK = {
  baseUrl: "https://wa.me/",
  messageQueryName: "text",
  querySeparator: "?",
  valueSeparator: "=",
} as const;

const PHONE_NUMBER_NON_DIGIT_PATTERN = /\D/g;

function buildWhatsappUrl(link: TribeWelcomeLinkResult): string | null {
  if (
    link.type !== TRIBE_WELCOME_LINK_TYPE.whatsappButton ||
    !link.phoneNumber
  ) {
    return null;
  }

  const normalizedPhoneNumber = link.phoneNumber.replace(
    PHONE_NUMBER_NON_DIGIT_PATTERN,
    ""
  );
  const messageQuery = link.message
    ? WHATSAPP_LINK.querySeparator +
      WHATSAPP_LINK.messageQueryName +
      WHATSAPP_LINK.valueSeparator +
      encodeURIComponent(link.message)
    : "";

  return WHATSAPP_LINK.baseUrl + normalizedPhoneNumber + messageQuery;
}

/**
 * Destination of a welcome resource: its URL, or the WhatsApp chat built from
 * the phone number and the optional prefilled message.
 * @param link - Welcome resource.
 * @returns The destination URL, or `null` when the resource has none.
 */
export function getTribeWelcomeLinkHref(
  link: TribeWelcomeLinkResult
): string | null {
  return link.type === TRIBE_WELCOME_LINK_TYPE.whatsappButton
    ? buildWhatsappUrl(link)
    : link.url;
}
