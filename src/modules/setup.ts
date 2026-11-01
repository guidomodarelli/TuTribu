import { buildAuthModule } from "./auth/setup";
import { BetterAuthSessionRepository } from "./auth/infrastructure/repositories/better-auth-session-repository";
import {createRequestAuthenticatedAccountProvider} from "./auth/infrastructure/composition/authenticated-account-provider";
import { readMessagingRecoveryLock, readMessagingHostingSecurityConfig,readMessagingHostingSecurityFacts, readMessagingHostingPlatformRequirement } from "./messaging/infrastructure/config/messaging-hosting-security";
import { PLATFORM_SECURITY_REQUIREMENT } from "./shared/constants/platform-security";

import { buildTribesModule, buildTribeMembershipLifecycleModule, buildTribeLifecycleModule } from "./tribes/setup";
import { TribeLifecycleError } from "./tribes/domain/errors/tribe-lifecycle-error";
import { TRIBE_LIFECYCLE_ERROR } from "./tribes/constants/tribe-lifecycle";
import { AdmissionOperationError } from "./academy-admissions/domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "./academy-admissions/constants/admission-errors";
import { ADMISSION_VERIFICATION_DISPATCH_LOG } from "./academy-admissions/constants/admission-verification-dispatch";
import { ScopedAdmissionVerificationDispatcher } from "./academy-admissions/infrastructure/verification/admission-verification-message-sender";
import { PostgresTribeCreationRepository } from "./tribes/infrastructure/repositories/postgres-tribe-creation-repository";
import { PostgresTribeCreatorWhitelistRepository } from "./tribes/infrastructure/repositories/postgres-tribe-creator-whitelist-repository";
import { PostgresTribeInvitationRepository } from "./tribes/infrastructure/repositories/postgres-tribe-invitation-repository";
import { PostgresTribeReadRepository } from "./tribes/infrastructure/repositories/postgres-tribe-read-repository";
import { CloudflareImagesTribeImageRepository } from "./tribes/infrastructure/repositories/cloudflare-images-tribe-image-repository";
import { PostgresTribeIdentityRepository } from "./tribes/infrastructure/repositories/postgres-tribe-identity-repository";
import { PostgresTribeFreeJoinRepository } from "./tribes/infrastructure/repositories/postgres-tribe-free-join-repository";
import { PostgresTribePresenceRepository } from "./tribes/infrastructure/repositories/postgres-tribe-presence-repository";
import { PostgresTribeStoryRepository } from "./tribes/infrastructure/repositories/postgres-tribe-story-repository";
import { PostgresTribeSupportRepository } from "./tribes/infrastructure/repositories/postgres-tribe-support-repository";
import { PostgresTribeWelcomeRepository } from "./tribes/infrastructure/repositories/postgres-tribe-welcome-repository";
import { PostgresTribeWelcomeSelectionRepository } from "./tribes/infrastructure/repositories/postgres-tribe-welcome-selection-repository";
import { PostgresTribeAcademyAdmissionRepository } from "./tribes/infrastructure/repositories/postgres-tribe-academy-admission-repository";
import { buildAcademyAdmissionsModule, createPaidAdmissionResolutionWriter, createAdmissionMembershipLifecycleWriter, createAdmissionScopeClosureWriter } from "./academy-admissions/setup";
import { createAdmissionPlatformSecurityReader } from "./academy-admissions/infrastructure/composition/admission-platform-security";
import { PostgresAdmissionActivationRepository } from "./academy-admissions/infrastructure/repositories/postgres-admission-activation-repository";
import {PostgresMessagingSelectionDependencies} from "./academy-admissions/infrastructure/repositories/postgres-messaging-selection-dependencies";
import { buildMessagingModule, buildMessagingWorkModule, buildAdmissionMessagingMaintenanceModule } from "./messaging/setup";
import { AdmissionMessagingMaintenanceError } from "./messaging/domain/errors/admission-messaging-maintenance-error";
import type { AdmissionMessagingMaintenanceRuntime } from "./messaging/domain/repositories/admission-messaging-maintenance";
import { ADMISSION_MESSAGING_MAINTENANCE_LOG, ADMISSION_MESSAGING_MAINTENANCE_REASON } from "./messaging/constants/admission-messaging-maintenance";
import { MessagingCryptographyError } from "./messaging/infrastructure/encryption/messaging-cryptography-error";
import {createRegisteredMessagingAdapters} from "./messaging/infrastructure/composition/messaging-provider-adapters";
import {createAdmissionNotificationResourceAuthority} from "./notifications/infrastructure/messaging/admission-notification-resource-authority";
import {MESSAGING_AUTHORIZATION_PURPOSE} from "./messaging/constants/messaging-connection";
import {ScopedConnectionDiagnosticDispatcher} from "./messaging/infrastructure/composition/connection-diagnostic-dispatcher";
import {CONNECTION_DIAGNOSTIC_DISPATCH_LOG} from "./messaging/constants/connection-diagnostic";
import {PostgresMessagingLifecycleDependencies} from "./academy-admissions/infrastructure/repositories/postgres-messaging-lifecycle-dependencies";
import {readAdmissionEmailLifecycleDependency} from "./notifications/infrastructure/repositories/admission-email-lifecycle-reader";
import {REAUTHENTICATION_OPERATION} from "./auth/constants/reauthentication-resources";
import {after} from "next/server";
import type {RequestContext} from "./shared/infrastructure/observability/request-context";
import { getMessagingUsageCountryChoices } from "./messaging/infrastructure/composition/messaging-usage-country-choices";
import { createRequestMessagingMaintenanceAuthorizer } from "./messaging/infrastructure/auth/request-maintenance-authorizer";
import { createMessagingDispatchReporter } from "./messaging/infrastructure/messaging-observability";
import type { AuthenticatedFeatureDependencies } from "./auth/infrastructure/composition/transaction-account-provider";
import { resolvePublicAppBaseUrl } from "./shared/infrastructure/backend/public-app-base-url";
import { buildProductAccessModule } from "./product-access/setup";
import { PostgresProductAccessRepository } from "./product-access/infrastructure/repositories/postgres-product-access-repository";
import {
  insertAcademyGrantWithEnrollment,
  recordAcademyAuditEvent,
} from "./product-access/infrastructure/repositories/academy-access-sql";
import { isAcademySalesActivationAllowed } from "./product-access/infrastructure/config/academy-sales-activation";
import { buildMemberVerificationsModule } from "./member-verifications/setup";
import { PostgresMemberVerificationRepository } from "./member-verifications/infrastructure/repositories/postgres-member-verification-repository";
import { PostgresAcademySubscriptionRepository } from "./subscriptions/infrastructure/repositories/postgres-academy-subscription-repository";
import { PostgresMessageRoundRepository } from "./messages/infrastructure/repositories/postgres-message-round-repository";
import { PostgresTribeChannelRepository } from "./messages/infrastructure/repositories/postgres-tribe-channel-repository";
import { PostgresMessageMutationRepository } from "./messages/infrastructure/repositories/postgres-message-mutation-repository";
import { CloudflareImagesMessageImageRepository } from "./messages/infrastructure/repositories/cloudflare-images-message-image-repository";
import { R2MessageFileRepository } from "./messages/infrastructure/repositories/r2-message-file-repository";
import { buildMessagesModule } from "./messages/setup";
import { buildCoursesModule } from "./courses/setup";
import { PostgresCourseRepository } from "./courses/infrastructure/repositories/postgres-course-repository";
import { PostgresLessonCommentRepository } from "./courses/infrastructure/repositories/postgres-lesson-comment-repository";
import { PostgresLessonEventSourceRepository } from "./courses/infrastructure/repositories/postgres-lesson-event-source-repository";
import { R2LessonFileRepository } from "./courses/infrastructure/repositories/r2-lesson-file-repository";
import { buildEventsCalendarFeedModule, buildEventsModule } from "./events/setup";
import { calendarFeedTokenCodec } from "./events/infrastructure/calendar/calendar-feed-token-codec";
import {
  PostgresTribeEventCalendarFeedReader,
  PostgresTribeEventCalendarFeedTokenRepository,
} from "./events/infrastructure/repositories/postgres-tribe-event-calendar-feed-repository";
import { PostgresTribeEventOccurrenceCommentRepository } from "./events/infrastructure/repositories/postgres-tribe-event-occurrence-comment-repository";
import { PostgresTribeEventOccurrenceExceptionRepository } from "./events/infrastructure/repositories/postgres-tribe-event-occurrence-exception-repository";
import { PostgresTribeEventPostEventRepository } from "./events/infrastructure/repositories/postgres-tribe-event-post-event-repository";
import { PostgresTribeEventProposalRepository } from "./events/infrastructure/repositories/postgres-tribe-event-proposal-repository";
import { PostgresTribeEventReminderRepository } from "./events/infrastructure/repositories/postgres-tribe-event-reminder-repository";
import { PostgresTribeEventRepository } from "./events/infrastructure/repositories/postgres-tribe-event-repository";
import { lockTribeEventOccurrenceRecordingForShare } from "./events/infrastructure/repositories/tribe-event-occurrence-recording-lock";
import { PostgresNotificationRepository } from "./notifications/infrastructure/repositories/postgres-notification-repository";
import { buildNotificationsModule, buildAdmissionNotificationSettingsModule, buildAdmissionNotificationRecoveryContent } from "./notifications/setup";
import { buildSubscriptionsModule } from "./subscriptions/setup";
import { buildSitepingModule } from "./siteping/setup";
import { PostgresTribeMemberSubscriptionRepository } from "./subscriptions/infrastructure/repositories/postgres-tribe-member-subscription-repository";
import { PostgresTribePaymentIntegrationRepository } from "./subscriptions/infrastructure/repositories/postgres-tribe-payment-integration-repository";
import { PostgresTribeSubscriptionPriceRepository } from "./subscriptions/infrastructure/repositories/postgres-tribe-subscription-price-repository";
import {
  createMercadoPagoPreapprovalPlan,
  createMercadoPagoPreapprovalSubscription,
  createMercadoPagoPendingPreapprovalSubscription,
  findMercadoPagoSubscriptionCheckoutByReference,
  getMercadoPagoPreapprovalDetails,
  getMercadoPagoPreapprovalPlan,
  getMercadoPagoPreapprovalPlanStatus,
  getMercadoPagoAuthorizedPayment,
  getMercadoPagoPayment,
  getMercadoPagoPreapprovalStatus,
  refreshMercadoPagoAccessToken,
  searchMercadoPagoAuthorizedPayments,
  updateMercadoPagoPreapprovalBackUrl,
  updateMercadoPagoPreapprovalPlan,
  updateMercadoPagoPreapprovalSubscriptionStatus,
} from "./subscriptions/infrastructure/mercado-pago/mercado-pago-subscription-gateway";
import {
  createServerDatabaseClient,
  DATABASE_CONNECTION_USAGE,
  type DatabaseConnectionUsage,
} from "./shared/infrastructure/database/server-database-client";
import { createServerLogger } from "./shared/infrastructure/observability/server-logger";
import { FetchGitHubIssuePublisher } from "./siteping/infrastructure/github/github-issue-publisher";
import { CloudflareImagesSitepingScreenshotStorage } from "./siteping/infrastructure/cloudflare/cloudflare-images-siteping-screenshot-storage";
import { PostgresSitepingFeedbackRepository } from "./siteping/infrastructure/repositories/postgres-siteping-feedback-repository";

