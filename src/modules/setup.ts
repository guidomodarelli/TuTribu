import { buildAuthModule } from "./auth/setup";
import { BetterAuthSessionRepository } from "./auth/infrastructure/repositories/better-auth-session-repository";
import {createRequestAuthenticatedAccountProvider} from "./auth/infrastructure/composition/authenticated-account-provider";
import { readMessagingRecoveryLock, readMessagingHostingSecurityConfig,readMessagingHostingSecurityFacts } from "./messaging/infrastructure/config/messaging-hosting-security";
import { buildTribesModule, buildTribeLeadershipModule } from "./tribes/setup";
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
import { buildAcademyAdmissionsModule, createPaidAdmissionResolutionWriter } from "./academy-admissions/setup";
import { PostgresAdmissionActivationRepository } from "./academy-admissions/infrastructure/repositories/postgres-admission-activation-repository";
import {PostgresMessagingSelectionDependencies} from "./academy-admissions/infrastructure/repositories/postgres-messaging-selection-dependencies";
import { buildMessagingModule, buildMessagingWorkModule, type MessagingWorkDependencies } from "./messaging/setup";
import {createRegisteredMessagingAdapters} from "./messaging/infrastructure/composition/messaging-provider-adapters";
import {MESSAGING_AUTHORIZATION_PURPOSE} from "./messaging/constants/messaging-connection";
import {ScopedConnectionDiagnosticDispatcher} from "./messaging/infrastructure/composition/connection-diagnostic-dispatcher";
import {CONNECTION_DIAGNOSTIC_DISPATCH_LOG} from "./messaging/constants/connection-diagnostic";
import {MessagingDeliveryStorageError} from "./messaging/domain/errors/messaging-delivery-storage-error";
import {MessagingDispatchDeadlineError} from "./messaging/domain/errors/messaging-dispatch-deadline-error";
import {PostgresMessagingLifecycleDependencies} from "./academy-admissions/infrastructure/repositories/postgres-messaging-lifecycle-dependencies";
import {readAdmissionEmailLifecycleDependency} from "./notifications/infrastructure/repositories/admission-email-lifecycle-reader";
import {REAUTHENTICATION_OPERATION} from "./auth/constants/reauthentication-resources";
import {after} from "next/server";
import type {RequestContext} from "./shared/infrastructure/observability/request-context";
import { getMessagingUsageCountryChoices } from "./messaging/infrastructure/composition/messaging-usage-country-choices";
import { createRequestMessagingMaintenanceAuthorizer } from "./messaging/infrastructure/auth/request-maintenance-authorizer";
import { MessagingSecretAccessError } from "./messaging/domain/errors/messaging-secret-access-error";
import { MESSAGING_ERROR_CODE } from "./messaging/constants/messaging-errors";
import type { AuthenticatedFeatureDependencies } from "./auth/infrastructure/composition/transaction-account-provider";
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
import { buildNotificationsModule } from "./notifications/setup";
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
 * Correlation id used by infrastructure loggers when the caller did not
 * propagate one for the current request.
 */
const FALLBACK_REQUEST_ID = "request";

type RequestScopedDatabaseClient = Awaited<ReturnType<typeof createServerDatabaseClient>>;
type RequestModuleContextOverrides = {
  databaseConnectionUsage?: DatabaseConnectionUsage;
  mercadoPagoWebhookVerified?: boolean;
  requestId?: string;
};
type MaintenanceModuleContextOverrides = Omit<
  RequestModuleContextOverrides,
  "databaseConnectionUsage"
