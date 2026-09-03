import { createHash } from "node:crypto";

import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { UpcomingTribeEvents } from "@/components/events/upcoming-tribe-events";
import { OpenInExternalBrowser } from "@/components/subscriptions/open-in-external-browser";
import { SubscriptionReturnStatus } from "@/components/subscriptions/subscription-return-status";
import {
  TribeOpenJoin,
  TribeOpenJoinStatus,
} from "@/components/subscriptions/tribe-open-join";
import { QUERY_PARAMS } from "@/src/constants/query-params";
import { ROUTES } from "@/src/constants/routes";
import { getServerBetterAuthSession as getSession } from "@/src/modules/auth/infrastructure/better-auth/server-auth-context";
import { selectMessageIdsNeedingVideoThumbnail } from "@/src/modules/messages/application/use-cases/resolve-missing-video-thumbnails-use-case";
import { scheduleMissingVideoThumbnailBackfill } from "@/src/modules/messages/infrastructure/composition/video-thumbnail-backfill";
import {
  TRIBE_CURRENT_SUBSCRIPTION_OFFER_STATUS,
  TRIBE_MEMBER_SUBSCRIPTION_STATUS,
} from "@/src/modules/subscriptions/constants/subscriptions";
import { createRequestModules } from "@/src/modules/setup";
import { resolvePublicAppBaseUrl } from "@/src/modules/shared/infrastructure/backend/public-app-base-url";
import {
  buildExternalBrowserUrl,
  type ExternalBrowserPlatform,
} from "@/src/modules/shared/infrastructure/http/external-browser-link";
import { detectInAppBrowser } from "@/src/modules/shared/infrastructure/http/in-app-browser-detection";
import { TribeRound } from "@/components/tribe-round/tribe-round";
import {
  TRIBE_MEMBERSHIP_STATUS_REASON,
  TRIBE_PAGE_ACCESS_REASON,
  TRIBE_PAGE_ACCESS_STATUS,
} from "@/src/modules/tribes/application/results/tribe-page-access-result";
import TribeLoadingPage from "./loading";
import { resolveTribePageAccess } from "./tribe-page-access";
import styles from "./page.module.scss";

const TRIBE_PAGE_LOG_REASON = {
  unexpectedEventRepositoryError: "unexpected_event_repository_error",
  unexpectedRoundRepositoryError: "unexpected_round_repository_error",
  unexpectedSubscriptionReturnRepositoryError:
    "unexpected_subscription_return_repository_error",
} as const;

const TRIBE_PAGE_LOG = {
  hiddenAccessMessage: "Tribe access hidden",
  operation: "tribe-page",
  resolveRoundFailureMessage: "Failed to resolve tribe round",
  resolveUpcomingEventsFailureMessage: "Failed to resolve upcoming tribe events",
  resolveSubscriptionReturnFailureMessage:
    "Failed to resolve subscription return",
  unauthenticatedSubscriptionReturnMessage:
    "Unauthenticated Mercado Pago subscription return",
} as const;

const TRIBE_PAGE_QUERY = {
  channel: "channel",
  joinStatus: "join_status",
  mercadoPagoPreapprovalId: "preapproval_id",
  page: "page",
} as const;

const SIGN_IN_REDIRECT_URL_TOKEN = {
  querySeparator: "?",
  valueSeparator: "=",
} as const;

const OPEN_JOIN_IDEMPOTENCY = {
  hashAlgorithm: "sha256",
  hashEncoding: "hex",
  scope: "open-join",
  separator: ":",
} as const;

const OPEN_JOIN_STATUS = {
  alreadySubscribed: "already_subscribed",
  blocked: "blocked",
  paymentUnavailable: "payment_unavailable",
} as const;

const OPEN_JOIN_CHECKOUT_URL_PROPERTY = "checkoutUrl";