/**
 * One definition of "the platform cannot protect admissions" for public reads: the same hosting settings the writers sign with
 * (missing, unusable or locked), so the entry never offers a form, a code or an account change that every write would reject.
 * @returns Whether new admission work is closed by the platform.
 */
async function isAdmissionPlatformClosed(): Promise<boolean> {
  return (await readMessagingHostingPlatformRequirement()) !== null;
}

/**
 * The preflight names an explicit platform recovery lock only; unconfigured security is named by the rules read as its own requirement.
 * @returns Whether the hosting security is configured and locked for recovery.
 */
async function isAdmissionPlatformRecoveryLocked(): Promise<boolean> {
  return (await readMessagingHostingPlatformRequirement()) === PLATFORM_SECURITY_REQUIREMENT.recoveryLocked;
}

/**
 * Correlation id used by infrastructure loggers when the caller did not
 * propagate one for the current request.
 */
const FALLBACK_REQUEST_ID = "request";

type RequestScopedDatabaseClient = Awaited<ReturnType<typeof createServerDatabaseClient>>;

/**
 * @param databaseClient - Native checkout selected by the composition root.
 * @returns Session-backed feature dependencies whose writes run as the authenticated account.
 */
function createAuthenticatedRequestDependencies(databaseClient: RequestScopedDatabaseClient): AuthenticatedFeatureDependencies {
  return {
    accounts: createRequestAuthenticatedAccountProvider(), clock: () => new Date(),
    execute: (account, run) => databaseClient.withRequestContext({ userId: account.userId, email: account.normalizedEmail }, run),
  };
}

/**
 * @param admission - Academy admissions composition of the current request.
 * @param databaseClient - Native checkout used for the public tribe lookup.
 * @returns Canonical academy tribe routing, read without session identity.
 */
function createAcademyRequestRouting(admission: ReturnType<typeof buildAcademyAdmissionsModule>, databaseClient: RequestScopedDatabaseClient) {
  return admission.createQueryModule({ executePublic: (run) => databaseClient.withRequestContext({ userId: null, email: null }, run), readRecoveryLock: isAdmissionPlatformClosed }).useCases;
}
type RequestModuleContextOverrides = {
  databaseConnectionUsage?: DatabaseConnectionUsage;
  mercadoPagoWebhookVerified?: boolean;
  requestId?: string;
};
type MaintenanceModuleContextOverrides = Omit<
  RequestModuleContextOverrides,
  "databaseConnectionUsage"
>;

type RequestDatabaseExecutor = <T>(
  callback: Parameters<RequestScopedDatabaseClient["withRequestContext"]>[1]
) => Promise<T>;

/**
 * Builds the repositories that more than one request module shares.
 *
 * @param executeWithRequestContext - Request-scoped database executor.
 * @param requestId - Correlation id for traces and logs.
 * @returns The shared repositories and the member verifications module.
 */
