/**
 * Persists and maps tribe subscription price versions in Postgres.
 *
 * @module postgres-tribe-subscription-price-repository
 */

import { sql } from "drizzle-orm";

import type {
  TribeFreeJoinMutationResult,
  TribeProviderSubscriberReconciliationResult,
  TribeSubscriberDiagnosticsReconciliationResult,
  TribeSubscriberDiagnosticsResult,
  TribeSubscriptionProviderPlanVerificationResult,
  TribeSubscriptionProviderPlansVerificationResult,
  TribeSubscriptionProviderPlanSyncResult,
  TribeSubscriptionPriceListResult,
  TribeSubscriptionPriceMutationResult,
  TribeSubscriptionPriceResult,
} from "@/src/modules/subscriptions/application/results/tribe-subscription-price-result";
import {
  MERCADO_PAGO_CONNECTION_STATUS,
  TRIBE_MEMBER_SUBSCRIPTION_STATUS,
  TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON,
  TRIBE_SUBSCRIPTION_PRICE_LIMIT,
  TRIBE_SUBSCRIPTION_PRICE_STATUS,
  TRIBE_SUBSCRIPTION_TRIAL_FREQUENCY_TYPE,
  TRIBE_SUBSCRIPTION_TRIAL_MAXIMUM_DAYS,
} from "@/src/modules/subscriptions/constants/subscriptions";
import type {
  TribeProviderSubscriberReconciliationCommand,
  TribeProviderSubscriberReconciliationRepository,
} from "@/src/modules/subscriptions/application/ports/tribe-provider-subscriber-reconciliation-repository";
import type { TribeSubscriberDiagnosticsRepository } from "@/src/modules/subscriptions/application/ports/tribe-subscriber-diagnostics-repository";
import type {
  CreateTribeSubscriptionPriceCommand,
  DeleteTribeSubscriptionPriceInvitationAction,
  DeleteTribeSubscriptionPriceWithInvitationActionsCommand,
  SetTribeFreeJoinAsCurrentCommand,
  SyncTribeSubscriptionProviderPlanCommand,
  TribeSubscriptionPriceIdentity,
  TribeSubscriptionPriceListQuery,
  TribeSubscriptionPriceRepository,
  TribeSubscriptionPriceUpdateTrialPolicy,
  UpdateTribeSubscriptionPriceCommand,
} from "@/src/modules/subscriptions/domain/repositories/tribe-subscription-price-repository";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type {
  MercadoPagoPlanInput,
  MercadoPagoPlanUpdateInput,
  MercadoPagoPreapprovalPlanInput,
  MercadoPagoPreapprovalPlanResult,
  MercadoPagoPreapprovalStatusInput,
  MercadoPagoPreapprovalPlanStatusInput,
} from "@/src/modules/subscriptions/infrastructure/mercado-pago/mercado-pago-subscription-gateway";
import type { PaymentOperationTraceContext } from "@/src/modules/subscriptions/infrastructure/observability/payment-operation-logger";
import {
  isMercadoPagoAccessTokenFresh,
  refreshStoredMercadoPagoAccessToken,
  resolveMercadoPagoAccessToken,
  type MercadoPagoAccessTokenRefresher,
  type StoredMercadoPagoAccessToken,
} from "@/src/modules/subscriptions/infrastructure/mercado-pago/mercado-pago-access-token";
import { mapMercadoPagoSubscriptionStatus } from "@/src/modules/subscriptions/infrastructure/mercado-pago/mercado-pago-subscription-status-mapper";
import { ROUTES } from "@/src/constants/routes";
import { resolvePublicAppBaseUrl } from "@/src/modules/shared/infrastructure/backend/public-app-base-url";

type DatabaseExecutor = <T>(
  callback: (database: RequestDatabase) => Promise<T>
) => Promise<T>;

type MercadoPagoPlanCreator = (input: MercadoPagoPlanInput) => Promise<string>;
type MercadoPagoPlanGetter = (
  input: MercadoPagoPreapprovalPlanInput
) => Promise<MercadoPagoPreapprovalPlanResult | null>;
type MercadoPagoPlanStatusGetter = (
  input: MercadoPagoPreapprovalPlanStatusInput
) => Promise<string | null>;
type MercadoPagoPlanUpdater = (
  input: MercadoPagoPlanUpdateInput
) => Promise<MercadoPagoPreapprovalPlanResult>;
type MercadoPagoSubscriptionStatusGetter = (
  input: MercadoPagoPreapprovalStatusInput
) => Promise<string | null>;

type MercadoPagoConnectionStatus =
  | typeof MERCADO_PAGO_CONNECTION_STATUS.connected
  | typeof MERCADO_PAGO_CONNECTION_STATUS.requiresReconnection;

type SubscriptionPriceRow = {
  active_subscribers_count: number | string | null;
  amount_cents: number;
  created_at: Date | string;
  currency: "ARS";
  frequency: "monthly";
  id: string;
  is_current: boolean;
  name: string;
  status: "active" | "canceled" | "deleted";
  trial_frequency: number | null;
  trial_frequency_type: "days" | "months" | null;
};

type SubscriptionPriceListRow = SubscriptionPriceRow & {
  access_token: string | null;
  can_manage_prices: boolean | null;
  can_view_prices: boolean | null;
  free_join_is_current: boolean | null;
  has_mercado_pago_integration: boolean | null;
  refresh_token: string | null;
  token_expires_at: Date | string | null;
  tribe_id: string | null;
};

type SubscriptionPriceMutationRow = SubscriptionPriceRow & {
  status_result: string | null;
};

type SubscriptionProviderPlanRow = SubscriptionPriceRow & {
  mercado_pago_preapproval_plan_id: string | null;
  tribe_id?: string;
};

type SubscriptionProviderSubscriberRow = {
  mercado_pago_preapproval_id: string | null;
};

type TribeSubscriberDiagnosticsRow = {
  last_reconciled_at: Date | string | null;
  local_active_subscribers_count: number | string | null;
  mercado_pago_authorized_subscribers_count: number | string | null;
  mercado_pago_canceled_or_missing_subscribers_count: number | string | null;
  mercado_pago_paused_subscribers_count: number | string | null;
  mercado_pago_pending_subscribers_count: number | string | null;
  target_tribe_id: string | null;
};

type SubscriptionProviderSubscriberStatusUpdate = {
  provider_subscription_id: string;
  status_reason: string;
  subscription_status: string;
};

type PriceCreationContextRow = {
  access_token: string | null;
  can_manage_prices: boolean | null;
  existing_price_count: number | string | null;
  refresh_token: string | null;
  token_expires_at: Date | string | null;
  tribe_id: string | null;
};

type PriceVerificationContextRow = {
  access_token: string | null;
  can_manage_prices: boolean | null;
  refresh_token: string | null;
  token_expires_at: Date | string | null;
  tribe_id: string | null;
};

type PriceReservationRow = {
  reserved_price_id: string | null;
  status_result: string | null;
};

type PriceUpdateContextRow = SubscriptionProviderPlanRow & {
  access_token: string | null;
  can_manage_prices: boolean | null;
  refresh_token: string | null;
  token_expires_at: Date | string | null;
  tribe_id: string | null;
};

type ResolvedUpdateTrialPeriod = {
  trialFrequency: number | null;
  trialFrequencyType: "days" | "months" | null;
};

type PriceCancellationReservationRow = PriceUpdateContextRow & {
  was_current: boolean | null;
};

type ProviderPlanWebhookContextRow = SubscriptionProviderPlanRow & {
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: Date | string | null;
  tribe_id: string | null;
};

const SUBSCRIPTION_PRICE_PROVIDER_PLAN_RESERVATION_STATUS =
  "pending_provider_plan";

/**
 * Local subscription statuses that still represent a live provider commitment.
 */
const CURRENT_MEMBER_SUBSCRIPTION_STATUSES = sql`(
  ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.active},
  ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending},
  ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.gracePeriod},
  ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.pastDue},
  ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.paymentBlocked},
  ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.paused}
)`;

const MERCADO_PAGO_PROVIDER_PLAN_STATUS = {
  active: "active",
  canceled: "canceled",
} as const;

const MERCADO_PAGO_PROVIDER_SUBSCRIPTION_STATUS_LOOKUP_CONCURRENCY_LIMIT = 5;

const SUBSCRIPTION_PRICE_PAYMENT_OPERATION_KEY = {
  deleteProviderPlanPrice: "delete-provider-plan-price",
  separator: ":",
  syncProviderPlanWebhook: "mercado-pago-plan-webhook",
  updateProviderPlan: "update-provider-plan",
  verifyProviderPlan: "verify-provider-plan",
  verifyProviderSubscribers: "verify-provider-subscribers",
} as const;

const MERCADO_PAGO_PAYMENT_INTEGRATION = {
  checkoutTribeSettingName: "app.subscription_checkout_tribe_id",
  provider: "mercado_pago",
} as const;

type MercadoPagoConnectionTokenRow = {
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: Date | string | null;
  tribe_id: string | null;
};

/**
 * Normalizes token expiration timestamps for stable comparisons across database drivers.
 *
 * @param tokenExpiresAt - Token expiration timestamp read from Postgres.
 * @returns Epoch milliseconds or null when the timestamp is absent or invalid.
 */
function normalizeMercadoPagoTokenExpiration(
  tokenExpiresAt: Date | string | null
): number | null {
  if (!tokenExpiresAt) {
    return null;
  }

  const expirationTime = new Date(tokenExpiresAt).getTime();

  return Number.isFinite(expirationTime) ? expirationTime : null;
}

/**
 * Determines whether a reloaded token differs from the originally listed token.
 *
 * @param input - Original and reloaded token snapshots.
 * @returns Whether another request likely persisted a newer token.
 */
function hasStoredMercadoPagoTokenChanged(input: {
  reloadedToken: StoredMercadoPagoAccessToken;
  storedToken: StoredMercadoPagoAccessToken;
}): boolean {
  return (
    input.reloadedToken.accessToken !== input.storedToken.accessToken ||
    input.reloadedToken.refreshToken !== input.storedToken.refreshToken ||
    normalizeMercadoPagoTokenExpiration(input.reloadedToken.tokenExpiresAt) !==
      normalizeMercadoPagoTokenExpiration(input.storedToken.tokenExpiresAt)
  );
}

/**
 * Reads the latest persisted Mercado Pago token for one tribe.
 *
 * @param input - Tribe identity and database executor.
 * @returns Stored token data, or null when no integration exists.
 */
async function readLatestStoredMercadoPagoAccessToken(input: {
  executeWithDatabase: DatabaseExecutor;
  tribeId: string | null;
}): Promise<StoredMercadoPagoAccessToken | null> {
  if (!input.tribeId) {
    return null;
  }

  return input.executeWithDatabase(async (database) => {
    const result = await database.execute(sql`
      with token_refresh_context as (
        select set_config(
          ${MERCADO_PAGO_PAYMENT_INTEGRATION.checkoutTribeSettingName},
          ${input.tribeId},
          true
        )
      )
      select
        tribe_payment_integrations.tribe_id,
        tribe_payment_integrations.access_token,
        tribe_payment_integrations.refresh_token,
        tribe_payment_integrations.token_expires_at
      from token_refresh_context
      cross join public.tribe_payment_integrations
      where tribe_payment_integrations.tribe_id = ${input.tribeId}
        and tribe_payment_integrations.provider = ${MERCADO_PAGO_PAYMENT_INTEGRATION.provider}
      limit 1
    `);
    const row = (result.rows?.[0] ?? null) as
      | MercadoPagoConnectionTokenRow
      | null;

    return row
      ? {
          accessToken: row.access_token,
          refreshToken: row.refresh_token,
          tokenExpiresAt: row.token_expires_at,
          tribeId: row.tribe_id,
        }
      : null;
  });
}

/**
 * Resolves a fresh token persisted by a concurrent refresh after this request failed.
 *
 * @param input - Original token and reloaded token data.
 * @returns Fresh access token, or null when reconnection is still required.
 */
function resolveFreshConcurrentMercadoPagoAccessToken(input: {
  reloadedToken: StoredMercadoPagoAccessToken | null;
  storedToken: StoredMercadoPagoAccessToken;
}): string | null {
  if (!input.reloadedToken?.accessToken) {
    return null;
  }

  return hasStoredMercadoPagoTokenChanged({
    reloadedToken: input.reloadedToken,
    storedToken: input.storedToken,
  }) && isMercadoPagoAccessTokenFresh(input.reloadedToken.tokenExpiresAt)
    ? input.reloadedToken.accessToken
    : null;
}

/**
 * Resolves Mercado Pago integration health by forcing an OAuth token refresh.
 *
 * @param input - Stored token data and refresh dependencies.
 * @returns Connected when Mercado Pago accepts the refresh token, otherwise reconnection required.
 */
async function resolveMercadoPagoConnectionStatus(input: {
  executeWithDatabase: DatabaseExecutor;
  refreshMercadoPagoAccessToken: MercadoPagoAccessTokenRefresher;
  storedToken: {
    accessToken: string | null;
    refreshToken: string | null;
    tokenExpiresAt: Date | string | null;
    tribeId: string | null;
  };
}): Promise<MercadoPagoConnectionStatus> {
  let refreshedAccessToken: string | null;

  try {
    refreshedAccessToken = await refreshStoredMercadoPagoAccessToken({
      executeWithDatabase: input.executeWithDatabase,
      refreshMercadoPagoAccessToken: input.refreshMercadoPagoAccessToken,
      storedToken: input.storedToken,
    });
  } catch {
    const reloadedToken = await readLatestStoredMercadoPagoAccessToken({
      executeWithDatabase: input.executeWithDatabase,
      tribeId: input.storedToken.tribeId,
    }).catch(() => null);

    refreshedAccessToken = resolveFreshConcurrentMercadoPagoAccessToken({
      reloadedToken,
      storedToken: input.storedToken,
    });
  }

  return refreshedAccessToken
    ? MERCADO_PAGO_CONNECTION_STATUS.connected
    : MERCADO_PAGO_CONNECTION_STATUS.requiresReconnection;
}

/**
 * Builds a trace context for Mercado Pago operations scoped to subscription prices.
 *
 * @param input - Payment operation identifiers available at the repository boundary.
 * @returns Trace context for provider logging, or undefined when request tracing is unavailable.
 */
