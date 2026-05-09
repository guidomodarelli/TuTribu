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
  useRef,
  useState,
} from "react";
import {
  CheckCircle2Icon,
  CreditCardIcon,
  PencilIcon,
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
  disconnectedNotice:
    "No estás conectado a Mercado Pago. Estamos intentando conectarte automáticamente.",
  canceledBadge: "Cancelado",
  currentBadge: "Actual",
  description:
    "Creá versiones históricas de precios. Los miembros existentes conservan siempre el precio con el que entraron.",
  emptyState: "Todavía no hay precios configurados.",
  fallbackCreateError: "No pudimos crear el precio.",
  fallbackDeleteError: "No pudimos eliminar el precio.",
  fallbackUpdateError: "No pudimos actualizar el precio.",
  fallbackMakeCurrentError: "No pudimos marcar el precio como actual.",
  fallbackVerifyProviderPlanError:
    "No pudimos verificar los planes. Intentá de nuevo.",
  fallbackVerifyProviderSubscribersError:
    "No pudimos verificar los suscriptores. Intentá de nuevo.",
  guardianNotice: "Tenés acceso de lectura. Solo el líder puede operar cambios.",
  makeCurrentButton: "Marcar como actual",
  nameLabel: "Nombre",
  namePlaceholder: "Plan mensual",
  cancelEditButton: "Cancelar edición",
  editAmountLabel: "Nuevo precio mensual",
  editButton: "Editar",
  editNameLabel: "Nuevo nombre",
  priceListLabel: "Precios históricos",
  readonlyBadge: "Solo lectura",
  removeButton: "Eliminar",
  saveEditButton: "Guardar cambios",
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
  patchMethod: "PATCH",
  pricesProperty: "prices",
  submitType: "submit",
  outlineVariant: "outline",
  readonlyBadgeVariant: "secondary",
  statusRole: "status",
} as const;

const PRICE_MANAGEMENT_STATUS = {
  canceled: "canceled",
} as const;

