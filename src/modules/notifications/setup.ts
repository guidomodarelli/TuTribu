/** Composes the generic inbox, native admission settings and explicitly authorized private email preparation. @module notifications-setup */
import "server-only";
import type { AuthenticatedFeatureDependencies } from "@/src/modules/auth/infrastructure/composition/transaction-account-provider";
import type { ResolveAdmissionContextUseCase } from "@/src/modules/academy-admissions/application/use-cases/resolve-admission-context-use-case";
import type { MessagingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-security-config";
import { createIdentityBoundExecutor } from "@/src/modules/academy-admissions/infrastructure/composition/identity-bound-executor";
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
import { PostgresAdmissionNotificationGroupRecoveryContent } from "./infrastructure/repositories/postgres-admission-notification-group-recovery-content";
import type { NotificationGroupRecoveryContent } from "@/src/modules/messaging/infrastructure/notification-group-recovery-content";
import { PrepareAdmissionEmailNotificationsUseCase } from "./application/use-cases/prepare-admission-email-notifications-use-case";
import { MaterializeAdmissionNotificationRemindersUseCase } from "./application/use-cases/materialize-admission-notification-reminders-use-case";
import { PostgresAdmissionNotificationProducer } from "./infrastructure/repositories/postgres-admission-notification-producer";
import { PostgresAdmissionNotificationCollectionProgress, type AdmissionNotificationCollectionExecutor } from "./infrastructure/repositories/postgres-admission-notification-collection-progress";
import { PostgresAdmissionNotificationGroupPreparation } from "./infrastructure/repositories/postgres-admission-notification-group-preparation";
import type { AdmissionNotificationProducerRuntime } from "./domain/repositories/admission-notification-producer";

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
  const execute = createIdentityBoundExecutor(dependencies);
  const useCases = {
    preferences: new AdmissionNotificationPreferencesUseCases(options.resolver, new PostgresAdmissionNotificationPreferenceRepository(execute)),
    email: new AdmissionNotificationEmailSettingsUseCases(options.resolver, new PostgresAdmissionNotificationEmailSettingsRepository(execute, options.readSecurityConfig)),
  };
  return { useCases, createPage: (resolveTribe: Pick<ResolveAdmissionTribeUseCase, "execute">) => new GetAdmissionNotificationSettingsPageUseCase(dependencies.accounts, { ...useCases, resolveTribe }, dependencies.clock) };
}

/** @param readSecurityConfig - Explicit current local epoch and retained keyring source. @returns The complete-group content collaborator for the original human recovery transaction; no pool, RPC or durable authority is created. */
export function buildAdmissionNotificationRecoveryContent(readSecurityConfig: () => Promise<MessagingSecurityConfig>): NotificationGroupRecoveryContent {
  return new PostgresAdmissionNotificationGroupRecoveryContent(readSecurityConfig);
}

/** @param dependencies - Private current job authority and original transaction, without keys or public-link configuration. @returns An independently observable unique internal reminder phase. */
export function buildAdmissionNotificationReminderModule(dependencies: { execute: AdmissionNotificationCollectionExecutor; authorize: () => Promise<boolean>; readRecoveryLock: () => Promise<boolean> }) {
  return { useCases: { materializeReminders: new MaterializeAdmissionNotificationRemindersUseCase(new PostgresAdmissionNotificationProducer(dependencies.execute, dependencies.authorize, dependencies.readRecoveryLock)) } };
}

/** @param dependencies - Native guarded maintenance owner, live bearer/recovery gates, local security and public canonical origin. @returns The composed bounded producer from logical reminders through whole original outbox; no provider call or scheduler is activated. */
export function buildAdmissionNotificationProducerModule(dependencies: { execute: AdmissionNotificationCollectionExecutor; authorize: () => Promise<boolean>; readRecoveryLock: () => Promise<boolean>; readSecurityConfig: () => Promise<MessagingSecurityConfig>; publicAppBaseUrl: string; runtime: AdmissionNotificationProducerRuntime }) {
  const producer = new PostgresAdmissionNotificationProducer(dependencies.execute, dependencies.authorize, dependencies.readRecoveryLock);
  const authorize = async () => dependencies.authorize();
  const progress = new PostgresAdmissionNotificationCollectionProgress(dependencies.execute, authorize, dependencies.readSecurityConfig, dependencies.runtime.now);
  const preparation = new PostgresAdmissionNotificationGroupPreparation(dependencies.execute, authorize, dependencies.readSecurityConfig, dependencies.publicAppBaseUrl);
  return { useCases: { prepareEmailNotifications: new PrepareAdmissionEmailNotificationsUseCase(producer, progress, preparation, dependencies.runtime) } };
}

/** @param dependencies - Explicit current job authority, original guarded executor, local security and registered code-free sender factory. @returns A private prepared sender and its guarded preparation port; no queue claim, endpoint or scheduler is activated. */
export function buildAdmissionNotificationDeliveryModule(dependencies: { execute: AdmissionNotificationPreparationExecutor; authorize: () => Promise<boolean>; readSecurityConfig: () => Promise<MessagingSecurityConfig>; createSender: (preparation: NotificationDeliveryPreparation) => MessageDeliverySender }) {
  const authority = createAdmissionNotificationResourceAuthority(dependencies.readSecurityConfig);
  const secrets = new PostgresEncryptedSecretStore({ executeWithDatabase: dependencies.execute, accounts: { getAuthenticatedAccount: async () => null }, readSecurityConfig: dependencies.readSecurityConfig, purpose: MESSAGING_AUTHORIZATION_PURPOSE.authorizedDelivery, authorizeDeliveryResource: authority.marked });
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