function createSharedRequestRepositories(
  executeWithRequestContext: RequestDatabaseExecutor,
  requestId: string | undefined
) {
  const tribeSubscriptionPriceRepository =
    new PostgresTribeSubscriptionPriceRepository({
      executeWithDatabase: executeWithRequestContext,
      createMercadoPagoPlan: createMercadoPagoPreapprovalPlan,
      updateMercadoPagoPlan: updateMercadoPagoPreapprovalPlan,
      getMercadoPagoPlan: getMercadoPagoPreapprovalPlan,
      refreshMercadoPagoAccessToken,
      getMercadoPagoPlanStatus: getMercadoPagoPreapprovalPlanStatus,
      getMercadoPagoSubscriptionStatus: getMercadoPagoPreapprovalStatus,
      createAdmissionResolution: createPaidAdmissionResolutionWriter,
      requestId,
    });
  const messageImageRepository = new CloudflareImagesMessageImageRepository(
    executeWithRequestContext,
    {
      logger: createServerLogger({
        feature: "messages",
        operation: "message_images",
        requestId: requestId ?? FALLBACK_REQUEST_ID,
      }),
    }
  );
  const memberVerifications = buildMemberVerificationsModule({
    memberVerificationRepository: new PostgresMemberVerificationRepository(
      executeWithRequestContext,
      recordAcademyAuditEvent
    ),
  });
  const academySubscriptionRepository = new PostgresAcademySubscriptionRepository(
    executeWithRequestContext,
    {
      cancelPreapproval: updateMercadoPagoPreapprovalSubscriptionStatus,
      createPreapproval: createMercadoPagoPendingPreapprovalSubscription,
      findCheckoutByReference: findMercadoPagoSubscriptionCheckoutByReference,
      getAuthorizedPayment: getMercadoPagoAuthorizedPayment,
      getPayment: getMercadoPagoPayment,
      getPreapprovalStatus: getMercadoPagoPreapprovalStatus,
      refreshAccessToken: refreshMercadoPagoAccessToken,
      searchAuthorizedPayments: searchMercadoPagoAuthorizedPayments,
    },
    insertAcademyGrantWithEnrollment,
    recordAcademyAuditEvent
  );
  const messageFileRepository = new R2MessageFileRepository(
    executeWithRequestContext,
    {
      logger: createServerLogger({
        feature: "messages",
        operation: "message_files",
        requestId: requestId ?? FALLBACK_REQUEST_ID,
      }),
    }
  );

  return {
    academySubscriptionRepository,
    memberVerifications,
    messageFileRepository,
    messageImageRepository,
    tribeSubscriptionPriceRepository,
  };
}

/**
 * Builds the request-scoped product access module.
 *
 * @param executeWithRequestContext - Request-scoped database executor.
 * @param shared - Repositories shared with other request modules.
 * @returns The product access module.
 */
function buildRequestProductAccessModule(
  executeWithRequestContext: RequestDatabaseExecutor,
  { academySubscriptionRepository, memberVerifications }: ReturnType<typeof createSharedRequestRepositories>
) {
  return buildProductAccessModule({
    isAcademySalesActivationAllowed,
    now: () => new Date(),
    ownAcademyRenewalReader: {
      getOwnAcademyRenewal: ({ tribeSlug }) => academySubscriptionRepository.getOwnRenewal({ tribeSlug }),
    },
    ownVerificationStatesReader: {
      listOwnVerificationStates: memberVerifications.useCases.listOwnVerificationStates,
    },
    productAccessRepository: new PostgresProductAccessRepository(executeWithRequestContext),
  });
}

/**
 * Builds the request-scoped tribes module.
 *
 * @param scope - Request executor, database client, correlation id, and academy admissions.
 * @returns The tribes module.
 */
function buildRequestTribesModule({
  academyAdmissions,
  databaseClient,
  executeWithRequestContext,
  requestId,
}: {
  academyAdmissions: ReturnType<typeof buildAcademyAdmissionsModule>;
  databaseClient: RequestScopedDatabaseClient;
  executeWithRequestContext: RequestDatabaseExecutor;
  requestId: string | undefined;
}) {
  return buildTribesModule({
    academyAdmissionEntry: academyAdmissions.createAcademyEntryModule({ executePublic: (run) => databaseClient.withRequestContext({ userId: null, email: null }, run), readRecoveryLock: isAdmissionPlatformClosed, readSecurityConfig: () => readMessagingHostingSecurityConfig() }),
    tribeAcademyAdmissionRepository: new PostgresTribeAcademyAdmissionRepository(
      executeWithRequestContext
    ),
    tribeReadRepository: new PostgresTribeReadRepository(
      executeWithRequestContext
    ),
    tribeCreationRepository: new PostgresTribeCreationRepository(
      executeWithRequestContext
    ),
    tribeCreatorWhitelistRepository:
      new PostgresTribeCreatorWhitelistRepository(executeWithRequestContext),
    tribeInvitationRepository: new PostgresTribeInvitationRepository(
      executeWithRequestContext
    ),
    tribeStoryRepository: new PostgresTribeStoryRepository(
      executeWithRequestContext
    ),
    tribeFreeJoinRepository: new PostgresTribeFreeJoinRepository(
      executeWithRequestContext
    ),
    tribePresenceRepository: new PostgresTribePresenceRepository(
      executeWithRequestContext
    ),
    tribeIdentityRepository: new PostgresTribeIdentityRepository(
      executeWithRequestContext
    ),
    tribeImageRepository: new CloudflareImagesTribeImageRepository(
      executeWithRequestContext,
      {
        logger: createServerLogger({
          feature: "tribes",
          operation: "tribe_images",
          requestId: requestId ?? FALLBACK_REQUEST_ID,
        }),
      }
    ),
    tribeSupportRepository: new PostgresTribeSupportRepository(
      executeWithRequestContext
    ),
    tribeWelcomeRepository: new PostgresTribeWelcomeRepository(
      executeWithRequestContext
    ),
    tribeWelcomeSelectionRepository:
      new PostgresTribeWelcomeSelectionRepository(executeWithRequestContext),
  });
}

/**
 * Builds the request-scoped messages module.
 *
 * @param executeWithRequestContext - Request-scoped database executor.
 * @param shared - Repositories shared with other request modules.
 * @returns The messages module.
 */
function buildRequestMessagesModule(
  executeWithRequestContext: RequestDatabaseExecutor,
  { messageFileRepository, messageImageRepository }: ReturnType<typeof createSharedRequestRepositories>
) {
  return buildMessagesModule({
    tribeChannelRepository: new PostgresTribeChannelRepository(
      executeWithRequestContext
    ),
    listCachedTribeRoundSharedData: (query) =>
      import("./messages/infrastructure/cache/tribe-round-shared-data-cache").then(
        ({ listCachedTribeRoundSharedData }) =>
          listCachedTribeRoundSharedData(query)
      ),
    messageReplyRepository: new PostgresMessageMutationRepository(
      executeWithRequestContext
    ),
    messageCreationRepository: new PostgresMessageMutationRepository(
      executeWithRequestContext
    ),
    messageRoundReadRepository: new PostgresMessageRoundRepository(executeWithRequestContext),
    messageReactionRepository: new PostgresMessageMutationRepository(
      executeWithRequestContext
    ),
    messagePinRepository: new PostgresMessageMutationRepository(
      executeWithRequestContext
    ),
    messagePollRepository: new PostgresMessageMutationRepository(
      executeWithRequestContext
    ),
    messageDeletionRepository: new PostgresMessageMutationRepository(
      executeWithRequestContext
    ),
    messageCreatedAtUpdateRepository: new PostgresMessageMutationRepository(
      executeWithRequestContext
    ),
    messageContentUpdateRepository: new PostgresMessageMutationRepository(
      executeWithRequestContext
    ),
    messageFileRepository,
    messageImageRepository,
  });
}