const PRICE_MANAGEMENT_EDIT_FIELD_ID_SUFFIX = {
  amount: "-edit-amount",
  name: "-edit-name",
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

type EditingPrice = {
  amount: string;
  id: string;
  name: string;
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
  isMercadoPagoConnected: boolean;
  navigateToMercadoPagoConnection?: (connectionEndpoint: string) => void;
  prices: TribeSubscriptionPriceResult[];
  shouldAutoConnectMercadoPago?: boolean;
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
 * Formats ARS cents for editable decimal inputs.
 *
 * @param amountCents - Amount in cents.
 * @returns Decimal amount without currency symbols.
 */
function formatAmountInputValue(amountCents: number): string {
  return String(amountCents / PRICE_MANAGEMENT_FORMAT.amountDivisor);
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
  isMercadoPagoConnected,
  navigateToMercadoPagoConnection,
  prices,
  shouldAutoConnectMercadoPago = true,
  statusMessage,
  tribeSlug,
}: TribeSubscriptionPriceManagementProps) {
  const [priceItems, setPriceItems] = useState(prices);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [editingPrice, setEditingPrice] = useState<EditingPrice | null>(null);
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
  const hasStartedMercadoPagoConnection = useRef(false);
  const nameInputId = useId();
  const amountInputId = useId();
  const amountErrorId = useId();
  const editAmountErrorId = useId();
  const sortedPrices = useMemo(
    () =>
      [...priceItems].sort((firstPrice, secondPrice) =>
        firstPrice.createdAt < secondPrice.createdAt ? 1 : -1
      ),
    [priceItems]
  );
  const isMercadoPagoConnectionRequired =
    canManagePrices && !isMercadoPagoConnected;
  const isPriceManagementDisabled =
    Boolean(pendingAction) ||
    isVerifyingProviderPlans ||
    isMercadoPagoConnectionRequired;
  const mercadoPagoConnectionEndpoint = buildMercadoPagoConnectionEndpoint(
    tribeSlug
  );
  const startMercadoPagoConnection = useCallback(
    (connectionEndpoint: string) => {
      if (navigateToMercadoPagoConnection) {
        navigateToMercadoPagoConnection(connectionEndpoint);

        return;
      }

      window.location.href = connectionEndpoint;
    },
    [navigateToMercadoPagoConnection]
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

  /**
   * Applies one price mutation response to the local list.
   *
   * @param price - Mutated price returned by the API.
   * @returns Void.
   */
  const applyPriceMutationResponse = useCallback(
    (price: TribeSubscriptionPriceResult) => {
      setPriceItems((currentPrices) => {
        const hasExistingPrice = currentPrices.some(
          (currentPrice) => currentPrice.id === price.id
        );
        const updatedPrices = hasExistingPrice
          ? currentPrices.map((currentPrice) =>
              currentPrice.id === price.id ? price : currentPrice
            )
          : [price, ...currentPrices];

        return price.isCurrent
          ? updatedPrices.map((currentPrice) => ({
              ...currentPrice,
              isCurrent: currentPrice.id === price.id,
            }))
          : updatedPrices;
      });
    },
    []
  );

  useEffect(() => {
    if (!canManagePrices || !isMercadoPagoConnected || prices.length === 0) {
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
    isMercadoPagoConnected,
    prices.length,
    tribeSlug,
  ]);

  useEffect(() => {
    if (
      !isMercadoPagoConnectionRequired ||
      !shouldAutoConnectMercadoPago ||
      hasStartedMercadoPagoConnection.current
    ) {
      return;
    }

    hasStartedMercadoPagoConnection.current = true;
    startMercadoPagoConnection(mercadoPagoConnectionEndpoint);
  }, [
    isMercadoPagoConnectionRequired,
    mercadoPagoConnectionEndpoint,
    shouldAutoConnectMercadoPago,
    startMercadoPagoConnection,
  ]);

  /**
   * Creates a new immutable price version.
   *
   * @param event - Form submission event.
   * @returns Promise resolved after the request completes.
   */
  const handleCreatePrice = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isMercadoPagoConnectionRequired) {
      return;
    }

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
        applyPriceMutationResponse(response.price);
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
   * Starts inline editing for one active price.
   *
   * @param price - Price selected for editing.
   * @returns Void.
   */
  const handleStartEditingPrice = (price: TribeSubscriptionPriceResult) => {
    setEditingPrice({
      amount: formatAmountInputValue(price.amountCents),
      id: price.id,
      name: price.name,
    });
    setFieldErrors({});
  };

  /**
   * Updates the current inline editing draft.
   *
   * @param partialEditingPrice - Partial editing state to merge.
   * @returns Void.
   */
  const updateEditingPrice = (partialEditingPrice: Partial<EditingPrice>) => {
    setEditingPrice((currentEditingPrice) =>
      currentEditingPrice
        ? {
            ...currentEditingPrice,
            ...partialEditingPrice,
          }
        : currentEditingPrice
    );
    setFieldErrors((currentFieldErrors) => ({
      ...currentFieldErrors,
      amount: undefined,
    }));
  };

  /**
   * Saves an inline price edit using the mixed synchronization policy.
   *
   * @param event - Form submission event.
   * @returns Promise resolved after the request completes.
   */
  const handleUpdatePrice = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!editingPrice) {
      return;
    }

    setPendingAction(PRICE_MANAGEMENT_COPY.saveEditButton + editingPrice.id);
    setFieldErrors({});

    try {
      const response = await submitPriceRequest(
        buildPriceEndpoint(tribeSlug, editingPrice.id),
        PRICE_MANAGEMENT_REQUEST.patchMethod,
        {
          amount: editingPrice.amount,
          name: editingPrice.name,
        }
      );

      if (response.price) {
        applyPriceMutationResponse(response.price);
      }

      setEditingPrice(null);
      toast.success(response.message ?? PRICE_MANAGEMENT_COPY.saveEditButton);
    } catch (error) {
      if (error instanceof PriceRequestError && error.fieldErrors.amount) {
        setFieldErrors(error.fieldErrors);

        return;
      }

      toast.error(
        error instanceof Error
          ? error.message
          : PRICE_MANAGEMENT_COPY.fallbackUpdateError
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
        applyPriceMutationResponse(response.price);
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

      if (response.price) {
        applyPriceMutationResponse(response.price);
      }
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
              startMercadoPagoConnection(mercadoPagoConnectionEndpoint);
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

      {isMercadoPagoConnectionRequired ? (
        <p
          className={styles.TribeSubscriptionPriceManagement__status}
          role={PRICE_MANAGEMENT_REQUEST.statusRole}
        >
          {PRICE_MANAGEMENT_COPY.disconnectedNotice}
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
              disabled={isMercadoPagoConnectionRequired}
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
              disabled={isMercadoPagoConnectionRequired}
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
              isPriceManagementDisabled ||
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
                      isPriceManagementDisabled ||
                      price.status === PRICE_MANAGEMENT_STATUS.canceled
                    }
                    onClick={() => {
                      handleStartEditingPrice(price);
                    }}
                    type={PRICE_MANAGEMENT_REQUEST.buttonType}
                    variant={PRICE_MANAGEMENT_REQUEST.outlineVariant}
                  >
                    <PencilIcon />
                    {PRICE_MANAGEMENT_COPY.editButton}
                  </Button>
                  <Button
                    disabled={
                      isPriceManagementDisabled ||
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
                      isPriceManagementDisabled ||
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
                    disabled={
                      isPriceManagementDisabled ||
                      price.status === PRICE_MANAGEMENT_STATUS.canceled
                    }
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
                    disabled={
                      isPriceManagementDisabled ||
                      price.status === PRICE_MANAGEMENT_STATUS.canceled
                    }
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
              {editingPrice?.id === price.id ? (
                <form
                  className={styles.TribeSubscriptionPriceManagement__editForm}
                  onSubmit={handleUpdatePrice}
                >
                  <div className={styles.TribeSubscriptionPriceManagement__field}>
                    <label
                      className={styles.TribeSubscriptionPriceManagement__label}
                      htmlFor={`${price.id}${PRICE_MANAGEMENT_EDIT_FIELD_ID_SUFFIX.name}`}
                    >
                      {PRICE_MANAGEMENT_COPY.editNameLabel}
                    </label>
                    <Input
                      id={`${price.id}${PRICE_MANAGEMENT_EDIT_FIELD_ID_SUFFIX.name}`}
                      onChange={(event) => {
                        updateEditingPrice({
                          name: event.currentTarget.value,
                        });
                      }}
                      value={editingPrice.name}
                    />
                  </div>
                  <div className={styles.TribeSubscriptionPriceManagement__field}>
                    <label
                      className={styles.TribeSubscriptionPriceManagement__label}
                      htmlFor={`${price.id}${PRICE_MANAGEMENT_EDIT_FIELD_ID_SUFFIX.amount}`}
                    >
                      {PRICE_MANAGEMENT_COPY.editAmountLabel}
                    </label>
                    <Input
                      aria-describedby={
                        fieldErrors.amount ? editAmountErrorId : undefined
                      }
                      aria-invalid={fieldErrors.amount ? true : undefined}
                      id={`${price.id}${PRICE_MANAGEMENT_EDIT_FIELD_ID_SUFFIX.amount}`}
                      inputMode={PRICE_MANAGEMENT_FORMAT.inputMode}
                      onChange={(event) => {
                        updateEditingPrice({
                          amount: event.currentTarget.value,
                        });
                      }}
                      value={editingPrice.amount}
                    />
                    {fieldErrors.amount ? (
                      <span
                        className={
                          styles.TribeSubscriptionPriceManagement__fieldError
                        }
                        id={editAmountErrorId}
                      >
                        {fieldErrors.amount}
                      </span>
                    ) : null}
                  </div>
                  <div className={styles.TribeSubscriptionPriceManagement__actions}>
                    <Button
                      disabled={
                        isPriceManagementDisabled ||
                        !editingPrice.name.trim() ||
                        !editingPrice.amount.trim()
                      }
                      type={PRICE_MANAGEMENT_REQUEST.submitType}
                    >
                      <CheckCircle2Icon />
                      {PRICE_MANAGEMENT_COPY.saveEditButton}
                    </Button>
                    <Button
                      onClick={() => {
                        setEditingPrice(null);
                        setFieldErrors({});
                      }}
                      type={PRICE_MANAGEMENT_REQUEST.buttonType}
                      variant={PRICE_MANAGEMENT_REQUEST.outlineVariant}
                    >
                      {PRICE_MANAGEMENT_COPY.cancelEditButton}
                    </Button>
                  </div>
                </form>
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
