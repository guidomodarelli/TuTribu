import { z } from "zod";

import type {
  NotificationInboxResult,
  NotificationItemResult,
  NotificationMarkAllReadResult,
  NotificationUnreadCountResult,
} from "@/src/modules/notifications/application/results/notification-result";
import {
  NOTIFICATION_PROPOSAL_DECISION,
  NOTIFICATION_TYPE,
} from "@/src/modules/notifications/constants/notifications";
import { ADMISSION_NOTIFICATION_TYPE, ADMISSION_NOTIFICATION_AUDIENCE } from "@/src/modules/notifications/constants/admission-notifications";

/**
 * Runtime contracts (allowlists) of the public notification DTOs: JSON bodies
 * of `app/api/notifications/**` and the inbox the platform layout passes to
 * the client bell. `z.object` strips unknown keys, so the parsed value is
 * exactly what leaves the server; the browser adapter parses the same schemas
 * with `safeParse` before using a response.
 */

const instantSchema = z.iso.datetime({ offset: true });
const unreadCountSchema = z.int().nonnegative();

const tribeSchema = z.object({
  name: z.string(),
  slug: z.string().min(1),
});

const eventOccurrenceSubjectSchema = z.object({
  eventId: z.uuid(),
  eventTitle: z.string().nullable(),
  occurrenceStartsAt: instantSchema,
  startsAt: instantSchema,
});

const proposalSubjectSchema = z.object({
  decision: z.enum(NOTIFICATION_PROPOSAL_DECISION),
  eventId: z.uuid().nullable(),
  eventStartsAt: instantSchema.nullable(),
  proposalId: z.uuid(),
  proposalTitle: z.string().nullable(),
  reviewNote: z.string().nullable(),
});

const notificationBaseShape = {
  createdAt: instantSchema,
  id: z.uuid(),
  readAt: instantSchema.nullable(),
  tribe: tribeSchema,
};

export const notificationItemSchema = z.discriminatedUnion("type", [
  z.object({
    ...notificationBaseShape,
    admission: z.object({ requestId: z.uuid(), audience: z.enum(ADMISSION_NOTIFICATION_AUDIENCE) }),
    type: z.enum(ADMISSION_NOTIFICATION_TYPE),
  }),
  z.object({
    ...notificationBaseShape,
    event: eventOccurrenceSubjectSchema,
    type: z.enum([
      NOTIFICATION_TYPE.eventReminderDayBefore,
      NOTIFICATION_TYPE.eventReminderSoon,
      NOTIFICATION_TYPE.eventWaitlistPromoted,
      NOTIFICATION_TYPE.eventOccurrenceCancelled,
      NOTIFICATION_TYPE.eventOccurrenceMoved,
      NOTIFICATION_TYPE.eventRecordingAvailable,
    ]),
  }),
  z.object({
    ...notificationBaseShape,
    proposal: proposalSubjectSchema,
    type: z.literal(NOTIFICATION_TYPE.eventProposalReviewed),
  }),
]) satisfies z.ZodType<NotificationItemResult>;

export const notificationInboxSchema = z.object({
  notifications: z.array(notificationItemSchema),
  unreadCount: unreadCountSchema,
}) satisfies z.ZodType<NotificationInboxResult>;

export const notificationUnreadCountSchema = z.object({
  unreadCount: unreadCountSchema,
}) satisfies z.ZodType<NotificationUnreadCountResult>;

export const notificationMarkReadResponseSchema = z.object({
  unreadCount: unreadCountSchema,
}) satisfies z.ZodType<NotificationMarkAllReadResult>;

export const notificationMessageResponseSchema = z.object({
  message: z.string(),
});

export type NotificationInboxResponse = z.infer<typeof notificationInboxSchema>;
export type NotificationUnreadCountResponse = z.infer<typeof notificationUnreadCountSchema>;
export type NotificationMarkReadResponse = z.infer<typeof notificationMarkReadResponseSchema>;