/**
 * Builds the request-scoped courses module.
 *
 * @param executeWithRequestContext - Request-scoped database executor.
 * @param requestId - Correlation id for logs.
 * @returns The courses module.
 */
function buildRequestCoursesModule(
  executeWithRequestContext: RequestDatabaseExecutor,
  requestId: string | undefined
) {
  return buildCoursesModule({
    courseRepository: new PostgresCourseRepository(executeWithRequestContext),
    lessonCommentRepository: new PostgresLessonCommentRepository(
      executeWithRequestContext
    ),
    lessonEventSourceRepository: new PostgresLessonEventSourceRepository(
      executeWithRequestContext,
      lockTribeEventOccurrenceRecordingForShare
    ),
    lessonFileRepository: new R2LessonFileRepository(
      executeWithRequestContext,
      {
        logger: createServerLogger({
          feature: "courses",
          operation: "lesson_files",
          requestId: requestId ?? FALLBACK_REQUEST_ID,
        }),
      }
    ),
  });
}

/**
 * Builds the request-scoped events module.
 *
 * @param executeWithRequestContext - Request-scoped database executor.
 * @returns The events module.
 */
function buildRequestEventsModule(executeWithRequestContext: RequestDatabaseExecutor) {
  return buildEventsModule({
    tribeEventCalendarFeedTokenCodec: calendarFeedTokenCodec,
    tribeEventCalendarFeedTokenRepository: new PostgresTribeEventCalendarFeedTokenRepository(
      executeWithRequestContext
    ),
    tribeEventOccurrenceCommentRepository: new PostgresTribeEventOccurrenceCommentRepository(
      executeWithRequestContext
    ),
    tribeEventOccurrenceExceptionRepository:
      new PostgresTribeEventOccurrenceExceptionRepository(executeWithRequestContext),
    tribeEventPostEventRepository: new PostgresTribeEventPostEventRepository(
      executeWithRequestContext
    ),
    tribeEventProposalRepository: new PostgresTribeEventProposalRepository(
      executeWithRequestContext
    ),
    tribeEventReminderRepository: new PostgresTribeEventReminderRepository(
      executeWithRequestContext
    ),
    tribeEventRepository: new PostgresTribeEventRepository(
      executeWithRequestContext
    ),
  });
}

/**
 * Builds the request-scoped subscriptions module.
 *
 * @param executeWithRequestContext - Request-scoped database executor.
 * @param requestId - Correlation id for payment traces.
 * @param shared - Repositories shared with other request modules.
 * @returns The subscriptions module.
 */
function buildRequestSubscriptionsModule(
  executeWithRequestContext: RequestDatabaseExecutor,
  requestId: string | undefined,
  { academySubscriptionRepository, tribeSubscriptionPriceRepository }: ReturnType<typeof createSharedRequestRepositories>
) {
  return buildSubscriptionsModule({
    academySubscriptionRepository,
    isAcademySalesActivationAllowed,
    tribeMemberSubscriptionRepository:
      new PostgresTribeMemberSubscriptionRepository({
        executeWithDatabase: executeWithRequestContext,
        createMercadoPagoPreapprovalSubscription,
        getMercadoPagoPreapprovalDetails,
        getMercadoPagoPreapprovalStatus,
        updateMercadoPagoPreapprovalStatus: updateMercadoPagoPreapprovalSubscriptionStatus,
        updateMercadoPagoPreapprovalBackUrl,
        refreshMercadoPagoAccessToken,
        createAdmissionResolution: createPaidAdmissionResolutionWriter,
        requestId,
      }),
    tribePaymentIntegrationRepository:
      new PostgresTribePaymentIntegrationRepository(executeWithRequestContext),
    tribeProviderSubscriberReconciliationRepository:
      tribeSubscriptionPriceRepository,
    tribeSubscriberDiagnosticsRepository: tribeSubscriptionPriceRepository,
    tribeSubscriptionPriceRepository:
      tribeSubscriptionPriceRepository,
  });
}

/**
 * Builds request-scoped modules with database context and optional tracing metadata.
 *
 * @param contextOverrides - Request flags and correlation data for infrastructure adapters.
 * @returns Composed application modules for the current request.
 */
export async function createRequestModules(
  contextOverrides: RequestModuleContextOverrides = {}
) {
  const { requestId, databaseConnectionUsage, ...databaseContextOverrides } =
    contextOverrides;
  const connectionUsage =
    databaseConnectionUsage ?? DATABASE_CONNECTION_USAGE.request;
  const [databaseClient, authContext] = await Promise.all([
    createServerDatabaseClient(connectionUsage),
    import("./auth/infrastructure/better-auth/server-auth-context").then(
      ({ getRequestAuthContext }) => getRequestAuthContext()
    ),
  ]);
  const executeWithRequestContext = <T>(
    callback: Parameters<RequestScopedDatabaseClient["withRequestContext"]>[1]
  ) =>
    databaseClient.withRequestContext(
      {
        ...authContext,
        ...databaseContextOverrides,
      },
      callback
    ) as Promise<T>;
  const shared = createSharedRequestRepositories(executeWithRequestContext, requestId);
  const { memberVerifications } = shared;

  const academyAdmissions = buildAcademyAdmissionsModule(createAuthenticatedRequestDependencies(databaseClient));
  return {
    academyAdmissions,
    messaging: buildMessagingModule(createAuthenticatedRequestDependencies(databaseClient)),
    memberVerifications,
    productAccess: buildRequestProductAccessModule(executeWithRequestContext, shared),
    auth: buildAuthModule({
      authSessionRepository: new BetterAuthSessionRepository(),
      authenticatedAccountProvider:createRequestAuthenticatedAccountProvider(),
    }),
    tribes: buildRequestTribesModule({
      academyAdmissions,
      databaseClient,
      executeWithRequestContext,
      requestId,
    }),
    messages: buildRequestMessagesModule(executeWithRequestContext, shared),
    courses: buildRequestCoursesModule(executeWithRequestContext, requestId),
    events: buildRequestEventsModule(executeWithRequestContext),
    notifications: buildNotificationsModule({
      notificationRepository: new PostgresNotificationRepository(executeWithRequestContext, {
        logger: createServerLogger({
          feature: "notifications",
          operation: "notification_inbox",
          requestId: requestId ?? FALLBACK_REQUEST_ID,
        }),
      }),
    }),
    siteping: buildSitepingModule({
      githubIssuePublisher: new FetchGitHubIssuePublisher(),
      logger: createServerLogger({
        feature: "siteping",
        operation: "siteping-feedback",
        requestId: requestId ?? FALLBACK_REQUEST_ID,
      }),
      screenshotStorage: new CloudflareImagesSitepingScreenshotStorage(),
      sitepingFeedbackRepository: new PostgresSitepingFeedbackRepository(
        executeWithRequestContext
      ),
    }),
    subscriptions: buildRequestSubscriptionsModule(executeWithRequestContext, requestId, shared),
  };
}

