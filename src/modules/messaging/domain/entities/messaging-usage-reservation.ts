/** Models a consumed external-attempt slot whose release requires explicit absence evidence. @module messaging-usage-reservation */
import type { MESSAGE_RESERVATION_STATE, MESSAGE_USAGE_CATEGORY } from "@/src/modules/messaging/constants/message-delivery";
export type MessagingUsageReservation = {
  id: string; tribeId: string; attemptId: string; deliveryId: string;
  category: (typeof MESSAGE_USAGE_CATEGORY)[keyof typeof MESSAGE_USAGE_CATEGORY];
  state: (typeof MESSAGE_RESERVATION_STATE)[keyof typeof MESSAGE_RESERVATION_STATE];
  reservedAt: Date; releasedAt: Date | null; absenceEvidence: string | null;
};
