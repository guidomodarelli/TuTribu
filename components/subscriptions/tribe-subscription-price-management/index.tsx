"use client";

/**
 * Renders tribe subscription price management for leaders and guardians.
 *
 * @module tribe-subscription-price-management
 */

import {
  FormEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import {
  CheckCircle2Icon,
  CreditCardIcon,
  PlusIcon,
  RefreshCwIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TribeSubscriptionPriceResult } from "@/src/modules/subscriptions/application/results/tribe-subscription-price-result";
import styles from "./styles.module.scss";

const PRICE_MANAGEMENT_COPY = {
  amountLabel: "Precio mensual",
  amountPlaceholder: "5000",
  connectButton: "Conectar Mercado Pago",
  createButton: "Crear precio",
  canceledBadge: "Cancelado",
  currentBadge: "Actual",
  description:
    "Creá versiones históricas de precios. Los miembros existentes conservan siempre el precio con el que entraron.",
  emptyState: "Todavía no hay precios configurados.",
  fallbackCreateError: "No pudimos crear el precio.",
  fallbackDeleteError: "No pudimos eliminar el precio.",
  fallbackMakeCurrentError: "No pudimos marcar el precio como actual.",
  fallbackVerifyProviderPlanError:
    "No pudimos verificar los planes. Intentá de nuevo.",
  fallbackVerifyProviderSubscribersError:
    "No pudimos verificar los suscriptores. Intentá de nuevo.",
  guardianNotice: "Tenés acceso de lectura. Solo el líder puede operar cambios.",
  makeCurrentButton: "Marcar como actual",
  nameLabel: "Nombre",
  namePlaceholder: "Plan mensual",
  priceListLabel: "Precios históricos",
  readonlyBadge: "Solo lectura",
  removeButton: "Eliminar",
  title: "Precios",
  providerSubscribersMetaSuffix: "suscriptores vigentes en Mercado Pago",
  verifyProviderPlanButton: "Verificar plan",
  verifyProviderSubscribersButton: "Verificar suscriptores",
  verifyingProviderPlans: "Verificando planes con Mercado Pago...",
} as const;

const PRICE_MANAGEMENT_ROUTE = {
  apiTribes: "/api/tribes/",
  connectSegment: "/mercado-pago/oauth/start",
  makeCurrentSegment: "/make-current",
  pricesSegment: "/subscriptions/prices",
  segmentSeparator: "/",
  verifyProviderPlanSegment: "/verify-provider-plan",
  verifyProviderPlansSegment: "/subscriptions/prices/verify-provider-plans",
  verifyProviderSubscribersSegment: "/verify-provider-subscribers",
} as const;

const PRICE_MANAGEMENT_REQUEST = {
  buttonType: "button",
  contentTypeHeader: "Content-Type",
  deleteMethod: "DELETE",
  destructiveBadgeVariant: "destructive",
  jsonContentType: "application/json",
  postMethod: "POST",
  pricesProperty: "prices",
  submitType: "submit",
  outlineVariant: "outline",
  readonlyBadgeVariant: "secondary",
  statusRole: "status",
} as const;

const PRICE_MANAGEMENT_STATUS = {
  canceled: "canceled",
} as const;

const PRICE_MANAGEMENT_FORMAT = {
  abortErrorName: "AbortError",
  amountDivisor: 100,
  currency: "ARS",
  inputMode: "decimal",
  locale: "es-AR",
  style: "currency",
} as const;

type PriceResponse = {
  fieldErrors?: PriceFieldErrors;
  message?: string;
  price?: TribeSubscriptionPriceResult;
};

type ProviderPlansVerificationResponse = {
  canceledPriceIds: string[];
  message?: string;
  prices: TribeSubscriptionPriceResult[];
  verifiedCount: number;
};

type ProviderPlanVerificationResponse = {
  message?: string;
  price?: TribeSubscriptionPriceResult;
  providerActiveSubscribersCount?: number;
  verifiedCount?: number;
};

type PriceFieldErrors = {
  amount?: string;
};

class PriceRequestError extends Error {
  constructor(
    message: string,
    readonly fieldErrors: PriceFieldErrors = {}
  ) {
    super(message);
  }
}

type TribeSubscriptionPriceManagementProps = {
  canManagePrices: boolean;
  prices: TribeSubscriptionPriceResult[];
  statusMessage: string | null;
  tribeSlug: string;
};

/**
 * Builds the prices collection endpoint.
 *
 * @param tribeSlug - Current tribe slug.
 * @returns Prices API endpoint.
 */
function buildPricesEndpoint(tribeSlug: string): string {
  return (
    PRICE_MANAGEMENT_ROUTE.apiTribes +
    tribeSlug +
    PRICE_MANAGEMENT_ROUTE.pricesSegment
  );
}

/**
 * Builds the price item endpoint.
 *
 * @param tribeSlug - Current tribe slug.
 * @param priceId - Subscription price identifier.
 * @returns Price item API endpoint.
 */
function buildPriceEndpoint(tribeSlug: string, priceId: string): string {
  return (
    buildPricesEndpoint(tribeSlug) +
    PRICE_MANAGEMENT_ROUTE.segmentSeparator +
    priceId
  );
}

/**
 * Builds the endpoint that verifies all provider plans for a tribe.
 *
 * @param tribeSlug - Current tribe slug.
 * @returns Provider plan verification endpoint.
 */
function buildProviderPlansVerificationEndpoint(tribeSlug: string): string {
  return (
    PRICE_MANAGEMENT_ROUTE.apiTribes +
    tribeSlug +
    PRICE_MANAGEMENT_ROUTE.verifyProviderPlansSegment
  );
}

/**
 * Builds the endpoint that verifies one provider plan for a price.
 *
 * @param tribeSlug - Current tribe slug.
 * @param priceId - Subscription price identifier.
 * @returns Provider plan verification endpoint.
 */
function buildProviderPlanVerificationEndpoint(
  tribeSlug: string,
  priceId: string
): string {
  return (
    buildPriceEndpoint(tribeSlug, priceId) +
    PRICE_MANAGEMENT_ROUTE.verifyProviderPlanSegment
  );
}

/**
 * Builds the endpoint that verifies real provider subscribers for a price.
 *
 * @param tribeSlug - Current tribe slug.
 * @param priceId - Subscription price identifier.
 * @returns Provider subscriber verification endpoint.
 */
function buildProviderSubscribersVerificationEndpoint(
  tribeSlug: string,
  priceId: string
): string {
  return (
    buildPriceEndpoint(tribeSlug, priceId) +
    PRICE_MANAGEMENT_ROUTE.verifyProviderSubscribersSegment
  );
}

/**
 * Builds the Mercado Pago OAuth start endpoint.
 *
 * @param tribeSlug - Current tribe slug.
 * @returns OAuth start endpoint.
 */
function buildMercadoPagoConnectionEndpoint(tribeSlug: string): string {
  return (
    PRICE_MANAGEMENT_ROUTE.apiTribes +
    tribeSlug +
    PRICE_MANAGEMENT_ROUTE.connectSegment
  );
}

/**
 * Formats ARS cents for display.
 *
 * @param amountCents - Amount in cents.
 * @returns Localized ARS amount.
 */
function formatAmount(amountCents: number): string {
  return new Intl.NumberFormat(PRICE_MANAGEMENT_FORMAT.locale, {
    currency: PRICE_MANAGEMENT_FORMAT.currency,
    style: PRICE_MANAGEMENT_FORMAT.style,
  }).format(amountCents / PRICE_MANAGEMENT_FORMAT.amountDivisor);
}

/**
 * Sends a price mutation request and reads a safe JSON response.
 *
 * @param url - Request URL.
 * @param method - HTTP method.
 * @param body - Optional JSON body.
 * @returns Parsed price response.
 */
async function submitPriceRequest(
  url: string,
  method: string,
  body?: Record<string, string>,
  signal?: AbortSignal
): Promise<PriceResponse> {
  const response = await fetch(url, {
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      [PRICE_MANAGEMENT_REQUEST.contentTypeHeader]:
        PRICE_MANAGEMENT_REQUEST.jsonContentType,
    },
    method,
    signal,
  });
  const responseBody = (await response.json().catch(() => ({}))) as PriceResponse;

  if (!response.ok) {
    throw new PriceRequestError(
      responseBody.message ?? PRICE_MANAGEMENT_COPY.fallbackCreateError,
      responseBody.fieldErrors
    );
  }

  return responseBody;
}