const OPEN_JOIN_COPY = {
  alreadySubscribedButton: "Ir a la tribu",
  alreadySubscribedDescription:
    "Tu suscripción está activa. Entrá a la tribu para continuar.",
  alreadySubscribedTitle: "Ya estás suscripto a esta tribu",
  blockedDescription:
    "Tu cuenta no puede acceder a esta tribu. Si creés que es un error, contactá a quien administra el espacio.",
  blockedTitle: "No pudimos sumar tu cuenta",
  paymentUnavailableDescription:
    "No pudimos iniciar el pago en este momento. Intentá de nuevo más tarde o pedí ayuda a quien administra la tribu.",
  paymentUnavailableTitle: "No pudimos iniciar el pago",
} as const;

const USER_AGENT_HEADER = "user-agent";
const EXTERNAL_BROWSER_PLATFORM = {
  android: "android",
  ios: "ios",
} as const satisfies Record<string, ExternalBrowserPlatform>;

const SUBSCRIPTION_RETURN_BLOCKED_REASONS: ReadonlySet<string> = new Set([
  TRIBE_MEMBERSHIP_STATUS_REASON.paymentBlocked,
  TRIBE_MEMBERSHIP_STATUS_REASON.subscriptionInactive,
]);

const SUBSCRIPTION_RETURN_VISIBLE_STATUSES: ReadonlySet<string> = new Set([
  TRIBE_MEMBER_SUBSCRIPTION_STATUS.canceled,
  TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending,
  TRIBE_MEMBER_SUBSCRIPTION_STATUS.providerUnavailable,
  TRIBE_MEMBER_SUBSCRIPTION_STATUS.removedBySubscription,
]);

type TribePageSearchParams = {
  [TRIBE_PAGE_QUERY.channel]?: string | string[];
  [TRIBE_PAGE_QUERY.joinStatus]?: string | string[];
  [TRIBE_PAGE_QUERY.mercadoPagoPreapprovalId]?: string | string[];
  [TRIBE_PAGE_QUERY.page]?: string | string[];
};

type TribePageProps = {
  params: Promise<{
    slug: string;
  }>;
  searchParams?: Promise<TribePageSearchParams>;
};

function readFirstSearchParamValue(
  searchParamValue: string | string[] | undefined
): string | null {
  if (typeof searchParamValue === "string") {
    return searchParamValue;
  }

  if (Array.isArray(searchParamValue)) {
    const firstStringValue = searchParamValue.find(
      (value) => value.trim().length > 0
    );

    return firstStringValue ?? null;
  }

  return null;
}

function readPositiveIntegerSearchParam(
  searchParamValue: string | string[] | undefined
): number {
  const rawValue = readFirstSearchParamValue(searchParamValue);
  const numericValue = rawValue ? Number(rawValue) : 1;

  return Number.isInteger(numericValue) && numericValue > 0 ? numericValue : 1;
}

function renderSubscriptionReturnStatus() {
  return (
    <main className={styles.TribePage}>
      <SubscriptionReturnStatus />
    </main>
  );
}

function buildSubscriptionReturnPath(
  slug: string,
  mercadoPagoPreapprovalId: string
): string {
  return (
    ROUTES.tribes.bySlug(slug) +
    SIGN_IN_REDIRECT_URL_TOKEN.querySeparator +
    TRIBE_PAGE_QUERY.mercadoPagoPreapprovalId +
    SIGN_IN_REDIRECT_URL_TOKEN.valueSeparator +
    encodeURIComponent(mercadoPagoPreapprovalId)
  );
}

function buildSubscriptionReturnSignInRedirect(
  slug: string,
  mercadoPagoPreapprovalId: string
): string {
  const callbackPath = buildSubscriptionReturnPath(
    slug,
    mercadoPagoPreapprovalId
  );
  const signInSearchParams = new URLSearchParams({
    [QUERY_PARAMS.auth.callbackUrl]: callbackPath,
  });

  return (
    ROUTES.auth.signIn +
    SIGN_IN_REDIRECT_URL_TOKEN.querySeparator +
    signInSearchParams.toString()
  );
}