/**
 * Builds modules for scheduled maintenance work, wired to the privileged
 * maintenance database connection instead of the least-privilege request
 * connection.
 *
 * The orphan-image cleanup cron drives owner-only SECURITY DEFINER maintenance
 * functions whose EXECUTE the migrations hold to the schema owner or a dedicated
 * maintenance role. Running them through the request connection would fail with
 * `permission denied` wherever `DATABASE_URL` is a least-privilege runtime role,
 * so maintenance entrypoints must compose through this helper rather than
 * `createRequestModules`.
 *
 * @param contextOverrides - Tracing correlation data for infrastructure adapters.
 * @returns Composed application modules bound to the maintenance connection.
 */
export async function createMaintenanceModules(
  contextOverrides: MaintenanceModuleContextOverrides = {}
) {
  return createRequestModules({
    ...contextOverrides,
    databaseConnectionUsage: DATABASE_CONNECTION_USAGE.maintenance,
  });
}

/**
 * Builds the modules of the public calendar feed. The feed has no session
 * (calendar apps send no cookies; the token in the URL is the credential), so
 * no auth context is read: the reader resolves the token without an app user
 * and then reads the calendar in a request context bound to the token owner.
 *
 * @returns The session-less calendar feed module.
 */
export async function createCalendarFeedModules() {
  const databaseClient = await createServerDatabaseClient(DATABASE_CONNECTION_USAGE.request);

  return {
    events: buildEventsCalendarFeedModule({
      tribeEventCalendarFeedReader: new PostgresTribeEventCalendarFeedReader(
        (userId) => (callback) =>
          databaseClient.withRequestContext({ email: null, userId }, callback)
      ),
      tribeEventCalendarFeedTokenCodec: calendarFeedTokenCodec,
    }),
  };
}

/**
 * Composes preadmission outside the membership scope with real native account and explicit database selection.
 * @param usage - Server-selected connection purpose; write entrypoints choose maintenance and still enforce actual human authority.
 * @returns Read-only public/own queries and implemented manual writers without a provider client or default key.
 */
export async function createAdmissionRequestModules(usage: DatabaseConnectionUsage = DATABASE_CONNECTION_USAGE.request) {
  const databaseClient = await createServerDatabaseClient(usage);
  const admissionModule = buildAcademyAdmissionsModule(createAuthenticatedRequestDependencies(databaseClient));
  const manualModule = admissionModule.createManualRequestModule({ readSecurityConfig: () => readMessagingHostingSecurityConfig() });
  const policyModule = admissionModule.createPolicyModule({ readSecurityConfig: () => readMessagingHostingSecurityConfig(), composePreflight: (database, context) => new PostgresAdmissionActivationRepository(database, context, manualModule.runtime, isAdmissionPlatformRecoveryLocked) });
  const queryModule = createAcademyRequestRouting(admissionModule, databaseClient);
  // The rules page evaluates the same preparation as the activation, so a denied activation can name what is missing.
  const policyQueryModule = admissionModule.createPolicyQueryModule({ composePreparation: policyModule.composePreparation, readSecurityConfig: () => readMessagingHostingSecurityConfig() });
  return {
    queries: queryModule,
    policyQuery: policyQueryModule.useCases,
    policyPage: policyQueryModule.createPage(queryModule.resolveTribe),
    policyCommands: policyModule.useCases,
    policyPreflight: admissionModule.createPreflightModule({ runtime: manualModule.runtime, readRecoveryLock: isAdmissionPlatformRecoveryLocked }).useCases,
    // The inbox closes with the decision writers' own rule: the hosting security they sign with, attested in the reviewer transaction.
    reviews: admissionModule.createReviewQueryModule({ readSecurityConfig: () => readMessagingHostingSecurityConfig() }).useCases,
    observations: admissionModule.createActivityQueryModule().useCases,
    manual: manualModule.useCases,
  };
}

/** @returns Current leader-only list reads and commands over the backend owner connection, with native account checks and no provider dependency. */
export async function createAllowlistRequestModule() {
  const databaseClient = await createServerDatabaseClient(DATABASE_CONNECTION_USAGE.maintenance);
  const dependencies = createAuthenticatedRequestDependencies(databaseClient);
  const admissionModule = buildAcademyAdmissionsModule(dependencies);
  const resolveTribe = createAcademyRequestRouting(admissionModule, databaseClient).resolveTribe;
  const allowlist = admissionModule.createAllowlistModule({ readSecurityConfig: () => readMessagingHostingSecurityConfig() });
  const policyQuery = admissionModule.createPolicyQueryModule({ composePreparation: null, readSecurityConfig: () => readMessagingHostingSecurityConfig() });
  return { resolveTribe, allowlist: allowlist.useCases, imports: allowlist.imports, page: allowlist.createPage(resolveTribe, policyQuery.useCases), policyPage: policyQuery.createPage(resolveTribe) };
}
/** @returns Only personal preview over the guarded backend connection, without provider calls or caller-selected identity. */
export async function createPersonalInvitationRequestModule() {
  const databaseClient = await createServerDatabaseClient(DATABASE_CONNECTION_USAGE.maintenance);
  const dependencies = createAuthenticatedRequestDependencies(databaseClient);
  const admissionModule = buildAcademyAdmissionsModule(dependencies);
  const personal = admissionModule.createPersonalInvitationQueryModule({ readSecurityConfig: () => readMessagingHostingSecurityConfig() });
  return { preview: personal.useCases.overview, page: personal.page };
}
/** @returns Leader-only metadata and explicit original personal commands, with configured public links and native account checks on each checkout. */
export async function createPersonalInvitationManagementRequestModule() {
  const databaseClient = await createServerDatabaseClient(DATABASE_CONNECTION_USAGE.maintenance);
  const dependencies = createAuthenticatedRequestDependencies(databaseClient);
  const admissionModule = buildAcademyAdmissionsModule(dependencies);
  const resolveTribe = createAcademyRequestRouting(admissionModule, databaseClient).resolveTribe;
  const personal = admissionModule.createPersonalInvitationModule({ readSecurityConfig: () => readMessagingHostingSecurityConfig() });
  const policy = admissionModule.createPolicyQueryModule({ composePreparation: null, readSecurityConfig: () => readMessagingHostingSecurityConfig() });
  return { resolveTribe, invitations: personal.useCases, publicOrigin: resolvePublicAppBaseUrl, page: personal.createPage(resolveTribe, policy.useCases) };
}
/** @param usage - Native connection purpose; writes select maintenance and still require exact human authority. @returns Early usage configuration and canonical academy routing, without a connection, admission policy writer or provider adapter. */
export async function createMessagingUsageRequestModule(usage: DatabaseConnectionUsage = DATABASE_CONNECTION_USAGE.request) {
  const { dependencies, routing } = await openRoutedMessagingRequest(usage);
  // The page shows, from its own read, whether the ledger can protect a save, with the same checks a save runs.
  const usageModule = buildMessagingModule(dependencies).createUsageModule({ readSecurityConfig: () => readMessagingHostingSecurityConfig(), readPlatformRequirement: createAdmissionPlatformSecurityReader(() => readMessagingHostingSecurityConfig()) });
  return { usage: usageModule.useCases, operation: usageModule.operation, createPage: () => usageModule.createPage(routing.resolveTribe, getMessagingUsageCountryChoices()), resolveTribe: routing.resolveTribe };
}

