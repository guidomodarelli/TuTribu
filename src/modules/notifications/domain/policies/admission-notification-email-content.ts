/** Composes generic notification copy without accepting private notes, applicant contacts or provider payloads. @module admission-notification-email-content */
import { ADMISSION_NOTIFICATION_AUDIENCE } from "../../constants/admission-notifications";
import { ADMISSION_NOTIFICATION_EVENT } from "../../constants/admission-notification-groups";
import { ADMISSION_NOTIFICATION_EMAIL_INTENT_FORMAT, ADMISSION_NOTIFICATION_EMAIL_INTENT_KIND } from "../../constants/admission-notification-email-intent";
import { MESSAGING_PUBLIC_CHANNEL } from "@/src/modules/messaging/constants/messaging-public-contract";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import type { AdmissionNotificationGroupManifest } from "../entities/admission-notification";
import type { AdmissionNotificationEmailIntent } from "../entities/admission-notification-email-intent";

/**
 * Builds complete fixed content from the exact frozen references and a server-owned consultation link.
 * @param input - Original group/version, projected manifest, exact tested sender and authenticated passive link.
 * @returns Email-only content without names, notes, contact addresses, verification codes or decision links.
 * @throws AdmissionOperationError when an audience contains an incompatible event or applicant group.
 */
export function createAdmissionNotificationEmailIntent(input: { groupId: string; groupVersion: number; manifest: AdmissionNotificationGroupManifest; senderId: string; href: string }): AdmissionNotificationEmailIntent {
  const original = input.manifest, identity = original.identity;
  const manifest: AdmissionNotificationGroupManifest = { format: original.format, identity: { tribeId: identity.tribeId, recipientUserId: identity.recipientUserId, audience: identity.audience, mode: identity.mode, preferenceVersion: identity.preferenceVersion, emailSettingsVersion: identity.emailSettingsVersion, individualObligationId: identity.individualObligationId, window: { startsAtMicroseconds: identity.window.startsAtMicroseconds, closesAtMicroseconds: identity.window.closesAtMicroseconds, timeZone: identity.window.timeZone } }, items: original.items.map((item) => ({ obligationId: item.obligationId, admissionRequestId: item.admissionRequestId, event: item.event, createdAtMicroseconds: item.createdAtMicroseconds, deadlineAtMicroseconds: item.deadlineAtMicroseconds })) };
  if (!manifest.items.length) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
  let subject: string, summary: string;
  if (manifest.identity.audience === ADMISSION_NOTIFICATION_AUDIENCE.reviewer) {
    if (manifest.items.some((item) => item.event !== ADMISSION_NOTIFICATION_EVENT.pendingCreated && item.event !== ADMISSION_NOTIFICATION_EVENT.reminder)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
    subject = "TuTribu: solicitudes de ingreso pendientes";
    summary = manifest.items.length === 1 ? "Tenés una solicitud de ingreso pendiente para revisar." : `Tenés ${manifest.items.length} avisos de solicitudes de ingreso pendientes para revisar.`;
  } else {
    if (manifest.items.length !== 1 || manifest.identity.individualObligationId !== manifest.items[0].obligationId) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
    subject = "TuTribu: novedades de tu solicitud de ingreso";
    const event = manifest.items[0].event;
    if (event === ADMISSION_NOTIFICATION_EVENT.approved) summary = "Tu solicitud de ingreso fue aprobada.";
    else if (event === ADMISSION_NOTIFICATION_EVENT.rejected) summary = "Tu solicitud de ingreso fue rechazada.";
    else if (event === ADMISSION_NOTIFICATION_EVENT.cancelled) summary = "Tu solicitud de ingreso fue cancelada.";
    else if (event === ADMISSION_NOTIFICATION_EVENT.expired) summary = "Tu solicitud de ingreso venció.";
    else throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
  }
  return { format: ADMISSION_NOTIFICATION_EMAIL_INTENT_FORMAT, kind: ADMISSION_NOTIFICATION_EMAIL_INTENT_KIND, groupId: input.groupId, groupVersion: input.groupVersion, manifest, channel: MESSAGING_PUBLIC_CHANNEL.email, senderId: input.senderId, subject, text: `${summary}\n\nConsultá el estado en TuTribu. Necesitás iniciar sesión:\n${input.href}\n\nAbrir este enlace no aprueba ni rechaza solicitudes.`, href: input.href };
}