/**
 * Resolves the external-browser deep-link platform for mobile visitors.
 *
 * The "unauthenticated + Mercado Pago preapproval return" combination is
 * itself a strong signal of an in-app browser callback, so the platform
 * is resolved purely from the device family. False positives (e.g. real
 * Safari with a lost session) just trigger an in-browser navigation and
 * keep the fallback link available.
 *
 * @param userAgent - Request user agent header value.
 * @returns Matching mobile platform, or null on desktop or unknown UAs.
 */
function resolveExternalBrowserPlatform(
  userAgent: string | null
): ExternalBrowserPlatform | null {
  const detection = detectInAppBrowser(userAgent);

  if (detection.isIos) {
    return EXTERNAL_BROWSER_PLATFORM.ios;
  }

  if (detection.isAndroid) {
    return EXTERNAL_BROWSER_PLATFORM.android;
  }

  return null;
}

function renderOpenInExternalBrowserHandoff(
  externalBrowserUrl: string,
  fallbackSignInUrl: string
) {
  return (
    <main className={styles.TribePage}>
      <OpenInExternalBrowser
        externalBrowserUrl={externalBrowserUrl}
        fallbackSignInUrl={fallbackSignInUrl}
      />
    </main>
  );
}

/**
 * Builds the sign-in redirect that returns to the tribe link after authentication.
 *
 * @param slug - Tribe slug used as the post-login callback target.
 * @returns Sign-in URL with the tribe link as the callback.
 */
function buildJoinSignInRedirect(slug: string): string {
  const signInSearchParams = new URLSearchParams({
    [QUERY_PARAMS.auth.callbackUrl]: ROUTES.tribes.bySlug(slug),
  });

  return (
    ROUTES.auth.signIn +
    SIGN_IN_REDIRECT_URL_TOKEN.querySeparator +
    signInSearchParams.toString()
  );
}

/**
 * Builds a stable idempotency key for a member open-join checkout attempt.
 *
 * @param input - Authenticated member id and tribe slug.
 * @returns Idempotency key scoped to the member, tribe, and open-join flow.
 */
function buildOpenJoinIdempotencyKey(input: {
  memberId: string;
  slug: string;
}): string {
  const slugHash = createHash(OPEN_JOIN_IDEMPOTENCY.hashAlgorithm)
    .update(input.slug)
    .digest(OPEN_JOIN_IDEMPOTENCY.hashEncoding);

  return [input.memberId, slugHash, OPEN_JOIN_IDEMPOTENCY.scope].join(
    OPEN_JOIN_IDEMPOTENCY.separator
  );
}

/**
 * Builds the tribe link with an open-join status query for non-checkout outcomes.
 *
 * @param slug - Tribe slug.
 * @param joinStatus - Mapped open-join status value.
 * @returns Tribe link carrying the open-join status query.
 */
function buildOpenJoinStatusPath(slug: string, joinStatus: string): string {
  return (
    ROUTES.tribes.bySlug(slug) +
    SIGN_IN_REDIRECT_URL_TOKEN.querySeparator +
    TRIBE_PAGE_QUERY.joinStatus +
    SIGN_IN_REDIRECT_URL_TOKEN.valueSeparator +
    joinStatus
  );
}

/**
 * Maps a member subscription start status to a safe open-join status value.
 *
 * @param status - Member subscription start status from the use case.
 * @returns Open-join status value used in the tribe link query.
 */
function mapOpenJoinStatus(status: string): string {
  if (status === TRIBE_MEMBER_SUBSCRIPTION_STATUS.alreadySubscribed) {
    return OPEN_JOIN_STATUS.alreadySubscribed;
  }

  if (status === TRIBE_MEMBER_SUBSCRIPTION_STATUS.conductBlocked) {
    return OPEN_JOIN_STATUS.blocked;
  }

  return OPEN_JOIN_STATUS.paymentUnavailable;
}

/**
 * Starts a tokenless open-join checkout for the tribe current paid price.
 *
 * @param input - Tribe slug bound to the form action.
 */
