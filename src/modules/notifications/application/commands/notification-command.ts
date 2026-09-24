/**
 * Inputs of the notification use cases. The recipient is never an input: it
 * is always the signed-in user of the request context.
 */

export type MarkNotificationReadCommand = {
  /** Already validated as a uuid at the route boundary. */
  notificationId: string;
};

export type PurgeReadNotificationsCommand = {
  /** Reference instant (ISO); defaults to the current time. */
  now?: string;
};