/**
 * Shares one native account projection and database selection across the existing private observation and usage owners.
 * @param usage - Server-selected read connection purpose, never browser authority.
 * @returns One page/snapshot composition without an Inspector, Sender, secret read or implicit configuration write.
 */
export async function createAdmissionActivityRequestModule(usage: DatabaseConnectionUsage = DATABASE_CONNECTION_USAGE.request) {
  const databaseClient = await createServerDatabaseClient(usage);
  const dependencies = createAuthenticatedRequestDependencies(databaseClient);
  const admission = buildAcademyAdmissionsModule(dependencies);
  const routing = createAcademyRequestRouting(admission, databaseClient);
  const observations = admission.createActivityQueryModule();
  const currentUsage = buildMessagingModule(dependencies).createUsageModule({ readSecurityConfig: () => readMessagingHostingSecurityConfig() });
  return { createPage: () => observations.createPage(routing.resolveTribe, currentUsage.useCases) };
}

/** @returns Only native request-history and canonical routing over the request connection, without a sender, keyring or general audit capability. */
export async function createAdmissionReviewHistoryRequestModule() {
  const databaseClient = await createServerDatabaseClient(DATABASE_CONNECTION_USAGE.request);
  const admission = buildAcademyAdmissionsModule(createAuthenticatedRequestDependencies(databaseClient));
  const routing = createAcademyRequestRouting(admission, databaseClient);
  return { page: admission.createReviewHistoryQueryModule().createPage(routing.resolveTribe) };
}

/** @param usage - Native guarded connection purpose; creation uses maintenance with exact human authority. @returns Protected candidate creation and canonical routing without Inspector/Sender execution. */
export async function createMessagingConnectionManagementRequestModule(usage: DatabaseConnectionUsage = DATABASE_CONNECTION_USAGE.maintenance) {
  const { dependencies, routing } = await openRoutedMessagingRequest(usage);
  const connections = buildMessagingModule(dependencies).createConnectionManagementModule({ readSecurityConfig: () => readMessagingHostingSecurityConfig() });
  return { connections: connections.useCases, resolveTribe: routing.resolveTribe };
}

/** @param usage - Native guarded connection purpose. @returns The guarded checkout, the current authenticated dependencies and canonical academy tenant routing. */
async function openRoutedMessagingRequest(usage: DatabaseConnectionUsage) {
  const databaseClient = await createServerDatabaseClient(usage);
  const dependencies = createAuthenticatedRequestDependencies(databaseClient);
  const routing = createAcademyRequestRouting(buildAcademyAdmissionsModule(dependencies), databaseClient);
  return { databaseClient, dependencies, routing };
}

/** @param usage - Native guarded connection purpose. @returns The routed request plus the management messaging request module with current hosting security. */
async function openMessagingManagementRequest(usage: DatabaseConnectionUsage) {
  const routed = await openRoutedMessagingRequest(usage);
  const request = buildMessagingModule(routed.dependencies).createRequestModule({ selection: "management", readSecurityConfig: () => readMessagingHostingSecurityConfig() });
  return { ...routed, request };
}

/** @param databaseClient - Native guarded checkout selected by this composition root. @returns Explicit implemented provider ports with current actor/purpose/resource reads and no credential cache. */
function createRequestMessagingProviderAdapters(databaseClient:Awaited<ReturnType<typeof createServerDatabaseClient>>){
  return createRegisteredMessagingAdapters({execute:(context,run)=>databaseClient.withRequestContext({userId:context.authorizationPurpose===MESSAGING_AUTHORIZATION_PURPOSE.sensitiveLeader?context.actorUserId:context.contributingLeaderUserId,email:null},run),readSecurityFacts:async()=>readMessagingHostingSecurityFacts(),fetch:globalThis.fetch,authorizeDeliveryResource:createAdmissionNotificationResourceAuthority(()=>readMessagingHostingSecurityConfig()).marked});
}

/** @param usage - Native guarded connection purpose; the mutation retains exact current human authority. @returns Only staged credential inspection and canonical routing, without message or activation capabilities. */
export async function createMessagingCredentialValidationRequestModule(usage: DatabaseConnectionUsage = DATABASE_CONNECTION_USAGE.maintenance) {
  const { databaseClient, routing, request } = await openMessagingManagementRequest(usage);
  return { validation: request.createCredentialValidation(createRequestMessagingProviderAdapters(databaseClient).inspectors), resolveTribe: routing.resolveTribe };
}

/** @param usage - Native read connection purpose; this path does not load keyrings or contact a provider. @returns Current leader/guardian configuration and canonical tenant routing. */
export async function createMessagingConfigurationRequestModule(usage:DatabaseConnectionUsage=DATABASE_CONNECTION_USAGE.request){
  const { databaseClient, dependencies, routing } = await openRoutedMessagingRequest(usage);
  // The leader's read reports whether the ledger can protect the connection writes, with the same checks those writes run.
  const configuration=buildMessagingModule(dependencies).createConfigurationModule({readSecurityFacts:async()=>readMessagingHostingSecurityFacts(),readPlatformRequirement:createAdmissionPlatformSecurityReader(()=>readMessagingHostingSecurityConfig())});
  const providerAdapters=createRequestMessagingProviderAdapters(databaseClient);
  return{configuration:configuration.useCases,resolveTribe:routing.resolveTribe,createPage:()=>configuration.createPage(routing.resolveTribe,{read:()=>providerAdapters.catalog.map((provider)=>({id:provider.id,channels:[...provider.channels]}))}),createSummaryPage:()=>configuration.createSummaryPage(routing.resolveTribe,{read:()=>providerAdapters.catalog.map((provider)=>({id:provider.id,channels:[...provider.channels]}))})};
}

/** @returns Own preference and independent leader email settings with native owner transactions, current session authority and canonical routing; no provider adapters or sends are composed. The leader's email read also attests, as the ledger does, whether the platform can protect a change. */
export async function createAdmissionNotificationSettingsRequestModule() {
  const databaseClient = await createServerDatabaseClient(DATABASE_CONNECTION_USAGE.maintenance);
  const dependencies = createAuthenticatedRequestDependencies(databaseClient);
  const admissions = buildAcademyAdmissionsModule(dependencies);
  const routing = createAcademyRequestRouting(admissions, databaseClient);
  const notifications = buildAdmissionNotificationSettingsModule(dependencies, { resolver: admissions.useCases.resolveContext, readSecurityConfig: () => readMessagingHostingSecurityConfig(), readPlatformSecurity: createAdmissionPlatformSecurityReader(() => readMessagingHostingSecurityConfig()) });
  return { resolveTribe: routing.resolveTribe, ...notifications.useCases, page: notifications.createPage(routing.resolveTribe) };
}

/** @param usage - Native guarded read purpose. @returns Sensitive current leader resource enumeration and tenant routing, without a dispatcher. */
export async function createMessagingResourceRequestModule(usage:DatabaseConnectionUsage=DATABASE_CONNECTION_USAGE.request){
  const { databaseClient, routing, request } = await openMessagingManagementRequest(usage);
  return{resources:request.createResourceListing(createRequestMessagingProviderAdapters(databaseClient).inspectors),resolveTribe:routing.resolveTribe};
}