>;

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
  const tribeSubscriptionPriceRepository =
    new PostgresTribeSubscriptionPriceRepository(
      executeWithRequestContext,
      createMercadoPagoPreapprovalPlan,
      updateMercadoPagoPreapprovalPlan,
      getMercadoPagoPreapprovalPlan,
      refreshMercadoPagoAccessToken,
      getMercadoPagoPreapprovalPlanStatus,
      getMercadoPagoPreapprovalStatus,
      createPaidAdmissionResolutionWriter,
      requestId
    );
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

  const academyAdmissions = buildAcademyAdmissionsModule({
      accounts: createRequestAuthenticatedAccountProvider(),
      execute: (account, run) => databaseClient.withRequestContext({ userId: account.userId, email: account.normalizedEmail }, run),
      clock: () => new Date(),
    } satisfies AuthenticatedFeatureDependencies);
  return {
    academyAdmissions,
    messaging: buildMessagingModule({
      accounts: createRequestAuthenticatedAccountProvider(),
      execute: (account, run) => databaseClient.withRequestContext({ userId: account.userId, email: account.normalizedEmail }, run),
      clock: () => new Date(),
    } satisfies AuthenticatedFeatureDependencies),
    memberVerifications,
    productAccess: buildProductAccessModule({
      isAcademySalesActivationAllowed,
      now: () => new Date(),
      ownAcademyRenewalReader: {
        getOwnAcademyRenewalStatus: ({ tribeSlug }) =>
          academySubscriptionRepository.getOwnRenewalStatus({ tribeSlug }),
      },
      ownVerificationStatesReader: {
        listOwnVerificationStates: memberVerifications.useCases.listOwnVerificationStates,
      },
      productAccessRepository: new PostgresProductAccessRepository(executeWithRequestContext),
    }),
    auth: buildAuthModule({
      authSessionRepository: new BetterAuthSessionRepository(),
      authenticatedAccountProvider:createRequestAuthenticatedAccountProvider(),
    }),
    tribes: buildTribesModule({
      academyAdmissionEntry: academyAdmissions.createAcademyEntryModule({ executePublic: (run) => databaseClient.withRequestContext({ userId: null, email: null }, run), readRecoveryLock: async () => readMessagingRecoveryLock(), readSecurityConfig: () => readMessagingHostingSecurityConfig() }),
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
    }),
    messages: buildMessagesModule({
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
    }),
    courses: buildCoursesModule({
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
    }),
    events: buildEventsModule({
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
    }),
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
    subscriptions: buildSubscriptionsModule({
      academySubscriptionRepository,
      isAcademySalesActivationAllowed,
      tribeMemberSubscriptionRepository:
        new PostgresTribeMemberSubscriptionRepository(
          executeWithRequestContext,
          createMercadoPagoPreapprovalSubscription,
          getMercadoPagoPreapprovalDetails,
          getMercadoPagoPreapprovalStatus,
          updateMercadoPagoPreapprovalSubscriptionStatus,
          updateMercadoPagoPreapprovalBackUrl,
          refreshMercadoPagoAccessToken,
          createPaidAdmissionResolutionWriter,
          requestId
        ),
      tribePaymentIntegrationRepository:
        new PostgresTribePaymentIntegrationRepository(executeWithRequestContext),
      tribeProviderSubscriberReconciliationRepository:
        tribeSubscriptionPriceRepository,
      tribeSubscriberDiagnosticsRepository: tribeSubscriptionPriceRepository,
      tribeSubscriptionPriceRepository:
        tribeSubscriptionPriceRepository,
    }),
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
 * Creates a distinct backend root from a live native bearer and explicit runtime/security/sender dependencies.
 * @param options - Server-owned job configuration, without a browser principal, global key or SDK fallback.
 * @returns Private implemented messaging worker capabilities; it installs no cron or public endpoint.
 * @throws MessagingSecretAccessError before database composition when current bearer authority is absent.
 */
export async function createAdmissionMessagingWorkModules(options: Omit<MessagingWorkDependencies, "execute" | "authorize"> & { request: Request; readCurrentCronSecret: () => string | undefined }) {
  const authorize = createRequestMessagingMaintenanceAuthorizer(options.request, options.readCurrentCronSecret);
  if (!await authorize()) throw new MessagingSecretAccessError(MESSAGING_ERROR_CODE.permissionDenied);
  const databaseClient = await createServerDatabaseClient(DATABASE_CONNECTION_USAGE.maintenance);
  return buildMessagingWorkModule({
    ...options, authorize,
    execute: (actorUserId, run) => databaseClient.withRequestContext({ userId: actorUserId, email: null }, run),
  });
}

/**
 * Composes preadmission outside the membership scope with real native account and explicit database selection.
 * @param usage - Server-selected connection purpose; write entrypoints choose maintenance and still enforce actual human authority.
 * @returns Read-only public/own queries and implemented manual writers without a provider client or default key.
 */
export async function createAdmissionRequestModules(usage: DatabaseConnectionUsage = DATABASE_CONNECTION_USAGE.request) {
  const databaseClient = await createServerDatabaseClient(usage);
  const admissionModule = buildAcademyAdmissionsModule({
    accounts: createRequestAuthenticatedAccountProvider(), clock: () => new Date(),
    execute: (account, run) => databaseClient.withRequestContext({ userId: account.userId, email: account.normalizedEmail }, run),
  });
  const manualModule = admissionModule.createManualRequestModule({ readSecurityConfig: () => readMessagingHostingSecurityConfig() });
  const policyModule = admissionModule.createPolicyModule({ readSecurityConfig: () => readMessagingHostingSecurityConfig(), composePreflight: (database, context) => new PostgresAdmissionActivationRepository(database, context, manualModule.runtime) });
  const queryModule = admissionModule.createQueryModule({ executePublic: (run) => databaseClient.withRequestContext({ userId: null, email: null }, run), readRecoveryLock: async () => readMessagingRecoveryLock() }).useCases;
  const policyQueryModule = admissionModule.createPolicyQueryModule({ composePreparation: null });
  return {
    queries: queryModule,
    policyQuery: policyQueryModule.useCases,
    policyPage: policyQueryModule.createPage(queryModule.resolveTribe),
    policyCommands: policyModule.useCases,
    policyPreflight: admissionModule.createPreflightModule({ runtime: manualModule.runtime }).useCases,
    reviews: admissionModule.createReviewQueryModule({ readRecoveryLock: async () => readMessagingRecoveryLock() }).useCases,
    manual: manualModule.useCases,
  };
}

/** @param usage - Native connection purpose; writes select maintenance and still require exact human authority. @returns Early usage configuration and canonical academy routing, without a connection, admission policy writer or provider adapter. */
export async function createMessagingUsageRequestModule(usage: DatabaseConnectionUsage = DATABASE_CONNECTION_USAGE.request) {
  const databaseClient = await createServerDatabaseClient(usage);
  const dependencies: AuthenticatedFeatureDependencies = {
    accounts: createRequestAuthenticatedAccountProvider(), clock: () => new Date(),
    execute: (account, run) => databaseClient.withRequestContext({ userId: account.userId, email: account.normalizedEmail }, run),
  };
  const routing = buildAcademyAdmissionsModule(dependencies).createQueryModule({ executePublic: (run) => databaseClient.withRequestContext({ userId: null, email: null }, run), readRecoveryLock: async () => readMessagingRecoveryLock() }).useCases;
  const usageModule = buildMessagingModule(dependencies).createUsageModule({ readSecurityConfig: () => readMessagingHostingSecurityConfig() });
  return { usage: usageModule.useCases, operation: usageModule.operation, createPage: () => usageModule.createPage(routing.resolveTribe, getMessagingUsageCountryChoices()), resolveTribe: routing.resolveTribe };
}

/** @param usage - Native guarded connection purpose; creation uses maintenance with exact human authority. @returns Protected candidate creation and canonical routing without Inspector/Sender execution. */
export async function createMessagingConnectionManagementRequestModule(usage: DatabaseConnectionUsage = DATABASE_CONNECTION_USAGE.maintenance) {
  const databaseClient = await createServerDatabaseClient(usage);
  const dependencies: AuthenticatedFeatureDependencies = {
    accounts: createRequestAuthenticatedAccountProvider(), clock: () => new Date(),
    execute: (account, run) => databaseClient.withRequestContext({ userId: account.userId, email: account.normalizedEmail }, run),
  };
  const routing = buildAcademyAdmissionsModule(dependencies).createQueryModule({ executePublic: (run) => databaseClient.withRequestContext({ userId: null, email: null }, run), readRecoveryLock: async () => readMessagingRecoveryLock() }).useCases;
  const connections = buildMessagingModule(dependencies).createConnectionManagementModule({ readSecurityConfig: () => readMessagingHostingSecurityConfig() });
  return { connections: connections.useCases, resolveTribe: routing.resolveTribe };
}

/** @param databaseClient - Native guarded checkout selected by this composition root. @returns Explicit implemented provider ports with current actor/purpose/resource reads and no credential cache. */
function createRequestMessagingProviderAdapters(databaseClient:Awaited<ReturnType<typeof createServerDatabaseClient>>){
  return createRegisteredMessagingAdapters({execute:(context,run)=>databaseClient.withRequestContext({userId:context.authorizationPurpose===MESSAGING_AUTHORIZATION_PURPOSE.sensitiveLeader?context.actorUserId:context.contributingLeaderUserId,email:null},run),readSecurityFacts:async()=>readMessagingHostingSecurityFacts(),fetch:globalThis.fetch});
}

/** @param usage - Native guarded connection purpose; the mutation retains exact current human authority. @returns Only staged credential inspection and canonical routing, without message or activation capabilities. */
export async function createMessagingCredentialValidationRequestModule(usage: DatabaseConnectionUsage = DATABASE_CONNECTION_USAGE.maintenance) {
  const databaseClient = await createServerDatabaseClient(usage);
  const dependencies: AuthenticatedFeatureDependencies = {
    accounts: createRequestAuthenticatedAccountProvider(), clock: () => new Date(),
    execute: (account, run) => databaseClient.withRequestContext({ userId: account.userId, email: account.normalizedEmail }, run),
  };
  const routing = buildAcademyAdmissionsModule(dependencies).createQueryModule({ executePublic: (run) => databaseClient.withRequestContext({ userId: null, email: null }, run), readRecoveryLock: async () => readMessagingRecoveryLock() }).useCases;
  const request = buildMessagingModule(dependencies).createRequestModule({ selection: "management", readSecurityConfig: () => readMessagingHostingSecurityConfig() });
  return { validation: request.createCredentialValidation(createRequestMessagingProviderAdapters(databaseClient).inspectors), resolveTribe: routing.resolveTribe };
}

/** @param usage - Native read connection purpose; this path does not load keyrings or contact a provider. @returns Current leader/guardian configuration and canonical tenant routing. */
export async function createMessagingConfigurationRequestModule(usage:DatabaseConnectionUsage=DATABASE_CONNECTION_USAGE.request){
  const databaseClient=await createServerDatabaseClient(usage);
  const dependencies:AuthenticatedFeatureDependencies={accounts:createRequestAuthenticatedAccountProvider(),clock:()=>new Date(),execute:(account,run)=>databaseClient.withRequestContext({userId:account.userId,email:account.normalizedEmail},run)};
  const routing=buildAcademyAdmissionsModule(dependencies).createQueryModule({executePublic:(run)=>databaseClient.withRequestContext({userId:null,email:null},run),readRecoveryLock:async()=>readMessagingRecoveryLock()}).useCases;
  const configuration=buildMessagingModule(dependencies).createConfigurationModule({readSecurityFacts:async()=>readMessagingHostingSecurityFacts()});
  return{configuration:configuration.useCases,resolveTribe:routing.resolveTribe,createPage:()=>configuration.createPage(routing.resolveTribe)};
}

/** @param usage - Native guarded read purpose. @returns Sensitive current leader resource enumeration and tenant routing, without a dispatcher. */
export async function createMessagingResourceRequestModule(usage:DatabaseConnectionUsage=DATABASE_CONNECTION_USAGE.request){
  const databaseClient=await createServerDatabaseClient(usage);
  const dependencies:AuthenticatedFeatureDependencies={accounts:createRequestAuthenticatedAccountProvider(),clock:()=>new Date(),execute:(account,run)=>databaseClient.withRequestContext({userId:account.userId,email:account.normalizedEmail},run)};
  const routing=buildAcademyAdmissionsModule(dependencies).createQueryModule({executePublic:(run)=>databaseClient.withRequestContext({userId:null,email:null},run),readRecoveryLock:async()=>readMessagingRecoveryLock()}).useCases;
  const request=buildMessagingModule(dependencies).createRequestModule({selection:"management",readSecurityConfig:()=>readMessagingHostingSecurityConfig()});
  return{resources:request.createResourceListing(createRequestMessagingProviderAdapters(databaseClient).inspectors),resolveTribe:routing.resolveTribe};
}

/** @param usage - Native protected write purpose. @returns Only versioned configuration and canonical routing with explicitly scoped inspectors. */
export async function createMessagingConnectionConfigurationRequestModule(usage:DatabaseConnectionUsage=DATABASE_CONNECTION_USAGE.maintenance){
  const databaseClient=await createServerDatabaseClient(usage);
  const dependencies:AuthenticatedFeatureDependencies={accounts:createRequestAuthenticatedAccountProvider(),clock:()=>new Date(),execute:(account,run)=>databaseClient.withRequestContext({userId:account.userId,email:account.normalizedEmail},run)};
  const routing=buildAcademyAdmissionsModule(dependencies).createQueryModule({executePublic:(run)=>databaseClient.withRequestContext({userId:null,email:null},run),readRecoveryLock:async()=>readMessagingRecoveryLock()}).useCases;
  const request=buildMessagingModule(dependencies).createRequestModule({selection:"management",readSecurityConfig:()=>readMessagingHostingSecurityConfig()});
  return{configuration:request.createConnectionConfiguration(createRequestMessagingProviderAdapters(databaseClient).inspectors),resolveTribe:routing.resolveTribe};
}

/** @param requestContext - Native boundary correlation, with no client permission facts. @returns Exact diagnostic issuance/verification with focal original dispatch and canonical routing. */
export async function createMessagingDiagnosticRequestModule(requestContext:RequestContext){
  const databaseClient=await createServerDatabaseClient(DATABASE_CONNECTION_USAGE.maintenance);
  const dependencies:AuthenticatedFeatureDependencies={accounts:createRequestAuthenticatedAccountProvider(),clock:()=>new Date(),execute:(account,run)=>databaseClient.withRequestContext({userId:account.userId,email:account.normalizedEmail},run)};
  const routing=buildAcademyAdmissionsModule(dependencies).createQueryModule({executePublic:(run)=>databaseClient.withRequestContext({userId:null,email:null},run),readRecoveryLock:async()=>readMessagingRecoveryLock()}).useCases;
  const request=buildMessagingModule(dependencies).createRequestModule({selection:"management",readSecurityConfig:()=>readMessagingHostingSecurityConfig()});
  const logger=createServerLogger({feature:CONNECTION_DIAGNOSTIC_DISPATCH_LOG.feature,operation:REAUTHENTICATION_OPERATION.diagnoseMessagingConnection,...requestContext});
  const adapters=createRequestMessagingProviderAdapters(databaseClient);
  const dispatcher=new ScopedConnectionDiagnosticDispatcher({readSecurityFacts:async()=>readMessagingHostingSecurityFacts(),createDispatcher:(diagnosticScope,authorize)=>buildMessagingWorkModule({diagnosticScope,authorize,execute:(actorUserId,run)=>databaseClient.withRequestContext({userId:actorUserId,email:null},run),readSecurityConfig:()=>readMessagingHostingSecurityConfig(),createSender:adapters.createSender,runtime:{now:Date.now,createId:()=>crypto.randomUUID(),defer:(work)=>{after(()=>work);},report:(diagnostic)=>{const code=diagnostic.cause instanceof MessagingDeliveryStorageError||diagnostic.cause instanceof MessagingSecretAccessError||diagnostic.cause instanceof MessagingDispatchDeadlineError?diagnostic.cause.code:MESSAGING_ERROR_CODE.unexpectedFailure;logger.error({message:CONNECTION_DIAGNOSTIC_DISPATCH_LOG.message,metadata:{stage:diagnostic.stage,code,deliveryId:diagnostic.deliveryId,attemptId:diagnostic.attemptId}});}}}).useCases.dispatch});
  return{issue:request.createDiagnosticIssuance(dispatcher),verify:request.useCases.verifyDiagnostic,resolveTribe:routing.resolveTribe};
}

/** @param requestContext - Safe correlation owned by the current request boundary. @returns Applicant code use cases and canonical routing with exact post-commit worker authority derived from the original challenge. */
export async function createAdmissionContactVerificationRequestModule(requestContext: RequestContext) {
  const databaseClient = await createServerDatabaseClient(DATABASE_CONNECTION_USAGE.maintenance);
  const dependencies: AuthenticatedFeatureDependencies = {
    accounts: createRequestAuthenticatedAccountProvider(), clock: () => new Date(),
    execute: (account, run) => databaseClient.withRequestContext({ userId: account.userId, email: account.normalizedEmail }, run),
  };
  const admissionModule = buildAcademyAdmissionsModule(dependencies);
  const routing = admissionModule.createQueryModule({ executePublic: (run) => databaseClient.withRequestContext({ userId: null, email: null }, run), readRecoveryLock: async () => readMessagingRecoveryLock() }).useCases;
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
        runtime: { now: Date.now, createId: () => crypto.randomUUID(), defer: (work) => { after(() => work); }, report: (diagnostic) => {
          const code = diagnostic.cause instanceof MessagingDeliveryStorageError || diagnostic.cause instanceof MessagingSecretAccessError || diagnostic.cause instanceof MessagingDispatchDeadlineError ? diagnostic.cause.code : MESSAGING_ERROR_CODE.unexpectedFailure;
          logger.error({ message: ADMISSION_VERIFICATION_DISPATCH_LOG.message, metadata: { stage: diagnostic.stage, code, deliveryId: diagnostic.deliveryId, attemptId: diagnostic.attemptId } });
        } },
      }).useCases.dispatch,
    }),
  }).useCases;
  return { verification, resolveTribe: routing.resolveTribe };
}

