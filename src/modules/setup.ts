import { buildAuthModule } from "./auth/setup";
import { BetterAuthSessionRepository } from "./auth/infrastructure/repositories/better-auth-session-repository";
import { buildTribesModule } from "./tribes/setup";
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
import { PostgresMessageRoundRepository } from "./messages/infrastructure/repositories/postgres-message-round-repository";
import { PostgresTribeChannelRepository } from "./messages/infrastructure/repositories/postgres-tribe-channel-repository";
import { PostgresMessageMutationRepository } from "./messages/infrastructure/repositories/postgres-message-mutation-repository";
import { CloudflareImagesMessageImageRepository } from "./messages/infrastructure/repositories/cloudflare-images-message-image-repository";
import { R2MessageFileRepository } from "./messages/infrastructure/repositories/r2-message-file-repository";
import { buildMessagesModule } from "./messages/setup";
import { buildCoursesModule } from "./courses/setup";
import { PostgresCourseRepository } from "./courses/infrastructure/repositories/postgres-course-repository";
import { PostgresLessonCommentRepository } from "./courses/infrastructure/repositories/postgres-lesson-comment-repository";
import { R2LessonFileRepository } from "./courses/infrastructure/repositories/r2-lesson-file-repository";
import { buildEventsCalendarFeedModule, buildEventsModule } from "./events/setup";
import { calendarFeedTokenCodec } from "./events/infrastructure/calendar/calendar-feed-token-codec";
import {
  PostgresTribeEventCalendarFeedReader,
  PostgresTribeEventCalendarFeedTokenRepository,
} from "./events/infrastructure/repositories/postgres-tribe-event-calendar-feed-repository";
import { PostgresTribeEventOccurrenceExceptionRepository } from "./events/infrastructure/repositories/postgres-tribe-event-occurrence-exception-repository";
import { PostgresTribeEventProposalRepository } from "./events/infrastructure/repositories/postgres-tribe-event-proposal-repository";
import { PostgresTribeEventReminderRepository } from "./events/infrastructure/repositories/postgres-tribe-event-reminder-repository";
import { PostgresTribeEventRepository } from "./events/infrastructure/repositories/postgres-tribe-event-repository";
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
  getMercadoPagoPreapprovalDetails,
  getMercadoPagoPreapprovalPlan,
  getMercadoPagoPreapprovalPlanStatus,
  getMercadoPagoPreapprovalStatus,
  refreshMercadoPagoAccessToken,
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
    auth: buildAuthModule({
      authSessionRepository: new BetterAuthSessionRepository(),
    }),
    tribes: buildTribesModule({
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
      tribeEventOccurrenceExceptionRepository:
        new PostgresTribeEventOccurrenceExceptionRepository(executeWithRequestContext),
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
      notificationRepository: new PostgresNotificationRepository(executeWithRequestContext),
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
      tribeMemberSubscriptionRepository:
        new PostgresTribeMemberSubscriptionRepository(
          executeWithRequestContext,
          createMercadoPagoPreapprovalSubscription,
          getMercadoPagoPreapprovalDetails,
          getMercadoPagoPreapprovalStatus,
          updateMercadoPagoPreapprovalSubscriptionStatus,
          updateMercadoPagoPreapprovalBackUrl,
          refreshMercadoPagoAccessToken,
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
