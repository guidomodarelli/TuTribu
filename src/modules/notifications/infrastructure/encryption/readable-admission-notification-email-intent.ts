/** Narrows only the private structure consumed by complete-content authentication. @module readable-admission-notification-email-intent */
import { ADMISSION_NOTIFICATION_EMAIL_INTENT_FORMAT, ADMISSION_NOTIFICATION_EMAIL_INTENT_LEGACY_FORMAT, ADMISSION_NOTIFICATION_EMAIL_INTENT_KIND } from "../../constants/admission-notification-email-intent";
import type { AdmissionNotificationEmailIntent } from "../../domain/entities/admission-notification-email-intent";

/** @param value - Original private JSON consumed by the MAC. @returns Minimum structural access safety, without imposing a PostgreSQL row schema. */
export function hasReadableAdmissionNotificationEmailIntent(value: unknown): value is AdmissionNotificationEmailIntent {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const intent = value as Record<string, unknown>;
  if ((intent.format !== ADMISSION_NOTIFICATION_EMAIL_INTENT_FORMAT && intent.format !== ADMISSION_NOTIFICATION_EMAIL_INTENT_LEGACY_FORMAT) || intent.kind !== ADMISSION_NOTIFICATION_EMAIL_INTENT_KIND || typeof intent.manifest !== "object" || intent.manifest === null || Array.isArray(intent.manifest)) return false;
  if (intent.format === ADMISSION_NOTIFICATION_EMAIL_INTENT_FORMAT && (typeof intent.payerBinding !== "string" || typeof intent.recipientBinding !== "string")) return false;
  const manifest = intent.manifest as Record<string, unknown>;
  if (typeof manifest.identity !== "object" || manifest.identity === null || Array.isArray(manifest.identity) || !Array.isArray(manifest.items)) return false;
  const identity = manifest.identity as Record<string, unknown>;
  return typeof identity.window === "object" && identity.window !== null && !Array.isArray(identity.window) && manifest.items.every((item) => typeof item === "object" && item !== null && !Array.isArray(item));
}