async function startOpenJoinSubscriptionAction({ slug }: { slug: string }) {
  "use server";

  const session = await getSession();

  if (!session) {
    redirect(buildJoinSignInRedirect(slug));
  }

  const modules = await createRequestModules();
  const authenticatedMember =
    await modules.auth.useCases.getAuthenticatedMember();

  if (!authenticatedMember) {
    redirect(buildJoinSignInRedirect(slug));
  }

  const idempotencyKey = buildOpenJoinIdempotencyKey({
    memberId: authenticatedMember.id,
    slug,
  });
  const result = await modules.subscriptions.useCases
    .startTribeOpenJoinSubscription({
      idempotencyKey,
      tribeSlug: slug,
    })
    .catch(() => ({
      status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.paymentBlocked,
    }));

  if (OPEN_JOIN_CHECKOUT_URL_PROPERTY in result) {
    redirect(result.checkoutUrl);
  }

  redirect(buildOpenJoinStatusPath(slug, mapOpenJoinStatus(result.status)));
}

/**
 * Renders a terminal open-join status screen for non-checkout outcomes.
 *
 * @param joinStatus - Open-join status value from the tribe link query.
 * @param slug - Tribe slug used for the optional call to action.
 * @returns Status screen element, or null when there is no status to show.
 */
function renderOpenJoinStatusScreen(joinStatus: string | null, slug: string) {
  if (joinStatus === OPEN_JOIN_STATUS.alreadySubscribed) {
    return (
      <main className={styles.TribePage}>
        <TribeOpenJoinStatus
          cta={{
            href: ROUTES.tribes.bySlug(slug),
            label: OPEN_JOIN_COPY.alreadySubscribedButton,
          }}
          description={OPEN_JOIN_COPY.alreadySubscribedDescription}
          title={OPEN_JOIN_COPY.alreadySubscribedTitle}
        />
      </main>
    );
  }

  if (joinStatus === OPEN_JOIN_STATUS.blocked) {
    return (
      <main className={styles.TribePage}>
        <TribeOpenJoinStatus
          description={OPEN_JOIN_COPY.blockedDescription}
          title={OPEN_JOIN_COPY.blockedTitle}
        />
      </main>
    );
  }

  if (joinStatus === OPEN_JOIN_STATUS.paymentUnavailable) {
    return (
      <main className={styles.TribePage}>
        <TribeOpenJoinStatus
          description={OPEN_JOIN_COPY.paymentUnavailableDescription}
          title={OPEN_JOIN_COPY.paymentUnavailableTitle}
        />
      </main>
    );
  }

  return null;
}