function buildSubscriptionPricePaymentTraceContext(input: {
  operationKey: string;
  preapprovalId?: string | null;
  priceId?: string | null;
  providerPlanId?: string | null;
  requestId?: string;
  tribeSlug?: string | null;
}): PaymentOperationTraceContext | undefined {
  if (!input.requestId) {
    return undefined;
  }

  return {
    operationKey: input.operationKey,
    preapprovalId: input.preapprovalId,
    priceId: input.priceId,
    providerPlanId: input.providerPlanId,
    requestId: input.requestId,
    tribeSlug: input.tribeSlug,
  };
}

/**
 * Builds a stable operation key for price-scoped Mercado Pago reads and writes.
 *
 * @param parts - Operation family and local identifiers.
 * @returns Stable operation key for tracing retries and outcomes.
 */
function buildSubscriptionPriceOperationKey(parts: {
  operation: string;
  priceId: string;
  source?: string;
  tribeSlug: string;
}): string {
  const operationKeyParts = [
    parts.operation,
    parts.tribeSlug,
    parts.priceId,
  ];

  if (parts.source) {
    operationKeyParts.push(parts.source);
  }

  return operationKeyParts.join(SUBSCRIPTION_PRICE_PAYMENT_OPERATION_KEY.separator);
}

/**
 * Builds local status updates aligned to verified provider subscribers.
 *
 * @param input - Provider subscriber rows and statuses returned by Mercado Pago.
 * @returns Persistable status updates for subscribers with provider identifiers.
 */
function buildProviderSubscriberStatusUpdates(input: {
  providerSubscribers: SubscriptionProviderSubscriberRow[];
  providerSubscriptionStatuses: (string | null)[];
}): SubscriptionProviderSubscriberStatusUpdate[] {
  return input.providerSubscriptionStatuses.reduce<
    SubscriptionProviderSubscriberStatusUpdate[]
  >((statusUpdates, providerSubscriptionStatus, subscriberIndex) => {
    const providerSubscriptionId =
      input.providerSubscribers[subscriberIndex]
        ?.mercado_pago_preapproval_id;

    if (!providerSubscriptionId) {
      return statusUpdates;
    }

    const subscriptionStatus = mapMercadoPagoSubscriptionStatus(
      providerSubscriptionStatus
    );

    statusUpdates.push({
      provider_subscription_id: providerSubscriptionId,
      status_reason: subscriptionStatus.statusReason,
      subscription_status: subscriptionStatus.status,
    });

    return statusUpdates;
  }, []);
}

/**
 * Reads provider subscriber statuses without opening an unbounded request fan-out.
 *
 * @param input - Access token, provider subscriber rows, and status reader.
 * @returns Provider statuses aligned to the local subscriber rows.
 */
async function readProviderSubscriptionStatuses(input: {
  accessToken: string;
  getMercadoPagoSubscriptionStatus: MercadoPagoSubscriptionStatusGetter;
  operationKey: string;
  priceId: string;
  providerSubscribers: SubscriptionProviderSubscriberRow[];
  requestId?: string;
  tribeSlug: string;
}): Promise<(string | null)[]> {
  const providerSubscriptionStatuses: (string | null)[] = new Array(
    input.providerSubscribers.length
  );
  let nextSubscriberIndex = 0;

  async function readNextProviderSubscriptions(): Promise<void> {
    while (nextSubscriberIndex < input.providerSubscribers.length) {
      const providerSubscriberIndex = nextSubscriberIndex;
      nextSubscriberIndex += 1;

      const providerSubscriber =
        input.providerSubscribers[providerSubscriberIndex];
      const traceContext = providerSubscriber.mercado_pago_preapproval_id
        ? buildSubscriptionPricePaymentTraceContext({
            operationKey: input.operationKey,
            preapprovalId: providerSubscriber.mercado_pago_preapproval_id,
            priceId: input.priceId,
            requestId: input.requestId,
            tribeSlug: input.tribeSlug,
          })
        : undefined;

      providerSubscriptionStatuses[providerSubscriberIndex] =
        providerSubscriber.mercado_pago_preapproval_id
          ? await input.getMercadoPagoSubscriptionStatus({
              accessToken: input.accessToken,
              preapprovalId: providerSubscriber.mercado_pago_preapproval_id,
              ...(traceContext ? { traceContext } : {}),
            })
          : null;
    }
  }

  const workerCount = Math.min(
    MERCADO_PAGO_PROVIDER_SUBSCRIPTION_STATUS_LOOKUP_CONCURRENCY_LIMIT,
    input.providerSubscribers.length
  );

  await Promise.all(
    Array.from({ length: workerCount }, () => readNextProviderSubscriptions())
  );

  return providerSubscriptionStatuses;
}

/**
 * Converts database dates and counts into application price results.
 *
 * @param row - Database subscription price row.
 * @returns Subscription price application result.
 */
function mapSubscriptionPrice(row: SubscriptionPriceRow): TribeSubscriptionPriceResult {
  return {
    activeSubscribersCount: Number(row.active_subscribers_count ?? 0),
    amountCents: row.amount_cents,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : new Date(row.created_at).toISOString(),
    currency: row.currency,
    frequency: row.frequency,
    id: row.id,
    isCurrent: row.is_current,
    name: row.name,
    status: row.status,
    trial:
      row.trial_frequency && row.trial_frequency_type
        ? {
            frequency: row.trial_frequency,
            frequencyType: row.trial_frequency_type,
          }
        : null,
  };
}

/**
 * Converts aggregate subscriber diagnostics from database rows to application results.
 *
 * @param row - Aggregate diagnostics row.
 * @returns Subscriber diagnostics result.
 */
function mapSubscriberDiagnostics(
  row: TribeSubscriberDiagnosticsRow
): TribeSubscriberDiagnosticsResult {
  const lastReconciledAt = row.last_reconciled_at
    ? new Date(row.last_reconciled_at).toISOString()
    : undefined;

  return {
    ...(lastReconciledAt ? { lastReconciledAt } : {}),
    localActiveSubscribersCount: Number(
      row.local_active_subscribers_count ?? 0
    ),
    mercadoPagoAuthorizedSubscribersCount: Number(
      row.mercado_pago_authorized_subscribers_count ?? 0
    ),
    mercadoPagoCanceledOrMissingSubscribersCount: Number(
      row.mercado_pago_canceled_or_missing_subscribers_count ?? 0
    ),
    mercadoPagoPausedSubscribersCount: Number(
      row.mercado_pago_paused_subscribers_count ?? 0
    ),
    mercadoPagoPendingSubscribersCount: Number(
      row.mercado_pago_pending_subscribers_count ?? 0
    ),
  };
}

/**
 * Builds the local external reference stored in Mercado Pago plans.
 *
 * @param priceId - Local subscription price identifier.
 * @returns Provider external reference for a TuTribu price.
 */
function buildPriceExternalReference(priceId: string): string {
  return `tutribu:price:${priceId}`;
}

const MERCADO_PAGO_BACK_URL_ENV = "MERCADO_PAGO_BACK_URL";

/**
 * Builds the successful return URL stored in Mercado Pago plans.
 * Uses MERCADO_PAGO_BACK_URL when set (required in local dev with a tunnel URL),
 * otherwise falls back to the public app base URL (works in production).
 *
 * @param tribeSlug - Current tribe slug.
 * @returns Public tribe URL used as Mercado Pago back URL.
 */
function buildProviderPlanBackUrl(tribeSlug: string): string {
  const override = process.env[MERCADO_PAGO_BACK_URL_ENV]?.trim();
  const baseUrl = override || resolvePublicAppBaseUrl();

  return baseUrl.replace(/\/$/, "") + ROUTES.tribes.bySlug(tribeSlug);
}

/**
 * Reads a local price identifier from a Mercado Pago external reference.
 *
 * @param externalReference - Provider external reference value.
 * @returns Local price identifier, or null when the reference is not from TuTribu.
 */
function parsePriceIdFromExternalReference(
  externalReference: string | null
): string | null {
  const prefix = "tutribu:price:";

  return externalReference?.startsWith(prefix)
    ? externalReference.slice(prefix.length)
    : null;
}

/**
 * Builds a stable idempotency key for one reserved Mercado Pago plan creation.
 *
 * @param command - Price creation command.
 * @param reservedPriceId - Local price reservation identifier linked to the provider plan.
 * @returns Stable key scoped to the local reservation and price content.
 */
function buildPlanIdempotencyKey(
  command: CreateTribeSubscriptionPriceCommand,
  reservedPriceId: string
): string {
  return [
    "tribe-price",
    reservedPriceId,
    command.tribeSlug,
    command.name,
    String(command.amountCents),
    command.currency,
    command.frequency,
  ].join(":");
}

/**
 * Maps a price mutation SQL result into the application contract.
 *
 * @param row - Database mutation row.
 * @param successStatus - Expected success status for the mutation.
 * @returns Price mutation result.
 */
function mapPriceMutationResult(
  row: SubscriptionPriceMutationRow | null,
  successStatus:
    | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.canceled
    | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.created
    | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.current
    | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.updated
): TribeSubscriptionPriceMutationResult {
  if (row?.status_result === successStatus) {
    return {
      price: mapSubscriptionPrice(row),
      status: successStatus,
    };
  }

  return {
    status:
      row?.status_result === TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound ||
      row?.status_result === TRIBE_SUBSCRIPTION_PRICE_STATUS.hasSubscribers ||
      row?.status_result === TRIBE_SUBSCRIPTION_PRICE_STATUS.limitReached ||
      row?.status_result === TRIBE_SUBSCRIPTION_PRICE_STATUS.missingIntegration
        ? row.status_result
        : TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden,
  };
}

/**
 * Resolves omitted update trial fields from the currently stored price.
 *
 * @param command - Price update command.
 * @param updateContext - Stored price state loaded for the update.
 * @returns Trial period values to persist and synchronize.
 */
function resolveUpdateTrialPeriod(
  command: UpdateTribeSubscriptionPriceCommand,
  updateContext: PriceUpdateContextRow
): ResolvedUpdateTrialPeriod {
  return {
    trialFrequency:
      command.trialFrequency === undefined
        ? updateContext.trial_frequency
        : command.trialFrequency,
    trialFrequencyType:
      command.trialFrequencyType === undefined
        ? updateContext.trial_frequency_type
        : command.trialFrequencyType,
  };
}

/**
 * Determines whether a day-based trial must wait until the provider plan is persisted.
 *
 * @param command - Price creation command that may carry a provider-synchronized trial.
 * @returns Whether the local reservation cannot store the trial before the provider plan exists.
 */
function shouldAttachTrialAfterProviderPlan(
  command: CreateTribeSubscriptionPriceCommand
): boolean {
  return (
    command.trialFrequencyType === TRIBE_SUBSCRIPTION_TRIAL_FREQUENCY_TYPE.days &&
    typeof command.trialFrequency === "number" &&
    command.trialFrequency > TRIBE_SUBSCRIPTION_TRIAL_MAXIMUM_DAYS
  );
}

