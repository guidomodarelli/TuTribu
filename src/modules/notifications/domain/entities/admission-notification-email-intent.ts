/** Defines the complete immutable email content without persisting a destination or credential. @module admission-notification-email-intent */
import type { AdmissionNotificationGroupManifest } from "./admission-notification";
import type { AdmissionNotificationEmailIntentFormat } from "../../constants/admission-notification-email-intent";

/** Contains only exact reference metadata, generic Spanish content and an authenticated passive link. */
export type AdmissionNotificationEmailContent = {
  readonly kind: "admission_notification_group";
  readonly groupId: string;
  readonly groupVersion: number;
  readonly manifest: AdmissionNotificationGroupManifest;
  readonly channel: "email";
  readonly senderId: string;
  readonly subject: string;
  readonly text: string;
  readonly href: string;
};

/** Preserves the original full-content protocol while its transient payer and destination remain available. */
export type LegacyAdmissionNotificationEmailIntent = AdmissionNotificationEmailContent & { readonly format: AdmissionNotificationEmailIntentFormat.legacy };

/** Retains opaque authenticated identity bindings after personal source references are legitimately minimized. */
export type BoundAdmissionNotificationEmailIntent = AdmissionNotificationEmailContent & {
  readonly format: AdmissionNotificationEmailIntentFormat.bound;
  readonly payerBinding: string;
  readonly recipientBinding: string;
};

/** Keeps historical and currently produced protocols explicit; neither is interpreted as the other. */
export type AdmissionNotificationEmailIntent = LegacyAdmissionNotificationEmailIntent | BoundAdmissionNotificationEmailIntent;

/** Binds immutable native delivery coordinates independently of personal information used at preparation. */
export type AdmissionNotificationEmailIntentScope = {
  readonly tribeId: string;
  readonly deliveryId: string;
  readonly originalDeliveryId: string | null;
  readonly connectionId: string;
  readonly connectionVersion: number;
  readonly recipientUserId: string;
  readonly idempotencyKey: string;
  readonly queuedUsagePolicyVersion: number;
  readonly createdAtMicroseconds: number;
  readonly deadlineAtMicroseconds: number;
};

/** Requires current trusted identities when preparing or authorizing a dispatch. */
export type AdmissionNotificationEmailIntentContext = AdmissionNotificationEmailIntentScope & {
  readonly contributingLeaderUserId: string;
  readonly normalizedRecipientEmail: string;
  readonly intent: AdmissionNotificationEmailIntent;
};

/** Prepares a complete new intent without accepting a previous binding or an external destination. */
export type AdmissionNotificationEmailSealingContext = AdmissionNotificationEmailIntentScope & {
  readonly contributingLeaderUserId: string;
  readonly normalizedRecipientEmail: string;
  readonly content: AdmissionNotificationEmailContent;
};

/** Authenticates historical bytes only; it does not grant current recipient, resource or dispatch authority. */
export type OriginalAdmissionNotificationEmailIntentContext = AdmissionNotificationEmailIntentScope & {
  readonly intent: BoundAdmissionNotificationEmailIntent;
};