export async function TribePageContent({
  params,
  searchParams = Promise.resolve({}),
}: TribePageProps) {
  const [{ slug }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const mercadoPagoPreapprovalId = readFirstSearchParamValue(
    resolvedSearchParams[TRIBE_PAGE_QUERY.mercadoPagoPreapprovalId]
  );
  const channelSlug = readFirstSearchParamValue(
    resolvedSearchParams[TRIBE_PAGE_QUERY.channel]
  );
  const page = readPositiveIntegerSearchParam(
    resolvedSearchParams[TRIBE_PAGE_QUERY.page]
  );
  const access = await resolveTribePageAccess({
    operation: TRIBE_PAGE_LOG.operation,
    slug,
  }).catch(() => {
    notFound();
  });

  if (!access) {
    notFound();
  }

  const {
    authenticatedMember,
    logger,
    modules,
    requestId,
    result: accessResult,
  } = access;

  if (accessResult.status === TRIBE_PAGE_ACCESS_STATUS.hidden) {
    logger.info({
      message: TRIBE_PAGE_LOG.hiddenAccessMessage,
      metadata: {
        reason: accessResult.reason,
        slug,
        viewerId: authenticatedMember?.id ?? null,
      },
    });

    if (
      accessResult.reason === TRIBE_PAGE_ACCESS_REASON.unauthenticatedHidden &&
      mercadoPagoPreapprovalId
    ) {
      const fallbackSignInUrl = buildSubscriptionReturnSignInRedirect(
        slug,
        mercadoPagoPreapprovalId
      );
      const requestHeaders = await headers();
      const userAgent = requestHeaders.get(USER_AGENT_HEADER);
      const externalBrowserPlatform =
        resolveExternalBrowserPlatform(userAgent);

      logger.info({
        message: TRIBE_PAGE_LOG.unauthenticatedSubscriptionReturnMessage,
        metadata: {
          externalBrowserPlatform,
          slug,
          userAgent,
        },
      });

      if (externalBrowserPlatform) {
        const targetHttpsUrl =
          resolvePublicAppBaseUrl() +
          buildSubscriptionReturnPath(slug, mercadoPagoPreapprovalId);
        const externalBrowserUrl = buildExternalBrowserUrl({
          platform: externalBrowserPlatform,
          targetHttpsUrl,
        });

        if (externalBrowserUrl) {
          return renderOpenInExternalBrowserHandoff(
            externalBrowserUrl,
            fallbackSignInUrl
          );
        }
      }

      redirect(fallbackSignInUrl);
    }

    if (
      accessResult.reason === TRIBE_PAGE_ACCESS_REASON.blockedHidden &&
      SUBSCRIPTION_RETURN_BLOCKED_REASONS.has(accessResult.blockedReason) &&
      mercadoPagoPreapprovalId
    ) {
      const subscriptionConfirmationModules = await createRequestModules({
        mercadoPagoWebhookVerified: true,
        requestId,
      });
      const resolveSubscriptionReturn =
        subscriptionConfirmationModules.subscriptions.useCases
          .resolveTribeMemberSubscriptionReturn;
      const validatePendingSubscriptionReturn =
        modules.subscriptions.useCases.validatePendingTribeMemberSubscriptionReturn;
      const subscriptionReturn = resolveSubscriptionReturn
        ? await resolveSubscriptionReturn({
            providerSubscriptionId: mercadoPagoPreapprovalId,
            tribeSlug: slug,
          })
          .catch((error: unknown) => {
            logger.error({
              message: TRIBE_PAGE_LOG.resolveSubscriptionReturnFailureMessage,
              error,
              metadata: {
                reason:
                  TRIBE_PAGE_LOG_REASON.unexpectedSubscriptionReturnRepositoryError,
                slug,
                viewerId: authenticatedMember?.id ?? null,
              },
            });

            return null;
          })
        : (await validatePendingSubscriptionReturn({
            providerSubscriptionId: mercadoPagoPreapprovalId,
            tribeSlug: slug,
          }))
          ? { status: TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending }
          : null;

      if (subscriptionReturn?.status === TRIBE_MEMBER_SUBSCRIPTION_STATUS.active) {
        redirect(ROUTES.tribes.welcome(slug));
      }

      if (subscriptionReturn?.status === TRIBE_MEMBER_SUBSCRIPTION_STATUS.paused) {
        redirect(ROUTES.tribes.subscription(slug));
      }

      if (
        subscriptionReturn &&
        SUBSCRIPTION_RETURN_VISIBLE_STATUSES.has(subscriptionReturn.status)
      ) {
        return renderSubscriptionReturnStatus();
      }
    }

    if (
      accessResult.reason === TRIBE_PAGE_ACCESS_REASON.unauthenticatedHidden
    ) {
      redirect(buildJoinSignInRedirect(slug));
    }

    // The open-join action redirects non-checkout outcomes back with a
    // join_status query. A failed checkout can leave the member blocked or
    // payment-blocked, so this terminal status screen must render for both the
    // not_found_or_not_visible and blocked_hidden reasons, not just for
    // non-members, otherwise blocked members fall through to a misleading 404.
    const joinStatusScreen = renderOpenJoinStatusScreen(
      readFirstSearchParamValue(
        resolvedSearchParams[TRIBE_PAGE_QUERY.joinStatus]
      ),
      slug
    );

    if (joinStatusScreen) {
      return joinStatusScreen;
    }

    // A member blocked or removed by a failed payment can recover paid access by
    // re-subscribing through the same tokenless open-join offer, so surface it
    // instead of a 404. Conduct blocks (and any non-payment reason) stay hidden:
    // SUBSCRIPTION_RETURN_BLOCKED_REASONS only covers payment_blocked and
    // subscription_inactive, mirroring the RLS open-join recovery policies.
    const canRecoverPaidAccessViaOpenJoin =
      accessResult.reason === TRIBE_PAGE_ACCESS_REASON.blockedHidden &&
      SUBSCRIPTION_RETURN_BLOCKED_REASONS.has(accessResult.blockedReason);

    // The open-join offer is the raw-link entry point only. When a Mercado Pago
    // return is in flight (preapproval_id present) its terminal return handling
    // ran above; if it could not be resolved we fall through to notFound instead
    // of a fresh "Completá tu suscripción" prompt, so a bad or transient return
    // never turns into a duplicate checkout.
    if (
      !mercadoPagoPreapprovalId &&
      (accessResult.reason === TRIBE_PAGE_ACCESS_REASON.notFoundOrNotVisible ||
        canRecoverPaidAccessViaOpenJoin)
    ) {
      const offer = await modules.subscriptions.useCases
        .getTribeCurrentSubscriptionOffer({ tribeSlug: slug })
        .catch(() => ({
          status: TRIBE_CURRENT_SUBSCRIPTION_OFFER_STATUS.unavailable,
        }));

      if (
        offer.status === TRIBE_CURRENT_SUBSCRIPTION_OFFER_STATUS.available
      ) {
        const startOpenJoin = startOpenJoinSubscriptionAction.bind(null, {
          slug,
        });

        return (
          <main className={styles.TribePage}>
            <TribeOpenJoin offer={offer.price} startAction={startOpenJoin} />
          </main>
        );
      }
    }

    notFound();
  }

  if (!authenticatedMember) {
    notFound();
  }

  if (mercadoPagoPreapprovalId) {
    redirect(ROUTES.tribes.welcome(slug));
  }

  const round = await modules.messages.useCases.listTribeRound({
    channelSlug,
    page,
    tribeSlug: accessResult.tribe.slug,
    viewerId: authenticatedMember.id,
  }).catch((error: unknown) => {
    logger.error({
      message: TRIBE_PAGE_LOG.resolveRoundFailureMessage,
      error,
      metadata: {
        reason: TRIBE_PAGE_LOG_REASON.unexpectedRoundRepositoryError,
        slug,
        viewerId: authenticatedMember?.id ?? null,
      },
    });
    notFound();
  });

  scheduleMissingVideoThumbnailBackfill({
    messageIds: selectMessageIdsNeedingVideoThumbnail(round.messages),
    tribeSlug: accessResult.tribe.slug,
    viewerId: authenticatedMember.id,
  });

  // The agenda is a secondary block: a failure to load it must never take the
  // feed down, so it degrades to an empty list after logging the cause.
  const upcomingEvents = await modules.events.useCases
    .listUpcomingTribeEvents({ tribeSlug: accessResult.tribe.slug })
    .catch((error: unknown) => {
      logger.error({
        message: TRIBE_PAGE_LOG.resolveUpcomingEventsFailureMessage,
        error,
        metadata: {
          reason: TRIBE_PAGE_LOG_REASON.unexpectedEventRepositoryError,
          slug,
          viewerId: authenticatedMember.id,
        },
      });

      return { events: [] };
    });

  return (
    <main className={styles.TribePage}>
      <UpcomingTribeEvents
        events={upcomingEvents.events}
        tribeSlug={accessResult.tribe.slug}
      />
      <TribeRound
        authenticatedMember={authenticatedMember}
        tribeSlug={accessResult.tribe.slug}
        round={round}
      />
    </main>
  );
}

export default function TribePage(props: TribePageProps) {
  return (
    <Suspense fallback={<TribeLoadingPage />}>
      <TribePageContent {...props} />
    </Suspense>
  );
}
