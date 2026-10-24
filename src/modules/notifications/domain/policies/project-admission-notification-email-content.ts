/** Projects complete immutable content without retaining accidental personal or provider metadata. @module project-admission-notification-email-content */
import type { AdmissionNotificationEmailContent } from "../entities/admission-notification-email-intent";

/**
 * Copies every consumed content/reference field before asynchronous authentication or explicit recovery.
 * @param content - Complete original content, not a reconstruction from one surviving member.
 * @returns An independent owned projection with original text, passive link, native clocks and member order.
 */
export function projectAdmissionNotificationEmailContent(content: AdmissionNotificationEmailContent): AdmissionNotificationEmailContent {
  const manifest = content.manifest, identity = manifest.identity;
  return {
    kind: content.kind, groupId: content.groupId, groupVersion: content.groupVersion, channel: content.channel,
    senderId: content.senderId, subject: content.subject, text: content.text, href: content.href,
    manifest: {
      format: manifest.format,
      identity: {
        tribeId: identity.tribeId, recipientUserId: identity.recipientUserId, audience: identity.audience,
        mode: identity.mode, preferenceVersion: identity.preferenceVersion, emailSettingsVersion: identity.emailSettingsVersion,
        individualObligationId: identity.individualObligationId,
        window: { startsAtMicroseconds: identity.window.startsAtMicroseconds, closesAtMicroseconds: identity.window.closesAtMicroseconds, timeZone: identity.window.timeZone },
      },
      items: manifest.items.map((item) => ({ obligationId: item.obligationId, admissionRequestId: item.admissionRequestId, event: item.event, createdAtMicroseconds: item.createdAtMicroseconds, deadlineAtMicroseconds: item.deadlineAtMicroseconds })),
    },
  };
}