/** @param usage - Native protected write purpose. @returns Only versioned configuration and canonical routing with explicitly scoped inspectors. */
export async function createMessagingConnectionConfigurationRequestModule(usage:DatabaseConnectionUsage=DATABASE_CONNECTION_USAGE.maintenance){
  const { databaseClient, routing, request } = await openMessagingManagementRequest(usage);
  return{configuration:request.createConnectionConfiguration(createRequestMessagingProviderAdapters(databaseClient).inspectors),resolveTribe:routing.resolveTribe};
}

/** @param requestContext - Native boundary correlation, with no client permission facts. @returns Exact diagnostic issuance/verification with focal original dispatch and canonical routing. */
export async function createMessagingDiagnosticRequestModule(requestContext:RequestContext){
  const { databaseClient, routing, request } = await openMessagingManagementRequest(DATABASE_CONNECTION_USAGE.maintenance);
  const logger=createServerLogger({feature:CONNECTION_DIAGNOSTIC_DISPATCH_LOG.feature,operation:REAUTHENTICATION_OPERATION.diagnoseMessagingConnection,...requestContext});
  const adapters=createRequestMessagingProviderAdapters(databaseClient);
  const dispatcher=new ScopedConnectionDiagnosticDispatcher({readSecurityFacts:async()=>readMessagingHostingSecurityFacts(),createDispatcher:(diagnosticScope,authorize)=>buildMessagingWorkModule({diagnosticScope,authorize,execute:(actorUserId,run)=>databaseClient.withRequestContext({userId:actorUserId,email:null},run),readSecurityConfig:()=>readMessagingHostingSecurityConfig(),createSender:adapters.createSender,runtime:{now:Date.now,createId:()=>crypto.randomUUID(),defer:(work)=>{after(()=>work);},report:createMessagingDispatchReporter(logger,CONNECTION_DIAGNOSTIC_DISPATCH_LOG.message)}}).useCases.dispatch});
  return{issue:request.createDiagnosticIssuance(dispatcher),verify:request.useCases.verifyDiagnostic,resolveTribe:routing.resolveTribe};
}

/** @param requestContext - Safe correlation owned by the current request boundary. @returns Applicant code use cases and canonical routing with exact post-commit worker authority derived from the original challenge. */
export async function createAdmissionContactVerificationRequestModule(requestContext: RequestContext) {
  const databaseClient = await createServerDatabaseClient(DATABASE_CONNECTION_USAGE.maintenance);
  const dependencies = createAuthenticatedRequestDependencies(databaseClient);
  const admissionModule = buildAcademyAdmissionsModule(dependencies);
  const routing = createAcademyRequestRouting(admissionModule, databaseClient);
  const logger = createServerLogger({ feature: ADMISSION_VERIFICATION_DISPATCH_LOG.feature, operation: ADMISSION_VERIFICATION_DISPATCH_LOG.operation, ...requestContext });
  const adapters = createRequestMessagingProviderAdapters(databaseClient);
  const verification = admissionModule.createContactVerificationModule({
    readSecurityConfig: () => readMessagingHostingSecurityConfig(),
    createDispatcher: (resolve) => new ScopedAdmissionVerificationDispatcher({
      resolve, readSecurityFacts: async () => readMessagingHostingSecurityFacts(),
      createDispatcher: (focalScope, authorize) => buildMessagingWorkModule({
        focalScope, authorize,
        execute: (actorUserId, run) => databaseClient.withRequestContext({ userId: actorUserId, email: null }, run),
        readSecurityConfig: () => readMessagingHostingSecurityConfig(), createSender: adapters.createSender,
        runtime: { now: Date.now, createId: () => crypto.randomUUID(), defer: (work) => { after(() => work); }, report: createMessagingDispatchReporter(logger, ADMISSION_VERIFICATION_DISPATCH_LOG.message) },
      }).useCases.dispatch,
    }),
  }).useCases;
  return { verification, resolveTribe: routing.resolveTribe };
}

/** @returns DB-only current-contact selection and canonical routing without provider adapters. */
export async function createAdmissionCurrentChallengeRequestModule() {
  const databaseClient = await createServerDatabaseClient(DATABASE_CONNECTION_USAGE.maintenance);
  const dependencies = createAuthenticatedRequestDependencies(databaseClient);
  const admissionModule = buildAcademyAdmissionsModule(dependencies);
  const routing = createAcademyRequestRouting(admissionModule, databaseClient);
  return { currentChallenge: admissionModule.createCurrentChallengeModule({ readSecurityConfig: () => readMessagingHostingSecurityConfig() }).useCase, resolveTribe: routing.resolveTribe };
}

/** @returns Own pending proof attachment and canonical routing through native session authority, without creating provider or dispatch adapters. */
export async function createAdmissionProofApplicationRequestModule() {
  const databaseClient = await createServerDatabaseClient(DATABASE_CONNECTION_USAGE.maintenance);
  const dependencies = createAuthenticatedRequestDependencies(databaseClient);
  const admissionModule = buildAcademyAdmissionsModule(dependencies);
  const routing = createAcademyRequestRouting(admissionModule, databaseClient);
  return { applyProof: admissionModule.createProofApplicationModule({ readSecurityConfig: () => readMessagingHostingSecurityConfig() }).useCases, resolveTribe: routing.resolveTribe };
}

/** @returns Native membership command/recovery composition with an owner transaction; no HTTP input selects the actor, role or database connection. */
export async function createTribeMembershipRequestModule() {
  const accounts = createRequestAuthenticatedAccountProvider(), databaseClient = await createServerDatabaseClient(DATABASE_CONNECTION_USAGE.maintenance);
  const dependencies: AuthenticatedFeatureDependencies = { accounts, clock: () => new Date(), execute: (account, run) => databaseClient.withRequestContext({ userId: account.userId, email: account.normalizedEmail }, run) };
  const routing = createAcademyRequestRouting(buildAcademyAdmissionsModule(dependencies), databaseClient);
  const membership = buildTribeMembershipLifecycleModule({ accounts, clock: dependencies.clock, readSecurityConfig: async () => readMessagingHostingSecurityConfig(), admission: createAdmissionMembershipLifecycleWriter, execute: async (context, run) => {
    const account = await accounts.getAuthenticatedAccount();
    if (account?.userId !== context.actorUserId || account.session.id !== context.sessionId) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
    return databaseClient.withRequestContext({ userId: account.userId, email: account.normalizedEmail }, run);
  } }).useCases;
  return { membership, resolveTribe: routing.resolveTribe };
}

/** @returns Native lifecycle composition whose fixed UUID supports original recovery after physical tribe deletion. */
export async function createTribeLifecycleRequestModule() {
  const accounts = createRequestAuthenticatedAccountProvider(), databaseClient = await createServerDatabaseClient(DATABASE_CONNECTION_USAGE.maintenance);
  return { lifecycle: buildTribeLifecycleModule({ accounts, readSecurityConfig: async () => readMessagingHostingSecurityConfig(), admission: createAdmissionScopeClosureWriter, execute: async (context, run) => {
    const account = await accounts.getAuthenticatedAccount();
    if (account?.userId !== context.actorUserId || account.session.id !== context.sessionId) throw new TribeLifecycleError(TRIBE_LIFECYCLE_ERROR.authenticationRequired);
    return databaseClient.withRequestContext({ userId: account.userId, email: account.normalizedEmail }, run);
  } }).useCases };
}