/** @returns Native request composition for an explicit canonical leadership operation, without creating a general transfer route or loading a BYOK. */
export async function createTribeLeadershipRequestModule(){
  const accounts=createRequestAuthenticatedAccountProvider(),databaseClient=await createServerDatabaseClient(DATABASE_CONNECTION_USAGE.maintenance);
  return buildTribeLeadershipModule({accounts,clock:()=>new Date(),readSecurityConfig:async()=>readMessagingHostingSecurityConfig(),execute:async(context,run)=>{
    const account=await accounts.getAuthenticatedAccount();if(!account||account.userId!==context.actorUserId||account.session.id!==context.sessionId)throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
    return databaseClient.withRequestContext({userId:account.userId,email:account.normalizedEmail},run);
  }});
}

/** @returns Local safety/retirement use cases with native authority and current admission/notification owners, without provider wiring. */
export async function createMessagingConnectionLifecycleRequestModule(){
  const databaseClient=await createServerDatabaseClient(DATABASE_CONNECTION_USAGE.maintenance);
  const dependencies:AuthenticatedFeatureDependencies={accounts:createRequestAuthenticatedAccountProvider(),clock:()=>new Date(),execute:(account,run)=>databaseClient.withRequestContext({userId:account.userId,email:account.normalizedEmail},run)};
  const routing=buildAcademyAdmissionsModule(dependencies).createQueryModule({executePublic:(run)=>databaseClient.withRequestContext({userId:null,email:null},run),readRecoveryLock:async()=>readMessagingRecoveryLock()}).useCases;
  const lifecycle=buildMessagingModule(dependencies).createConnectionLifecycleModule({readSecurityConfig:()=>readMessagingHostingSecurityConfig(),composeDependencies:(database)=>new PostgresMessagingLifecycleDependencies(database,readAdmissionEmailLifecycleDependency)}).useCases;
  return{lifecycle,resolveTribe:routing.resolveTribe};
}

