/** Owns resource selection and bounded continuation vocabulary independently of provider cursors. @module messaging-resources */
import type {MessagingChannelResourceRequirement} from "../domain/errors/messaging-requirement-error";
export const MESSAGING_RESOURCE_KIND={senders:"senders",templates:"templates"} as const;
/** Continuations contain only own scope/offset; they never confer authority or preserve an upstream cursor. */
export const MESSAGING_RESOURCE_CURSOR_MAXIMUM_OFFSET=5_000;
/** Why a chosen sender or template cannot serve the channel: the typed cause of a missing capability, logged but never serialized. */
export const MESSAGING_CHANNEL_RESOURCE_REQUIREMENT={senderMismatch:"sender_mismatch",senderChannelMissing:"sender_channel_missing",senderWhatsappTemplatesUnavailable:"sender_whatsapp_templates_unavailable",templateMismatch:"template_mismatch",templateNotApproved:"template_not_approved",templateLanguageMismatch:"template_language_mismatch"} as const satisfies Record<string,MessagingChannelResourceRequirement>;