/** @returns Local safety/retirement use cases with native authority and current admission/notification owners, without provider wiring. */
export async function createMessagingConnectionLifecycleRequestModule(){
  const { dependencies, routing } = await openRoutedMessagingRequest(DATABASE_CONNECTION_USAGE.maintenance);
  const lifecycle=buildMessagingModule(dependencies).createConnectionLifecycleModule({readSecurityConfig:()=>readMessagingHostingSecurityConfig(),composeDependencies:(database)=>new PostgresMessagingLifecycleDependencies(database,readAdmissionEmailLifecycleDependency)}).useCases;
  return{lifecycle,resolveTribe:routing.resolveTribe};
}

/** @returns Minimal current leader/challenge-owner transport and routing, without loading keyrings or contacting the provider. */
export async function createMessageDeliveryReadRequestModule(){
  const { dependencies, routing } = await openRoutedMessagingRequest(DATABASE_CONNECTION_USAGE.request);
  return{delivery:buildMessagingModule(dependencies).createDeliveryReadModule().useCases,resolveTribe:routing.resolveTribe};
}

/** @returns Explicit original-notification recovery and canonical routing, with no provider call or automatic dispatch. */
export async function createNotificationDeliveryRecoveryRequestModule() {
  const { dependencies, routing } = await openRoutedMessagingRequest(DATABASE_CONNECTION_USAGE.maintenance);
  const readSecurityConfig = () => readMessagingHostingSecurityConfig();
  const recovery = buildMessagingModule(dependencies).createNotificationRecoveryModule({ readSecurityConfig, groupContent: buildAdmissionNotificationRecoveryContent(readSecurityConfig) });
  return { recovery: recovery.useCases, resolveTribe: routing.resolveTribe };
}

/** @returns Original actor/tribe-owned recovery metadata and canonical routing without loading platform keys or creating work. */
export async function createNotificationRecoveryOperationRequestModule() {
  const { dependencies, routing } = await openRoutedMessagingRequest(DATABASE_CONNECTION_USAGE.maintenance);
  const operation = buildMessagingModule(dependencies).createNotificationRecoveryOperationReadModule();
  return { operation: operation.useCases, resolveTribe: routing.resolveTribe };
}

/** @returns Bounded current leader notification metadata and canonical routing, without keys or writes. */
export async function createNotificationDeliveryCatalogRequestModule() {
  const { dependencies, routing } = await openRoutedMessagingRequest(DATABASE_CONNECTION_USAGE.request);
  const catalog = buildMessagingModule(dependencies).createNotificationDeliveryCatalogModule();
  return { catalog: catalog.useCases, resolveTribe: routing.resolveTribe };
}

/** @returns Current native candidate activation with feature-owned metadata/evidence changes in one protected transaction, without provider calls. */
export async function createMessagingConnectionActivationRequestModule(){
  const { routing, request } = await openMessagingManagementRequest(DATABASE_CONNECTION_USAGE.maintenance);
  return{activation:request.createConnectionActivation((database)=>new PostgresMessagingSelectionDependencies(database,readAdmissionEmailLifecycleDependency)),resolveTribe:routing.resolveTribe};
}

/** @returns Readonly original connection operations under native actor/session/tribe authority, without a keyring or provider. */
export async function createMessagingConnectionOperationRequestModule(){
  const { dependencies, routing } = await openRoutedMessagingRequest(DATABASE_CONNECTION_USAGE.maintenance);
  return{operation:buildMessagingModule(dependencies).createConnectionOperationReadModule().useCases,resolveTribe:routing.resolveTribe};
}

/** @param error - Failure reported by the maintenance workflow. @returns Closed reason logged for it, never the raw error text. */
function resolveMaintenanceFailureReason(error: unknown) {
  if (error instanceof AdmissionMessagingMaintenanceError) return error.reason;
  if (error instanceof MessagingCryptographyError) return ADMISSION_MESSAGING_MAINTENANCE_REASON.configurationUnavailable;
  return ADMISSION_MESSAGING_MAINTENANCE_REASON.operationUnresolved;
}

/** @param request - Actual native request, never a browser principal or authority flag. @param context - Bounded private correlation selected by the HTTP boundary. @returns The complete workflow after current bearer authorization, with no global provider credential or pre-composition database read. */
export async function createAdmissionMessagingMaintenanceRequestModule(request: Request, context: RequestContext) {
  const authorize = createRequestMessagingMaintenanceAuthorizer(request);
  if (!await authorize()) throw new AdmissionMessagingMaintenanceError(ADMISSION_MESSAGING_MAINTENANCE_REASON.authorityUnavailable);
  const databaseClient = await createServerDatabaseClient(DATABASE_CONNECTION_USAGE.maintenance);
  const logger = createServerLogger({ feature: ADMISSION_MESSAGING_MAINTENANCE_LOG.feature, operation: ADMISSION_MESSAGING_MAINTENANCE_LOG.operation, ...context });
  const runtime: AdmissionMessagingMaintenanceRuntime = {
    now: Date.now,
    createId: () => crypto.randomUUID(),
    defer: (work) => { after(() => work); },
    report: (error, diagnostic) => {
      const reason = resolveMaintenanceFailureReason(error);
      logger.error({ message: ADMISSION_MESSAGING_MAINTENANCE_LOG.failureMessage, metadata: { operation: diagnostic.operation, reason, ...(diagnostic.runId ? { runId: diagnostic.runId } : {}), ...(diagnostic.phase ? { phase: diagnostic.phase } : {}) } });
    },
  };
  return buildAdmissionMessagingMaintenanceModule({
    execute: (actorUserId, work) => databaseClient.withRequestContext({ userId: actorUserId, email: null }, work),
    authorize,
    readRecoveryLock: async () => readMessagingRecoveryLock(),
    readExternalScope: async () => { const facts = readMessagingHostingSecurityFacts(); return facts.environment && facts.securityEpoch ? { environment: facts.environment, securityEpoch: facts.securityEpoch } : null; },
    readSecurityConfig: () => readMessagingHostingSecurityConfig(),
    publicAppBaseUrl: () => { try { return resolvePublicAppBaseUrl(); } catch (error) { throw new AdmissionMessagingMaintenanceError(ADMISSION_MESSAGING_MAINTENANCE_REASON.configurationUnavailable, { cause: error }); } },
    runtime,
    dispatchRuntime: { now: runtime.now, createId: runtime.createId, defer: (work) => runtime.defer(work), report: createMessagingDispatchReporter(logger, ADMISSION_MESSAGING_MAINTENANCE_LOG.failureMessage) },
    createSenders: (execute) => {
      const adapters = createRegisteredMessagingAdapters({ execute: (scope, work) => {
        if (scope.authorizationPurpose !== MESSAGING_AUTHORIZATION_PURPOSE.authorizedDelivery) throw new AdmissionMessagingMaintenanceError(ADMISSION_MESSAGING_MAINTENANCE_REASON.authorityUnavailable);
        return execute(scope.contributingLeaderUserId, work);
      }, readSecurityFacts: async () => readMessagingHostingSecurityFacts(), fetch: globalThis.fetch, authorizeDeliveryResource: createAdmissionNotificationResourceAuthority(() => readMessagingHostingSecurityConfig()).marked });
      return { createSender: adapters.createSender, createNotificationSender: adapters.createNotificationSender };
    },
  });
}