/**
 * Sends a provider plan verification request and reads a safe JSON response.
 *
 * @param url - Request URL.
 * @param signal - Optional abort signal for automatic verification.
 * @returns Parsed provider plan verification response.
 */
async function submitProviderPlanVerificationRequest<
  VerificationResponse extends ProviderPlanVerificationResponse | ProviderPlansVerificationResponse,
>(url: string, signal?: AbortSignal): Promise<VerificationResponse> {
  return submitPriceRequest(
    url,
    PRICE_MANAGEMENT_REQUEST.postMethod,
    undefined,
    signal
  ) as Promise<VerificationResponse>;
}

/**
 * Detects request cancellation errors from fetch.
 *
 * @param error - Unknown error thrown by the request.
 * @returns Whether the error represents an aborted request.
 */
function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    error.name === PRICE_MANAGEMENT_FORMAT.abortErrorName
  );
}

export function TribeSubscriptionPriceManagement({
  canManagePrices,
  prices,
  statusMessage,
  tribeSlug,
}: TribeSubscriptionPriceManagementProps) {
  const [priceItems, setPriceItems] = useState(prices);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [fieldErrors, setFieldErrors] = useState<PriceFieldErrors>({});
  const [providerVerificationMessage, setProviderVerificationMessage] = useState<
    string | null
  >(null);
  const [isVerifyingProviderPlans, setIsVerifyingProviderPlans] =
    useState(false);
  const [
    providerSubscriberCountsByPriceId,
    setProviderSubscriberCountsByPriceId,
  ] = useState<Record<string, number>>({});
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const nameInputId = useId();
  const amountInputId = useId();
  const amountErrorId = useId();
  const sortedPrices = useMemo(
    () =>
      [...priceItems].sort((firstPrice, secondPrice) =>
        firstPrice.createdAt < secondPrice.createdAt ? 1 : -1
      ),
    [priceItems]
  );

  /**
   * Applies a provider verification response to the local price list.
   *
   * @param response - Provider verification response returned by the API.
   * @returns Void.
   */
  const applyProviderPlanVerificationResponse = useCallback((
    response: ProviderPlanVerificationResponse | ProviderPlansVerificationResponse
  ) => {
    if (PRICE_MANAGEMENT_REQUEST.pricesProperty in response) {
      setPriceItems(response.prices);

      return;
    }

    if (response.price) {
      setPriceItems((currentPrices) =>
        currentPrices.map((price) =>
          price.id === response.price!.id ? response.price! : price
        )
      );

      if (typeof response.providerActiveSubscribersCount === "number") {
        setProviderSubscriberCountsByPriceId((currentCounts) => ({
          ...currentCounts,
          [response.price!.id]: response.providerActiveSubscribersCount!,
        }));
      }
    }

  }, []);

  useEffect(() => {
    if (!canManagePrices || prices.length === 0) {
      return undefined;
    }

    const controller = new AbortController();
    let isActive = true;

    /**
     * Verifies provider plans once the price management view loads.
     *
     * @returns Promise resolved after verification completes.
     */
    async function verifyProviderPlansOnLoad() {
      setIsVerifyingProviderPlans(true);
      setProviderVerificationMessage(
        PRICE_MANAGEMENT_COPY.verifyingProviderPlans
      );

      try {
        const response =
          await submitProviderPlanVerificationRequest<ProviderPlansVerificationResponse>(
            buildProviderPlansVerificationEndpoint(tribeSlug),
            controller.signal
          );

        if (!isActive) {
          return;
        }

        applyProviderPlanVerificationResponse(response);
        setProviderVerificationMessage(response.message ?? null);
      } catch (error) {
        if (!isActive || isAbortError(error)) {
          return;
        }

        const fallbackMessage =
          error instanceof Error
            ? error.message
            : PRICE_MANAGEMENT_COPY.fallbackVerifyProviderPlanError;
        setProviderVerificationMessage(fallbackMessage);
        toast.error(fallbackMessage);
      } finally {
        if (isActive) {
          setIsVerifyingProviderPlans(false);
        }
      }
    }

    void verifyProviderPlansOnLoad();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [
    applyProviderPlanVerificationResponse,
    canManagePrices,
    prices.length,
    tribeSlug,
  ]);

  /**
   * Creates a new immutable price version.
   *
   * @param event - Form submission event.
   * @returns Promise resolved after the request completes.
   */
  const handleCreatePrice = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPendingAction(PRICE_MANAGEMENT_COPY.createButton);
    setFieldErrors({});

    try {
      const response = await submitPriceRequest(
        buildPricesEndpoint(tribeSlug),
        PRICE_MANAGEMENT_REQUEST.postMethod,
        {
          amount,
          name,
        }
      );

      if (response.price) {
        setPriceItems((currentPrices) => [response.price!, ...currentPrices]);
      }

      setAmount("");
      setName("");
      toast.success(response.message ?? PRICE_MANAGEMENT_COPY.createButton);
    } catch (error) {
      if (error instanceof PriceRequestError && error.fieldErrors.amount) {
        setFieldErrors(error.fieldErrors);

        return;
      }

      toast.error(
        error instanceof Error
          ? error.message
          : PRICE_MANAGEMENT_COPY.fallbackCreateError
      );
    } finally {
      setPendingAction(null);
    }
  };

  /**
   * Marks an existing price as current.
   *
   * @param priceId - Price identifier to mark current.
   * @returns Promise resolved after the request completes.
   */
  const handleMakeCurrent = async (priceId: string) => {
    setPendingAction(priceId);

    try {
      const response = await submitPriceRequest(
        buildPriceEndpoint(tribeSlug, priceId) +
          PRICE_MANAGEMENT_ROUTE.makeCurrentSegment,
        PRICE_MANAGEMENT_REQUEST.postMethod
      );

      if (response.price) {
        setPriceItems((currentPrices) =>
          currentPrices.map((price) => ({
            ...price,
            isCurrent: price.id === response.price!.id,
          }))
        );
      }

      toast.success(response.message ?? PRICE_MANAGEMENT_COPY.makeCurrentButton);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : PRICE_MANAGEMENT_COPY.fallbackMakeCurrentError
      );
    } finally {
      setPendingAction(null);
    }
  };

  /**
   * Deletes a price that has no member subscriptions.
   *
   * @param priceId - Price identifier to delete.
   * @returns Promise resolved after the request completes.
   */
  const handleDeletePrice = async (priceId: string) => {
    setPendingAction(priceId);

    try {
      const response = await submitPriceRequest(
        buildPriceEndpoint(tribeSlug, priceId),
        PRICE_MANAGEMENT_REQUEST.deleteMethod
      );

      setPriceItems((currentPrices) =>
        currentPrices.filter((price) => price.id !== priceId)
      );
      toast.success(response.message ?? PRICE_MANAGEMENT_COPY.removeButton);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : PRICE_MANAGEMENT_COPY.fallbackDeleteError
      );
    } finally {
      setPendingAction(null);
    }
  };

  /**
   * Verifies one price provider plan and removes it locally when missing.
   *
   * @param priceId - Price identifier to verify.
   * @returns Promise resolved after the request completes.
   */
  const handleVerifyProviderPlan = async (priceId: string) => {
    setPendingAction(PRICE_MANAGEMENT_COPY.verifyProviderPlanButton + priceId);

    try {
      const response =
        await submitProviderPlanVerificationRequest<ProviderPlanVerificationResponse>(
          buildProviderPlanVerificationEndpoint(tribeSlug, priceId)
        );

      applyProviderPlanVerificationResponse(response);
      toast.success(
        response.message ?? PRICE_MANAGEMENT_COPY.verifyProviderPlanButton
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : PRICE_MANAGEMENT_COPY.fallbackVerifyProviderPlanError
      );
    } finally {
      setPendingAction(null);
    }
  };

  /**
   * Verifies real provider subscribers and updates the displayed count.
   *
   * @param priceId - Price identifier whose subscribers should be verified.
   * @returns Promise resolved after the request completes.
   */
  const handleVerifyProviderSubscribers = async (priceId: string) => {
    setPendingAction(
      PRICE_MANAGEMENT_COPY.verifyProviderSubscribersButton + priceId
    );

    try {
      const response =
        await submitProviderPlanVerificationRequest<ProviderPlanVerificationResponse>(
          buildProviderSubscribersVerificationEndpoint(tribeSlug, priceId)
        );

      applyProviderPlanVerificationResponse(response);
      toast.success(
        response.message ??
          PRICE_MANAGEMENT_COPY.verifyProviderSubscribersButton
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : PRICE_MANAGEMENT_COPY.fallbackVerifyProviderSubscribersError
      );
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <section className={styles.TribeSubscriptionPriceManagement}>
      <header className={styles.TribeSubscriptionPriceManagement__header}>
        <div>
          <h1 className={styles.TribeSubscriptionPriceManagement__title}>
            {PRICE_MANAGEMENT_COPY.title}
          </h1>
          <p className={styles.TribeSubscriptionPriceManagement__description}>
            {PRICE_MANAGEMENT_COPY.description}
          </p>
        </div>
        {canManagePrices ? (
          <Button
            onClick={() => {
              window.location.href = buildMercadoPagoConnectionEndpoint(tribeSlug);
            }}
            type={PRICE_MANAGEMENT_REQUEST.buttonType}
            variant={PRICE_MANAGEMENT_REQUEST.outlineVariant}
          >
            <CreditCardIcon />
            {PRICE_MANAGEMENT_COPY.connectButton}
          </Button>
        ) : (
          <Badge variant={PRICE_MANAGEMENT_REQUEST.readonlyBadgeVariant}>
            {PRICE_MANAGEMENT_COPY.readonlyBadge}
          </Badge>
        )}
      </header>

      {statusMessage ? (
        <p
          className={styles.TribeSubscriptionPriceManagement__status}
          role={PRICE_MANAGEMENT_REQUEST.statusRole}
        >
          {statusMessage}
        </p>
      ) : null}

      {providerVerificationMessage ? (
        <p
          className={styles.TribeSubscriptionPriceManagement__status}
          role={PRICE_MANAGEMENT_REQUEST.statusRole}
        >
          {providerVerificationMessage}
        </p>
      ) : null}

      {canManagePrices ? (
        <form
          className={styles.TribeSubscriptionPriceManagement__form}
          onSubmit={handleCreatePrice}
        >
          <div className={styles.TribeSubscriptionPriceManagement__field}>
            <label
              className={styles.TribeSubscriptionPriceManagement__label}
              htmlFor={nameInputId}
            >
              {PRICE_MANAGEMENT_COPY.nameLabel}
            </label>
            <Input
              id={nameInputId}
              onChange={(event) => {
                setName(event.currentTarget.value);
              }}
              placeholder={PRICE_MANAGEMENT_COPY.namePlaceholder}
              value={name}
            />
          </div>
          <div className={styles.TribeSubscriptionPriceManagement__field}>
            <label
              className={styles.TribeSubscriptionPriceManagement__label}
              htmlFor={amountInputId}
            >
              {PRICE_MANAGEMENT_COPY.amountLabel}
            </label>
            <Input
              id={amountInputId}
              inputMode={PRICE_MANAGEMENT_FORMAT.inputMode}
              aria-describedby={
                fieldErrors.amount ? amountErrorId : undefined
              }
              aria-invalid={fieldErrors.amount ? true : undefined}
              onChange={(event) => {
                setAmount(event.currentTarget.value);
                setFieldErrors((currentFieldErrors) => ({
                  ...currentFieldErrors,
                  amount: undefined,
                }));
              }}
              placeholder={PRICE_MANAGEMENT_COPY.amountPlaceholder}
              value={amount}
            />
            {fieldErrors.amount ? (
              <span
                className={styles.TribeSubscriptionPriceManagement__fieldError}
                id={amountErrorId}
              >
                {fieldErrors.amount}
              </span>
            ) : null}
          </div>
          <Button
            disabled={
              Boolean(pendingAction) ||
              isVerifyingProviderPlans ||
              !name.trim() ||
              !amount.trim()
            }
            type={PRICE_MANAGEMENT_REQUEST.submitType}
          >
            <PlusIcon />
            {PRICE_MANAGEMENT_COPY.createButton}
          </Button>
        </form>
      ) : (
        <p className={styles.TribeSubscriptionPriceManagement__notice}>
          {PRICE_MANAGEMENT_COPY.guardianNotice}
        </p>
      )}

      {sortedPrices.length > 0 ? (
        <ol
          aria-label={PRICE_MANAGEMENT_COPY.priceListLabel}
          className={styles.TribeSubscriptionPriceManagement__list}
        >
          {sortedPrices.map((price) => (
            <li
              className={styles.TribeSubscriptionPriceManagement__item}
              key={price.id}
            >
              <div className={styles.TribeSubscriptionPriceManagement__summary}>
                <strong className={styles.TribeSubscriptionPriceManagement__name}>
                  {price.name}
                </strong>
                <span className={styles.TribeSubscriptionPriceManagement__amount}>
                  {formatAmount(price.amountCents)}
                </span>
                <span className={styles.TribeSubscriptionPriceManagement__meta}>
                  {price.activeSubscribersCount} miembros asociados
                </span>
                {providerSubscriberCountsByPriceId[price.id] !== undefined ? (
                  <span className={styles.TribeSubscriptionPriceManagement__meta}>
                    {providerSubscriberCountsByPriceId[price.id]}{" "}
                    {PRICE_MANAGEMENT_COPY.providerSubscribersMetaSuffix}
                  </span>
                ) : null}
              </div>
              {price.isCurrent ? (
                <Badge>
                  <CheckCircle2Icon />
                  {PRICE_MANAGEMENT_COPY.currentBadge}
                </Badge>
              ) : null}
              {price.status === PRICE_MANAGEMENT_STATUS.canceled ? (
                <Badge variant={PRICE_MANAGEMENT_REQUEST.destructiveBadgeVariant}>
                  {PRICE_MANAGEMENT_COPY.canceledBadge}
                </Badge>
              ) : null}
              {canManagePrices ? (
                <div className={styles.TribeSubscriptionPriceManagement__actions}>
                  <Button
                    disabled={
                      Boolean(pendingAction) ||
                      isVerifyingProviderPlans ||
                      price.isCurrent ||
                      price.status === PRICE_MANAGEMENT_STATUS.canceled
                    }
                    onClick={() => {
                      void handleMakeCurrent(price.id);
                    }}
                    type={PRICE_MANAGEMENT_REQUEST.buttonType}
                    variant={PRICE_MANAGEMENT_REQUEST.outlineVariant}
                  >
                    <StarIcon />
                    {PRICE_MANAGEMENT_COPY.makeCurrentButton}
                  </Button>
                  <Button
                    disabled={
                      Boolean(pendingAction) ||
                      isVerifyingProviderPlans ||
                      price.activeSubscribersCount > 0 ||
                      price.status === PRICE_MANAGEMENT_STATUS.canceled
                    }
                    onClick={() => {
                      void handleDeletePrice(price.id);
                    }}
                    type={PRICE_MANAGEMENT_REQUEST.buttonType}
                    variant={PRICE_MANAGEMENT_REQUEST.outlineVariant}
                  >
                    <Trash2Icon />
                    {PRICE_MANAGEMENT_COPY.removeButton}
                  </Button>
                  <Button
                    disabled={Boolean(pendingAction) || isVerifyingProviderPlans}
                    onClick={() => {
                      void handleVerifyProviderPlan(price.id);
                    }}
                    type={PRICE_MANAGEMENT_REQUEST.buttonType}
                    variant={PRICE_MANAGEMENT_REQUEST.outlineVariant}
                  >
                    <RefreshCwIcon />
                    {PRICE_MANAGEMENT_COPY.verifyProviderPlanButton}
                  </Button>
                  <Button
                    disabled={Boolean(pendingAction) || isVerifyingProviderPlans}
                    onClick={() => {
                      void handleVerifyProviderSubscribers(price.id);
                    }}
                    type={PRICE_MANAGEMENT_REQUEST.buttonType}
                    variant={PRICE_MANAGEMENT_REQUEST.outlineVariant}
                  >
                    <RefreshCwIcon />
                    {PRICE_MANAGEMENT_COPY.verifyProviderSubscribersButton}
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.TribeSubscriptionPriceManagement__empty}>
          {PRICE_MANAGEMENT_COPY.emptyState}
        </p>
      )}
    </section>
  );
}
