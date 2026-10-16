/** Composes the generic inbox, native admission settings and explicitly authorized private email preparation. @module notifications-setup */
import "server-only";
import type { AuthenticatedFeatureDependencies } from "@/src/modules/auth/infrastructure/composition/transaction-account-provider";
import type { ResolveAdmissionContextUseCase } from "@/src/modules/academy-admissions/application/use-cases/resolve-admission-context-use-case";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { AdmissionNotificationPreferencesUseCases } from "./application/use-cases/admission-notification-preferences-use-cases";
import { AdmissionNotificationEmailSettingsUseCases } from "./application/use-cases/admission-notification-email-settings-use-cases";
import { GetAdmissionNotificationSettingsPageUseCase } from "./application/use-cases/get-admission-notification-settings-page-use-case";
import type { ResolveAdmissionTribeUseCase } from "@/src/modules/academy-admissions/application/use-cases/resolve-admission-tribe-use-case";
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
import type { MessageDeliverySender } from "@/src/modules/messaging/domain/repositories/message-delivery-sender";
import type { MessagingSecretMaterialStore } from "@/src/modules/messaging/domain/repositories/messaging-repositories";
import type { NotificationDeliveryPreparation } from "@/src/modules/messaging/infrastructure/notification-delivery-preparation";
import { PostgresEncryptedSecretStore } from "@/src/modules/messaging/infrastructure/repositories/postgres-encrypted-secret-store";
import { MESSAGING_AUTHORIZATION_PURPOSE } from "@/src/modules/messaging/constants/messaging-connection";
import { MessagingSecretAccessError } from "@/src/modules/messaging/domain/errors/messaging-secret-access-error";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { PostgresAdmissionNotificationDeliveryPreparation, type AdmissionNotificationPreparationExecutor } from "./infrastructure/repositories/postgres-admission-notification-delivery-preparation";
import { createAdmissionNotificationResourceAuthority } from "./infrastructure/messaging/admission-notification-resource-authority";

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
  const useCases = {
    preferences: new AdmissionNotificationPreferencesUseCases(options.resolver, new PostgresAdmissionNotificationPreferenceRepository(execute)),
    email: new AdmissionNotificationEmailSettingsUseCases(options.resolver, new PostgresAdmissionNotificationEmailSettingsRepository(execute, options.readSecurityConfig)),
  };
  return { useCases, createPage: (resolveTribe: Pick<ResolveAdmissionTribeUseCase, "execute">) => new GetAdmissionNotificationSettingsPageUseCase(dependencies.accounts, { ...useCases, resolveTribe }, dependencies.clock) };
}

/** @param dependencies - Explicit current job authority, original guarded executor, local security and registered code-free sender factory. @returns A private prepared sender and its guarded preparation port; no queue claim, endpoint or scheduler is activated. */
export function buildAdmissionNotificationDeliveryModule(dependencies: { execute: AdmissionNotificationPreparationExecutor; authorize: () => Promise<boolean>; readSecurityConfig: () => Promise<MessagingSecurityConfig>; createSender: (preparation: NotificationDeliveryPreparation) => MessageDeliverySender }) {
  const authority = createAdmissionNotificationResourceAuthority(dependencies.readSecurityConfig);
  const secrets = new PostgresEncryptedSecretStore(dependencies.execute, { getAuthenticatedAccount: async () => null }, dependencies.readSecurityConfig, MESSAGING_AUTHORIZATION_PURPOSE.authorizedDelivery, authority.marked);
  const authorizedSecrets: MessagingSecretMaterialStore = {
    /** @param context - Original private marker, independently checked by the real store. @returns Its transient credential/provider after current job authority; native resource preparation must run again afterward. @throws MessagingSecretAccessError when job authority is lost after the secret transaction commits. */
    async loadAuthorizedSecretMaterial(context) {
      const material = await secrets.loadAuthorizedSecretMaterial(context);
      if (!await dependencies.authorize()) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.permissionDenied);
      return material;
    },
  };
  const privatePreparation = new PostgresAdmissionNotificationDeliveryPreparation(dependencies.execute, authorizedSecrets, dependencies.readSecurityConfig);
  const preparation: NotificationDeliveryPreparation = {
    /** @param context - Original already committed marker. @param signal - Original remaining run deadline. @returns Current backend-only material while the explicit job remains authorized. @throws MessagingSecretAccessError on lost current job authority. */
    async prepare(context, signal) {
      signal.throwIfAborted();
      if (!await dependencies.authorize()) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.permissionDenied);
      return privatePreparation.prepare(context, signal);
    },
  };
  return { sender: dependencies.createSender(preparation), preparation };
}
