/** Defines the complete immutable email content without persisting a destination or credential. @module admission-notification-email-intent */
import type { AdmissionNotificationGroupManifest } from "./admission-notification";

/** Contains only exact reference metadata, generic Spanish content and an authenticated passive link. */
export type AdmissionNotificationEmailIntent = {
  readonly format: 1;
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

/** Binds the exact new delivery, payer, native lifetime and current trusted destination without storing that address. */
export type AdmissionNotificationEmailIntentContext = {
  readonly tribeId: string;
  readonly deliveryId: string;
  readonly originalDeliveryId: string | null;
  readonly connectionId: string;
  readonly connectionVersion: number;
  readonly contributingLeaderUserId: string;
  readonly recipientUserId: string;
  readonly normalizedRecipientEmail: string;
  readonly idempotencyKey: string;
  readonly queuedUsagePolicyVersion: number;
  readonly createdAtMicroseconds: number;
  readonly deadlineAtMicroseconds: number;
  readonly intent: AdmissionNotificationEmailIntent;
};