export class PostgresTribeSubscriptionPriceRepository
  implements
    TribeProviderSubscriberReconciliationRepository,
    TribeSubscriberDiagnosticsRepository,
    TribeSubscriptionPriceRepository
{
  /**
   * Creates a subscription price repository with provider adapters and trace context.
   *
   * @param executeWithDatabase - Request-scoped database executor.
   * @param createMercadoPagoPlan - Adapter that creates provider plans.
   * @param updateMercadoPagoPlan - Adapter that updates provider plans.
   * @param getMercadoPagoPlan - Adapter that reads provider plan details.
   * @param refreshMercadoPagoAccessToken - Adapter that refreshes provider tokens.
   * @param getMercadoPagoPlanStatus - Adapter that reads provider plan status.
   * @param getMercadoPagoSubscriptionStatus - Adapter that reads provider subscription status.
   * @param requestId - Optional request correlation identifier for payment traces.
   */
  constructor(
    private readonly executeWithDatabase: DatabaseExecutor,
    private readonly createMercadoPagoPlan: MercadoPagoPlanCreator,
    private readonly updateMercadoPagoPlan: MercadoPagoPlanUpdater,
    private readonly getMercadoPagoPlan: MercadoPagoPlanGetter,
    private readonly refreshMercadoPagoAccessToken: MercadoPagoAccessTokenRefresher,
    private readonly getMercadoPagoPlanStatus: MercadoPagoPlanStatusGetter,
    private readonly getMercadoPagoSubscriptionStatus: MercadoPagoSubscriptionStatusGetter,
    private readonly requestId?: string
  ) {}

  /**
   * Lists subscription price versions visible to subscription admins.
   *
   * @param query - Tribe slug query.
   * @returns Prices and viewer permissions.
   */
  async listByTribeSlug(
    query: TribeSubscriptionPriceListQuery
  ): Promise<TribeSubscriptionPriceListResult> {
    const rows = await this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select
            tribes.id,
            tribes.free_join_is_current
          from public.tribes
          where tribes.slug = ${query.tribeSlug}
          limit 1
        ),
        viewer_permissions as (
          select
            coalesce(public.can_view_tribe_subscription_prices((select id from target_tribe)), false) as can_view_prices,
            coalesce(public.can_manage_tribe_subscription_prices((select id from target_tribe)), false) as can_manage_prices
        ),
        payment_integration as (
          select
            target_tribe.id as tribe_id,
            tribe_payment_integrations.access_token,
            tribe_payment_integrations.refresh_token,
            tribe_payment_integrations.token_expires_at
          from (select 1) result
          left join target_tribe
            on true
          left join public.tribe_payment_integrations
            on tribe_payment_integrations.tribe_id = target_tribe.id
            and tribe_payment_integrations.provider = 'mercado_pago'
        ),
        price_rows as (
          select
            tribe_subscription_prices.id,
            tribe_subscription_prices.name,
            tribe_subscription_prices.amount_cents,
            tribe_subscription_prices.currency,
            tribe_subscription_prices.frequency,
            tribe_subscription_prices.status,
            tribe_subscription_prices.is_current,
            tribe_subscription_prices.trial_frequency,
            tribe_subscription_prices.trial_frequency_type,
            tribe_subscription_prices.created_at,
            count(tribe_member_subscriptions.id) filter (
              where tribe_member_subscriptions.status in ${CURRENT_MEMBER_SUBSCRIPTION_STATUSES}
            ) as active_subscribers_count
          from public.tribe_subscription_prices
          inner join target_tribe
            on target_tribe.id = tribe_subscription_prices.tribe_id
          left join public.tribe_member_subscriptions
            on tribe_member_subscriptions.price_id = tribe_subscription_prices.id
          where tribe_subscription_prices.status in ('active', 'canceled')
            and public.can_view_tribe_subscription_prices(target_tribe.id)
          group by tribe_subscription_prices.id
        )
        select
          price_rows.id,
          price_rows.name,
          price_rows.amount_cents,
          price_rows.currency,
          price_rows.frequency,
          price_rows.status,
          price_rows.is_current,
          price_rows.trial_frequency,
          price_rows.trial_frequency_type,
          price_rows.created_at,
          price_rows.active_subscribers_count,
          viewer_permissions.can_view_prices,
          viewer_permissions.can_manage_prices,
          (select free_join_is_current from target_tribe) as free_join_is_current,
          payment_integration.tribe_id,
          payment_integration.access_token,
          payment_integration.refresh_token,
          payment_integration.token_expires_at
        from viewer_permissions
        cross join payment_integration
        left join price_rows
          on true
        order by price_rows.created_at desc
      `);

      return (result.rows ?? []) as SubscriptionPriceListRow[];
    });
    const prices = rows.reduce<ReturnType<typeof mapSubscriptionPrice>[]>(
      (mappedPrices, row) => {
        if (row.id) {
          mappedPrices.push(mapSubscriptionPrice(row));
        }

        return mappedPrices;
      },
      []
    );
    const mercadoPagoConnectionStatus =
      await resolveMercadoPagoConnectionStatus({
        executeWithDatabase: this.executeWithDatabase,
        refreshMercadoPagoAccessToken: this.refreshMercadoPagoAccessToken,
        storedToken: {
          accessToken: rows[0]?.access_token ?? null,
          refreshToken: rows[0]?.refresh_token ?? null,
          tokenExpiresAt: rows[0]?.token_expires_at ?? null,
          tribeId: rows[0]?.tribe_id ?? null,
        },
      });

    return {
      freeJoinIsCurrent: Boolean(rows[0]?.free_join_is_current),
      hasMercadoPagoIntegration:
        mercadoPagoConnectionStatus === MERCADO_PAGO_CONNECTION_STATUS.connected,
      mercadoPagoConnectionStatus,
      prices,
      viewerPermissions: {
        canManagePrices: Boolean(rows[0]?.can_manage_prices),
        canViewPrices: Boolean(rows[0]?.can_view_prices),
      },
    };
  }

  /**
   * Reads the stored trial policy required to validate extended day trial preservation.
   *
   * @param command - Price identity for the update.
   * @returns Existing trial policy, or null when the price is unavailable.
   */
  async getUpdateTrialPolicy(
    command: TribeSubscriptionPriceIdentity
  ): Promise<TribeSubscriptionPriceUpdateTrialPolicy | null> {
    const updateContext = await this.resolvePriceUpdateContext(command);

    if (!updateContext?.tribe_id || !updateContext.can_manage_prices) {
      return null;
    }

    return {
      amountCents: updateContext.amount_cents,
      hasMercadoPagoPreapprovalPlan: Boolean(
        updateContext.mercado_pago_preapproval_plan_id
      ),
      trialFrequency: updateContext.trial_frequency,
      trialFrequencyType: updateContext.trial_frequency_type,
    };
  }

  /**
   * Reads aggregate local subscriber diagnostics for tribe leaders.
   *
   * @param query - Tribe slug query.
   * @returns Aggregate diagnostics, or null when the tribe is missing or forbidden.
   */
  async getSubscriberDiagnostics(
    query: TribeSubscriptionPriceListQuery
  ): Promise<TribeSubscriberDiagnosticsResult | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${query.tribeSlug}
          limit 1
        )
        select
          target_tribe.id as target_tribe_id,
          count(tribe_member_subscriptions.id) filter (
            where tribe_member_subscriptions.status = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.active}
          ) as local_active_subscribers_count,
          count(tribe_member_subscriptions.id) filter (
            where tribe_member_subscriptions.status = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.active}
              and tribe_member_subscriptions.mercado_pago_preapproval_id is not null
          ) as mercado_pago_authorized_subscribers_count,
          count(tribe_member_subscriptions.id) filter (
            where tribe_member_subscriptions.status = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending}
          ) as mercado_pago_pending_subscribers_count,
          count(tribe_member_subscriptions.id) filter (
            where tribe_member_subscriptions.status = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.paused}
          ) as mercado_pago_paused_subscribers_count,
          count(tribe_member_subscriptions.id) filter (
            where tribe_member_subscriptions.status = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.canceled}
              or (
                tribe_member_subscriptions.status = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.active}
                and tribe_member_subscriptions.mercado_pago_preapproval_id is null
              )
          ) as mercado_pago_canceled_or_missing_subscribers_count,
          max(tribe_member_subscriptions.updated_at) as last_reconciled_at
        from target_tribe
        left join public.tribe_subscription_prices
          on tribe_subscription_prices.tribe_id = target_tribe.id
          and tribe_subscription_prices.status in ('active', 'canceled')
        left join public.tribe_member_subscriptions
          on tribe_member_subscriptions.price_id = tribe_subscription_prices.id
          and tribe_member_subscriptions.tribe_id = target_tribe.id
        where public.can_manage_tribe_subscription_prices(target_tribe.id)
        group by target_tribe.id
      `);
      const row = (result.rows?.[0] ?? null) as
        | TribeSubscriberDiagnosticsRow
        | null;

      return row?.target_tribe_id ? mapSubscriberDiagnostics(row) : null;
    });
  }

  /**
   * Reconciles every stored provider subscriber before returning aggregate diagnostics.
   *
   * @param query - Tribe slug query.
   * @returns Reconciled diagnostics or a stable failure status.
   */
  async reconcileSubscriberDiagnostics(
    query: TribeSubscriptionPriceListQuery
  ): Promise<TribeSubscriberDiagnosticsReconciliationResult> {
    const verificationContext = await this.resolveProviderPlanVerificationContext(
      query.tribeSlug
    );
    const accessToken = await this.resolveVerificationAccessToken(
      verificationContext
    );

    if ("status" in accessToken) {
      return accessToken;
    }

    const providerSubscribers = await this.listProviderSubscribersByTribe({
      tribeSlug: query.tribeSlug,
    });
    const providerSubscriptionStatuses =
      await readProviderSubscriptionStatuses({
        accessToken: accessToken.value,
        getMercadoPagoSubscriptionStatus:
          this.getMercadoPagoSubscriptionStatus,
        operationKey: [
          SUBSCRIPTION_PRICE_PAYMENT_OPERATION_KEY.verifyProviderSubscribers,
          query.tribeSlug,
          "diagnostics",
        ].join(SUBSCRIPTION_PRICE_PAYMENT_OPERATION_KEY.separator),
        priceId: "subscriber-diagnostics",
        providerSubscribers,
        requestId: this.requestId,
        tribeSlug: query.tribeSlug,
      });
    const providerSubscriberStatusUpdates =
      buildProviderSubscriberStatusUpdates({
        providerSubscribers,
        providerSubscriptionStatuses,
      });

    await this.reconcileTribeProviderSubscriberStatuses({
      providerSubscriberStatusUpdates,
      tribeSlug: query.tribeSlug,
    });

    const diagnostics = await this.getSubscriberDiagnostics(query);

    return diagnostics
      ? {
          diagnostics,
          status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
          verifiedCount: providerSubscribers.length,
        }
      : { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound };
  }

  /**
   * Creates a new immutable price version and matching Mercado Pago plan.
   *
   * @param command - Normalized price creation command.
   * @returns Price creation result.
   */
  async create(
    command: CreateTribeSubscriptionPriceCommand
  ): Promise<TribeSubscriptionPriceMutationResult> {
    const creationContext = await this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
          for update
        ),
        active_prices as (
          select count(*) as existing_price_count
          from public.tribe_subscription_prices
          inner join target_tribe
            on target_tribe.id = tribe_subscription_prices.tribe_id
          where tribe_subscription_prices.status in (
            'active',
            ${SUBSCRIPTION_PRICE_PROVIDER_PLAN_RESERVATION_STATUS}
          )
        )
        select
          (select id from target_tribe) as tribe_id,
          coalesce(public.can_manage_tribe_subscription_prices((select id from target_tribe)), false) as can_manage_prices,
          (select existing_price_count from active_prices) as existing_price_count,
          tribe_payment_integrations.access_token,
          tribe_payment_integrations.refresh_token,
          tribe_payment_integrations.token_expires_at
        from (select 1) result
        left join public.tribe_payment_integrations
          on tribe_payment_integrations.tribe_id = (select id from target_tribe)
          and tribe_payment_integrations.provider = 'mercado_pago'
      `);

      return (result.rows?.[0] ?? null) as
        | PriceCreationContextRow
        | null;
    });

    if (!creationContext?.tribe_id) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound };
    }

    if (!creationContext.can_manage_prices) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden };
    }

    if (
      Number(creationContext.existing_price_count ?? 0) >=
        TRIBE_SUBSCRIPTION_PRICE_LIMIT
    ) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.limitReached };
    }

    const accessToken = await resolveMercadoPagoAccessToken({
      executeWithDatabase: this.executeWithDatabase,
      refreshMercadoPagoAccessToken: this.refreshMercadoPagoAccessToken,
      storedToken: {
        accessToken: creationContext.access_token,
        refreshToken: creationContext.refresh_token,
        tokenExpiresAt: creationContext.token_expires_at,
        tribeId: creationContext.tribe_id,
      },
    }).catch(() => null);

    if (!accessToken) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.missingIntegration };
    }

    const reservation = await this.reserveProviderPlanPrice(
      shouldAttachTrialAfterProviderPlan(command)
        ? {
            ...command,
            trialFrequency: null,
            trialFrequencyType: null,
          }
        : command
    );

    if (reservation.status_result !== TRIBE_SUBSCRIPTION_PRICE_STATUS.created) {
      return {
        status:
          reservation.status_result === TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound ||
          reservation.status_result ===
            TRIBE_SUBSCRIPTION_PRICE_STATUS.limitReached
            ? reservation.status_result
            : TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden,
      };
    }

    if (!reservation.reserved_price_id) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden };
    }

    let mercadoPagoPlanId: string;
    const providerPlanOperationKey = buildPlanIdempotencyKey(
      command,
      reservation.reserved_price_id
    );
    const traceContext = buildSubscriptionPricePaymentTraceContext({
      operationKey: providerPlanOperationKey,
      priceId: reservation.reserved_price_id,
      requestId: this.requestId,
      tribeSlug: command.tribeSlug,
    });

    try {
      mercadoPagoPlanId = await this.createMercadoPagoPlan({
        accessToken,
        amountCents: command.amountCents,
        backUrl: buildProviderPlanBackUrl(command.tribeSlug),
        currency: command.currency,
        externalReference: buildPriceExternalReference(
          reservation.reserved_price_id
        ),
        idempotencyKey: providerPlanOperationKey,
        name: command.name,
        reason: command.name,
        trialFrequency: command.trialFrequency,
        trialFrequencyType: command.trialFrequencyType,
        ...(traceContext ? { traceContext } : {}),
      });
    } catch (error) {
      await this.releaseProviderPlanPriceReservation(reservation.reserved_price_id);

      throw error;
    }

    return this.attachProviderPlanToReservedPrice({
      mercadoPagoPlanId,
      priceId: reservation.reserved_price_id,
      trialFrequency: command.trialFrequency,
      trialFrequencyType: command.trialFrequencyType,
    });
  }

  private async reserveProviderPlanPrice(
    command: CreateTribeSubscriptionPriceCommand
  ): Promise<PriceReservationRow> {
    return this.executeWithDatabase(async (database) => {
      const reservationResult = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
          for update
        ),
        active_prices_before_insert as (
          select count(*) as existing_price_count
          from public.tribe_subscription_prices
          inner join target_tribe
            on target_tribe.id = tribe_subscription_prices.tribe_id
          where tribe_subscription_prices.status in (
            'active',
            ${SUBSCRIPTION_PRICE_PROVIDER_PLAN_RESERVATION_STATUS}
          )
        ),
        reserved_price as (
          insert into public.tribe_subscription_prices (
            tribe_id,
            name,
            amount_cents,
            currency,
            frequency,
            status,
            is_current,
            trial_frequency,
            trial_frequency_type,
            mercado_pago_preapproval_plan_id,
            created_by,
            created_at
          )
          select
            target_tribe.id,
            ${command.name},
            ${command.amountCents},
            ${command.currency},
            ${command.frequency},
            ${SUBSCRIPTION_PRICE_PROVIDER_PLAN_RESERVATION_STATUS},
            false,
            ${command.trialFrequency},
            ${command.trialFrequencyType},
            null,
            public.current_app_user_id(),
            timezone('utc', now())
          from target_tribe
          where public.can_manage_tribe_subscription_prices(target_tribe.id)
            and (
              select existing_price_count
              from active_prices_before_insert
            ) < ${TRIBE_SUBSCRIPTION_PRICE_LIMIT}
          returning id
        )
        select
          case
            when exists (select 1 from reserved_price) then ${TRIBE_SUBSCRIPTION_PRICE_STATUS.created}
            when not exists (select 1 from target_tribe) then ${TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound}
            when (
              select existing_price_count
              from active_prices_before_insert
            ) >= ${TRIBE_SUBSCRIPTION_PRICE_LIMIT} then ${TRIBE_SUBSCRIPTION_PRICE_STATUS.limitReached}
            else ${TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden}
          end as status_result,
          (select id from reserved_price) as reserved_price_id
      `);

      return (reservationResult.rows?.[0] ?? null) as PriceReservationRow;
    });
  }

  private async releaseProviderPlanPriceReservation(priceId: string): Promise<void> {
    await this.executeWithDatabase(async (database) => {
      await database.execute(sql`
        update public.tribe_subscription_prices
        set
          status = 'deleted',
          deleted_at = timezone('utc', now())
        where tribe_subscription_prices.id = ${priceId}
          and tribe_subscription_prices.status = ${SUBSCRIPTION_PRICE_PROVIDER_PLAN_RESERVATION_STATUS}
          and tribe_subscription_prices.mercado_pago_preapproval_plan_id is null
          and public.can_manage_tribe_subscription_prices(tribe_subscription_prices.tribe_id)
      `);
    });
  }

  private async attachProviderPlanToReservedPrice(input: {
    mercadoPagoPlanId: string;
    priceId: string;
    trialFrequency: CreateTribeSubscriptionPriceCommand["trialFrequency"];
    trialFrequencyType: CreateTribeSubscriptionPriceCommand["trialFrequencyType"];
  }): Promise<TribeSubscriptionPriceMutationResult> {
    return this.executeWithDatabase(async (database) => {
      const activationResult = await database.execute(sql`
        update public.tribe_subscription_prices
        set
          mercado_pago_preapproval_plan_id = ${input.mercadoPagoPlanId},
          trial_frequency = ${input.trialFrequency},
          trial_frequency_type = ${input.trialFrequencyType},
          status = 'active'
        where tribe_subscription_prices.id = ${input.priceId}
          and tribe_subscription_prices.status = ${SUBSCRIPTION_PRICE_PROVIDER_PLAN_RESERVATION_STATUS}
          and public.can_manage_tribe_subscription_prices(tribe_subscription_prices.tribe_id)
        returning id, name, amount_cents, currency, frequency, status, is_current, trial_frequency, trial_frequency_type, created_at
      `);

      return mapPriceMutationResult(
        (activationResult.rows?.[0]
          ? {
              ...activationResult.rows[0],
              active_subscribers_count: 0,
              status_result: TRIBE_SUBSCRIPTION_PRICE_STATUS.created,
            }
          : null) as SubscriptionPriceMutationRow | null,
        TRIBE_SUBSCRIPTION_PRICE_STATUS.created
      );
    });
  }

  /**
   * Updates a price name in place or creates a new version when the amount changes.
   *
   * @param command - Normalized price update command.
   * @returns Price update or version creation result.
   */
  async update(
    command: UpdateTribeSubscriptionPriceCommand
  ): Promise<TribeSubscriptionPriceMutationResult> {
    const updateContext = await this.resolvePriceUpdateContext(command);

    if (!updateContext?.tribe_id) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound };
    }

    if (!updateContext.can_manage_prices) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden };
    }

    const amountHasChanged = updateContext.amount_cents !== command.amountCents;
    const resolvedTrialPeriod = resolveUpdateTrialPeriod(command, updateContext);

    if (amountHasChanged) {
      const createdPriceResult = await this.create({
        amountCents: command.amountCents,
        currency: command.currency,
        frequency: command.frequency,
        name: command.name,
        ...resolvedTrialPeriod,
        tribeSlug: command.tribeSlug,
      });

      if (
        createdPriceResult.status === TRIBE_SUBSCRIPTION_PRICE_STATUS.created &&
        updateContext.is_current
      ) {
        return this.makeCurrent({
          priceId: createdPriceResult.price.id,
          tribeSlug: command.tribeSlug,
        });
      }

      return createdPriceResult;
    }

    const accessToken = await this.resolveAccessTokenForProviderMutation(
      updateContext
    );

    if (!accessToken) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.missingIntegration };
    }

    if (updateContext.mercado_pago_preapproval_plan_id) {
      const operationKey = buildSubscriptionPriceOperationKey({
        operation: SUBSCRIPTION_PRICE_PAYMENT_OPERATION_KEY.updateProviderPlan,
        priceId: command.priceId,
        tribeSlug: command.tribeSlug,
      });
      const traceContext = buildSubscriptionPricePaymentTraceContext({
        operationKey,
        priceId: command.priceId,
        providerPlanId: updateContext.mercado_pago_preapproval_plan_id,
        requestId: this.requestId,
        tribeSlug: command.tribeSlug,
      });

      await this.updateMercadoPagoPlan({
        accessToken,
        backUrl: buildProviderPlanBackUrl(command.tribeSlug),
        externalReference: buildPriceExternalReference(command.priceId),
        preapprovalPlanId: updateContext.mercado_pago_preapproval_plan_id,
        reason: command.name,
        status: MERCADO_PAGO_PROVIDER_PLAN_STATUS.active,
        ...resolvedTrialPeriod,
        ...(traceContext ? { traceContext } : {}),
      });
    }

    return this.updateLocalPriceMutableFields({
      ...command,
      ...resolvedTrialPeriod,
    });
  }

  /**
   * Resolves the local price, permissions, and provider token state for mutations.
   *
   * @param command - Price update command.
   * @returns Price update context row, or null when no row is available.
   */
  private async resolvePriceUpdateContext(
    command: TribeSubscriptionPriceIdentity
  ): Promise<PriceUpdateContextRow | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        target_price as (
          select
            tribe_subscription_prices.id,
            tribe_subscription_prices.tribe_id,
            tribe_subscription_prices.name,
            tribe_subscription_prices.amount_cents,
            tribe_subscription_prices.currency,
            tribe_subscription_prices.frequency,
            tribe_subscription_prices.status,
            tribe_subscription_prices.is_current,
            tribe_subscription_prices.trial_frequency,
            tribe_subscription_prices.trial_frequency_type,
            tribe_subscription_prices.created_at,
            tribe_subscription_prices.mercado_pago_preapproval_plan_id
          from public.tribe_subscription_prices
          inner join target_tribe
            on target_tribe.id = tribe_subscription_prices.tribe_id
          where tribe_subscription_prices.id = ${command.priceId}
            and tribe_subscription_prices.status in ('active', 'canceled')
          limit 1
        )
        select
          target_price.id,
          target_price.tribe_id,
          target_price.name,
          target_price.amount_cents,
          target_price.currency,
          target_price.frequency,
          target_price.status,
          target_price.is_current,
          target_price.trial_frequency,
          target_price.trial_frequency_type,
          target_price.created_at,
          target_price.mercado_pago_preapproval_plan_id,
          0 as active_subscribers_count,
          coalesce(public.can_manage_tribe_subscription_prices((select id from target_tribe)), false) as can_manage_prices,
          tribe_payment_integrations.access_token,
          tribe_payment_integrations.refresh_token,
          tribe_payment_integrations.token_expires_at
        from (select 1) result
        left join target_price
          on true
        left join public.tribe_payment_integrations
          on tribe_payment_integrations.tribe_id = (select id from target_tribe)
          and tribe_payment_integrations.provider = 'mercado_pago'
      `);

      return (result.rows?.[0] ?? null) as PriceUpdateContextRow | null;
    });
  }

  /**
   * Resolves an access token for provider mutations from a stored context row.
   *
   * @param mutationContext - Stored provider token context.
   * @returns Fresh provider access token, or null when unavailable.
   */
  private async resolveAccessTokenForProviderMutation(
    mutationContext: PriceUpdateContextRow | PriceCreationContextRow
  ): Promise<string | null> {
    return resolveMercadoPagoAccessToken({
      executeWithDatabase: this.executeWithDatabase,
      refreshMercadoPagoAccessToken: this.refreshMercadoPagoAccessToken,
      storedToken: {
        accessToken: mutationContext.access_token,
        refreshToken: mutationContext.refresh_token,
        tokenExpiresAt: mutationContext.token_expires_at,
        tribeId: mutationContext.tribe_id,
      },
    }).catch(() => null);
  }

  /**
   * Persists mutable local price fields after Mercado Pago accepts the change.
   *
   * @param command - Price update command.
   * @returns Updated price mutation result.
   */
  private async updateLocalPriceMutableFields(
    command: UpdateTribeSubscriptionPriceCommand
  ): Promise<TribeSubscriptionPriceMutationResult> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        updated_price as (
          update public.tribe_subscription_prices
          set
            name = ${command.name},
            trial_frequency = ${command.trialFrequency},
            trial_frequency_type = ${command.trialFrequencyType}
          where tribe_subscription_prices.tribe_id = (select id from target_tribe)
            and tribe_subscription_prices.id = ${command.priceId}
            and tribe_subscription_prices.status = 'active'
            and public.can_manage_tribe_subscription_prices(tribe_subscription_prices.tribe_id)
          returning id, name, amount_cents, currency, frequency, status, is_current, trial_frequency, trial_frequency_type, created_at
        )
        select
          ${TRIBE_SUBSCRIPTION_PRICE_STATUS.updated} as status_result,
          updated_price.id,
          updated_price.name,
          updated_price.amount_cents,
          updated_price.currency,
          updated_price.frequency,
          updated_price.status,
          updated_price.is_current,
          updated_price.trial_frequency,
          updated_price.trial_frequency_type,
          updated_price.created_at,
          0 as active_subscribers_count
        from updated_price
      `);

      return mapPriceMutationResult(
        (result.rows?.[0] ?? null) as SubscriptionPriceMutationRow | null,
        TRIBE_SUBSCRIPTION_PRICE_STATUS.updated
      );
    });
  }

  /**
   * Marks a price as current for new members without touching existing subscribers.
   *
   * @param command - Price identity command.
   * @returns Current price mutation result.
   */
  async makeCurrent(
    command: TribeSubscriptionPriceIdentity
  ): Promise<TribeSubscriptionPriceMutationResult> {
    return this.executeWithDatabase(async (database) => {
      const targetResult = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
          for update
        ),
        target_price as (
          select
            tribe_subscription_prices.id,
            tribe_subscription_prices.name,
            tribe_subscription_prices.amount_cents,
            tribe_subscription_prices.currency,
            tribe_subscription_prices.frequency,
            tribe_subscription_prices.status,
            tribe_subscription_prices.is_current,
            tribe_subscription_prices.created_at
          from public.tribe_subscription_prices
          inner join target_tribe
            on target_tribe.id = tribe_subscription_prices.tribe_id
          where tribe_subscription_prices.id = ${command.priceId}
            and tribe_subscription_prices.status = 'active'
            and tribe_subscription_prices.mercado_pago_preapproval_plan_id is not null
          limit 1
        )
        select
          case
            when not exists (select 1 from target_tribe) then ${TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound}
            when not exists (select 1 from target_price) then ${TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound}
            when not public.can_manage_tribe_subscription_prices((select id from target_tribe)) then ${TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden}
            else ${TRIBE_SUBSCRIPTION_PRICE_STATUS.current}
          end as status_result,
          target_price.id,
          target_price.name,
          target_price.amount_cents,
          target_price.currency,
          target_price.frequency,
          target_price.status,
          target_price.is_current,
          target_price.created_at,
          0 as active_subscribers_count
        from (select 1) result
        left join target_price
          on true
      `);
      const targetRow = (targetResult.rows?.[0] ?? null) as
        | SubscriptionPriceMutationRow
        | null;

      if (targetRow?.status_result !== TRIBE_SUBSCRIPTION_PRICE_STATUS.current) {
        return mapPriceMutationResult(
          targetRow,
          TRIBE_SUBSCRIPTION_PRICE_STATUS.current
        );
      }

      await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        )
        update public.tribe_subscription_prices
        set is_current = false
        where tribe_subscription_prices.tribe_id = (select id from target_tribe)
          and tribe_subscription_prices.id <> ${command.priceId}
          and tribe_subscription_prices.is_current = true
          and public.can_manage_tribe_subscription_prices(tribe_subscription_prices.tribe_id)
      `);

      const currentResult = await database.execute(sql`
        update public.tribe_subscription_prices
        set is_current = true
        where tribe_subscription_prices.id = ${command.priceId}
          and tribe_subscription_prices.status = 'active'
          and tribe_subscription_prices.mercado_pago_preapproval_plan_id is not null
          and public.can_manage_tribe_subscription_prices(tribe_subscription_prices.tribe_id)
        returning
          ${TRIBE_SUBSCRIPTION_PRICE_STATUS.current} as status_result,
          id, name, amount_cents, currency, frequency, status, is_current,
          trial_frequency, trial_frequency_type, created_at,
          0 as active_subscribers_count
      `);

      const currentRow = (currentResult.rows?.[0] ?? null) as
        | SubscriptionPriceMutationRow
        | null;

      if (currentRow?.status_result !== TRIBE_SUBSCRIPTION_PRICE_STATUS.current) {
        throw new Error(
          `Tribe subscription price ${command.priceId} for tribe ${command.tribeSlug} became ineligible while marking it as current`
        );
      }

      await database.execute(sql`
        update public.tribes
        set free_join_is_current = false
        where tribes.slug = ${command.tribeSlug}
          and public.can_manage_tribe_subscription_prices(tribes.id)
      `);

      return mapPriceMutationResult(
        currentRow,
        TRIBE_SUBSCRIPTION_PRICE_STATUS.current
      );
    });
  }

  /**
   * Marks the synthetic free-join option as the tribe's current offering,
   * atomically clearing any paid price flagged as current.
   *
   * @param command - Tribe identity for the free-join toggle.
   * @returns Mutation outcome reflecting permission and existence checks.
   */
  async setFreeJoinAsCurrent(
    command: SetTribeFreeJoinAsCurrentCommand
  ): Promise<TribeFreeJoinMutationResult> {
    return this.executeWithDatabase(async (database) => {
      const validationResult = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
          for update
        )
        select
          case
            when not exists (select 1 from target_tribe) then ${TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound}
            when not public.can_manage_tribe_subscription_prices((select id from target_tribe)) then ${TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden}
            else ${TRIBE_SUBSCRIPTION_PRICE_STATUS.current}
          end as status_result
      `);
      const validationRow =
        (validationResult.rows?.[0] ?? null) as { status_result?: string } | null;

      if (
        validationRow?.status_result !== TRIBE_SUBSCRIPTION_PRICE_STATUS.current
      ) {
        return {
          status:
            (validationRow?.status_result as TribeFreeJoinMutationResult["status"]) ??
            TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound,
        };
      }

      await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        )
        update public.tribe_subscription_prices
        set is_current = false
        where tribe_subscription_prices.tribe_id = (select id from target_tribe)
          and tribe_subscription_prices.is_current = true
          and public.can_manage_tribe_subscription_prices(tribe_subscription_prices.tribe_id)
      `);

      const updateResult = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        updated_tribe as (
          update public.tribes
          set free_join_is_current = true
          where tribes.id = (select id from target_tribe)
            and public.can_manage_tribe_subscription_prices(tribes.id)
          returning id
        )
        select
          case
            when exists (select 1 from updated_tribe) then ${TRIBE_SUBSCRIPTION_PRICE_STATUS.current}
            else ${TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden}
          end as status_result
      `);
      const updateRow =
        (updateResult.rows?.[0] ?? null) as { status_result?: string } | null;

      return {
        status:
          (updateRow?.status_result as TribeFreeJoinMutationResult["status"]) ??
          TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden,
      };
    });
  }

  /**
   * Verifies all active local prices against their Mercado Pago plan.
   *
   * @param query - Tribe slug query.
   * @returns Provider plan verification result with the refreshed price list.
   */
  async verifyProviderPlans(
    query: TribeSubscriptionPriceListQuery
  ): Promise<TribeSubscriptionProviderPlansVerificationResult> {
    const verificationContext = await this.resolveProviderPlanVerificationContext(
      query.tribeSlug
    );
    const accessToken = await this.resolveVerificationAccessToken(
      verificationContext
    );

    if ("status" in accessToken) {
      return accessToken;
    }

    const providerPlanPrices = await this.listProviderPlanPrices({
      tribeSlug: query.tribeSlug,
    });
    const canceledPrices = await Promise.all(
      providerPlanPrices.map(async (providerPlanPrice) => {
        const traceContext = providerPlanPrice.mercado_pago_preapproval_plan_id
          ? buildSubscriptionPricePaymentTraceContext({
              operationKey: buildSubscriptionPriceOperationKey({
                operation:
                  SUBSCRIPTION_PRICE_PAYMENT_OPERATION_KEY.verifyProviderPlan,
                priceId: providerPlanPrice.id,
                tribeSlug: query.tribeSlug,
              }),
              priceId: providerPlanPrice.id,
              providerPlanId:
                providerPlanPrice.mercado_pago_preapproval_plan_id,
              requestId: this.requestId,
              tribeSlug: query.tribeSlug,
            })
          : undefined;
        const providerPlanStatus =
          providerPlanPrice.mercado_pago_preapproval_plan_id
            ? await this.getMercadoPagoPlanStatus({
                accessToken: accessToken.value,
                preapprovalPlanId:
                  providerPlanPrice.mercado_pago_preapproval_plan_id,
                ...(traceContext ? { traceContext } : {}),
              })
            : null;

        return providerPlanStatus !== MERCADO_PAGO_PROVIDER_PLAN_STATUS.active
          ? this.cancelProviderPlanPrice({
              priceId: providerPlanPrice.id,
              tribeSlug: query.tribeSlug,
            })
          : null;
      })
    );
    const canceledPriceIds = canceledPrices.reduce<string[]>(
      (priceIds, canceledPrice) => {
        if (canceledPrice) {
          priceIds.push(canceledPrice.id);
        }

        return priceIds;
      },
      []
    );

    const refreshedPriceList = await this.listByTribeSlug(query);

    return {
      canceledPriceIds,
      freeJoinIsCurrent: refreshedPriceList.freeJoinIsCurrent,
      prices: refreshedPriceList.prices,
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
      verifiedCount: providerPlanPrices.length,
    };
  }

  /**
   * Verifies one active local price against its Mercado Pago plan.
   *
   * @param command - Price identity command.
   * @returns Provider plan verification result.
   */
  async verifyProviderPlan(
    command: TribeSubscriptionPriceIdentity
  ): Promise<TribeSubscriptionProviderPlanVerificationResult> {
    const verificationContext = await this.resolveProviderPlanVerificationContext(
      command.tribeSlug
    );
    const accessToken = await this.resolveVerificationAccessToken(
      verificationContext
    );

    if ("status" in accessToken) {
      return accessToken;
    }

    const providerPlanPrice =
      await this.readProviderSubscriberVerificationPrice({
        priceId: command.priceId,
        tribeSlug: command.tribeSlug,
      });

    if (!providerPlanPrice) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound };
    }

    const traceContext = providerPlanPrice.mercado_pago_preapproval_plan_id
      ? buildSubscriptionPricePaymentTraceContext({
          operationKey: buildSubscriptionPriceOperationKey({
            operation:
              SUBSCRIPTION_PRICE_PAYMENT_OPERATION_KEY.verifyProviderPlan,
            priceId: providerPlanPrice.id,
            tribeSlug: command.tribeSlug,
          }),
          priceId: providerPlanPrice.id,
          providerPlanId: providerPlanPrice.mercado_pago_preapproval_plan_id,
          requestId: this.requestId,
          tribeSlug: command.tribeSlug,
        })
      : undefined;
    const providerPlanStatus =
      providerPlanPrice.mercado_pago_preapproval_plan_id
        ? await this.getMercadoPagoPlanStatus({
            accessToken: accessToken.value,
            preapprovalPlanId: providerPlanPrice.mercado_pago_preapproval_plan_id,
            ...(traceContext ? { traceContext } : {}),
          })
        : null;

    if (providerPlanStatus !== MERCADO_PAGO_PROVIDER_PLAN_STATUS.active) {
      const canceledPrice = await this.cancelProviderPlanPrice({
        priceId: providerPlanPrice.id,
        tribeSlug: command.tribeSlug,
      });
      const refreshedPriceList = await this.listByTribeSlug({
        tribeSlug: command.tribeSlug,
      });

      return {
        freeJoinIsCurrent: refreshedPriceList.freeJoinIsCurrent,
        price: canceledPrice ?? {
          ...mapSubscriptionPrice(providerPlanPrice),
          isCurrent: false,
          status: TRIBE_SUBSCRIPTION_PRICE_STATUS.canceled,
        },
        status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
      };
    }

    return {
      price: mapSubscriptionPrice(providerPlanPrice),
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
    };
  }

  /**
   * Reconciles real Mercado Pago subscribers for one local price.
   *
   * @param command - Reconciliation command with price identity and trigger source.
   * @returns Provider subscriber reconciliation result with a provider-backed count.
   */
  async reconcileProviderSubscribers(
    command: TribeProviderSubscriberReconciliationCommand
  ): Promise<TribeProviderSubscriberReconciliationResult> {
    const verificationContext = await this.resolveProviderPlanVerificationContext(
      command.tribeSlug
    );
    const accessToken = await this.resolveVerificationAccessToken(
      verificationContext
    );

    if ("status" in accessToken) {
      return accessToken;
    }

    const providerPlanPrice = (
      await this.listProviderPlanPrices({
        includeCanceled: true,
        priceId: command.priceId,
        tribeSlug: command.tribeSlug,
      })
    )[0];

    if (!providerPlanPrice) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound };
    }

    const providerSubscribers = await this.listProviderSubscribers({
      priceId: command.priceId,
      tribeSlug: command.tribeSlug,
    });
    const providerSubscriptionStatuses =
      await readProviderSubscriptionStatuses({
        accessToken: accessToken.value,
        getMercadoPagoSubscriptionStatus:
          this.getMercadoPagoSubscriptionStatus,
        operationKey: buildSubscriptionPriceOperationKey({
          operation:
            SUBSCRIPTION_PRICE_PAYMENT_OPERATION_KEY.verifyProviderSubscribers,
          priceId: command.priceId,
          source: command.source,
          tribeSlug: command.tribeSlug,
        }),
        priceId: command.priceId,
        providerSubscribers,
        requestId: this.requestId,
        tribeSlug: command.tribeSlug,
      });
    const providerSubscriberStatusUpdates =
      buildProviderSubscriberStatusUpdates({
        providerSubscribers,
        providerSubscriptionStatuses,
      });
    const activeSubscribersCount = providerSubscriptionStatuses.filter(
      (providerSubscriptionStatus) =>
        mapMercadoPagoSubscriptionStatus(providerSubscriptionStatus)
          .isAttachedToProviderPlan
    ).length;
    const reconciledPrice = await this.reconcileProviderSubscriberStatuses({
      priceId: command.priceId,
      providerSubscriberStatusUpdates,
      tribeSlug: command.tribeSlug,
    });

    if (!reconciledPrice) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound };
    }

    return {
      price: reconciledPrice,
      providerActiveSubscribersCount: activeSubscribersCount,
      status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
      verifiedCount: providerSubscribers.length,
    };
  }

  /**
   * Synchronizes a Mercado Pago plan webhook into the linked local price.
   *
   * @param command - Provider plan webhook command.
   * @returns Provider plan synchronization result.
   */
  async syncProviderPlan(
    command: SyncTribeSubscriptionProviderPlanCommand
  ): Promise<TribeSubscriptionProviderPlanSyncResult> {
    const webhookContext = await this.resolveProviderPlanWebhookContext(
      command.resourceId
    );

    if (!webhookContext?.tribe_id) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound };
    }

    const accessToken = await this.resolveAccessTokenForProviderMutation({
      ...webhookContext,
      can_manage_prices: true,
    });

    if (!accessToken) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.missingIntegration };
    }

    const webhookRegistration = {
      eventId: command.eventId,
      resourceId: command.resourceId,
      topic: command.topic,
      tribeId: webhookContext.tribe_id,
    };
    const shouldProcessWebhook = await this.registerProviderPlanWebhook(
      webhookRegistration
    );

    if (!shouldProcessWebhook) {
      return {
        price: mapSubscriptionPrice(webhookContext),
        status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
      };
    }

    try {
      const operationKey = [
        SUBSCRIPTION_PRICE_PAYMENT_OPERATION_KEY.syncProviderPlanWebhook,
        command.eventId,
      ].join(SUBSCRIPTION_PRICE_PAYMENT_OPERATION_KEY.separator);
      const traceContext = buildSubscriptionPricePaymentTraceContext({
        operationKey,
        priceId: webhookContext.id,
        providerPlanId: command.resourceId,
        requestId: this.requestId,
      });
      const providerPlan = await this.getMercadoPagoPlan({
        accessToken,
        preapprovalPlanId: command.resourceId,
        ...(traceContext ? { traceContext } : {}),
      });
      const linkedPriceId = parsePriceIdFromExternalReference(
        providerPlan?.externalReference ?? null
      );

      if (linkedPriceId && linkedPriceId !== webhookContext.id) {
        return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound };
      }

      if (providerPlan?.status !== MERCADO_PAGO_PROVIDER_PLAN_STATUS.active) {
        const canceledPrice = await this.cancelProviderPlanPriceFromWebhook({
          priceId: webhookContext.id,
        });

        return canceledPrice
          ? {
              price: canceledPrice,
              status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
            }
          : { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound };
      }

      const updatedPrice = await this.updateLocalPriceNameFromWebhook({
        name: providerPlan.reason ?? webhookContext.name,
        priceId: webhookContext.id,
        trialFrequency: providerPlan.trial?.frequency ?? null,
        trialFrequencyType: providerPlan.trial?.frequencyType ?? null,
      });

      return updatedPrice
        ? {
            price: updatedPrice,
            status: TRIBE_SUBSCRIPTION_PRICE_STATUS.verified,
          }
        : { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound };
    } catch (error) {
      await this.releaseProviderPlanWebhookRegistration(webhookRegistration);

      throw error;
    }
  }

  /**
   * Resolves a local price and provider token context from a Mercado Pago plan id.
   *
   * @param providerPlanId - Mercado Pago preapproval plan identifier.
   * @returns Webhook synchronization context, or null when no linked price exists.
   */
  private async resolveProviderPlanWebhookContext(
    providerPlanId: string
  ): Promise<ProviderPlanWebhookContextRow | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select
          tribe_subscription_prices.id,
          tribe_subscription_prices.tribe_id,
          tribe_subscription_prices.name,
          tribe_subscription_prices.amount_cents,
          tribe_subscription_prices.currency,
          tribe_subscription_prices.frequency,
          tribe_subscription_prices.status,
          tribe_subscription_prices.is_current,
          tribe_subscription_prices.trial_frequency,
          tribe_subscription_prices.trial_frequency_type,
          tribe_subscription_prices.created_at,
          tribe_subscription_prices.mercado_pago_preapproval_plan_id,
          0 as active_subscribers_count,
          tribe_payment_integrations.access_token,
          tribe_payment_integrations.refresh_token,
          tribe_payment_integrations.token_expires_at
        from public.tribe_subscription_prices
        inner join public.tribe_payment_integrations
          on tribe_payment_integrations.tribe_id = tribe_subscription_prices.tribe_id
          and tribe_payment_integrations.provider = 'mercado_pago'
        where tribe_subscription_prices.mercado_pago_preapproval_plan_id = ${providerPlanId}
          and tribe_subscription_prices.status in ('active', 'canceled')
        limit 1
      `);

      return (result.rows?.[0] ?? null) as
        | ProviderPlanWebhookContextRow
        | null;
    });
  }

  /**
   * Registers a provider plan webhook for idempotent processing.
   *
   * @param input - Webhook identity and local tribe context.
   * @returns Whether the webhook was newly registered and should be processed.
   */
  private async registerProviderPlanWebhook(input: {
    eventId: string;
    resourceId: string;
    topic: string;
    tribeId: string;
  }): Promise<boolean> {
    return this.executeWithDatabase(async (database) => {
      const operationKey = `mercado-pago-plan-webhook:${input.eventId}`;
      const result = await database.execute(sql`
        insert into public.subscription_idempotency_operations (
          operation_key,
          operation_type,
          tribe_id,
          user_id,
          payload_hash,
          response_body
        )
        values (
          ${operationKey},
          'mercado_pago_plan_webhook',
          ${input.tribeId},
          null,
          ${input.topic + ":" + input.resourceId},
          '{}'::jsonb
        )
        on conflict (operation_key) do nothing
        returning id
      `);

      return Boolean(result.rows?.[0]);
    });
  }

  /**
   * Releases a failed provider plan webhook registration so Mercado Pago can retry it.
   *
   * @param input - Webhook identity and local tribe context.
   * @returns Promise resolved after the registration is removed.
   */
  private async releaseProviderPlanWebhookRegistration(input: {
    eventId: string;
    resourceId: string;
    topic: string;
    tribeId: string;
  }): Promise<void> {
    await this.executeWithDatabase(async (database) => {
      const operationKey = `mercado-pago-plan-webhook:${input.eventId}`;

      await database.execute(sql`
        delete from public.subscription_idempotency_operations
        where subscription_idempotency_operations.operation_key = ${operationKey}
          and subscription_idempotency_operations.operation_type = 'mercado_pago_plan_webhook'
          and subscription_idempotency_operations.tribe_id = ${input.tribeId}
          and subscription_idempotency_operations.payload_hash = ${input.topic + ":" + input.resourceId}
      `);
    });
  }

  /**
   * Updates a local price name from a verified Mercado Pago webhook.
   *
   * @param input - Local price identifier and provider plan name.
   * @returns Updated price, or null when no row was changed.
   */
  private async updateLocalPriceNameFromWebhook(input: {
    name: string;
    priceId: string;
    trialFrequency: number | null;
    trialFrequencyType: "days" | "months" | null;
  }): Promise<TribeSubscriptionPriceResult | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        update public.tribe_subscription_prices
        set
          name = ${input.name},
          trial_frequency = ${input.trialFrequency},
          trial_frequency_type = ${input.trialFrequencyType}
        where tribe_subscription_prices.id = ${input.priceId}
          and tribe_subscription_prices.status = 'active'
        returning id, name, amount_cents, currency, frequency, status, is_current, trial_frequency, trial_frequency_type, created_at, 0 as active_subscribers_count
      `);
      const row = (result.rows?.[0] ?? null) as SubscriptionPriceRow | null;

      return row ? mapSubscriptionPrice(row) : null;
    });
  }

  /**
   * Cancels a local price from a verified Mercado Pago webhook.
   *
   * @param input - Local price identifier.
   * @returns Updated price, or null when no row was changed.
   */
  private async cancelProviderPlanPriceFromWebhook(input: {
    priceId: string;
  }): Promise<TribeSubscriptionPriceResult | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_price as (
          select
            tribe_subscription_prices.id,
            tribe_subscription_prices.tribe_id,
            tribe_subscription_prices.is_current
          from public.tribe_subscription_prices
          where tribe_subscription_prices.id = ${input.priceId}
            and tribe_subscription_prices.status = 'active'
          limit 1
        ),
        updated_price as (
          update public.tribe_subscription_prices
          set
            status = ${TRIBE_SUBSCRIPTION_PRICE_STATUS.canceled},
            is_current = false
          where tribe_subscription_prices.id = (select id from target_price)
          returning id, name, amount_cents, currency, frequency, status, is_current, trial_frequency, trial_frequency_type, created_at, 0 as active_subscribers_count
        ),
        updated_tribe as (
          update public.tribes
          set free_join_is_current = true
          where tribes.id = (select tribe_id from target_price)
            and exists (select 1 from updated_price)
            and exists (
              select 1
              from target_price
              where target_price.is_current = true
            )
            and not exists (
              select 1
              from public.tribe_subscription_prices
              where tribe_subscription_prices.tribe_id = (select tribe_id from target_price)
                and tribe_subscription_prices.id <> (select id from target_price)
                and tribe_subscription_prices.is_current = true
                and tribe_subscription_prices.status = 'active'
                and tribe_subscription_prices.mercado_pago_preapproval_plan_id is not null
            )
          returning id
        )
        select
          updated_price.id,
          updated_price.name,
          updated_price.amount_cents,
          updated_price.currency,
          updated_price.frequency,
          updated_price.status,
          updated_price.is_current,
          updated_price.trial_frequency,
          updated_price.trial_frequency_type,
          updated_price.created_at,
          updated_price.active_subscribers_count
        from updated_price
      `);
      const row = (result.rows?.[0] ?? null) as SubscriptionPriceRow | null;

      return row ? mapSubscriptionPrice(row) : null;
    });
  }

  /**
   * Resolves authorization and token context for provider plan verification.
   *
   * @param tribeSlug - Tribe slug used to scope the verification.
   * @returns Database context required to call Mercado Pago.
   */
  private async resolveProviderPlanVerificationContext(
    tribeSlug: string
  ): Promise<PriceVerificationContextRow | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${tribeSlug}
          limit 1
        )
        select
          (select id from target_tribe) as tribe_id,
          coalesce(public.can_manage_tribe_subscription_prices((select id from target_tribe)), false) as can_manage_prices,
          tribe_payment_integrations.access_token,
          tribe_payment_integrations.refresh_token,
          tribe_payment_integrations.token_expires_at
        from (select 1) result
        left join public.tribe_payment_integrations
          on tribe_payment_integrations.tribe_id = (select id from target_tribe)
          and tribe_payment_integrations.provider = 'mercado_pago'
      `);

      return (result.rows?.[0] ?? null) as PriceVerificationContextRow | null;
    });
  }

  /**
   * Resolves a fresh access token or a stable verification failure status.
   *
   * @param verificationContext - Database context for the tribe integration.
   * @returns Access token wrapper or a verification failure result.
   */
  private async resolveVerificationAccessToken(
    verificationContext: PriceVerificationContextRow | null
  ): Promise<
    | {
        value: string;
      }
    | {
        status:
          | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden
          | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.missingIntegration
          | typeof TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound;
      }
  > {
    if (!verificationContext?.tribe_id) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound };
    }

    if (!verificationContext.can_manage_prices) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden };
    }

    const accessToken = await resolveMercadoPagoAccessToken({
      executeWithDatabase: this.executeWithDatabase,
      refreshMercadoPagoAccessToken: this.refreshMercadoPagoAccessToken,
      storedToken: {
        accessToken: verificationContext.access_token,
        refreshToken: verificationContext.refresh_token,
        tokenExpiresAt: verificationContext.token_expires_at,
        tribeId: verificationContext.tribe_id,
      },
    }).catch(() => null);

    return accessToken
      ? { value: accessToken }
      : { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.missingIntegration };
  }

  /**
   * Reads a price that can have its stored subscribers verified against Mercado Pago.
   *
   * @param input - Tribe and price identifiers used to scope the verification.
   * @returns Price row for active or canceled prices, or null when unavailable.
   */
  private async readProviderSubscriberVerificationPrice(input: {
    priceId: string;
    tribeSlug: string;
  }): Promise<SubscriptionProviderPlanRow | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${input.tribeSlug}
          limit 1
        )
        select
          tribe_subscription_prices.id,
          tribe_subscription_prices.name,
          tribe_subscription_prices.amount_cents,
          tribe_subscription_prices.currency,
          tribe_subscription_prices.frequency,
          tribe_subscription_prices.status,
          tribe_subscription_prices.is_current,
          tribe_subscription_prices.trial_frequency,
          tribe_subscription_prices.trial_frequency_type,
          tribe_subscription_prices.created_at,
          tribe_subscription_prices.mercado_pago_preapproval_plan_id,
          count(tribe_member_subscriptions.id) filter (
            where tribe_member_subscriptions.status in ${CURRENT_MEMBER_SUBSCRIPTION_STATUSES}
          ) as active_subscribers_count
        from public.tribe_subscription_prices
        inner join target_tribe
          on target_tribe.id = tribe_subscription_prices.tribe_id
        left join public.tribe_member_subscriptions
          on tribe_member_subscriptions.price_id = tribe_subscription_prices.id
        where tribe_subscription_prices.id = ${input.priceId}
          and tribe_subscription_prices.status in ('active', 'canceled')
          and public.can_manage_tribe_subscription_prices(target_tribe.id)
        group by tribe_subscription_prices.id
        limit 1
      `);

      return (result.rows?.[0] ?? null) as
        | SubscriptionProviderPlanRow
        | null;
    });
  }

  /**
   * Persists provider-backed subscriber statuses and recalculates local member access.
   *
   * @param input - Price identity and verified subscriber status updates.
   * @returns Reconciled price row with the updated association count.
   */
  private async reconcileProviderSubscriberStatuses(input: {
    priceId: string;
    providerSubscriberStatusUpdates: SubscriptionProviderSubscriberStatusUpdate[];
    tribeSlug: string;
  }): Promise<TribeSubscriptionPriceResult | null> {
    if (input.providerSubscriberStatusUpdates.length === 0) {
      const price = await this.readProviderSubscriberVerificationPrice({
        priceId: input.priceId,
        tribeSlug: input.tribeSlug,
      });

      return price ? mapSubscriptionPrice(price) : null;
    }

    const statusUpdatesJson = JSON.stringify(
      input.providerSubscriberStatusUpdates
    );

    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${input.tribeSlug}
          limit 1
        ),
        target_price as (
          select
            tribe_subscription_prices.id,
            tribe_subscription_prices.name,
            tribe_subscription_prices.amount_cents,
            tribe_subscription_prices.currency,
            tribe_subscription_prices.frequency,
            tribe_subscription_prices.status,
            tribe_subscription_prices.is_current,
            tribe_subscription_prices.trial_frequency,
            tribe_subscription_prices.trial_frequency_type,
            tribe_subscription_prices.created_at
          from public.tribe_subscription_prices
          inner join target_tribe
            on target_tribe.id = tribe_subscription_prices.tribe_id
          where tribe_subscription_prices.id = ${input.priceId}
            and tribe_subscription_prices.status in ('active', 'canceled')
            and public.can_manage_tribe_subscription_prices(target_tribe.id)
          limit 1
        ),
        provider_statuses as (
          select
            provider_statuses.provider_subscription_id,
            provider_statuses.subscription_status,
            provider_statuses.status_reason
          from jsonb_to_recordset(${statusUpdatesJson}::jsonb) as provider_statuses(
            provider_subscription_id text,
            subscription_status text,
            status_reason text
          )
        ),
        updated_subscriptions as (
          update public.tribe_member_subscriptions
          set
            status = provider_statuses.subscription_status,
            status_reason = provider_statuses.status_reason,
            updated_at = timezone('utc', now())
          from provider_statuses,
            target_price
          where tribe_member_subscriptions.price_id = target_price.id
            and tribe_member_subscriptions.mercado_pago_preapproval_id =
              provider_statuses.provider_subscription_id
          returning
            tribe_member_subscriptions.tribe_id,
            tribe_member_subscriptions.user_id
        ),
        affected_members as (
          select distinct
            updated_subscriptions.tribe_id,
            updated_subscriptions.user_id
          from updated_subscriptions
        ),
        updated_members as (
          update public.tribe_members
          set
            status = case
              when exists (
                select 1
                from public.tribe_member_subscriptions
                where tribe_member_subscriptions.tribe_id = tribe_members.tribe_id
                  and tribe_member_subscriptions.user_id = tribe_members.user_id
                  and tribe_member_subscriptions.status = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.active}
              ) then 'active'
              when exists (
                select 1
                from public.tribe_member_subscriptions
                where tribe_member_subscriptions.tribe_id = tribe_members.tribe_id
                  and tribe_member_subscriptions.user_id = tribe_members.user_id
                  and tribe_member_subscriptions.status = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending}
              ) then 'blocked'
              else 'removed'
            end,
            status_reason = case
              when exists (
                select 1
                from public.tribe_member_subscriptions
                where tribe_member_subscriptions.tribe_id = tribe_members.tribe_id
                  and tribe_member_subscriptions.user_id = tribe_members.user_id
                  and tribe_member_subscriptions.status = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.active}
              ) then ${TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.none}
              when exists (
                select 1
                from public.tribe_member_subscriptions
                where tribe_member_subscriptions.tribe_id = tribe_members.tribe_id
                  and tribe_member_subscriptions.user_id = tribe_members.user_id
                  and tribe_member_subscriptions.status = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending}
              ) then ${TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.paymentBlocked}
              else ${TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.subscriptionInactive}
            end
          from affected_members
          where tribe_members.tribe_id = affected_members.tribe_id
            and tribe_members.user_id = affected_members.user_id
            and not (
              tribe_members.status = 'blocked'
              and tribe_members.status_reason <> ${TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.paymentBlocked}
            )
          returning tribe_members.user_id
        )
        select
          target_price.id,
          target_price.name,
          target_price.amount_cents,
          target_price.currency,
          target_price.frequency,
          target_price.status,
          target_price.is_current,
          target_price.trial_frequency,
          target_price.trial_frequency_type,
          target_price.created_at,
          count(tribe_member_subscriptions.id) filter (
            where tribe_member_subscriptions.status in ${CURRENT_MEMBER_SUBSCRIPTION_STATUSES}
          ) as active_subscribers_count
        from target_price
        left join public.tribe_member_subscriptions
          on tribe_member_subscriptions.price_id = target_price.id
        group by
          target_price.id,
          target_price.name,
          target_price.amount_cents,
          target_price.currency,
          target_price.frequency,
          target_price.status,
          target_price.is_current,
          target_price.trial_frequency,
          target_price.trial_frequency_type,
          target_price.created_at
      `);
      const row = (result.rows?.[0] ?? null) as SubscriptionPriceRow | null;

      return row ? mapSubscriptionPrice(row) : null;
    });
  }

  /**
   * Lists local visible prices that can be verified against Mercado Pago.
   *
   * @param input - Tribe and optional price filter.
   * @returns Price rows with provider plan identifiers.
   */
  private async listProviderPlanPrices(input: {
    includeCanceled?: boolean;
    priceId?: string;
    tribeSlug: string;
  }): Promise<SubscriptionProviderPlanRow[]> {
    const statusFilter = input.includeCanceled
      ? sql`tribe_subscription_prices.status in ('active', 'canceled')`
      : sql`tribe_subscription_prices.status = 'active'`;

    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${input.tribeSlug}
          limit 1
        )
        select
          tribe_subscription_prices.id,
          tribe_subscription_prices.name,
          tribe_subscription_prices.amount_cents,
          tribe_subscription_prices.currency,
          tribe_subscription_prices.frequency,
          tribe_subscription_prices.status,
          tribe_subscription_prices.is_current,
          tribe_subscription_prices.created_at,
          tribe_subscription_prices.mercado_pago_preapproval_plan_id,
          count(tribe_member_subscriptions.id) filter (
            where tribe_member_subscriptions.status in ${CURRENT_MEMBER_SUBSCRIPTION_STATUSES}
          ) as active_subscribers_count
        from public.tribe_subscription_prices
        inner join target_tribe
          on target_tribe.id = tribe_subscription_prices.tribe_id
        left join public.tribe_member_subscriptions
          on tribe_member_subscriptions.price_id = tribe_subscription_prices.id
        where ${statusFilter}
          and (${input.priceId ?? ""} = '' or tribe_subscription_prices.id::text = ${input.priceId ?? ""})
          and public.can_manage_tribe_subscription_prices(target_tribe.id)
        group by tribe_subscription_prices.id
        order by tribe_subscription_prices.created_at desc
      `);

      return (result.rows ?? []) as SubscriptionProviderPlanRow[];
    });
  }

  /**
   * Lists local provider subscriber identifiers attached to a price.
   *
   * @param input - Tribe and price identifiers used to scope subscribers.
   * @returns Provider subscriber identifiers persisted for the price.
   */
  private async listProviderSubscribers(input: {
    priceId: string;
    tribeSlug: string;
  }): Promise<SubscriptionProviderSubscriberRow[]> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${input.tribeSlug}
          limit 1
        )
        select tribe_member_subscriptions.mercado_pago_preapproval_id
        from public.tribe_member_subscriptions
        inner join public.tribe_subscription_prices
          on tribe_subscription_prices.id = tribe_member_subscriptions.price_id
        inner join target_tribe
          on target_tribe.id = tribe_subscription_prices.tribe_id
        where tribe_subscription_prices.id = ${input.priceId}
          and tribe_subscription_prices.status in ('active', 'canceled')
          and tribe_member_subscriptions.mercado_pago_preapproval_id is not null
          and public.can_manage_tribe_subscription_prices(target_tribe.id)
      `);

      return (result.rows ?? []) as SubscriptionProviderSubscriberRow[];
    });
  }

  /**
   * Lists local provider subscriber identifiers for all visible tribe prices.
   *
   * @param input - Tribe slug used to scope subscribers.
   * @returns Provider subscriber identifiers persisted for active or canceled prices.
   */
  private async listProviderSubscribersByTribe(input: {
    tribeSlug: string;
  }): Promise<SubscriptionProviderSubscriberRow[]> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${input.tribeSlug}
          limit 1
        )
        select tribe_member_subscriptions.mercado_pago_preapproval_id
        from public.tribe_member_subscriptions
        inner join public.tribe_subscription_prices
          on tribe_subscription_prices.id = tribe_member_subscriptions.price_id
        inner join target_tribe
          on target_tribe.id = tribe_subscription_prices.tribe_id
        where tribe_subscription_prices.status in ('active', 'canceled')
          and tribe_member_subscriptions.mercado_pago_preapproval_id is not null
          and public.can_manage_tribe_subscription_prices(target_tribe.id)
        order by tribe_member_subscriptions.created_at asc
      `);

      return (result.rows ?? []) as SubscriptionProviderSubscriberRow[];
    });
  }

  /**
   * Persists provider-backed subscriber statuses for all tribe diagnostics rows.
   *
   * @param input - Tribe slug and verified subscriber status updates.
   * @returns Promise resolved after local subscriber state is updated.
   */
  private async reconcileTribeProviderSubscriberStatuses(input: {
    providerSubscriberStatusUpdates: SubscriptionProviderSubscriberStatusUpdate[];
    tribeSlug: string;
  }): Promise<void> {
    if (input.providerSubscriberStatusUpdates.length === 0) {
      return;
    }

    const statusUpdatesJson = JSON.stringify(
      input.providerSubscriberStatusUpdates
    );

    await this.executeWithDatabase(async (database) => {
      await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${input.tribeSlug}
          limit 1
        ),
        provider_statuses as (
          select
            provider_statuses.provider_subscription_id,
            provider_statuses.subscription_status,
            provider_statuses.status_reason
          from jsonb_to_recordset(${statusUpdatesJson}::jsonb) as provider_statuses(
            provider_subscription_id text,
            subscription_status text,
            status_reason text
          )
        ),
        updated_subscriptions as (
          update public.tribe_member_subscriptions
          set
            status = provider_statuses.subscription_status,
            status_reason = provider_statuses.status_reason,
            updated_at = timezone('utc', now())
          from provider_statuses,
            target_tribe
          where tribe_member_subscriptions.tribe_id = target_tribe.id
            and tribe_member_subscriptions.mercado_pago_preapproval_id =
              provider_statuses.provider_subscription_id
            and public.can_manage_tribe_subscription_prices(target_tribe.id)
          returning
            tribe_member_subscriptions.tribe_id,
            tribe_member_subscriptions.user_id
        ),
        affected_members as (
          select distinct
            updated_subscriptions.tribe_id,
            updated_subscriptions.user_id
          from updated_subscriptions
        )
        update public.tribe_members
        set
          status = case
            when exists (
              select 1
              from public.tribe_member_subscriptions
              where tribe_member_subscriptions.tribe_id = tribe_members.tribe_id
                and tribe_member_subscriptions.user_id = tribe_members.user_id
                and tribe_member_subscriptions.status = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.active}
            ) then 'active'
            when exists (
              select 1
              from public.tribe_member_subscriptions
              where tribe_member_subscriptions.tribe_id = tribe_members.tribe_id
                and tribe_member_subscriptions.user_id = tribe_members.user_id
                and tribe_member_subscriptions.status = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending}
            ) then 'blocked'
            else 'removed'
          end,
          status_reason = case
            when exists (
              select 1
              from public.tribe_member_subscriptions
              where tribe_member_subscriptions.tribe_id = tribe_members.tribe_id
                and tribe_member_subscriptions.user_id = tribe_members.user_id
                and tribe_member_subscriptions.status = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.active}
            ) then ${TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.none}
            when exists (
              select 1
              from public.tribe_member_subscriptions
              where tribe_member_subscriptions.tribe_id = tribe_members.tribe_id
                and tribe_member_subscriptions.user_id = tribe_members.user_id
                and tribe_member_subscriptions.status = ${TRIBE_MEMBER_SUBSCRIPTION_STATUS.pending}
            ) then ${TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.paymentBlocked}
            else ${TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.subscriptionInactive}
          end
        from affected_members
        where tribe_members.tribe_id = affected_members.tribe_id
          and tribe_members.user_id = affected_members.user_id
          and not (
            tribe_members.status = 'blocked'
            and tribe_members.status_reason <> ${TRIBE_MEMBER_SUBSCRIPTION_STATUS_REASON.paymentBlocked}
          )
      `);
    });
  }

  /**
   * Cancels a local price after provider plan verification proves it is gone.
   *
   * @param input - Tribe slug and price identifier.
   * @returns Updated price, or null when no row was updated.
   */
  private async cancelProviderPlanPrice(input: {
    priceId: string;
    tribeSlug: string;
  }): Promise<TribeSubscriptionPriceResult | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${input.tribeSlug}
          limit 1
        ),
        target_price as (
          select
            tribe_subscription_prices.id,
            tribe_subscription_prices.tribe_id,
            tribe_subscription_prices.is_current
          from public.tribe_subscription_prices
          where tribe_subscription_prices.tribe_id = (select id from target_tribe)
            and tribe_subscription_prices.id = ${input.priceId}
            and tribe_subscription_prices.status = 'active'
          limit 1
        ),
        updated_price as (
        update public.tribe_subscription_prices
        set
          status = ${TRIBE_SUBSCRIPTION_PRICE_STATUS.canceled},
          is_current = false
        where tribe_subscription_prices.id = (select id from target_price)
          and public.can_manage_tribe_subscription_prices(tribe_subscription_prices.tribe_id)
        returning id, name, amount_cents, currency, frequency, status, is_current, trial_frequency, trial_frequency_type, created_at
        ),
        updated_tribe as (
          update public.tribes
          set free_join_is_current = true
          where tribes.id = (select id from target_tribe)
            and exists (select 1 from updated_price)
            and exists (
              select 1
              from target_price
              where target_price.is_current = true
            )
            and not exists (
              select 1
              from public.tribe_subscription_prices
              where tribe_subscription_prices.tribe_id = (select id from target_tribe)
                and tribe_subscription_prices.id <> (select id from target_price)
                and tribe_subscription_prices.is_current = true
                and tribe_subscription_prices.status = 'active'
                and tribe_subscription_prices.mercado_pago_preapproval_plan_id is not null
            )
          returning id
        )
        select
          updated_price.id,
          updated_price.name,
          updated_price.amount_cents,
          updated_price.currency,
          updated_price.frequency,
          updated_price.status,
          updated_price.is_current,
          updated_price.trial_frequency,
          updated_price.trial_frequency_type,
          updated_price.created_at,
          count(tribe_member_subscriptions.id) filter (
            where tribe_member_subscriptions.status in ${CURRENT_MEMBER_SUBSCRIPTION_STATUSES}
          ) as active_subscribers_count
        from updated_price
        left join public.tribe_member_subscriptions
          on tribe_member_subscriptions.price_id = updated_price.id
        group by
          updated_price.id,
          updated_price.name,
          updated_price.amount_cents,
          updated_price.currency,
          updated_price.frequency,
          updated_price.status,
          updated_price.is_current,
          updated_price.trial_frequency,
          updated_price.trial_frequency_type,
          updated_price.created_at
      `);

      const row = (result.rows?.[0] ?? null) as SubscriptionPriceRow | null;

      return row ? mapSubscriptionPrice(row) : null;
    });
  }

  /**
   * Cancels a provider plan and marks the local price as canceled.
   *
   * @param command - Price identity command.
   * @returns Price cancellation result.
   */
  async delete(
    command: TribeSubscriptionPriceIdentity
  ): Promise<TribeSubscriptionPriceMutationResult> {
    const updateContext = await this.resolvePriceUpdateContext(command);

    if (!updateContext?.tribe_id) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound };
    }

    if (!updateContext.can_manage_prices) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden };
    }

    const hasLocalActiveSubscriptions = await this.hasLocalActiveSubscriptions(
      command.priceId
    );

    if (hasLocalActiveSubscriptions) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.hasSubscribers };
    }

    if (updateContext.status !== TRIBE_SUBSCRIPTION_PRICE_STATUS.canceled) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden };
    }

    const linkedInvitationIds = await this.listLinkedActiveInvitationIds(
      command.priceId
    );

    if (linkedInvitationIds.length > 0) {
      return {
        linkedInvitationIds,
        status: TRIBE_SUBSCRIPTION_PRICE_STATUS.hasLinkedInvitations,
      };
    }

    const providerSubscribers = await this.listProviderSubscribers({
      priceId: command.priceId,
      tribeSlug: command.tribeSlug,
    });
    const hasProviderPlanLink = Boolean(
      updateContext.mercado_pago_preapproval_plan_id
    );
    const needsProviderVerification =
      hasProviderPlanLink || providerSubscribers.length > 0;

    if (!needsProviderVerification) {
      const wasDeleted = await this.deleteCanceledProviderPlanPrice(command);

      return wasDeleted
        ? { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.deleted }
        : { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound };
    }

    const accessToken = await this.resolveAccessTokenForProviderMutation(
      updateContext
    );

    if (!accessToken) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.missingIntegration };
    }

    if (updateContext.mercado_pago_preapproval_plan_id) {
      const traceContext = buildSubscriptionPricePaymentTraceContext({
        operationKey: buildSubscriptionPriceOperationKey({
          operation:
            SUBSCRIPTION_PRICE_PAYMENT_OPERATION_KEY.deleteProviderPlanPrice,
          priceId: command.priceId,
          tribeSlug: command.tribeSlug,
        }),
        priceId: command.priceId,
        providerPlanId: updateContext.mercado_pago_preapproval_plan_id,
        requestId: this.requestId,
        tribeSlug: command.tribeSlug,
      });
      const providerPlanStatus = await this.getMercadoPagoPlanStatus({
        accessToken,
        preapprovalPlanId: updateContext.mercado_pago_preapproval_plan_id,
        ...(traceContext ? { traceContext } : {}),
      });

      if (providerPlanStatus === MERCADO_PAGO_PROVIDER_PLAN_STATUS.active) {
        return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden };
      }
    }

    const providerSubscriptionStatuses =
      await readProviderSubscriptionStatuses({
        accessToken,
        getMercadoPagoSubscriptionStatus:
          this.getMercadoPagoSubscriptionStatus,
        operationKey: buildSubscriptionPriceOperationKey({
          operation:
            SUBSCRIPTION_PRICE_PAYMENT_OPERATION_KEY.deleteProviderPlanPrice,
          priceId: command.priceId,
          tribeSlug: command.tribeSlug,
        }),
        priceId: command.priceId,
        providerSubscribers,
        requestId: this.requestId,
        tribeSlug: command.tribeSlug,
      });
    const hasProviderActiveSubscribers = providerSubscriptionStatuses.some(
      (providerSubscriptionStatus) =>
        mapMercadoPagoSubscriptionStatus(providerSubscriptionStatus)
          .isAttachedToProviderPlan
    );

    if (hasProviderActiveSubscribers) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.hasSubscribers };
    }

    const wasDeleted = await this.deleteCanceledProviderPlanPrice(command);

    return wasDeleted
      ? { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.deleted }
      : { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound };
  }

  /**
   * Temporarily removes a price from checkout selection before provider cancellation.
   *
   * @param command - Price identity command.
   * @returns Cancellation reservation context, or null when no row is available.
   */
  private async reserveProviderPlanPriceCancellation(
    command: TribeSubscriptionPriceIdentity
  ): Promise<PriceCancellationReservationRow | null> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        target_price as (
          select
            tribe_subscription_prices.id,
            tribe_subscription_prices.tribe_id,
            tribe_subscription_prices.name,
            tribe_subscription_prices.amount_cents,
            tribe_subscription_prices.currency,
            tribe_subscription_prices.frequency,
            tribe_subscription_prices.status,
            tribe_subscription_prices.is_current,
            tribe_subscription_prices.created_at,
            tribe_subscription_prices.mercado_pago_preapproval_plan_id
          from public.tribe_subscription_prices
          inner join target_tribe
            on target_tribe.id = tribe_subscription_prices.tribe_id
          where tribe_subscription_prices.id = ${command.priceId}
            and tribe_subscription_prices.status = 'active'
          limit 1
          for update
        ),
        associated_members as (
          select tribe_member_subscriptions.id
          from public.tribe_member_subscriptions
          where tribe_member_subscriptions.price_id = (select id from target_price)
          limit 1
        ),
        reserved_price as (
          update public.tribe_subscription_prices
          set is_current = false
          where tribe_subscription_prices.id = (select id from target_price)
            and not exists (select 1 from associated_members)
            and public.can_manage_tribe_subscription_prices(tribe_subscription_prices.tribe_id)
          returning
            id,
            tribe_id,
            name,
            amount_cents,
            currency,
            frequency,
            status,
            is_current,
            created_at,
            mercado_pago_preapproval_plan_id
        )
        select
          coalesce(reserved_price.id, target_price.id) as id,
          coalesce(reserved_price.tribe_id, target_price.tribe_id) as tribe_id,
          coalesce(reserved_price.name, target_price.name) as name,
          coalesce(reserved_price.amount_cents, target_price.amount_cents) as amount_cents,
          coalesce(reserved_price.currency, target_price.currency) as currency,
          coalesce(reserved_price.frequency, target_price.frequency) as frequency,
          coalesce(reserved_price.status, target_price.status) as status,
          coalesce(reserved_price.is_current, target_price.is_current) as is_current,
          target_price.is_current as was_current,
          coalesce(reserved_price.created_at, target_price.created_at) as created_at,
          coalesce(
            reserved_price.mercado_pago_preapproval_plan_id,
            target_price.mercado_pago_preapproval_plan_id
          ) as mercado_pago_preapproval_plan_id,
          case when exists (select 1 from associated_members) then 1 else 0 end as active_subscribers_count,
          coalesce(public.can_manage_tribe_subscription_prices((select id from target_tribe)), false) as can_manage_prices,
          tribe_payment_integrations.access_token,
          tribe_payment_integrations.refresh_token,
          tribe_payment_integrations.token_expires_at
        from (select 1) result
        left join target_price
          on true
        left join reserved_price
          on true
        left join public.tribe_payment_integrations
          on tribe_payment_integrations.tribe_id = (select id from target_tribe)
          and tribe_payment_integrations.provider = 'mercado_pago'
      `);

      return (result.rows?.[0] ?? null) as
        | PriceCancellationReservationRow
        | null;
    });
  }

  /**
   * Restores current price selection after a provider cancellation failure.
   *
   * @param input - Price identity and previous current state.
   * @returns Promise resolved after the local reservation is restored.
   */
  private async restoreProviderPlanPriceCancellationReservation(input: {
    priceId: string;
    tribeSlug: string;
    wasCurrent: boolean;
  }): Promise<void> {
    if (!input.wasCurrent) {
      return;
    }

    await this.executeWithDatabase(async (database) => {
      await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${input.tribeSlug}
          limit 1
        )
        update public.tribe_subscription_prices
        set is_current = true
        where tribe_subscription_prices.tribe_id = (select id from target_tribe)
          and tribe_subscription_prices.id = ${input.priceId}
          and tribe_subscription_prices.status = 'active'
          and public.can_manage_tribe_subscription_prices(tribe_subscription_prices.tribe_id)
          and not exists (
            select 1
            from public.tribe_subscription_prices existing_current_price
            where existing_current_price.tribe_id = tribe_subscription_prices.tribe_id
              and existing_current_price.status = 'active'
              and existing_current_price.is_current = true
          )
      `);
    });
  }

  /**
   * Checks whether a local price has any associated member subscriptions.
   *
   * @param priceId - Local subscription price identifier.
   * @returns Whether the price has associated subscriptions.
   */
  private async hasLocalActiveSubscriptions(priceId: string): Promise<boolean> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        select exists (
          select 1
          from public.tribe_member_subscriptions
          where tribe_member_subscriptions.price_id = ${priceId}
            and tribe_member_subscriptions.status in ${CURRENT_MEMBER_SUBSCRIPTION_STATUSES}
          limit 1
        ) as has_local_active_subscriptions
      `);

      return Boolean(
        (
          result.rows?.[0] as
            | {
                has_local_active_subscriptions?: boolean;
              }
            | undefined
        )?.has_local_active_subscriptions
      );
    });
  }

  private async listLinkedActiveInvitationIds(priceId: string): Promise<string[]> {
    return this.executeWithDatabase(async (database) => {
      return this.listLinkedActiveInvitationIdsWithDatabase(database, priceId);
    }).catch((error: unknown) => {
      if (
        error &&
        typeof error === "object" &&
        ((error as { code?: string }).code === "42703" ||
          (error as { code?: string }).code === "42P01")
      ) {
        return [];
      }

      throw error;
    });
  }

  private async listLinkedActiveInvitationIdsWithDatabase(
    database: RequestDatabase,
    priceId: string
  ): Promise<string[]> {
    const result = await database.execute(sql`
      select tribe_invitations.id
      from public.tribe_invitations
      where tribe_invitations.subscription_price_id = ${priceId}
        and tribe_invitations.status = 'active'
      order by tribe_invitations.created_at asc
    `);

    return ((result.rows ?? []) as { id: string }[]).map((row) => row.id);
  }

  async deleteWithInvitationActions(
    command: DeleteTribeSubscriptionPriceWithInvitationActionsCommand
  ): Promise<TribeSubscriptionPriceMutationResult> {
    const updateContext = await this.resolvePriceUpdateContext({
      priceId: command.priceId,
      tribeSlug: command.tribeSlug,
    });

    if (!updateContext?.tribe_id) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.notFound };
    }

    if (!updateContext.can_manage_prices) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden };
    }

    if (await this.hasLocalActiveSubscriptions(command.priceId)) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.hasSubscribers };
    }

    if (updateContext.status !== TRIBE_SUBSCRIPTION_PRICE_STATUS.canceled) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden };
    }

    const validatedActions = await this.validateInvitationActions(
      command.priceId,
      updateContext.tribe_id,
      command.invitationActions
    );

    if (!validatedActions.valid) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.invalidInput };
    }

    const providerPrecheckStatus = await this.runDeleteProviderPrecheck(
      command,
      updateContext
    );

    if (providerPrecheckStatus) {
      return providerPrecheckStatus;
    }

    return this.executeWithDatabase(async (database) => {
      const transactionValidatedActions =
        await this.validateInvitationActionsWithDatabase(
          database,
          command.priceId,
          updateContext.tribe_id,
          command.invitationActions
        );

      if (!transactionValidatedActions.valid) {
        return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.invalidInput };
      }

      for (const action of command.invitationActions) {
        if (action.action === "revoke") {
          await database.execute(sql`
            update public.tribe_invitations
            set status = 'revoked',
                revoked_at = timezone('utc', now())
            where tribe_invitations.id = ${action.invitationId}
              and tribe_invitations.subscription_price_id = ${command.priceId}
              and tribe_invitations.status = 'active'
              and public.can_manage_tribe_invitations(tribe_invitations.tribe_id)
          `);
          continue;
        }

        if (action.action === "switch_to_current") {
          await database.execute(sql`
            update public.tribe_invitations
            set subscription_association_type = 'current',
                subscription_price_id = null
            where tribe_invitations.id = ${action.invitationId}
              and tribe_invitations.subscription_price_id = ${command.priceId}
              and tribe_invitations.status = 'active'
              and public.can_manage_tribe_invitations(tribe_invitations.tribe_id)
          `);
          continue;
        }

        await database.execute(sql`
          update public.tribe_invitations
          set subscription_association_type = 'specific',
              subscription_price_id = ${action.targetPriceId}
          where tribe_invitations.id = ${action.invitationId}
            and tribe_invitations.subscription_price_id = ${command.priceId}
            and tribe_invitations.status = 'active'
            and public.can_manage_tribe_invitations(tribe_invitations.tribe_id)
        `);
      }

      const stillLinkedResult = await database.execute(sql`
        select count(*)::int as remaining
        from public.tribe_invitations
        where tribe_invitations.subscription_price_id = ${command.priceId}
          and tribe_invitations.status = 'active'
      `);
      const remaining = Number(
        (stillLinkedResult.rows?.[0] as { remaining?: number | string } | undefined)
          ?.remaining ?? 0
      );

      if (remaining > 0) {
        throw new Error(
          "Linked invitations remain after applying provided actions"
        );
      }

      const deletionResult = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        )
        update public.tribe_subscription_prices
        set
          status = ${TRIBE_SUBSCRIPTION_PRICE_STATUS.deleted},
          is_current = false,
          deleted_at = timezone('utc', now())
        where tribe_subscription_prices.tribe_id = (select id from target_tribe)
          and tribe_subscription_prices.id = ${command.priceId}
          and tribe_subscription_prices.status = ${TRIBE_SUBSCRIPTION_PRICE_STATUS.canceled}
          and public.can_manage_tribe_subscription_prices(tribe_subscription_prices.tribe_id)
        returning id
      `);

      if ((deletionResult.rows ?? []).length === 0) {
        throw new Error("Failed to soft-delete subscription price");
      }

      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.deleted };
    });
  }

  private async validateInvitationActions(
    priceId: string,
    tribeId: string,
    actions: DeleteTribeSubscriptionPriceInvitationAction[]
  ): Promise<{ valid: boolean }> {
    return this.executeWithDatabase((database) =>
      this.validateInvitationActionsWithDatabase(
        database,
        priceId,
        tribeId,
        actions
      )
    );
  }

  private async validateInvitationActionsWithDatabase(
    database: RequestDatabase,
    priceId: string,
    tribeId: string,
    actions: DeleteTribeSubscriptionPriceInvitationAction[]
  ): Promise<{ valid: boolean }> {
    const linkedInvitationIds = await this.listLinkedActiveInvitationIdsWithDatabase(
      database,
      priceId
    );
    const linkedSet = new Set(linkedInvitationIds);
    const actionInvitationIds = new Set<string>();

    for (const action of actions) {
      if (!linkedSet.has(action.invitationId)) {
        return { valid: false };
      }

      if (actionInvitationIds.has(action.invitationId)) {
        return { valid: false };
      }

      actionInvitationIds.add(action.invitationId);

      if (action.action === "switch_to_specific") {
        if (
          !action.targetPriceId ||
          action.targetPriceId === priceId
        ) {
          return { valid: false };
        }

        const targetIsValid = await this.isCandidateReassignmentPriceWithDatabase(
          database,
          tribeId,
          action.targetPriceId
        );

        if (!targetIsValid) {
          return { valid: false };
        }
      }
    }

    if (actionInvitationIds.size !== linkedSet.size) {
      return { valid: false };
    }

    return { valid: true };
  }

  private async isCandidateReassignmentPrice(
    tribeId: string,
    candidatePriceId: string
  ): Promise<boolean> {
    return this.executeWithDatabase(async (database) => {
      return this.isCandidateReassignmentPriceWithDatabase(
        database,
        tribeId,
        candidatePriceId
      );
    });
  }

  private async isCandidateReassignmentPriceWithDatabase(
    database: RequestDatabase,
    tribeId: string,
    candidatePriceId: string
  ): Promise<boolean> {
    const result = await database.execute(sql`
      select 1
      from public.tribe_subscription_prices
      where tribe_subscription_prices.id = ${candidatePriceId}
        and tribe_subscription_prices.tribe_id = ${tribeId}
        and tribe_subscription_prices.status = 'active'
        and tribe_subscription_prices.mercado_pago_preapproval_plan_id is not null
      limit 1
    `);

    return (result.rows ?? []).length > 0;
  }

  private async runDeleteProviderPrecheck(
    command: TribeSubscriptionPriceIdentity,
    updateContext: PriceUpdateContextRow
  ): Promise<TribeSubscriptionPriceMutationResult | null> {
    const providerSubscribers = await this.listProviderSubscribers({
      priceId: command.priceId,
      tribeSlug: command.tribeSlug,
    });
    const hasProviderPlanLink = Boolean(
      updateContext.mercado_pago_preapproval_plan_id
    );
    const needsProviderVerification =
      hasProviderPlanLink || providerSubscribers.length > 0;

    if (!needsProviderVerification) {
      return null;
    }

    const accessToken = await this.resolveAccessTokenForProviderMutation(
      updateContext
    );

    if (!accessToken) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.missingIntegration };
    }

    if (updateContext.mercado_pago_preapproval_plan_id) {
      const traceContext = buildSubscriptionPricePaymentTraceContext({
        operationKey: buildSubscriptionPriceOperationKey({
          operation:
            SUBSCRIPTION_PRICE_PAYMENT_OPERATION_KEY.deleteProviderPlanPrice,
          priceId: command.priceId,
          tribeSlug: command.tribeSlug,
        }),
        priceId: command.priceId,
        providerPlanId: updateContext.mercado_pago_preapproval_plan_id,
        requestId: this.requestId,
        tribeSlug: command.tribeSlug,
      });
      const providerPlanStatus = await this.getMercadoPagoPlanStatus({
        accessToken,
        preapprovalPlanId: updateContext.mercado_pago_preapproval_plan_id,
        ...(traceContext ? { traceContext } : {}),
      });

      if (providerPlanStatus === MERCADO_PAGO_PROVIDER_PLAN_STATUS.active) {
        return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.forbidden };
      }
    }

    const providerSubscriptionStatuses =
      await readProviderSubscriptionStatuses({
        accessToken,
        getMercadoPagoSubscriptionStatus:
          this.getMercadoPagoSubscriptionStatus,
        operationKey: buildSubscriptionPriceOperationKey({
          operation:
            SUBSCRIPTION_PRICE_PAYMENT_OPERATION_KEY.deleteProviderPlanPrice,
          priceId: command.priceId,
          tribeSlug: command.tribeSlug,
        }),
        priceId: command.priceId,
        providerSubscribers,
        requestId: this.requestId,
        tribeSlug: command.tribeSlug,
      });
    const hasProviderActiveSubscribers = providerSubscriptionStatuses.some(
      (providerSubscriptionStatus) =>
        mapMercadoPagoSubscriptionStatus(providerSubscriptionStatus)
          .isAttachedToProviderPlan
    );

    if (hasProviderActiveSubscribers) {
      return { status: TRIBE_SUBSCRIPTION_PRICE_STATUS.hasSubscribers };
    }

    return null;
  }

  private async deleteCanceledProviderPlanPrice(
    command: TribeSubscriptionPriceIdentity
  ): Promise<boolean> {
    return this.executeWithDatabase(async (database) => {
      const result = await database.execute(sql`
        with target_tribe as (
          select tribes.id
          from public.tribes
          where tribes.slug = ${command.tribeSlug}
          limit 1
        ),
        deleted_price as (
          update public.tribe_subscription_prices
          set
            status = ${TRIBE_SUBSCRIPTION_PRICE_STATUS.deleted},
            is_current = false,
            deleted_at = timezone('utc', now())
          where tribe_subscription_prices.tribe_id = (select id from target_tribe)
            and tribe_subscription_prices.id = ${command.priceId}
            and tribe_subscription_prices.status = ${TRIBE_SUBSCRIPTION_PRICE_STATUS.canceled}
            and public.can_manage_tribe_subscription_prices(tribe_subscription_prices.tribe_id)
          returning id
        )
        select exists (select 1 from deleted_price) as was_deleted
      `);

      return Boolean(
        (
          result.rows?.[0] as
            | {
                was_deleted?: boolean;
              }
            | undefined
        )?.was_deleted
      );
    });
  }
}
