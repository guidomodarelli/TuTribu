/** Composes the generic inbox and explicit native admission settings without creating delivery adapters. @module notifications-setup */
import "server-only";
import type { AuthenticatedFeatureDependencies } from "@/src/modules/auth/infrastructure/composition/transaction-account-provider";
import type { ResolveAdmissionContextUseCase } from "@/src/modules/academy-admissions/application/use-cases/resolve-admission-context-use-case";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { AdmissionNotificationPreferencesUseCases } from "./application/use-cases/admission-notification-preferences-use-cases";
import { AdmissionNotificationEmailSettingsUseCases } from "./application/use-cases/admission-notification-email-settings-use-cases";
import { PostgresAdmissionNotificationPreferenceRepository } from "./infrastructure/repositories/postgres-admission-notification-preference-repository";
import { PostgresAdmissionNotificationEmailSettingsRepository } from "./infrastructure/repositories/postgres-admission-notification-email-settings-repository";
import type {
  MarkNotificationReadCommand,
  PurgeReadNotificationsCommand,
} from "@/src/modules/notifications/application/commands/notification-command";
import type {
  NotificationInboxResult,
  NotificationMarkAllReadResult,
  NotificationMarkReadResult,
  NotificationPurgeResult,
  NotificationUnreadCountResult,
} from "@/src/modules/notifications/application/results/notification-result";
import {
  getNotificationInbox,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
  purgeReadNotifications,
} from "@/src/modules/notifications/application/use-cases/notification-use-cases";
import type { NotificationRepository } from "@/src/modules/notifications/domain/repositories/notification-repository";

type NotificationsModuleDependencies = {
  notificationRepository: NotificationRepository;
};

type NotificationsModule = {
  useCases: {
    getNotificationInbox: () => Promise<NotificationInboxResult>;
    getUnreadNotificationCount: () => Promise<NotificationUnreadCountResult>;
    markAllNotificationsRead: () => Promise<NotificationMarkAllReadResult>;
    markNotificationRead: (command: MarkNotificationReadCommand) => Promise<NotificationMarkReadResult>;
    purgeReadNotifications: (command?: PurgeReadNotificationsCommand) => Promise<NotificationPurgeResult>;
  };
};

/**
 * Composes the generic in-app notification inbox. Producers (events, and
 * future modules) enqueue through their own adapters or SQL triggers; this
 * module only reads, marks, and purges.
 */
export function buildNotificationsModule(
  dependencies: NotificationsModuleDependencies
): NotificationsModule {
  return {
    useCases: {
      getNotificationInbox: getNotificationInbox(dependencies),
      getUnreadNotificationCount: getUnreadNotificationCount(dependencies),
      markAllNotificationsRead: markAllNotificationsRead(dependencies),
      markNotificationRead: markNotificationRead(dependencies),
      purgeReadNotifications: purgeReadNotifications(dependencies),
    },
  };
}

/**
 * Composes independent own preferences and leader email settings under the existing guarded executor.
 * @param dependencies - Native current-account provider and transaction owner; no browser authority is accepted.
 * @param options - Admission-owned current resolver and lazily read server security for explicit email mutations only.
 * @returns Explicit read/write use cases without a provider client, dispatcher or implicit settings initialization.
 */
export function buildAdmissionNotificationSettingsModule(dependencies: AuthenticatedFeatureDependencies, options: { resolver: Pick<ResolveAdmissionContextUseCase, "execute">; readSecurityConfig: () => Promise<MessagingSecurityConfig> }) {
  /** @param scope - Server-resolved account/session being rechecked before checkout. @param run - Native DB-only work with final owner authorization. @returns The guarded result or a current authentication denial. */
  const execute = async <Result>(scope: { userId: string; sessionId: string }, run: (database: RequestDatabase) => Promise<Result>): Promise<Result> => {
    const account = await dependencies.accounts.getAuthenticatedAccount();
    if (!account || account.userId !== scope.userId || account.session.id !== scope.sessionId) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
    return dependencies.execute(account, run);
  };
  return { useCases: {
    preferences: new AdmissionNotificationPreferencesUseCases(options.resolver, new PostgresAdmissionNotificationPreferenceRepository(execute)),
    email: new AdmissionNotificationEmailSettingsUseCases(options.resolver, new PostgresAdmissionNotificationEmailSettingsRepository(execute, options.readSecurityConfig)),
  } };
}