/** @returns Minimal current leader/challenge-owner transport and routing, without loading keyrings or contacting the provider. */
export async function createMessageDeliveryReadRequestModule(){
  const databaseClient=await createServerDatabaseClient(DATABASE_CONNECTION_USAGE.request);
  const dependencies:AuthenticatedFeatureDependencies={accounts:createRequestAuthenticatedAccountProvider(),clock:()=>new Date(),execute:(account,run)=>databaseClient.withRequestContext({userId:account.userId,email:account.normalizedEmail},run)};
  const routing=buildAcademyAdmissionsModule(dependencies).createQueryModule({executePublic:(run)=>databaseClient.withRequestContext({userId:null,email:null},run),readRecoveryLock:async()=>readMessagingRecoveryLock()}).useCases;
  return{delivery:buildMessagingModule(dependencies).createDeliveryReadModule().useCases,resolveTribe:routing.resolveTribe};
}

/** @returns Current native candidate activation with feature-owned metadata/evidence changes in one protected transaction, without provider calls. */
export async function createMessagingConnectionActivationRequestModule(){
  const databaseClient=await createServerDatabaseClient(DATABASE_CONNECTION_USAGE.maintenance);
  const dependencies:AuthenticatedFeatureDependencies={accounts:createRequestAuthenticatedAccountProvider(),clock:()=>new Date(),execute:(account,run)=>databaseClient.withRequestContext({userId:account.userId,email:account.normalizedEmail},run)};
  const routing=buildAcademyAdmissionsModule(dependencies).createQueryModule({executePublic:(run)=>databaseClient.withRequestContext({userId:null,email:null},run),readRecoveryLock:async()=>readMessagingRecoveryLock()}).useCases;
  const request=buildMessagingModule(dependencies).createRequestModule({selection:"management",readSecurityConfig:()=>readMessagingHostingSecurityConfig()});
  return{activation:request.createConnectionActivation((database)=>new PostgresMessagingSelectionDependencies(database,readAdmissionEmailLifecycleDependency)),resolveTribe:routing.resolveTribe};
}

/** @returns Readonly original connection operations under native actor/session/tribe authority, without a keyring or provider. */
export async function createMessagingConnectionOperationRequestModule(){
  const databaseClient=await createServerDatabaseClient(DATABASE_CONNECTION_USAGE.maintenance);
  const dependencies:AuthenticatedFeatureDependencies={accounts:createRequestAuthenticatedAccountProvider(),clock:()=>new Date(),execute:(account,run)=>databaseClient.withRequestContext({userId:account.userId,email:account.normalizedEmail},run)};
  const routing=buildAcademyAdmissionsModule(dependencies).createQueryModule({executePublic:(run)=>databaseClient.withRequestContext({userId:null,email:null},run),readRecoveryLock:async()=>readMessagingRecoveryLock()}).useCases;
  return{operation:buildMessagingModule(dependencies).createConnectionOperationReadModule().useCases,resolveTribe:routing.resolveTribe};
}
