"use client";

/**
 * Renders tribe subscription price management for leaders and guardians.
 *
 * @module tribe-subscription-price-management
 */

import { FormEvent, useId, useMemo, useState } from "react";
import {
  CheckCircle2Icon,
  CreditCardIcon,
  PlusIcon,
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
  currentBadge: "Actual",
  description:
    "Creá versiones históricas de precios. Los miembros existentes conservan siempre el precio con el que entraron.",
  emptyState: "Todavía no hay precios configurados.",
  fallbackCreateError: "No pudimos crear el precio.",
  fallbackDeleteError: "No pudimos eliminar el precio.",
  fallbackMakeCurrentError: "No pudimos marcar el precio como actual.",
  guardianNotice: "Tenés acceso de lectura. Solo el líder puede operar cambios.",
  makeCurrentButton: "Marcar como actual",
  nameLabel: "Nombre",
  namePlaceholder: "Plan mensual",
  priceListLabel: "Precios históricos",
  readonlyBadge: "Solo lectura",
  removeButton: "Eliminar",
  title: "Precios",
} as const;

const PRICE_MANAGEMENT_ROUTE = {
  apiTribes: "/api/tribes/",
  connectSegment: "/mercado-pago/oauth/start",
  makeCurrentSegment: "/make-current",
  pricesSegment: "/subscriptions/prices",
  segmentSeparator: "/",
} as const;

const PRICE_MANAGEMENT_REQUEST = {
  buttonType: "button",
  contentTypeHeader: "Content-Type",
  deleteMethod: "DELETE",
  jsonContentType: "application/json",
  postMethod: "POST",
  submitType: "submit",
  outlineVariant: "outline",
  readonlyBadgeVariant: "secondary",
  statusRole: "status",
} as const;

const PRICE_MANAGEMENT_FORMAT = {
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
  body?: Record<string, string>
): Promise<PriceResponse> {
  const response = await fetch(url, {
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      [PRICE_MANAGEMENT_REQUEST.contentTypeHeader]:
        PRICE_MANAGEMENT_REQUEST.jsonContentType,
    },
    method,
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
            disabled={Boolean(pendingAction) || !name.trim() || !amount.trim()}
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
              </div>
              {price.isCurrent ? (
                <Badge>
                  <CheckCircle2Icon />
                  {PRICE_MANAGEMENT_COPY.currentBadge}
                </Badge>
              ) : null}
              {canManagePrices ? (
                <div className={styles.TribeSubscriptionPriceManagement__actions}>
                  <Button
                    disabled={Boolean(pendingAction) || price.isCurrent}
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
                      Boolean(pendingAction) || price.activeSubscribersCount > 0
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
