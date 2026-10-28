"use client";

/**
 * Renders tribe subscription price management for leaders and guardians.
 *
 * @module tribe-subscription-price-management
 */

import {
  type Dispatch,
  type KeyboardEvent,
  type ReactNode,
  type SetStateAction,
  type SubmitEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  Clock3Icon,
  CreditCardIcon,
  InfoIcon,
  PencilIcon,
  PauseCircleIcon,
  PlusIcon,
  RefreshCwIcon,
  StarIcon,
  Trash2Icon,
  UserRoundXIcon,
  UsersRoundIcon,
} from "lucide-react";
import { toast, Badge, Button, Checkbox, Input, Separator, Switch, Select, type SelectOption, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, AnimatedCount, cn } from "@golfo/ui";

import type {
  TribeSubscriberDiagnosticsResult,
  TribeMercadoPagoAccountResult,
  TribeSubscriptionPriceResult,
} from "@/src/modules/subscriptions/application/results/tribe-subscription-price-result";
import { MERCADO_PAGO_CONNECTION_STATUS } from "@/src/modules/subscriptions/constants/subscriptions";
import type { TribeInvitationListItemResult } from "@/src/modules/tribes/application/results/tribe-invitation-result";
import { BUENOS_AIRES_TIME_ZONE } from "@/src/constants/date-time";
import {
  LinkedInvitationsDeletionDialog,
  PRICE_STATUS_ACTIVE,
  type LinkedInvitationActionSelection,
  type LinkedInvitationsDialogTargetPrice,
} from "./linked-invitations-deletion-dialog";
import styles from "./styles.module.scss";

const PRICE_DELETION_STATUS = {
  hasLinkedInvitations: "has_linked_invitations",
} as const;

const PRICE_DELETION_ROUTE_SEGMENT = {
  deleteWithInvitationActions: "/delete-with-invitation-actions",
} as const;

const PRICE_MANAGEMENT_COPY = {
  activeBadge: "Activo",
  amountLabel: "Precio mensual",
  amountPlaceholder: "5000",
  accountMismatchMessage:
    "Seleccioná la cuenta Mercado Pago asociada a este plan para operar la acción.",
  accountLabelSaveButton: "Guardar alias",
  accountLabelUpdating: "Guardando alias...",
  accountLabelLabel: "Alias",
  accountSelectorLabel: "Cuenta Mercado Pago",
  accountSelectorPlaceholder: "Seleccioná una cuenta",
  connectButton: "Conectar Mercado Pago",
  connectAnotherAccountButton: "Conectar otra cuenta",
  connectedStatus: "Conectado",
  accountSectionTitle: "Cuenta Mercado Pago",
  accountContextEmptyState:
    "Conectá una cuenta de Mercado Pago para empezar a gestionar precios.",
  diagnosticsForAccountPrefix: "Suscriptores de",
  createButton: "Crear precio",
  createPendingButton: "Creando precio...",
  associatedMembersPluralSuffix: "miembros asociados",
  associatedMembersSingularSuffix: "miembro asociado",
  createSectionTitle: "Crear nuevo precio",
  disconnectedFreeJoinNotice:
    "Mercado Pago requiere reconexión para crear precios pagos. Podés marcar la entrada gratis como actual.",
  disconnectedNotice:
    "Mercado Pago requiere reconexión. Estamos intentando conectarte automáticamente.",
  canceledBadge: "Cancelado",
  currentBadge: "Actual",
  description:
    "Gestioná los planes disponibles para nuevas suscripciones. Mercado Pago mantiene congeladas las condiciones de cada suscriptor existente.",
  emptyState: "Todavía no hay precios configurados.",
  fallbackCreateError: "No pudimos crear el precio.",
  fallbackDeleteError: "No pudimos eliminar el precio.",
  fallbackUpdateError: "No pudimos actualizar el precio.",
  fallbackMakeCurrentError: "No pudimos marcar el precio como actual.",
  fallbackFreeJoinError: "No pudimos marcar la entrada gratis como actual.",
  freeJoinName: "Entrada gratis",
  openFreeJoinLabel: "Permitir unirse sin invitación",
  openFreeJoinHint:
    "Con la entrada gratis como actual, cualquier persona con sesión puede unirse desde la página de historia. Si está desactivado, solo se entra con un link de invitación.",
  openFreeJoinFallbackError:
    "No pudimos guardar el cambio de entrada abierta.",
  freeJoinMeta:
    "Los invitados entran directo a la tribu, sin Mercado Pago ni suscripción.",
  freeJoinPlaceholder: "—",
  freeJoinSuccess: "Entrada gratis marcada como actual.",
  fallbackVerifyProviderPlanError:
    "No pudimos verificar los planes. Intentá de nuevo.",
  fallbackVerifyProviderSubscribersError:
    "No pudimos verificar los suscriptores. Intentá de nuevo.",
  fallbackSubscriberDiagnosticsError:
    "No pudimos actualizar el diagnóstico. Intentá de nuevo.",
  freshSubscriberDiagnosticsStatus:
    "Diagnóstico actualizado con Mercado Pago.",
  guardianNotice: "Tenés acceso de lectura. Solo el líder puede operar cambios.",
  localActiveSubscribersLabel: "Activos locales",
  makeCurrentButton: "Marcar como actual",
  mercadoPagoAuthorizedSubscribersLabel: "Autorizados en Mercado Pago",
  mercadoPagoCanceledOrMissingSubscribersLabel:
    "Cancelados o ausentes en Mercado Pago",
  mercadoPagoPausedSubscribersLabel: "Pausados en Mercado Pago",
  mercadoPagoPendingSubscribersLabel: "Pendientes en Mercado Pago",
  nameLabel: "Nombre",
  namePlaceholder: "Plan mensual",
  cancelEditButton: "Cancelar edición",
  editAmountLabel: "Nuevo precio mensual",
  editButton: "Editar",
  editNameLabel: "Nuevo nombre",
  priceListLabel: "Catálogo de planes",
  pausedBadge: "Pausado",
  pricesHelpDescription:
    "Editar un plan actualiza su plantilla para nuevos suscriptores. Los suscriptores existentes conservan las condiciones de su suscripción en Mercado Pago.",
  pricesHelpTitle: "Sobre los planes",
  readonlyBadge: "Solo lectura",
  removeButton: "Eliminar",
  requiresReconnectionStatus: "Requiere reconexión",
  saveEditButton: "Guardar cambios",
  subscriberDiagnosticsLastReconciledPrefix: "Última actualización:",
  subscriberDiagnosticsTitle: "Detalle de suscriptores",
  subscriberDiagnosticsUpdateButton: "Actualizar diagnóstico",
  subscriberDiagnosticsUpdating: "Actualizando diagnóstico...",
  tableActionsHeader: "Acciones",
  tableNameHeader: "Nombre",
  tableStatusHeader: "Estado",
  tableTrialHeader: "Prueba gratis",
  title: "Precios",
  trialDaysLabel: "Días de prueba gratis",
  trialDaysToggleLabel: "Agregar prueba gratis",
  academyBadge: "Academia",
  academyTrialNotice: "Los precios de academia se cobran mensualmente y no tienen prueba gratis.",
  productAcademyOption: "Academia",
  productLabel: "Producto",
  productMembershipOption: "Membresía",
  trialDaysPlaceholder: "7",
  trialDaysRangeError: "La prueba gratis debe ser de entre 1 y 14 días.",
  trialDaySuffix: "día",
  trialEmptyLabel: "Sin prueba gratis",
  trialDaysSuffix: "días",
  trialMonthSuffix: "mes",
  trialMonthsSuffix: "meses",
  providerSubscribersMetaSuffix: "suscriptores vigentes en Mercado Pago",
  providerSubscriberMetaSingularSuffix: "suscriptor vigente en Mercado Pago",
  verifyProviderPlanButton: "Verificar plan",
  verifyProviderSubscribersButton: "Verificar suscriptores",
  verifyingProviderPlans: "Verificando planes con Mercado Pago...",
} as const;

const PRICE_MANAGEMENT_ROUTE = {
  apiTribes: "/api/tribes/",
  connectSegment: "/mercado-pago/oauth/start",
  freeJoinMakeCurrentSegment: "/free-join/make-current",
  openFreeJoinSegment: "/free-join/open",
  makeCurrentSegment: "/make-current",
  mercadoPagoAccountsSegment: "/subscriptions/mercado-pago-accounts",
  pricesSegment: "/subscriptions/prices",
  subscriberDiagnosticsReconcileSegment:
    "/subscriptions/subscriber-diagnostics/reconcile",
  segmentSeparator: "/",
  verifyProviderPlanSegment: "/verify-provider-plan",
  verifyProviderPlansSegment: "/subscriptions/prices/verify-provider-plans",
  verifyProviderSubscribersSegment: "/verify-provider-subscribers",
} as const;

const PRICE_MANAGEMENT_REQUEST = {
  ariaHidden: true,
  buttonType: "button",
  tableColumnCount: 5,
  contentTypeHeader: "Content-Type",
  deleteMethod: "DELETE",
  dangerBadgeTone: "danger",
  enterKey: "Enter",
  escapeKey: "Escape",
  jsonContentType: "application/json",
  postMethod: "POST",
  patchMethod: "PATCH",
  putMethod: "PUT",
  pricesProperty: "prices",
  submitType: "submit",
  secondaryVariant: "secondary",
  infoBadgeTone: "info",
  statusRole: "status",
} as const;

const PRICE_MANAGEMENT_STATUS = {
  canceled: "canceled",
  paused: "paused",
} as const;

const PRICE_MANAGEMENT_EDIT_FIELD_ID_SUFFIX = {
  amount: "-edit-amount",
  name: "-edit-name",
  trialFrequency: "-edit-trial-frequency",
} as const;

/** Product of a price; `membership` keeps the historical tribe entry. */
const PRICE_PRODUCT = {
  academy: "academy",
  membership: "membership",
} as const;

type PriceProduct = "academy" | "membership";

const PRICE_PRODUCT_OPTIONS: SelectOption[] = [
  { label: PRICE_MANAGEMENT_COPY.productMembershipOption, value: PRICE_PRODUCT.membership },
  { label: PRICE_MANAGEMENT_COPY.productAcademyOption, value: PRICE_PRODUCT.academy },
];

/**
 * Product of a price; prices created before the academy are membership.
 *
 * @param price - Price result.
 * @returns Product key.
 */
function readPriceProduct(price: TribeSubscriptionPriceResult): PriceProduct {
  return price.productKey === PRICE_PRODUCT.academy
    ? PRICE_PRODUCT.academy
    : PRICE_PRODUCT.membership;
}

const PRICE_MANAGEMENT_ELEMENT_ID = {
  createPriceTitle: "create-subscription-price-title",
  subscriberDiagnosticsTitle: "subscriber-diagnostics-title",
} as const;

const PRICE_MANAGEMENT_FORMAT = {
  abortErrorName: "AbortError",
  amountDivisor: 100,
  currency: "ARS",
  inputMode: "decimal",
  numericInputMode: "numeric",
  locale: "es-AR",
  labelSeparator: " ",
  monthlyTrialFrequencyType: "months",
  trialFrequencyMaximumDays: 14,
  trialFrequencyMinimumDays: 1,
  style: "currency",
  trialFrequencyType: "days",
  validTrialFrequencyPattern: /^\d+$/,
} as const;
/**
 * Joins a count with its singular or plural noun phrase.
 *
 * @param count - Number of people counted.
 * @param singularSuffix - Phrase used when the count is exactly one.
 * @param pluralSuffix - Phrase used for any other count.
 * @returns Count followed by the matching phrase.
 */
function formatCountLabel(
  count: number,
  singularSuffix: string,
  pluralSuffix: string
): string {
  return (
    String(count) +
    PRICE_MANAGEMENT_FORMAT.labelSeparator +
    (count === 1 ? singularSuffix : pluralSuffix)
  );
}

const PRICE_AMOUNT_FORMATTER = new Intl.NumberFormat(
  PRICE_MANAGEMENT_FORMAT.locale,
  {
    currency: PRICE_MANAGEMENT_FORMAT.currency,
    style: PRICE_MANAGEMENT_FORMAT.style,
  }
);
const SUBSCRIBER_DIAGNOSTICS_RECONCILED_AT_FORMATTER = new Intl.DateTimeFormat(
  PRICE_MANAGEMENT_FORMAT.locale,
  {
    timeZone: BUENOS_AIRES_TIME_ZONE,
  }
);

type PriceResponse = {
  deletedPriceId?: string;
  fieldErrors?: PriceFieldErrors;
  linkedInvitations?: TribeInvitationListItemResult[];
  message?: string;
  price?: TribeSubscriptionPriceResult;
  status?: string;
};

type ProviderPlansVerificationResponse = {
  canceledPriceIds: string[];
  freeJoinIsCurrent?: boolean;
  message?: string;
  prices: TribeSubscriptionPriceResult[];
  verifiedCount: number;
};

type ProviderPlanVerificationResponse = {
  freeJoinIsCurrent?: boolean;
  message?: string;
  price?: TribeSubscriptionPriceResult;
  providerActiveSubscribersCount?: number;
  verifiedCount?: number;
};

type SubscriberDiagnosticsReconciliationResponse = {
  diagnostics?: TribeSubscriberDiagnosticsResult;
  message?: string;
  verifiedCount?: number;
};

type MercadoPagoAccountResponse = {
  account?: TribeMercadoPagoAccountResult;
  message?: string;
};

type PriceFieldErrors = {
  amount?: string;
  trialFrequency?: string;
};

type EditingPrice = {
  amount: string;
  id: string;
  name: string;
  originalTrialFrequency: string;
  originalTrialFrequencyType: "days" | "months";
  trialFrequency: string;
  trialFrequencyType: "days" | "months";
};

class PriceRequestError extends Error {
  constructor(
    message: string,
    readonly fieldErrors: PriceFieldErrors = {},
    readonly status?: string,
    readonly linkedInvitations?: TribeInvitationListItemResult[]
  ) {
    super(message);
  }
}

type TribeSubscriptionPriceManagementProps = {
  availableMercadoPagoAccounts?: TribeMercadoPagoAccountResult[];
  canManagePrices: boolean;
  freeJoinIsCurrent: boolean;
  isMercadoPagoConnected: boolean;
  openFreeJoinEnabled: boolean;
  navigateToMercadoPagoConnection?: (connectionEndpoint: string) => void;
  prices: TribeSubscriptionPriceResult[];
  shouldAutoConnectMercadoPago?: boolean;
  subscriberDiagnostics?: TribeSubscriberDiagnosticsResult | null;
  statusMessage: string | null;
  tribeSlug: string;
};

const EMPTY_MERCADO_PAGO_ACCOUNTS: TribeMercadoPagoAccountResult[] = [];

/**
 * Preserves account fields when a mutation endpoint returns a partial price.
 *
 * @param incomingPrice - Price returned by the API.
 * @param currentPrice - Existing price in local state.
 * @returns Price with stable Mercado Pago account metadata.
 */
function mergePriceAccountMetadata(
  incomingPrice: TribeSubscriptionPriceResult,
  currentPrice: TribeSubscriptionPriceResult | undefined
): TribeSubscriptionPriceResult {
  if (!currentPrice) {
    return incomingPrice;
  }

  return {
    ...currentPrice,
    ...incomingPrice,
    mercadoPagoAccountEmail:
      incomingPrice.mercadoPagoAccountEmail ??
      currentPrice.mercadoPagoAccountEmail,
    mercadoPagoAccountLabel:
      incomingPrice.mercadoPagoAccountLabel ??
      currentPrice.mercadoPagoAccountLabel,
    paymentIntegrationId:
      incomingPrice.paymentIntegrationId ?? currentPrice.paymentIntegrationId,
    providerAccountId:
      incomingPrice.providerAccountId ?? currentPrice.providerAccountId,
  };
}

/**
 * Merges a returned price list against current state without reviving omitted prices.
 *
 * @param incomingPrices - Prices returned by the API.
 * @param currentPrices - Existing prices in local state.
 * @returns Prices with preserved account metadata where needed.
 */
function mergePriceListAccountMetadata(
  incomingPrices: TribeSubscriptionPriceResult[],
  currentPrices: TribeSubscriptionPriceResult[]
): TribeSubscriptionPriceResult[] {
  return incomingPrices.map((incomingPrice) =>
    mergePriceAccountMetadata(
      incomingPrice,
      currentPrices.find((currentPrice) => currentPrice.id === incomingPrice.id)
    )
  );
}

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
 * Builds the Mercado Pago account item endpoint.
 *
 * @param tribeSlug - Current tribe slug.
 * @param paymentIntegrationId - Payment integration identifier.
 * @returns Mercado Pago account API endpoint.
 */
function buildMercadoPagoAccountEndpoint(
  tribeSlug: string,
  paymentIntegrationId: string
): string {
  return (
    PRICE_MANAGEMENT_ROUTE.apiTribes +
    tribeSlug +
    PRICE_MANAGEMENT_ROUTE.mercadoPagoAccountsSegment +
    PRICE_MANAGEMENT_ROUTE.segmentSeparator +
    paymentIntegrationId
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
 * Builds the endpoint that reconciles aggregate subscriber diagnostics.
 *
 * @param tribeSlug - Current tribe slug.
 * @returns Subscriber diagnostics reconciliation endpoint.
 */
function buildSubscriberDiagnosticsReconciliationEndpoint(
  tribeSlug: string
): string {
  return (
    PRICE_MANAGEMENT_ROUTE.apiTribes +
    tribeSlug +
    PRICE_MANAGEMENT_ROUTE.subscriberDiagnosticsReconcileSegment
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
  return PRICE_AMOUNT_FORMATTER.format(
    amountCents / PRICE_MANAGEMENT_FORMAT.amountDivisor
  );
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
 * Resolves the localized unit label for a trial period.
 *
 * @param trial - Subscription price trial data.
 * @returns Spanish trial unit label.
 */
function getTrialUnitLabel(
  trial: NonNullable<TribeSubscriptionPriceResult["trial"]>
): string {
  if (
    trial.frequencyType === PRICE_MANAGEMENT_FORMAT.monthlyTrialFrequencyType
  ) {
    return trial.frequency === 1
      ? PRICE_MANAGEMENT_COPY.trialMonthSuffix
      : PRICE_MANAGEMENT_COPY.trialMonthsSuffix;
  }

  return trial.frequency === 1
    ? PRICE_MANAGEMENT_COPY.trialDaySuffix
    : PRICE_MANAGEMENT_COPY.trialDaysSuffix;
}

/**
 * Formats trial period data for price tables.
 *
 * @param price - Subscription price result.
 * @returns Spanish trial period label.
 */
function formatTrialPeriod(price: TribeSubscriptionPriceResult): string {
  return price.trial
    ? `${price.trial.frequency}${
        PRICE_MANAGEMENT_FORMAT.labelSeparator
      }${getTrialUnitLabel(price.trial)}`
    : PRICE_MANAGEMENT_COPY.trialEmptyLabel;
}

/**
 * Determines whether a day-based trial frequency is inside the supported range.
 *
 * @param trialFrequencyValue - Trial frequency typed by the user.
 * @returns Whether the trial frequency can be submitted.
 */
function isValidDayTrialFrequency(trialFrequencyValue: string): boolean {
  const normalizedTrialFrequency = trialFrequencyValue.trim();

  if (
    !PRICE_MANAGEMENT_FORMAT.validTrialFrequencyPattern.test(
      normalizedTrialFrequency
    )
  ) {
    return false;
  }

  const parsedTrialFrequency = Number(normalizedTrialFrequency);

  return (
    Number.isSafeInteger(parsedTrialFrequency) &&
    parsedTrialFrequency >= PRICE_MANAGEMENT_FORMAT.trialFrequencyMinimumDays &&
    parsedTrialFrequency <= PRICE_MANAGEMENT_FORMAT.trialFrequencyMaximumDays
  );
}

/**
 * Resolves inline validation feedback for the create-price trial field.
 *
 * @param input - Current trial field state.
 * @returns Spanish field error text or undefined.
 */
function getCreateTrialFrequencyError(input: {
  fieldError?: string;
  isTrialEnabled: boolean;
  trialFrequency: string;
}): string | undefined {
  if (input.fieldError) {
    return input.fieldError;
  }

  if (!input.isTrialEnabled || !input.trialFrequency.trim()) {
    return undefined;
  }

  return isValidDayTrialFrequency(input.trialFrequency)
    ? undefined
    : PRICE_MANAGEMENT_COPY.trialDaysRangeError;
}

/**
 * Resolves inline validation feedback for the edit-price trial field.
 *
 * @param input - Current editing field state.
 * @returns Spanish field error text or undefined.
 */
function getEditTrialFrequencyError(input: {
  fieldError?: string;
  originalTrialFrequency: string;
  originalTrialFrequencyType: "days" | "months";
  trialFrequency: string;
  trialFrequencyType: "days" | "months";
}): string | undefined {
  if (input.fieldError) {
    return input.fieldError;
  }

  if (!input.trialFrequency.trim()) {
    return undefined;
  }

  if (
    input.trialFrequency.trim() === input.originalTrialFrequency &&
    input.trialFrequencyType === input.originalTrialFrequencyType
  ) {
    return undefined;
  }

  return input.trialFrequencyType === PRICE_MANAGEMENT_FORMAT.trialFrequencyType &&
    !isValidDayTrialFrequency(input.trialFrequency)
    ? PRICE_MANAGEMENT_COPY.trialDaysRangeError
    : undefined;
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
  body?: Record<string, unknown>,
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
      responseBody.fieldErrors,
      responseBody.status,
      responseBody.linkedInvitations
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
 * Sends a subscriber diagnostics reconciliation request.
 *
 * @param tribeSlug - Current tribe slug.
 * @returns Parsed diagnostics reconciliation response.
 */
async function submitSubscriberDiagnosticsReconciliationRequest(
  tribeSlug: string
): Promise<SubscriberDiagnosticsReconciliationResponse> {
  return submitPriceRequest(
    buildSubscriberDiagnosticsReconciliationEndpoint(tribeSlug),
    PRICE_MANAGEMENT_REQUEST.postMethod
  );
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

/**
 * Orders prices from newest to oldest creation date.
 *
 * @param firstPrice - First compared price.
 * @param secondPrice - Second compared price.
 * @returns Sort order for `Array#toSorted`.
 */
function compareNewestPriceFirst(
  firstPrice: TribeSubscriptionPriceResult,
  secondPrice: TribeSubscriptionPriceResult
): number {
  return firstPrice.createdAt < secondPrice.createdAt ? 1 : -1;
}

/**
 * Stable ref callback that focuses an element once it mounts.
 *
 * @param element - Mounted element, or null on unmount.
 */
function focusElementOnMount(element: HTMLElement | null): void {
  element?.focus();
}

/**
 * Reads the message of a thrown error, or a fallback for unknown values.
 *
 * @param error - Unknown thrown value.
 * @param fallbackMessage - Message used when the value is not an Error.
 * @returns User-facing error message.
 */
function readErrorMessage(error: unknown, fallbackMessage: string): string {
  return error instanceof Error ? error.message : fallbackMessage;
}

/**
 * Detects a request error that carries amount or trial field errors.
 *
 * @param error - Unknown thrown value.
 * @returns Whether the error should be shown inline on the fields.
 */
function hasPriceFieldErrors(error: unknown): error is PriceRequestError {
  return (
    error instanceof PriceRequestError &&
    Boolean(error.fieldErrors.amount || error.fieldErrors.trialFrequency)
  );
}

/**
 * Merges one mutated price into the list, keeping one current price per product.
 *
 * @param currentPrices - Prices currently shown.
 * @param price - Mutated price returned by the API.
 * @returns Updated price list.
 */
function applyPriceToList(
  currentPrices: TribeSubscriptionPriceResult[],
  price: TribeSubscriptionPriceResult
): TribeSubscriptionPriceResult[] {
  const hasExistingPrice = currentPrices.some(
    (currentPrice) => currentPrice.id === price.id
  );
  const updatedPrices = hasExistingPrice
    ? currentPrices.map((currentPrice) =>
        currentPrice.id === price.id
          ? mergePriceAccountMetadata(price, currentPrice)
          : currentPrice
      )
    : [price, ...currentPrices];

  return price.isCurrent
    ? updatedPrices.map((currentPrice) =>
        readPriceProduct(currentPrice) === readPriceProduct(price)
          ? { ...currentPrice, isCurrent: currentPrice.id === price.id }
          : currentPrice
      )
    : updatedPrices;
}

/**
 * Builds the inline editing draft of a price.
 *
 * @param price - Price selected for editing.
 * @returns Editing draft seeded with the saved values.
 */
function buildEditingPrice(price: TribeSubscriptionPriceResult): EditingPrice {
  const originalTrialFrequency = price.trial
    ? String(price.trial.frequency)
    : "";
  const originalTrialFrequencyType =
    price.trial?.frequencyType ?? PRICE_MANAGEMENT_FORMAT.trialFrequencyType;

  return {
    amount: formatAmountInputValue(price.amountCents),
    id: price.id,
    name: price.name,
    originalTrialFrequency,
    originalTrialFrequencyType,
    trialFrequency: originalTrialFrequency,
    trialFrequencyType: originalTrialFrequencyType,
  };
}

/**
 * Checks whether the edited trial can be saved: empty, not in days, a valid
 * day count, or unchanged from the saved value.
 *
 * @param editingPrice - Current editing draft.
 * @returns Whether the edit trial frequency is valid.
 */
function isEditingTrialFrequencyValid(editingPrice: EditingPrice | null): boolean {
  return (
    !editingPrice?.trialFrequency.trim() ||
    editingPrice.trialFrequencyType !==
      PRICE_MANAGEMENT_FORMAT.trialFrequencyType ||
    isValidDayTrialFrequency(editingPrice.trialFrequency) ||
    (editingPrice.trialFrequency.trim() ===
      editingPrice.originalTrialFrequency &&
      editingPrice.trialFrequencyType ===
        editingPrice.originalTrialFrequencyType)
  );
}

/**
 * Error shown under the edited trial field.
 *
 * @param editingPrice - Current editing draft.
 * @param fieldError - Trial error returned by the API.
 * @returns Error message, if any.
 */
function getEditingTrialFrequencyError(
  editingPrice: EditingPrice | null,
  fieldError: string | undefined
): string | undefined {
  return editingPrice
    ? getEditTrialFrequencyError({
        fieldError,
        originalTrialFrequency: editingPrice.originalTrialFrequency,
        originalTrialFrequencyType: editingPrice.originalTrialFrequencyType,
        trialFrequency: editingPrice.trialFrequency,
        trialFrequencyType: editingPrice.trialFrequencyType,
      })
    : undefined;
}

type SubscriberDiagnosticsItem = {
  icon: ReactNode;
  label: string;
  tone: string | undefined;
  value: number;
};

/**
 * Builds the subscriber diagnostics counters.
 *
 * @param result - Latest subscriber diagnostics.
 * @returns Counters shown in the diagnostics list.
 */
function buildSubscriberDiagnosticsItems(
  result: TribeSubscriberDiagnosticsResult | null
): SubscriberDiagnosticsItem[] {
  if (!result) {
    return [];
  }

  return [
    {
      icon: <UsersRoundIcon />,
      label: PRICE_MANAGEMENT_COPY.localActiveSubscribersLabel,
      tone: styles.TribeSubscriptionPriceManagement__diagnosticsIconBlue,
      value: result.localActiveSubscribersCount,
    },
    {
      icon: <CheckCircle2Icon />,
      label: PRICE_MANAGEMENT_COPY.mercadoPagoAuthorizedSubscribersLabel,
      tone: styles.TribeSubscriptionPriceManagement__diagnosticsIconGreen,
      value: result.mercadoPagoAuthorizedSubscribersCount,
    },
    {
      icon: <Clock3Icon />,
      label: PRICE_MANAGEMENT_COPY.mercadoPagoPendingSubscribersLabel,
      tone: styles.TribeSubscriptionPriceManagement__diagnosticsIconOrange,
      value: result.mercadoPagoPendingSubscribersCount,
    },
    {
      icon: <PauseCircleIcon />,
      label: PRICE_MANAGEMENT_COPY.mercadoPagoPausedSubscribersLabel,
      tone: styles.TribeSubscriptionPriceManagement__diagnosticsIconPurple,
      value: result.mercadoPagoPausedSubscribersCount,
    },
    {
      icon: <UserRoundXIcon />,
      label: PRICE_MANAGEMENT_COPY.mercadoPagoCanceledOrMissingSubscribersLabel,
      tone: styles.TribeSubscriptionPriceManagement__diagnosticsIconRed,
      value: result.mercadoPagoCanceledOrMissingSubscribersCount,
    },
  ];
}

/**
 * Builds the Mercado Pago account selector options.
 *
 * @param accounts - Accounts with their current labels.
 * @returns Select options; disconnected accounts are disabled.
 */
function buildAccountSelectOptions(
  accounts: TribeMercadoPagoAccountResult[]
): SelectOption[] {
  return accounts.map((account) => ({
    disabled: account.status !== MERCADO_PAGO_CONNECTION_STATUS.connected,
    label:
      (account.providerAccountEmail ?? account.accountLabel) +
      (account.status !== MERCADO_PAGO_CONNECTION_STATUS.connected
        ? ` (${PRICE_MANAGEMENT_COPY.requiresReconnectionStatus})`
        : ""),
    value: account.id,
  }));
}

/**
 * Starts the Mercado Pago connection once when it is rendered; it is only
 * rendered while the connection must start automatically.
 */
function MercadoPagoAutoConnect({
  connectionEndpoint,
  onStart,
}: {
  connectionEndpoint: string;
  onStart: (connectionEndpoint: string) => void;
}) {
  useEffect(() => {
    onStart(connectionEndpoint);
  }, [connectionEndpoint, onStart]);

  return null;
}

type SetPriceItems = Dispatch<SetStateAction<TribeSubscriptionPriceResult[]>>;
type SetPendingAction = (update: SetStateAction<string | null>) => void;

/**
 * Mercado Pago accounts with locally renamed labels and the selected account.
 *
 * @param availableMercadoPagoAccounts - Accounts available to the tribe.
 * @returns Accounts, the effective selection and the label drafts.
 */
function useMercadoPagoAccounts(
  availableMercadoPagoAccounts: TribeMercadoPagoAccountResult[]
) {
  const [
    accountLabelDraftByPaymentIntegrationId,
    setAccountLabelDraftByPaymentIntegrationId,
  ] = useState<Record<string, string>>({});
  const [
    accountLabelOverrideByPaymentIntegrationId,
    setAccountLabelOverrideByPaymentIntegrationId,
  ] = useState<Record<string, string>>({});
  const [selectedPaymentIntegrationId, setSelectedPaymentIntegrationId] =
    useState(() => availableMercadoPagoAccounts[0]?.id ?? "");
  const mercadoPagoAccounts = useMemo(
    () =>
      availableMercadoPagoAccounts.map((account) => ({
        ...account,
        accountLabel:
          accountLabelOverrideByPaymentIntegrationId[account.id] ??
          account.accountLabel,
      })),
    [accountLabelOverrideByPaymentIntegrationId, availableMercadoPagoAccounts]
  );
  const connectedMercadoPagoAccounts = useMemo(
    () =>
      mercadoPagoAccounts.filter(
        (account) => account.status === MERCADO_PAGO_CONNECTION_STATUS.connected
      ),
    [mercadoPagoAccounts]
  );
  const effectiveSelectedPaymentIntegrationId =
    selectedPaymentIntegrationId &&
    connectedMercadoPagoAccounts.some(
      (account) => account.id === selectedPaymentIntegrationId
    )
      ? selectedPaymentIntegrationId
      : connectedMercadoPagoAccounts[0]?.id ?? "";
  const selectedMercadoPagoAccount = useMemo(
    () =>
      mercadoPagoAccounts.find(
        (account) => account.id === effectiveSelectedPaymentIntegrationId
      ) ?? null,
    [effectiveSelectedPaymentIntegrationId, mercadoPagoAccounts]
  );
  const accountLabel =
    (selectedMercadoPagoAccount
      ? accountLabelDraftByPaymentIntegrationId[selectedMercadoPagoAccount.id]
      : undefined) ??
    selectedMercadoPagoAccount?.accountLabel ??
    "";

  return {
    accountLabel,
    effectiveSelectedPaymentIntegrationId,
    mercadoPagoAccounts,
    selectedMercadoPagoAccount,
    setAccountLabelDraftByPaymentIntegrationId,
    setAccountLabelOverrideByPaymentIntegrationId,
    setSelectedPaymentIntegrationId,
  };
}

type MercadoPagoAccountsModel = ReturnType<typeof useMercadoPagoAccounts>;

/**
 * Draft of the price creation form.
 *
 * @returns Draft values, their setters and a reset after a successful create.
 */
function usePriceCreateDraft() {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [isTrialEnabled, setIsTrialEnabled] = useState(false);
  const [priceProduct, setPriceProduct] = useState<PriceProduct>(PRICE_PRODUCT.membership);
  const [trialFrequency, setTrialFrequency] = useState("");

  const resetDraft = () => {
    setAmount("");
    setName("");
    setPriceProduct(PRICE_PRODUCT.membership);
    setIsTrialEnabled(false);
    setTrialFrequency("");
  };

  return { amount, isAcademyPriceSelected: priceProduct === PRICE_PRODUCT.academy, isTrialEnabled, name, priceProduct, resetDraft, setAmount, setIsTrialEnabled, setName, setPriceProduct, setTrialFrequency, trialFrequency };
}

type PriceCreateDraft = ReturnType<typeof usePriceCreateDraft>;

/**
 * Pending action, inline editor and field errors of the price list. Closing an
 * editor returns focus to its edit button once nothing is pending, because the
 * button stays disabled while an action runs.
 *
 * @returns Editor state, the pending action and the focus helpers.
 */
function usePriceActionState() {
  const [editingPrice, setEditingPrice] = useState<EditingPrice | null>(null);
  const [fieldErrors, setFieldErrors] = useState<PriceFieldErrors>({});
  const [pendingAction, setPendingActionState] = useState<string | null>(null);
  const pendingActionRef = useRef<string | null>(null);
  const editButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  // Price whose edit button regains focus once its inline editor closes.
  const priceIdToRefocusRef = useRef<string | null>(null);

  const refocusClosedEditorButton = () => {
    const priceIdToRefocus = priceIdToRefocusRef.current;

    if (!priceIdToRefocus || pendingActionRef.current) {
      return;
    }

    priceIdToRefocusRef.current = null;
    editButtonRefs.current.get(priceIdToRefocus)?.focus();
  };
  const setPendingAction: SetPendingAction = (update) => {
    const nextPendingAction =
      typeof update === "function" ? update(pendingActionRef.current) : update;

    pendingActionRef.current = nextPendingAction;

    if (nextPendingAction) {
      setPendingActionState(nextPendingAction);
      return;
    }

    flushSync(() => {
      setPendingActionState(null);
    });
    refocusClosedEditorButton();
  };
  const closePriceEditor = (priceId: string) => {
    priceIdToRefocusRef.current = priceId;
    flushSync(() => {
      setEditingPrice(null);
      setFieldErrors({});
    });
    refocusClosedEditorButton();
  };
  const bindEditButton =
    (priceId: string) => (element: HTMLButtonElement | null) => {
      if (element) {
        editButtonRefs.current.set(priceId, element);
      } else {
        editButtonRefs.current.delete(priceId);
      }
    };

  return { bindEditButton, closePriceEditor, editingPrice, fieldErrors, pendingAction, setEditingPrice, setFieldErrors, setPendingAction };
}

type PriceActionState = ReturnType<typeof usePriceActionState>;

/**
 * Aggregate subscriber diagnostics and the state of their last refresh.
 *
 * @param subscriberDiagnostics - Diagnostics rendered by the server.
 * @returns Diagnostics, the refresh message and whether it failed.
 */
function useSubscriberDiagnosticsState(
  subscriberDiagnostics: TribeSubscriberDiagnosticsResult | null | undefined
) {
  const [subscriberDiagnosticsResult, setSubscriberDiagnosticsResult] =
    useState<TribeSubscriberDiagnosticsResult | null>(
      subscriberDiagnostics ?? null
    );
  const [subscriberDiagnosticsMessage, setSubscriberDiagnosticsMessage] =
    useState<string | null>(null);
  const [hasSubscriberDiagnosticsError, setHasSubscriberDiagnosticsError] =
    useState(false);

  return { hasSubscriberDiagnosticsError, setHasSubscriberDiagnosticsError, setSubscriberDiagnosticsMessage, setSubscriberDiagnosticsResult, subscriberDiagnosticsMessage, subscriberDiagnosticsResult };
}

type SubscriberDiagnosticsState = ReturnType<typeof useSubscriberDiagnosticsState>;

/**
 * Merges a provider verification response into the price list, the free join
 * state and the fresh provider subscriber counts.
 *
 * @param response - Provider verification response returned by the API.
 * @param setters - State setters that receive the verified values.
 */
function applyProviderPlanVerification(
  response: ProviderPlanVerificationResponse | ProviderPlansVerificationResponse,
  setters: {
    setIsFreeJoinCurrent: (isFreeJoinCurrent: boolean) => void;
    setPriceItems: SetPriceItems;
    setProviderSubscriberCountsByPriceId: Dispatch<SetStateAction<Record<string, number>>>;
  }
) {
  if (PRICE_MANAGEMENT_REQUEST.pricesProperty in response) {
    setters.setPriceItems((currentPrices) =>
      mergePriceListAccountMetadata(response.prices, currentPrices)
    );
    if (typeof response.freeJoinIsCurrent === "boolean") {
      setters.setIsFreeJoinCurrent(response.freeJoinIsCurrent);
    }

    return;
  }

  if (typeof response.freeJoinIsCurrent === "boolean") {
    setters.setIsFreeJoinCurrent(response.freeJoinIsCurrent);
  }

  const verifiedPrice = response.price;

  if (!verifiedPrice) {
    return;
  }

  setters.setPriceItems((currentPrices) =>
    currentPrices.map((price) =>
      price.id === verifiedPrice.id
        ? mergePriceAccountMetadata(verifiedPrice, price)
        : price
    )
  );

  const { providerActiveSubscribersCount } = response;

  if (typeof providerActiveSubscribersCount === "number") {
    setters.setProviderSubscriberCountsByPriceId((currentCounts) => ({
      ...currentCounts,
      [verifiedPrice.id]: providerActiveSubscribersCount,
    }));
  }
}

type ProviderPlanVerificationOptions = {
  canManagePrices: boolean;
  isMercadoPagoConnected: boolean;
  priceCount: number;
  setIsFreeJoinCurrent: (isFreeJoinCurrent: boolean) => void;
  setPriceItems: SetPriceItems;
  tribeSlug: string;
};

/**
 * Provider plan verification: the automatic check on load and the merge of
 * verification responses into the price list.
 *
 * @param options - Tribe, permissions and the list setters.
 * @returns Verification state and the response merger.
 */
function useProviderPlanVerification({
  canManagePrices,
  isMercadoPagoConnected,
  priceCount,
  setIsFreeJoinCurrent,
  setPriceItems,
  tribeSlug,
}: ProviderPlanVerificationOptions) {
  const [providerVerificationMessage, setProviderVerificationMessage] = useState<
    string | null
  >(null);
  const [isVerifyingProviderPlans, setIsVerifyingProviderPlans] =
    useState(false);
  const [
    providerSubscriberCountsByPriceId,
    setProviderSubscriberCountsByPriceId,
  ] = useState<Record<string, number>>({});

  /**
   * Applies a provider verification response to the local price list.
   *
   * @param response - Provider verification response returned by the API.
   * @returns Void.
   */
  const applyProviderPlanVerificationResponse = useCallback((
    response: ProviderPlanVerificationResponse | ProviderPlansVerificationResponse
  ) => {
    applyProviderPlanVerification(response, {
      setIsFreeJoinCurrent,
      setPriceItems,
      setProviderSubscriberCountsByPriceId,
    });
  }, [setIsFreeJoinCurrent, setPriceItems]);

  useEffect(() => {
    if (!canManagePrices || !isMercadoPagoConnected || priceCount === 0) {
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

        const fallbackMessage = readErrorMessage(
          error,
          PRICE_MANAGEMENT_COPY.fallbackVerifyProviderPlanError
        );
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
    priceCount,
    tribeSlug,
  ]);

  return { applyProviderPlanVerificationResponse, isVerifyingProviderPlans, providerSubscriberCountsByPriceId, providerVerificationMessage };
}

type ProviderPlanVerification = ReturnType<typeof useProviderPlanVerification>;

type AccountLabelHandlerOptions = {
  accounts: MercadoPagoAccountsModel;
  isAccountLabelUpdateDisabled: boolean;
  setPendingAction: SetPendingAction;
  setPriceItems: SetPriceItems;
  tribeSlug: string;
};

/**
 * Saves the selected Mercado Pago account label, from its button or Enter.
 *
 * @param options - Accounts model, guards and setters.
 * @returns Account label save and keyboard handlers.
 */
function createAccountLabelHandlers({
  accounts,
  isAccountLabelUpdateDisabled,
  setPendingAction,
  setPriceItems,
  tribeSlug,
}: AccountLabelHandlerOptions) {
  const { selectedMercadoPagoAccount } = accounts;
  const trimmedAccountLabel = accounts.accountLabel.trim();

  /**
   * Updates the selected Mercado Pago account label.
   *
   * @returns Promise resolved after the request completes.
   */
  const handleUpdateMercadoPagoAccountLabel = async () => {
    if (
      !selectedMercadoPagoAccount ||
      isAccountLabelUpdateDisabled ||
      !trimmedAccountLabel
    ) {
      return;
    }

    setPendingAction(PRICE_MANAGEMENT_COPY.accountLabelSaveButton);

    try {
      const response = (await submitPriceRequest(
        buildMercadoPagoAccountEndpoint(tribeSlug, selectedMercadoPagoAccount.id),
        PRICE_MANAGEMENT_REQUEST.patchMethod,
        {
          accountLabel: trimmedAccountLabel,
        }
      )) as MercadoPagoAccountResponse;
      const updatedAccount = response.account;

      if (updatedAccount) {
        accounts.setAccountLabelOverrideByPaymentIntegrationId((currentLabels) => ({
          ...currentLabels,
          [updatedAccount.id]: updatedAccount.accountLabel,
        }));
        accounts.setAccountLabelDraftByPaymentIntegrationId((currentLabels) => ({
          ...currentLabels,
          [updatedAccount.id]: updatedAccount.accountLabel,
        }));
        setPriceItems((currentPrices) =>
          currentPrices.map((price) =>
            price.paymentIntegrationId === updatedAccount.id
              ? {
                  ...price,
                  mercadoPagoAccountLabel: updatedAccount.accountLabel,
                }
              : price
          )
        );
      }

      toast.success(response.message ?? PRICE_MANAGEMENT_COPY.accountLabelSaveButton);
    } catch (error) {
      toast.error(
        error instanceof PriceRequestError
          ? error.message
          : PRICE_MANAGEMENT_COPY.fallbackUpdateError
      );
    } finally {
      setPendingAction((current) =>
        current === PRICE_MANAGEMENT_COPY.accountLabelSaveButton ? null : current
      );
    }
  };

  /**
   * Saves the selected account label without submitting the price creation form.
   *
   * @param event - Account label input keyboard event.
   */
  const handleAccountLabelKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== PRICE_MANAGEMENT_REQUEST.enterKey) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    void handleUpdateMercadoPagoAccountLabel();
  };

  return { handleAccountLabelKeyDown, handleUpdateMercadoPagoAccountLabel };
}

type CreatePriceHandlerOptions = {
  actions: PriceActionState;
  applyPriceMutationResponse: (price: TribeSubscriptionPriceResult) => void;
  draft: PriceCreateDraft;
  effectiveSelectedPaymentIntegrationId: string;
  isBlocked: boolean;
  isCreateTrialFrequencyValid: boolean;
  tribeSlug: string;
};

/**
 * Creates a new provider-backed price from the creation draft.
 *
 * @param options - Draft, guards and setters.
 * @returns Form submit handler.
 */
function createCreatePriceHandler({
  actions,
  applyPriceMutationResponse,
  draft,
  effectiveSelectedPaymentIntegrationId,
  isBlocked,
  isCreateTrialFrequencyValid,
  tribeSlug,
}: CreatePriceHandlerOptions) {
  return async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isBlocked) {
      return;
    }

    if (!isCreateTrialFrequencyValid) {
      actions.setFieldErrors((currentFieldErrors) => ({
        ...currentFieldErrors,
        trialFrequency: PRICE_MANAGEMENT_COPY.trialDaysRangeError,
      }));

      return;
    }

    actions.setPendingAction(PRICE_MANAGEMENT_COPY.createButton);
    actions.setFieldErrors({});

    try {
      const submittedTrialFrequency =
        draft.isTrialEnabled && !draft.isAcademyPriceSelected ? draft.trialFrequency : "";
      const response = await submitPriceRequest(
        buildPricesEndpoint(tribeSlug),
        PRICE_MANAGEMENT_REQUEST.postMethod,
        {
          amount: draft.amount,
          name: draft.name,
          ...(effectiveSelectedPaymentIntegrationId
            ? { paymentIntegrationId: effectiveSelectedPaymentIntegrationId }
            : {}),
          ...(draft.isAcademyPriceSelected ? { productKey: PRICE_PRODUCT.academy } : {}),
          trialFrequency: submittedTrialFrequency,
          trialFrequencyType: PRICE_MANAGEMENT_FORMAT.trialFrequencyType,
        }
      );

      if (response.price) {
        applyPriceMutationResponse(response.price);
      }

      draft.resetDraft();
      toast.success(response.message ?? PRICE_MANAGEMENT_COPY.createButton);
    } catch (error) {
      if (hasPriceFieldErrors(error)) {
        actions.setFieldErrors(error.fieldErrors);

        return;
      }

      toast.error(readErrorMessage(error, PRICE_MANAGEMENT_COPY.fallbackCreateError));
    } finally {
      actions.setPendingAction(null);
    }
  };
}

type PriceEditHandlerOptions = {
  actions: PriceActionState;
  applyPriceMutationResponse: (price: TribeSubscriptionPriceResult) => void;
  isSelectedAccountMismatch: (price: TribeSubscriptionPriceResult) => boolean;
  tribeSlug: string;
};

/**
 * Opens, edits and saves the inline price editor.
 *
 * @param options - Editor state, guards and setters.
 * @returns Start, draft update and save handlers.
 */
function createPriceEditHandlers({
  actions,
  applyPriceMutationResponse,
  isSelectedAccountMismatch,
  tribeSlug,
}: PriceEditHandlerOptions) {
  const { editingPrice, setEditingPrice, setFieldErrors } = actions;

  const handleStartEditingPrice = (price: TribeSubscriptionPriceResult) => {
    if (isSelectedAccountMismatch(price)) {
      toast.error(PRICE_MANAGEMENT_COPY.accountMismatchMessage);

      return;
    }

    setEditingPrice(buildEditingPrice(price));
    setFieldErrors({});
  };
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
      trialFrequency: undefined,
    }));
  };
  /**
   * Saves an inline price edit using the mixed synchronization policy.
   *
   * @param event - Form submission event.
   * @returns Promise resolved after the request completes.
   */
  const handleUpdatePrice = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!editingPrice) {
      return;
    }

    if (!isEditingTrialFrequencyValid(editingPrice)) {
      setFieldErrors((currentFieldErrors) => ({
        ...currentFieldErrors,
        trialFrequency: PRICE_MANAGEMENT_COPY.trialDaysRangeError,
      }));

      return;
    }

    await savePriceEdit({ actions, applyPriceMutationResponse, editingPrice, tribeSlug });
  };

  return { handleStartEditingPrice, handleUpdatePrice, updateEditingPrice };
}

/**
 * Sends a valid inline price edit and closes the editor once it is saved.
 *
 * @param options - Editor state, the draft and the tribe.
 * @returns Promise resolved after the request completes.
 */
async function savePriceEdit({
  actions,
  applyPriceMutationResponse,
  editingPrice,
  tribeSlug,
}: Omit<PriceEditHandlerOptions, "isSelectedAccountMismatch"> & {
  editingPrice: EditingPrice;
}) {
  actions.setPendingAction(PRICE_MANAGEMENT_COPY.saveEditButton + editingPrice.id);
  actions.setFieldErrors({});

  try {
    const response = await submitPriceRequest(
      buildPriceEndpoint(tribeSlug, editingPrice.id),
      PRICE_MANAGEMENT_REQUEST.patchMethod,
      {
        amount: editingPrice.amount,
        name: editingPrice.name,
        trialFrequency: editingPrice.trialFrequency,
        trialFrequencyType: editingPrice.trialFrequencyType,
      }
    );

    if (response.price) {
      applyPriceMutationResponse(response.price);
    }

    actions.closePriceEditor(editingPrice.id);
    toast.success(response.message ?? PRICE_MANAGEMENT_COPY.saveEditButton);
  } catch (error) {
    if (hasPriceFieldErrors(error)) {
      actions.setFieldErrors(error.fieldErrors);

      return;
    }

    toast.error(readErrorMessage(error, PRICE_MANAGEMENT_COPY.fallbackUpdateError));
  } finally {
    actions.setPendingAction(null);
  }
}

type PriceRowActionOptions = {
  applyPriceMutationResponse: (price: TribeSubscriptionPriceResult) => void;
  applyProviderPlanVerificationResponse: ProviderPlanVerification["applyProviderPlanVerificationResponse"];
  isSelectedAccountMismatch: (price: TribeSubscriptionPriceResult) => boolean;
  setIsFreeJoinCurrent: (isFreeJoinCurrent: boolean) => void;
  setLinkedInvitationsDeletion: (deletion: LinkedInvitationsDeletion | null) => void;
  setPendingAction: SetPendingAction;
  setPriceItems: SetPriceItems;
  tribeSlug: string;
};

type LinkedInvitationsDeletion = {
  invitations: TribeInvitationListItemResult[];
  priceId: string;
};

/**
 * Removes the deleted price from the list when the API reports one.
 *
 * @param setPriceItems - Price list setter.
 * @param deletedPriceId - Price removed by the API, if any.
 */
function removeDeletedPrice(
  setPriceItems: SetPriceItems,
  deletedPriceId: string | undefined
) {
  if (deletedPriceId) {
    setPriceItems((currentPrices) =>
      currentPrices.filter((price) => price.id !== deletedPriceId)
    );
  }
}

/**
 * Marks a price current and deletes canceled prices.
 *
 * @param options - Guards, setters and the tribe.
 * @returns Make current and delete handlers.
 */
function createPriceLifecycleHandlers(options: PriceRowActionOptions) {
  const { applyPriceMutationResponse, isSelectedAccountMismatch, setPendingAction, tribeSlug } = options;

  const handleMakeCurrent = async (price: TribeSubscriptionPriceResult) => {
    if (isSelectedAccountMismatch(price)) {
      toast.error(PRICE_MANAGEMENT_COPY.accountMismatchMessage);

      return;
    }

    setPendingAction(price.id);

    try {
      const response = await submitPriceRequest(
        buildPriceEndpoint(tribeSlug, price.id) +
          PRICE_MANAGEMENT_ROUTE.makeCurrentSegment,
        PRICE_MANAGEMENT_REQUEST.postMethod
      );

      if (response.price) {
        applyPriceMutationResponse(response.price);
      }
      options.setIsFreeJoinCurrent(false);

      toast.success(response.message ?? PRICE_MANAGEMENT_COPY.makeCurrentButton);
    } catch (error) {
      toast.error(readErrorMessage(error, PRICE_MANAGEMENT_COPY.fallbackMakeCurrentError));
    } finally {
      setPendingAction(null);
    }
  };
  /**
   * Deletes a price that has no member subscriptions.
   *
   * @param price - Price to delete.
   * @returns Promise resolved after the request completes.
   */
  const handleDeletePrice = async (price: TribeSubscriptionPriceResult) => {
    if (isSelectedAccountMismatch(price)) {
      toast.error(PRICE_MANAGEMENT_COPY.accountMismatchMessage);

      return;
    }

    setPendingAction(price.id);

    try {
      const response = await submitPriceRequest(
        buildPriceEndpoint(tribeSlug, price.id),
        PRICE_MANAGEMENT_REQUEST.deleteMethod
      );

      if (response.price) {
        applyPriceMutationResponse(response.price);
      }
      removeDeletedPrice(options.setPriceItems, response.deletedPriceId);
      toast.success(response.message ?? PRICE_MANAGEMENT_COPY.removeButton);
    } catch (error) {
      handleDeletePriceError(error, price, options);
    } finally {
      setPendingAction((current) => (current === price.id ? null : current));
    }
  };

  return { handleDeletePrice, handleMakeCurrent };
}

/**
 * Opens the linked invitations dialog when the price still has invitations,
 * otherwise reports the deletion error.
 *
 * @param error - Error thrown by the delete request.
 * @param price - Price being deleted.
 * @param options - Dialog and pending action setters.
 */
function handleDeletePriceError(
  error: unknown,
  price: TribeSubscriptionPriceResult,
  options: Pick<PriceRowActionOptions, "setLinkedInvitationsDeletion" | "setPendingAction">
) {
  if (
    error instanceof PriceRequestError &&
    error.status === PRICE_DELETION_STATUS.hasLinkedInvitations &&
    Array.isArray(error.linkedInvitations)
  ) {
    options.setLinkedInvitationsDeletion({
      invitations: error.linkedInvitations,
      priceId: price.id,
    });
    options.setPendingAction(null);
    return;
  }

  toast.error(readErrorMessage(error, PRICE_MANAGEMENT_COPY.fallbackDeleteError));
}

/**
 * Verifies one price against the provider: its plan or its subscribers.
 *
 * @param options - Guards, setters and the tribe.
 * @returns Plan and subscriber verification handlers.
 */
function createPriceVerificationHandlers(options: PriceRowActionOptions) {
  const { isSelectedAccountMismatch, setPendingAction, tribeSlug } = options;

  const verifyPrice = async (
    price: TribeSubscriptionPriceResult,
    request: {
      endpoint: string;
      fallbackError: string;
      pendingActionPrefix: string;
    }
  ) => {
    if (isSelectedAccountMismatch(price)) {
      toast.error(PRICE_MANAGEMENT_COPY.accountMismatchMessage);

      return;
    }

    setPendingAction(request.pendingActionPrefix + price.id);

    try {
      const response =
        await submitProviderPlanVerificationRequest<ProviderPlanVerificationResponse>(
          request.endpoint
        );

      options.applyProviderPlanVerificationResponse(response);
      toast.success(response.message ?? request.pendingActionPrefix);
    } catch (error) {
      toast.error(readErrorMessage(error, request.fallbackError));
    } finally {
      setPendingAction(null);
    }
  };

  return {
    /** Verifies one price provider plan and removes it locally when missing. */
    handleVerifyProviderPlan: (price: TribeSubscriptionPriceResult) =>
      verifyPrice(price, {
        endpoint: buildProviderPlanVerificationEndpoint(tribeSlug, price.id),
        fallbackError: PRICE_MANAGEMENT_COPY.fallbackVerifyProviderPlanError,
        pendingActionPrefix: PRICE_MANAGEMENT_COPY.verifyProviderPlanButton,
      }),
    /** Verifies real provider subscribers and updates the displayed count. */
    handleVerifyProviderSubscribers: (price: TribeSubscriptionPriceResult) =>
      verifyPrice(price, {
        endpoint: buildProviderSubscribersVerificationEndpoint(tribeSlug, price.id),
        fallbackError: PRICE_MANAGEMENT_COPY.fallbackVerifyProviderSubscribersError,
        pendingActionPrefix: PRICE_MANAGEMENT_COPY.verifyProviderSubscribersButton,
      }),
  };
}

const FREE_JOIN_PENDING_ACTION_KEY = "free-join";

type FreeJoinHandlerOptions = {
  isOpenFreeJoinEnabled: boolean;
  setIsFreeJoinCurrent: (isFreeJoinCurrent: boolean) => void;
  setIsOpenFreeJoinEnabled: (enabled: boolean) => void;
  setIsSavingOpenFreeJoin: (isSaving: boolean) => void;
  setPendingAction: SetPendingAction;
  setPriceItems: SetPriceItems;
  tribeSlug: string;
};

/**
 * Makes the free join current and toggles the tokenless free join.
 *
 * @param options - Free join state setters and the tribe.
 * @returns Free join handlers.
 */
function createFreeJoinHandlers(options: FreeJoinHandlerOptions) {
  const { setPendingAction, tribeSlug } = options;

  const handleMakeFreeJoinCurrent = async () => {
    setPendingAction(FREE_JOIN_PENDING_ACTION_KEY);

    try {
      const response = await submitPriceRequest(
        PRICE_MANAGEMENT_ROUTE.apiTribes +
          tribeSlug +
          PRICE_MANAGEMENT_ROUTE.freeJoinMakeCurrentSegment,
        PRICE_MANAGEMENT_REQUEST.postMethod
      );

      options.setIsFreeJoinCurrent(true);
      options.setPriceItems((currentPrices) =>
        currentPrices.map((price) =>
          price.isCurrent && readPriceProduct(price) === PRICE_PRODUCT.membership
            ? { ...price, isCurrent: false }
            : price
        )
      );

      toast.success(response.message ?? PRICE_MANAGEMENT_COPY.freeJoinSuccess);
    } catch (error) {
      toast.error(readErrorMessage(error, PRICE_MANAGEMENT_COPY.fallbackFreeJoinError));
    } finally {
      setPendingAction(null);
    }
  };
  /**
   * Toggles whether a free tribe can be joined without an invitation link.
   *
   * @param enabled - Whether the tokenless free join is allowed.
   * @returns Promise resolved after the request completes.
   */
  const handleToggleOpenFreeJoin = async (enabled: boolean) => {
    const previousValue = options.isOpenFreeJoinEnabled;

    options.setIsOpenFreeJoinEnabled(enabled);
    options.setIsSavingOpenFreeJoin(true);

    try {
      const response = await submitPriceRequest(
        PRICE_MANAGEMENT_ROUTE.apiTribes +
          tribeSlug +
          PRICE_MANAGEMENT_ROUTE.openFreeJoinSegment,
        PRICE_MANAGEMENT_REQUEST.putMethod,
        { enabled }
      );

      toast.success(
        response.message ?? PRICE_MANAGEMENT_COPY.freeJoinSuccess
      );
    } catch (error) {
      options.setIsOpenFreeJoinEnabled(previousValue);
      toast.error(readErrorMessage(error, PRICE_MANAGEMENT_COPY.openFreeJoinFallbackError));
    } finally {
      options.setIsSavingOpenFreeJoin(false);
    }
  };

  return { handleMakeFreeJoinCurrent, handleToggleOpenFreeJoin };
}

/**
 * Linked invitations dialog shown when a deleted price still has invitations.
 *
 * @param options - Price list setter and the tribe.
 * @returns Dialog state and its confirm and cancel handlers.
 */
function useLinkedInvitationsDeletion({
  setPriceItems,
  tribeSlug,
}: {
  setPriceItems: SetPriceItems;
  tribeSlug: string;
}) {
  const [linkedInvitationsDeletion, setLinkedInvitationsDeletion] =
    useState<LinkedInvitationsDeletion | null>(null);
  const [
    isSubmittingLinkedInvitationsDeletion,
    setIsSubmittingLinkedInvitationsDeletion,
  ] = useState(false);

  const handleConfirmLinkedInvitationsDeletion = async (
    selections: LinkedInvitationActionSelection[]
  ) => {
    if (!linkedInvitationsDeletion) {
      return;
    }

    const { priceId } = linkedInvitationsDeletion;
    setIsSubmittingLinkedInvitationsDeletion(true);

    try {
      const response = await submitPriceRequest(
        buildPriceEndpoint(tribeSlug, priceId) +
          PRICE_DELETION_ROUTE_SEGMENT.deleteWithInvitationActions,
        PRICE_MANAGEMENT_REQUEST.postMethod,
        { invitationActions: selections }
      );

      removeDeletedPrice(setPriceItems, response.deletedPriceId);
      toast.success(response.message ?? PRICE_MANAGEMENT_COPY.removeButton);
      setLinkedInvitationsDeletion(null);
    } catch (error) {
      toast.error(readErrorMessage(error, PRICE_MANAGEMENT_COPY.fallbackDeleteError));
    } finally {
      setIsSubmittingLinkedInvitationsDeletion(false);
    }
  };
  const handleCancelLinkedInvitationsDeletion = () => {
    if (isSubmittingLinkedInvitationsDeletion) {
      return;
    }

    setLinkedInvitationsDeletion(null);
  };

  return { handleCancelLinkedInvitationsDeletion, handleConfirmLinkedInvitationsDeletion, isSubmittingLinkedInvitationsDeletion, linkedInvitationsDeletion, setLinkedInvitationsDeletion };
}

/**
 * Reconciles aggregate subscriber diagnostics with Mercado Pago.
 *
 * @param options - Diagnostics state, the pending action setter and the tribe.
 * @returns Reconcile handler.
 */
function createReconcileSubscriberDiagnosticsHandler({
  diagnostics,
  setPendingAction,
  tribeSlug,
}: {
  diagnostics: SubscriberDiagnosticsState;
  setPendingAction: SetPendingAction;
  tribeSlug: string;
}) {
  return async () => {
    setPendingAction(PRICE_MANAGEMENT_COPY.subscriberDiagnosticsUpdateButton);
    diagnostics.setHasSubscriberDiagnosticsError(false);
    diagnostics.setSubscriberDiagnosticsMessage(
      PRICE_MANAGEMENT_COPY.subscriberDiagnosticsUpdating
    );

    try {
      const response = await submitSubscriberDiagnosticsReconciliationRequest(
        tribeSlug
      );

      if (response.diagnostics) {
        diagnostics.setSubscriberDiagnosticsResult(response.diagnostics);
      }

      diagnostics.setSubscriberDiagnosticsMessage(response.message ?? null);
      toast.success(
        response.message ??
          PRICE_MANAGEMENT_COPY.subscriberDiagnosticsUpdateButton
      );
    } catch (error) {
      const message = readErrorMessage(
        error,
        PRICE_MANAGEMENT_COPY.fallbackSubscriberDiagnosticsError
      );

      diagnostics.setHasSubscriberDiagnosticsError(true);
      diagnostics.setSubscriberDiagnosticsMessage(message);
      toast.error(message);
    } finally {
      setPendingAction(null);
    }
  };
}

/** Title and description of the price management page. */
function PriceManagementHeader() {
  return (
    <header className={styles.TribeSubscriptionPriceManagement__header}>
      <h1 className={styles.TribeSubscriptionPriceManagement__title}>
        {PRICE_MANAGEMENT_COPY.title}
      </h1>
      <p className={styles.TribeSubscriptionPriceManagement__description}>
        {PRICE_MANAGEMENT_COPY.description}
      </p>
    </header>
  );
}

/** Button that starts a Mercado Pago connection. */
function ConnectMercadoPagoButton({
  label,
  onConnect,
}: {
  label: string;
  onConnect: () => void;
}) {
  return (
    <Button
      onClick={onConnect}
      type={PRICE_MANAGEMENT_REQUEST.buttonType}
      variant={PRICE_MANAGEMENT_REQUEST.secondaryVariant}
    >
      <CreditCardIcon />
      {label}
    </Button>
  );
}

type AccountSelectorRowProps = {
  accounts: MercadoPagoAccountsModel;
  canManagePrices: boolean;
  isMercadoPagoConnected: boolean;
  onConnect: () => void;
};

/** Account selector, its connection badge and the connect-another action. */
function AccountSelectorRow({
  accounts,
  canManagePrices,
  isMercadoPagoConnected,
  onConnect,
}: AccountSelectorRowProps) {
  const accountSelectId = useId();

  return (
    <div
      className={styles.TribeSubscriptionPriceManagement__accountRow}
    >
      <div
        className={
          styles.TribeSubscriptionPriceManagement__accountRowLeft
        }
      >
        <Select
          disabled={!canManagePrices}
          hideLabel
          id={accountSelectId}
          label={PRICE_MANAGEMENT_COPY.accountSelectorLabel}
          onValueChange={accounts.setSelectedPaymentIntegrationId}
          options={buildAccountSelectOptions(accounts.mercadoPagoAccounts)}
          placeholder={PRICE_MANAGEMENT_COPY.accountSelectorPlaceholder}
          triggerClassName={
            styles.TribeSubscriptionPriceManagement__accountSelect
          }
          value={accounts.effectiveSelectedPaymentIntegrationId}
        />
        {canManagePrices ? (
          <Badge
            icon={
              isMercadoPagoConnected ? (
                <CheckCircle2Icon />
              ) : (
                <RefreshCwIcon />
              )
            }
            tone={
              isMercadoPagoConnected
                ? PRICE_MANAGEMENT_REQUEST.infoBadgeTone
                : PRICE_MANAGEMENT_REQUEST.dangerBadgeTone
            }
          >
            {isMercadoPagoConnected
              ? PRICE_MANAGEMENT_COPY.connectedStatus
              : PRICE_MANAGEMENT_COPY.requiresReconnectionStatus}
          </Badge>
        ) : null}
      </div>
      {canManagePrices ? (
        <ConnectMercadoPagoButton
          label={PRICE_MANAGEMENT_COPY.connectAnotherAccountButton}
          onConnect={onConnect}
        />
      ) : null}
    </div>
  );
}

type AccountAliasEditorProps = {
  accounts: MercadoPagoAccountsModel;
  handlers: ReturnType<typeof createAccountLabelHandlers>;
  isAccountLabelUpdateDisabled: boolean;
  isPriceManagementDisabled: boolean;
  isSavingLabel: boolean;
};

/** Alias input and save button of the selected account. */
function AccountAliasEditor({
  accounts,
  handlers,
  isAccountLabelUpdateDisabled,
  isPriceManagementDisabled,
  isSavingLabel,
}: AccountAliasEditorProps) {
  const accountLabelInputId = useId();
  const { selectedMercadoPagoAccount } = accounts;

  return (
    <div
      className={
        styles.TribeSubscriptionPriceManagement__aliasGroup
      }
    >
      <label
        className={
          styles.TribeSubscriptionPriceManagement__aliasInlineLabel
        }
        htmlFor={accountLabelInputId}
      >
        {PRICE_MANAGEMENT_COPY.accountLabelLabel}
      </label>
      <Input
        className={
          styles.TribeSubscriptionPriceManagement__aliasInput
        }
        disabled={
          !selectedMercadoPagoAccount || isPriceManagementDisabled
        }
        id={accountLabelInputId}
        onChange={(event) => {
          if (!selectedMercadoPagoAccount) {
            return;
          }

          const nextValue = event.currentTarget.value;

          accounts.setAccountLabelDraftByPaymentIntegrationId(
            (currentLabels) => ({
              ...currentLabels,
              [selectedMercadoPagoAccount.id]: nextValue,
            })
          );
        }}
        onKeyDown={handlers.handleAccountLabelKeyDown}
        value={accounts.accountLabel}
      />
      <Button
        disabled={isAccountLabelUpdateDisabled}
        onClick={() => {
          void handlers.handleUpdateMercadoPagoAccountLabel();
        }}
        type={PRICE_MANAGEMENT_REQUEST.buttonType}
        variant={PRICE_MANAGEMENT_REQUEST.secondaryVariant}
      >
        <CheckCircle2Icon />
        {isSavingLabel
          ? PRICE_MANAGEMENT_COPY.accountLabelUpdating
          : PRICE_MANAGEMENT_COPY.accountLabelSaveButton}
      </Button>
    </div>
  );
}

type AccountContextSectionProps = AccountSelectorRowProps &
  Omit<AccountAliasEditorProps, "accounts">;

/** Mercado Pago account context: selector, alias editor or empty state. */
function AccountContextSection({
  accounts,
  canManagePrices,
  isMercadoPagoConnected,
  onConnect,
  ...aliasEditorProps
}: AccountContextSectionProps) {
  return (
    <section
      className={styles.TribeSubscriptionPriceManagement__accountContext}
    >
      <div
        className={
          styles.TribeSubscriptionPriceManagement__accountContextHeader
        }
      >
        <h2 className={styles.TribeSubscriptionPriceManagement__sectionTitle}>
          {PRICE_MANAGEMENT_COPY.accountSectionTitle}
        </h2>
        {!canManagePrices ? (
          <Badge>
            {PRICE_MANAGEMENT_COPY.readonlyBadge}
          </Badge>
        ) : null}
      </div>

      {accounts.mercadoPagoAccounts.length > 0 ? (
        <>
          <AccountSelectorRow
            accounts={accounts}
            canManagePrices={canManagePrices}
            isMercadoPagoConnected={isMercadoPagoConnected}
            onConnect={onConnect}
          />

          {canManagePrices ? (
            <AccountAliasEditor accounts={accounts} {...aliasEditorProps} />
          ) : null}
        </>
      ) : (
        <div
          className={styles.TribeSubscriptionPriceManagement__accountRow}
        >
          <p className={styles.TribeSubscriptionPriceManagement__notice}>
            {PRICE_MANAGEMENT_COPY.accountContextEmptyState}
          </p>
          {canManagePrices ? (
            <ConnectMercadoPagoButton
              label={PRICE_MANAGEMENT_COPY.connectButton}
              onConnect={onConnect}
            />
          ) : null}
        </div>
      )}
    </section>
  );
}

/** Status line announced to assistive technology. */
function PriceStatusMessage({ children }: { children: ReactNode }) {
  return (
    <p
      className={styles.TribeSubscriptionPriceManagement__status}
      role={PRICE_MANAGEMENT_REQUEST.statusRole}
    >
      {children}
    </p>
  );
}

/** Icon mirroring the diagnostics refresh: in progress, failed or updated. */
function DiagnosticsStatusIcon({
  hasError,
  isReconciling,
}: {
  hasError: boolean;
  isReconciling: boolean;
}) {
  if (isReconciling) {
    return (
      <RefreshCwIcon
        aria-hidden
        className={
          styles.TribeSubscriptionPriceManagement__spinningIcon
        }
      />
    );
  }

  return hasError ? (
    <AlertCircleIcon aria-hidden />
  ) : (
    <CheckCircle2Icon aria-hidden />
  );
}

/** Counters of the subscriber diagnostics. */
function SubscriberDiagnosticsList({
  items,
}: {
  items: SubscriberDiagnosticsItem[];
}) {
  return (
    <dl
      className={
        styles.TribeSubscriptionPriceManagement__diagnosticsList
      }
    >
      {items.map((item) => (
        <div
          className={
            styles.TribeSubscriptionPriceManagement__diagnosticsItem
          }
          key={item.label}
        >
          <dt
            className={
              styles.TribeSubscriptionPriceManagement__diagnosticsTerm
            }
          >
            <span
              className={`${styles.TribeSubscriptionPriceManagement__diagnosticsIcon} ${item.tone}`}
              aria-hidden={PRICE_MANAGEMENT_REQUEST.ariaHidden}
            >
              {item.icon}
            </span>
            {item.label}
          </dt>
          <dd
            className={
              styles.TribeSubscriptionPriceManagement__diagnosticsValue
            }
          >
            <AnimatedCount value={item.value} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

type SubscriberDiagnosticsSectionProps = {
  diagnostics: SubscriberDiagnosticsState;
  diagnosticsResult: TribeSubscriberDiagnosticsResult;
  isMercadoPagoConnected: boolean;
  isReconciling: boolean;
  onReconcile: () => void;
  pendingAction: string | null;
  selectedMercadoPagoAccount: TribeMercadoPagoAccountResult | null;
};

/** Title, account and last reconciliation of the diagnostics, with the refresh button. */
function SubscriberDiagnosticsHeader({
  diagnosticsResult,
  isMercadoPagoConnected,
  isReconciling,
  onReconcile,
  pendingAction,
  selectedMercadoPagoAccount,
}: Omit<SubscriberDiagnosticsSectionProps, "diagnostics">) {
  return (
    <div
      className={
        styles.TribeSubscriptionPriceManagement__diagnosticsHeader
      }
    >
      <div>
        <h2
          className={
            styles.TribeSubscriptionPriceManagement__sectionTitle
          }
          id={PRICE_MANAGEMENT_ELEMENT_ID.subscriberDiagnosticsTitle}
        >
          {PRICE_MANAGEMENT_COPY.subscriberDiagnosticsTitle}
        </h2>
        {selectedMercadoPagoAccount ? (
          <p className={styles.TribeSubscriptionPriceManagement__meta}>
            {PRICE_MANAGEMENT_COPY.diagnosticsForAccountPrefix}{" "}
            {selectedMercadoPagoAccount.providerAccountEmail ??
              selectedMercadoPagoAccount.accountLabel}
          </p>
        ) : null}
        {diagnosticsResult.lastReconciledAt ? (
          <p className={styles.TribeSubscriptionPriceManagement__meta}>
            {PRICE_MANAGEMENT_COPY.subscriberDiagnosticsLastReconciledPrefix}{" "}
            {SUBSCRIBER_DIAGNOSTICS_RECONCILED_AT_FORMATTER.format(
              new Date(diagnosticsResult.lastReconciledAt)
            )}
          </p>
        ) : null}
      </div>
      {isMercadoPagoConnected ? (
        <Button
          aria-busy={isReconciling || undefined}
          disabled={Boolean(pendingAction)}
          onClick={onReconcile}
          type={PRICE_MANAGEMENT_REQUEST.buttonType}
          variant={PRICE_MANAGEMENT_REQUEST.secondaryVariant}
        >
          <RefreshCwIcon
            aria-hidden
            className={cn(
              isReconciling &&
                styles.TribeSubscriptionPriceManagement__spinningIcon
            )}
          />
          {PRICE_MANAGEMENT_COPY.subscriberDiagnosticsUpdateButton}
        </Button>
      ) : null}
    </div>
  );
}

/** Aggregate subscriber diagnostics compared with Mercado Pago. */
function SubscriberDiagnosticsSection(props: SubscriberDiagnosticsSectionProps) {
  const { diagnostics, diagnosticsResult, isMercadoPagoConnected, isReconciling } = props;
  const { hasSubscriberDiagnosticsError, subscriberDiagnosticsMessage } = diagnostics;

  return (
    <section
      aria-labelledby={
        PRICE_MANAGEMENT_ELEMENT_ID.subscriberDiagnosticsTitle
      }
      className={styles.TribeSubscriptionPriceManagement__diagnostics}
    >
      <SubscriberDiagnosticsHeader {...props} />
      {subscriberDiagnosticsMessage ? (
        <p
          className={cn(
            styles.TribeSubscriptionPriceManagement__status,
            hasSubscriberDiagnosticsError &&
              styles["TribeSubscriptionPriceManagement__status--error"]
          )}
          role={PRICE_MANAGEMENT_REQUEST.statusRole}
        >
          <DiagnosticsStatusIcon
            hasError={hasSubscriberDiagnosticsError}
            isReconciling={isReconciling}
          />
          {subscriberDiagnosticsMessage}
        </p>
      ) : null}
      {!subscriberDiagnosticsMessage && isMercadoPagoConnected ? (
        <PriceStatusMessage>
          <CheckCircle2Icon />
          {PRICE_MANAGEMENT_COPY.freshSubscriberDiagnosticsStatus}
        </PriceStatusMessage>
      ) : null}
      <SubscriberDiagnosticsList
        items={buildSubscriberDiagnosticsItems(diagnosticsResult)}
      />
    </section>
  );
}

type CreatePriceFormProps = {
  draft: PriceCreateDraft;
  fieldErrors: PriceFieldErrors;
  isCreateTrialFrequencyValid: boolean;
  isCreating: boolean;
  isMercadoPagoConnectionRequired: boolean;
  isPriceManagementDisabled: boolean;
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => Promise<void>;
  setFieldErrors: PriceActionState["setFieldErrors"];
};

/** Days input of the free trial with its suffix and error. */
function CreatePriceTrialField({
  draft,
  isMercadoPagoConnectionRequired,
  onTrialFrequencyEdit,
  trialFrequencyError,
}: {
  draft: PriceCreateDraft;
  isMercadoPagoConnectionRequired: boolean;
  onTrialFrequencyEdit: () => void;
  trialFrequencyError: string | undefined;
}) {
  const trialFrequencyInputId = useId();
  const trialFrequencyErrorId = useId();
  const { isTrialEnabled, trialFrequency } = draft;

  return (
  <div
      className={
        styles.TribeSubscriptionPriceManagement__trialField
      }
      data-disabled={
        !isTrialEnabled || isMercadoPagoConnectionRequired
          ? "true"
          : undefined
      }
    >
      <label
        className={styles.TribeSubscriptionPriceManagement__visuallyHidden}
        htmlFor={trialFrequencyInputId}
      >
        {PRICE_MANAGEMENT_COPY.trialDaysLabel}
      </label>
      <div
        className={
          styles.TribeSubscriptionPriceManagement__trialInputGroup
        }
      >
        <Input
          aria-describedby={
            trialFrequencyError ? trialFrequencyErrorId : undefined
          }
          aria-invalid={trialFrequencyError ? true : undefined}
          className={
            styles.TribeSubscriptionPriceManagement__trialInput
          }
          disabled={isMercadoPagoConnectionRequired || !isTrialEnabled}
          id={trialFrequencyInputId}
          inputMode={PRICE_MANAGEMENT_FORMAT.numericInputMode}
          onChange={(event) => {
            draft.setTrialFrequency(event.currentTarget.value);
            onTrialFrequencyEdit();
          }}
          placeholder={PRICE_MANAGEMENT_COPY.trialDaysPlaceholder}
          value={trialFrequency}
        />
        <span
          aria-hidden={PRICE_MANAGEMENT_REQUEST.ariaHidden}
          className={
            styles.TribeSubscriptionPriceManagement__trialSuffix
          }
        >
          {PRICE_MANAGEMENT_COPY.trialDaysSuffix}
        </span>
      </div>
      {trialFrequencyError ? (
        <span
          className={
            styles.TribeSubscriptionPriceManagement__fieldError
          }
          id={trialFrequencyErrorId}
        >
          {trialFrequencyError}
        </span>
      ) : null}
    </div>
  );
}

/** Free trial toggle and days field of the creation form. */
function CreatePriceTrialBlock({
  draft,
  fieldErrors,
  isMercadoPagoConnectionRequired,
  setFieldErrors,
}: Pick<CreatePriceFormProps, "draft" | "fieldErrors" | "isMercadoPagoConnectionRequired" | "setFieldErrors">) {
  const trialFrequencyToggleId = useId();
  const { isTrialEnabled, trialFrequency } = draft;
  const trialFrequencyError = getCreateTrialFrequencyError({
    fieldError: fieldErrors.trialFrequency,
    isTrialEnabled,
    trialFrequency,
  });
  const clearTrialFrequencyError = () => {
    setFieldErrors((currentFieldErrors) => ({
      ...currentFieldErrors,
      trialFrequency: undefined,
    }));
  };

  return (
    <div
      className={styles.TribeSubscriptionPriceManagement__trialBlock}
    >
      <div
        className={
          styles.TribeSubscriptionPriceManagement__checkboxField
        }
      >
        <Checkbox
          checked={isTrialEnabled}
          disabled={isMercadoPagoConnectionRequired}
          id={trialFrequencyToggleId}
          onCheckedChange={(checked) => {
            const nextIsTrialEnabled = checked === true;

            draft.setIsTrialEnabled(nextIsTrialEnabled);
            clearTrialFrequencyError();

            if (!nextIsTrialEnabled) {
              draft.setTrialFrequency("");
            }
          }}
        />
        <label
          className={styles.TribeSubscriptionPriceManagement__label}
          htmlFor={trialFrequencyToggleId}
        >
          {PRICE_MANAGEMENT_COPY.trialDaysToggleLabel}
        </label>
      </div>
      <CreatePriceTrialField
        draft={draft}
        isMercadoPagoConnectionRequired={isMercadoPagoConnectionRequired}
        onTrialFrequencyEdit={clearTrialFrequencyError}
        trialFrequencyError={trialFrequencyError}
      />
    </div>
  );
}

/** Name, amount and product fields of the creation form. */
function CreatePriceMainFields({
  draft,
  fieldErrors,
  isMercadoPagoConnectionRequired,
  setFieldErrors,
}: Pick<CreatePriceFormProps, "draft" | "fieldErrors" | "isMercadoPagoConnectionRequired" | "setFieldErrors">) {
  const priceProductSelectId = useId();

  return (
    <>
      <div
        className={styles.TribeSubscriptionPriceManagement__formMainRow}
      >
          <Input
            disabled={isMercadoPagoConnectionRequired}
            label={PRICE_MANAGEMENT_COPY.nameLabel}
            onChange={(event) => {
              draft.setName(event.currentTarget.value);
            }}
            placeholder={PRICE_MANAGEMENT_COPY.namePlaceholder}
            value={draft.name}
          />
          <Input
            disabled={isMercadoPagoConnectionRequired}
            error={fieldErrors.amount}
            inputMode={PRICE_MANAGEMENT_FORMAT.inputMode}
            label={PRICE_MANAGEMENT_COPY.amountLabel}
            onChange={(event) => {
              draft.setAmount(event.currentTarget.value);
              setFieldErrors((currentFieldErrors) => ({
                ...currentFieldErrors,
                amount: undefined,
              }));
            }}
            placeholder={PRICE_MANAGEMENT_COPY.amountPlaceholder}
            value={draft.amount}
          />
        </div>

        <Select
          disabled={isMercadoPagoConnectionRequired}
          id={priceProductSelectId}
          label={PRICE_MANAGEMENT_COPY.productLabel}
          onValueChange={(value) => {
            const nextProduct =
              value === PRICE_PRODUCT.academy
                ? PRICE_PRODUCT.academy
                : PRICE_PRODUCT.membership;

            draft.setPriceProduct(nextProduct);

            if (nextProduct === PRICE_PRODUCT.academy) {
              draft.setIsTrialEnabled(false);
              draft.setTrialFrequency("");
            }
          }}
          options={PRICE_PRODUCT_OPTIONS}
          value={draft.priceProduct}
        />
    </>
  );
}

/** Price creation form for leaders. */
function CreatePriceSection(props: CreatePriceFormProps) {
  const { draft, isCreateTrialFrequencyValid, isCreating, isPriceManagementDisabled } = props;

  return (
    <section
      aria-labelledby={PRICE_MANAGEMENT_ELEMENT_ID.createPriceTitle}
      className={styles.TribeSubscriptionPriceManagement__create}
    >
      <h2
        className={styles.TribeSubscriptionPriceManagement__sectionTitle}
        id={PRICE_MANAGEMENT_ELEMENT_ID.createPriceTitle}
      >
        {PRICE_MANAGEMENT_COPY.createSectionTitle}
      </h2>
      <form
        className={styles.TribeSubscriptionPriceManagement__form}
        onSubmit={props.onSubmit}
      >
        <CreatePriceMainFields {...props} />

          {draft.isAcademyPriceSelected ? (
            <p className={styles.TribeSubscriptionPriceManagement__notice}>
              {PRICE_MANAGEMENT_COPY.academyTrialNotice}
            </p>
          ) : (
            <CreatePriceTrialBlock {...props} />
          )}

          <div
            className={styles.TribeSubscriptionPriceManagement__formActions}
          >
            <Button
              aria-busy={isCreating || undefined}
              disabled={
                isPriceManagementDisabled ||
                !draft.name.trim() ||
                !draft.amount.trim() ||
                !isCreateTrialFrequencyValid
              }
              type={PRICE_MANAGEMENT_REQUEST.submitType}
            >
              <PlusIcon aria-hidden />
              {isCreating
                ? PRICE_MANAGEMENT_COPY.createPendingButton
                : PRICE_MANAGEMENT_COPY.createButton}
            </Button>
          </div>
      </form>
    </section>
  );
}

/** Header row of the price table. */
function PriceTableHeader() {
  return (
    <TableHeader>
      <TableRow className={styles.TribeSubscriptionPriceManagement__tableHeaderRow}>
        <TableHead className={styles.TribeSubscriptionPriceManagement__tableHead}>
          {PRICE_MANAGEMENT_COPY.tableNameHeader}
        </TableHead>
        <TableHead className={styles.TribeSubscriptionPriceManagement__tableHead}>
          {PRICE_MANAGEMENT_COPY.amountLabel}
        </TableHead>
        <TableHead className={styles.TribeSubscriptionPriceManagement__tableHead}>
          {PRICE_MANAGEMENT_COPY.tableTrialHeader}
        </TableHead>
        <TableHead className={styles.TribeSubscriptionPriceManagement__tableHead}>
          {PRICE_MANAGEMENT_COPY.tableStatusHeader}
        </TableHead>
        <TableHead className={styles.TribeSubscriptionPriceManagement__tableHead}>
          {PRICE_MANAGEMENT_COPY.tableActionsHeader}
        </TableHead>
      </TableRow>
    </TableHeader>
  );
}

type FreeJoinRowsProps = {
  canManagePrices: boolean;
  handlers: ReturnType<typeof createFreeJoinHandlers>;
  isFreeJoinCurrent: boolean;
  isFreeJoinManagementDisabled: boolean;
  isOpenFreeJoinEnabled: boolean;
  isSavingOpenFreeJoin: boolean;
};

/** Current or active badge of the free join. */
function FreeJoinStatusBadges({ isFreeJoinCurrent }: { isFreeJoinCurrent: boolean }) {
  return (
    <span
      className={styles.TribeSubscriptionPriceManagement__badges}
    >
      {isFreeJoinCurrent ? (
        <Badge
          icon={<CheckCircle2Icon />}
          tone={PRICE_MANAGEMENT_REQUEST.infoBadgeTone}
        >
          {PRICE_MANAGEMENT_COPY.currentBadge}
        </Badge>
      ) : (
        <Badge>
          {PRICE_MANAGEMENT_COPY.activeBadge}
        </Badge>
      )}
    </span>
  );
}

/** Free join row of the price table. */
function FreeJoinPriceRow({
  canManagePrices,
  handlers,
  isFreeJoinCurrent,
  isFreeJoinManagementDisabled,
}: Omit<FreeJoinRowsProps, "isOpenFreeJoinEnabled" | "isSavingOpenFreeJoin">) {
  return (
    <TableRow
      className={styles.TribeSubscriptionPriceManagement__tableRow}
    >
      <TableCell
        className={styles.TribeSubscriptionPriceManagement__nameCell}
      >
        <span
          className={
            styles.TribeSubscriptionPriceManagement__priceIndicator
          }
          aria-hidden={PRICE_MANAGEMENT_REQUEST.ariaHidden}
        />
        <span
          className={styles.TribeSubscriptionPriceManagement__summary}
        >
          <strong
            className={styles.TribeSubscriptionPriceManagement__name}
          >
            {PRICE_MANAGEMENT_COPY.freeJoinName}
          </strong>
          <span
            className={styles.TribeSubscriptionPriceManagement__meta}
          >
            {PRICE_MANAGEMENT_COPY.freeJoinMeta}
          </span>
        </span>
      </TableCell>
      <TableCell
        className={styles.TribeSubscriptionPriceManagement__amount}
      >
        {PRICE_MANAGEMENT_COPY.freeJoinPlaceholder}
      </TableCell>
      <TableCell
        className={styles.TribeSubscriptionPriceManagement__meta}
      >
        {PRICE_MANAGEMENT_COPY.freeJoinPlaceholder}
      </TableCell>
      <TableCell>
        <FreeJoinStatusBadges isFreeJoinCurrent={isFreeJoinCurrent} />
      </TableCell>
      <TableCell>
        {canManagePrices ? (
          <div
            className={
              styles.TribeSubscriptionPriceManagement__actions
            }
          >
            <Button
              disabled={isFreeJoinManagementDisabled}
              onClick={() => {
                void handlers.handleMakeFreeJoinCurrent();
              }}
              type={PRICE_MANAGEMENT_REQUEST.buttonType}
              variant={PRICE_MANAGEMENT_REQUEST.secondaryVariant}
            >
              <StarIcon />
              {PRICE_MANAGEMENT_COPY.makeCurrentButton}
            </Button>
          </div>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

/** Free join rows: the free price and, for leaders, the tokenless join switch. */
function FreeJoinRows(props: FreeJoinRowsProps) {
  const { handlers, isFreeJoinCurrent, isOpenFreeJoinEnabled, isSavingOpenFreeJoin } = props;

  return (
    <>
      <FreeJoinPriceRow {...props} />
      {props.canManagePrices ? (
        <TableRow
          className={styles.TribeSubscriptionPriceManagement__tableRow}
        >
          <TableCell
            colSpan={PRICE_MANAGEMENT_REQUEST.tableColumnCount}
          >
            <div
              className={
                styles.TribeSubscriptionPriceManagement__openFreeJoin
              }
            >
              <label
                className={
                  styles.TribeSubscriptionPriceManagement__openFreeJoinLabel
                }
              >
                <Switch
                  checked={isOpenFreeJoinEnabled}
                  disabled={!isFreeJoinCurrent || isSavingOpenFreeJoin}
                  onCheckedChange={(checked) => {
                    void handlers.handleToggleOpenFreeJoin(checked);
                  }}
                />
                {PRICE_MANAGEMENT_COPY.openFreeJoinLabel}
              </label>
              <span
                className={
                  styles.TribeSubscriptionPriceManagement__meta
                }
              >
                {PRICE_MANAGEMENT_COPY.openFreeJoinHint}
              </span>
            </div>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

/** Name, member count and fresh provider count of a price. */
function PriceSummaryCell({
  price,
  providerSubscriberCount,
}: {
  price: TribeSubscriptionPriceResult;
  providerSubscriberCount: number | undefined;
}) {
  return (
    <TableCell className={styles.TribeSubscriptionPriceManagement__nameCell}>
      <span
        className={
          styles.TribeSubscriptionPriceManagement__priceIndicator
        }
        aria-hidden={PRICE_MANAGEMENT_REQUEST.ariaHidden}
      />
      <span className={styles.TribeSubscriptionPriceManagement__summary}>
        <strong
          className={styles.TribeSubscriptionPriceManagement__name}
        >
          {price.name}
        </strong>
        <span className={styles.TribeSubscriptionPriceManagement__meta}>
          {formatCountLabel(
            price.activeSubscribersCount,
            PRICE_MANAGEMENT_COPY.associatedMembersSingularSuffix,
            PRICE_MANAGEMENT_COPY.associatedMembersPluralSuffix
          )}
        </span>
        {providerSubscriberCount !== undefined ? (
          <span
            className={cn(
              styles.TribeSubscriptionPriceManagement__meta,
              styles["TribeSubscriptionPriceManagement__meta--fresh"]
            )}
          >
            {formatCountLabel(
              providerSubscriberCount,
              PRICE_MANAGEMENT_COPY.providerSubscriberMetaSingularSuffix,
              PRICE_MANAGEMENT_COPY.providerSubscribersMetaSuffix
            )}
          </span>
        ) : null}
      </span>
    </TableCell>
  );
}

/** Product, current and status badges of a price. */
function PriceStatusBadges({ price }: { price: TribeSubscriptionPriceResult }) {
  const isCanceled = price.status === PRICE_MANAGEMENT_STATUS.canceled;
  const isPaused = price.status === PRICE_MANAGEMENT_STATUS.paused;

  return (
    <span className={styles.TribeSubscriptionPriceManagement__badges}>
      {readPriceProduct(price) === PRICE_PRODUCT.academy ? (
        <Badge>
          {PRICE_MANAGEMENT_COPY.academyBadge}
        </Badge>
      ) : null}
      {price.isCurrent ? (
        <Badge
          className={
            styles.TribeSubscriptionPriceManagement__currentBadge
          }
          icon={<CheckCircle2Icon />}
          tone={PRICE_MANAGEMENT_REQUEST.infoBadgeTone}
        >
          {PRICE_MANAGEMENT_COPY.currentBadge}
        </Badge>
      ) : null}
      {isCanceled ? (
        <Badge tone={PRICE_MANAGEMENT_REQUEST.dangerBadgeTone}>
          {PRICE_MANAGEMENT_COPY.canceledBadge}
        </Badge>
      ) : null}
      {isPaused ? (
        <Badge>
          {PRICE_MANAGEMENT_COPY.pausedBadge}
        </Badge>
      ) : null}
      {!price.isCurrent && !isCanceled && !isPaused ? (
        <Badge>
          {PRICE_MANAGEMENT_COPY.activeBadge}
        </Badge>
      ) : null}
    </span>
  );
}

type PriceRowHandlers = ReturnType<typeof createPriceLifecycleHandlers> &
  ReturnType<typeof createPriceVerificationHandlers> &
  ReturnType<typeof createPriceEditHandlers>;

type PriceRowProps = {
  actions: PriceActionState;
  canManagePrices: boolean;
  handlers: PriceRowHandlers;
  isPriceManagementDisabled: boolean;
  price: TribeSubscriptionPriceResult;
  providerSubscriberCount: number | undefined;
};

/** Provider verification button whose icon spins while its request runs. */
function VerifyPriceButton({
  disabled,
  isVerifying,
  label,
  onVerify,
}: {
  disabled: boolean;
  isVerifying: boolean;
  label: string;
  onVerify: () => void;
}) {
  return (
    <Button
      disabled={disabled}
      onClick={onVerify}
      type={PRICE_MANAGEMENT_REQUEST.buttonType}
      variant={PRICE_MANAGEMENT_REQUEST.secondaryVariant}
    >
      <RefreshCwIcon
        aria-hidden
        className={cn(
          isVerifying &&
            styles.TribeSubscriptionPriceManagement__spinningIcon
        )}
      />
      {label}
    </Button>
  );
}

/** Button that opens the inline editor of a price. */
function EditPriceButton({
  actions,
  handlers,
  isPriceManagementDisabled,
  price,
}: Omit<PriceRowProps, "canManagePrices" | "providerSubscriberCount">) {
  return (
    <Button
      aria-expanded={(actions.editingPrice?.id ?? null) === price.id}
      disabled={isPriceManagementDisabled}
      onClick={() => {
        handlers.handleStartEditingPrice(price);
      }}
      ref={actions.bindEditButton(price.id)}
      type={PRICE_MANAGEMENT_REQUEST.buttonType}
      variant={PRICE_MANAGEMENT_REQUEST.secondaryVariant}
    >
      <PencilIcon />
      {PRICE_MANAGEMENT_COPY.editButton}
    </Button>
  );
}

/** Edit, make current, delete and provider verification actions of a price. */
function PriceRowActions({
  actions,
  handlers,
  isPriceManagementDisabled,
  price,
}: Omit<PriceRowProps, "canManagePrices" | "providerSubscriberCount">) {
  const { pendingAction } = actions;
  const isCanceled = price.status === PRICE_MANAGEMENT_STATUS.canceled;
  const isPaused = price.status === PRICE_MANAGEMENT_STATUS.paused;

  return (
    <div className={styles.TribeSubscriptionPriceManagement__actions}>
      {!isCanceled && !isPaused ? (
        <EditPriceButton
          actions={actions}
          handlers={handlers}
          isPriceManagementDisabled={isPriceManagementDisabled}
          price={price}
        />
      ) : null}
      <Button
        disabled={
          isPriceManagementDisabled ||
          price.isCurrent ||
          isCanceled ||
          isPaused
        }
        onClick={() => {
          void handlers.handleMakeCurrent(price);
        }}
        type={PRICE_MANAGEMENT_REQUEST.buttonType}
        variant={PRICE_MANAGEMENT_REQUEST.secondaryVariant}
      >
        <StarIcon />
        {PRICE_MANAGEMENT_COPY.makeCurrentButton}
      </Button>
      <Button
        disabled={isPriceManagementDisabled || !isCanceled}
        onClick={() => {
          void handlers.handleDeletePrice(price);
        }}
        type={PRICE_MANAGEMENT_REQUEST.buttonType}
        variant={PRICE_MANAGEMENT_REQUEST.secondaryVariant}
      >
        <Trash2Icon />
        {PRICE_MANAGEMENT_COPY.removeButton}
      </Button>
      <VerifyPriceButton
        disabled={isPriceManagementDisabled || isCanceled}
        isVerifying={
          pendingAction ===
          PRICE_MANAGEMENT_COPY.verifyProviderPlanButton + price.id
        }
        label={PRICE_MANAGEMENT_COPY.verifyProviderPlanButton}
        onVerify={() => {
          void handlers.handleVerifyProviderPlan(price);
        }}
      />
      <VerifyPriceButton
        disabled={
          isPriceManagementDisabled ||
          (isCanceled && price.activeSubscribersCount === 0)
        }
        isVerifying={
          pendingAction ===
          PRICE_MANAGEMENT_COPY.verifyProviderSubscribersButton + price.id
        }
        label={PRICE_MANAGEMENT_COPY.verifyProviderSubscribersButton}
        onVerify={() => {
          void handlers.handleVerifyProviderSubscribers(price);
        }}
      />
    </div>
  );
}

/** Save and cancel buttons of the inline price editor. */
function PriceEditActions({
  editingPrice,
  isPriceManagementDisabled,
  isSaving,
  onCancel,
  onKeyDown,
}: {
  editingPrice: EditingPrice;
  isPriceManagementDisabled: boolean;
  isSaving: boolean;
  onCancel: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}) {
  return (
    <div className={styles.TribeSubscriptionPriceManagement__actions}>
      <Button
        aria-busy={isSaving || undefined}
        disabled={
          isPriceManagementDisabled ||
          !editingPrice.name.trim() ||
          !editingPrice.amount.trim() ||
          !isEditingTrialFrequencyValid(editingPrice)
        }
        onKeyDown={onKeyDown}
        type={PRICE_MANAGEMENT_REQUEST.submitType}
      >
        <CheckCircle2Icon />
        {PRICE_MANAGEMENT_COPY.saveEditButton}
      </Button>
      <Button
        onClick={onCancel}
        onKeyDown={onKeyDown}
        type={PRICE_MANAGEMENT_REQUEST.buttonType}
        variant={PRICE_MANAGEMENT_REQUEST.secondaryVariant}
      >
        {PRICE_MANAGEMENT_COPY.cancelEditButton}
      </Button>
    </div>
  );
}

/** Inline editor row of the price being edited. */
function PriceEditRow({
  actions,
  editingPrice,
  handlers,
  isPriceManagementDisabled,
  price,
}: Omit<PriceRowProps, "canManagePrices" | "providerSubscriberCount"> & {
  editingPrice: EditingPrice;
}) {
  const { fieldErrors, pendingAction } = actions;
  const { updateEditingPrice } = handlers;
  // Escape closes the editor from any of its controls unless a save runs.
  const handleEditorKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === PRICE_MANAGEMENT_REQUEST.escapeKey && !pendingAction) {
      event.preventDefault();
      actions.closePriceEditor(price.id);
    }
  };

  return (
    <TableRow className={styles.TribeSubscriptionPriceManagement__editRow}>
      <TableCell colSpan={PRICE_MANAGEMENT_REQUEST.tableColumnCount}>
        <form
          className={styles.TribeSubscriptionPriceManagement__editForm}
          onSubmit={handlers.handleUpdatePrice}
        >
          <Input
            id={`${price.id}${PRICE_MANAGEMENT_EDIT_FIELD_ID_SUFFIX.name}`}
            label={PRICE_MANAGEMENT_COPY.editNameLabel}
            onChange={(event) => {
              updateEditingPrice({
                name: event.currentTarget.value,
              });
            }}
            onKeyDown={handleEditorKeyDown}
            ref={focusElementOnMount}
            value={editingPrice.name}
          />
          <Input
            error={fieldErrors.amount}
            id={`${price.id}${PRICE_MANAGEMENT_EDIT_FIELD_ID_SUFFIX.amount}`}
            inputMode={PRICE_MANAGEMENT_FORMAT.inputMode}
            label={PRICE_MANAGEMENT_COPY.editAmountLabel}
            onChange={(event) => {
              updateEditingPrice({
                amount: event.currentTarget.value,
              });
            }}
            onKeyDown={handleEditorKeyDown}
            value={editingPrice.amount}
          />
          <Input
            error={getEditingTrialFrequencyError(editingPrice, fieldErrors.trialFrequency)}
            id={`${price.id}${PRICE_MANAGEMENT_EDIT_FIELD_ID_SUFFIX.trialFrequency}`}
            inputMode={PRICE_MANAGEMENT_FORMAT.numericInputMode}
            label={PRICE_MANAGEMENT_COPY.trialDaysLabel}
            onChange={(event) => {
              updateEditingPrice({
                trialFrequency: event.currentTarget.value,
                trialFrequencyType:
                  PRICE_MANAGEMENT_FORMAT.trialFrequencyType,
              });
            }}
            onKeyDown={handleEditorKeyDown}
            value={editingPrice.trialFrequency}
          />
          <PriceEditActions
            editingPrice={editingPrice}
            isPriceManagementDisabled={isPriceManagementDisabled}
            isSaving={pendingAction === PRICE_MANAGEMENT_COPY.saveEditButton + price.id}
            onCancel={() => {
              actions.closePriceEditor(price.id);
            }}
            onKeyDown={handleEditorKeyDown}
          />
        </form>
      </TableCell>
    </TableRow>
  );
}

/** Table row of one price and, while it is edited, its inline editor. */
function PriceRow(props: PriceRowProps) {
  const { actions, canManagePrices, price, providerSubscriberCount } = props;
  const { editingPrice } = actions;

  return (
    <>
      <TableRow className={styles.TribeSubscriptionPriceManagement__tableRow}>
        <PriceSummaryCell
          price={price}
          providerSubscriberCount={providerSubscriberCount}
        />
        <TableCell className={styles.TribeSubscriptionPriceManagement__amount}>
          {formatAmount(price.amountCents)}
        </TableCell>
        <TableCell className={styles.TribeSubscriptionPriceManagement__meta}>
          {formatTrialPeriod(price)}
        </TableCell>
        <TableCell>
          <PriceStatusBadges price={price} />
        </TableCell>
        <TableCell>
          {canManagePrices ? <PriceRowActions {...props} /> : null}
        </TableCell>
      </TableRow>
      {editingPrice?.id === price.id ? (
        <PriceEditRow {...props} editingPrice={editingPrice} />
      ) : null}
    </>
  );
}

/** Help note about how prices work. */
function PricesHelp() {
  return (
    <section className={styles.TribeSubscriptionPriceManagement__help}>
      <span
        className={styles.TribeSubscriptionPriceManagement__helpIcon}
        aria-hidden={PRICE_MANAGEMENT_REQUEST.ariaHidden}
      >
        <InfoIcon />
      </span>
      <div>
        <h2 className={styles.TribeSubscriptionPriceManagement__helpTitle}>
          {PRICE_MANAGEMENT_COPY.pricesHelpTitle}
        </h2>
        <p className={styles.TribeSubscriptionPriceManagement__helpText}>
          {PRICE_MANAGEMENT_COPY.pricesHelpDescription}
        </p>
      </div>
    </section>
  );
}

/**
 * Starts the Mercado Pago connection, through the injected navigation when
 * provided, and decides once on load whether it starts automatically.
 *
 * @param options - Navigation override and the auto connect inputs.
 * @returns Connection starters and the load-time auto connect decision.
 */
function useMercadoPagoConnectionStart({
  freeJoinIsCurrent,
  navigateToMercadoPagoConnection,
  shouldAutoConnectMercadoPago,
}: Pick<TribeSubscriptionPriceManagementProps, "freeJoinIsCurrent" | "navigateToMercadoPagoConnection"> & {
  shouldAutoConnectMercadoPago: boolean;
}) {
  const hasStartedMercadoPagoConnection = useRef(false);
  const [shouldAutoConnectMercadoPagoOnLoad] = useState(
    () => shouldAutoConnectMercadoPago && freeJoinIsCurrent
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
  const startMercadoPagoConnectionOnce = useCallback(
    (connectionEndpoint: string) => {
      if (hasStartedMercadoPagoConnection.current) {
        return;
      }

      hasStartedMercadoPagoConnection.current = true;
      startMercadoPagoConnection(connectionEndpoint);
    },
    [startMercadoPagoConnection]
  );

  return { shouldAutoConnectMercadoPagoOnLoad, startMercadoPagoConnection, startMercadoPagoConnectionOnce };
}

/**
 * Tokenless free join switch state.
 *
 * @param initialOpenFreeJoinEnabled - Saved switch value.
 * @returns Switch value, its saving state and their setters.
 */
function useOpenFreeJoinState(initialOpenFreeJoinEnabled: boolean) {
  const [isOpenFreeJoinEnabled, setIsOpenFreeJoinEnabled] = useState(
    initialOpenFreeJoinEnabled
  );
  const [isSavingOpenFreeJoin, setIsSavingOpenFreeJoin] = useState(false);

  return { isOpenFreeJoinEnabled, isSavingOpenFreeJoin, setIsOpenFreeJoinEnabled, setIsSavingOpenFreeJoin };
}

/**
 * Visible prices for the selected account, newest first.
 *
 * @param priceItems - All prices of the tribe.
 * @param selectedPaymentIntegrationId - Selected account, if any.
 * @returns Sorted visible prices.
 */
function selectVisiblePrices(
  priceItems: TribeSubscriptionPriceResult[],
  selectedPaymentIntegrationId: string
): TribeSubscriptionPriceResult[] {
  const visiblePrices = selectedPaymentIntegrationId
    ? priceItems.filter(
        (price) =>
          !price.paymentIntegrationId ||
          price.paymentIntegrationId === selectedPaymentIntegrationId
      )
    : priceItems;

  return visiblePrices.toSorted(compareNewestPriceFirst);
}

type PriceManagementGuardInput = {
  accounts: MercadoPagoAccountsModel;
  canManagePrices: boolean;
  isMercadoPagoConnected: boolean;
  isVerifyingProviderPlans: boolean;
  pendingAction: string | null;
};

/**
 * Whether price actions are blocked by a connection or account requirement.
 *
 * @param input - Permissions, connection and the accounts model.
 * @returns Connection and account selection requirements.
 */
function getPriceManagementRequirements({
  accounts,
  canManagePrices,
  isMercadoPagoConnected,
}: Omit<PriceManagementGuardInput, "isVerifyingProviderPlans" | "pendingAction">) {
  const isMercadoPagoConnectionRequired =
    canManagePrices && !isMercadoPagoConnected;
  const isPaymentIntegrationSelectionRequired =
    canManagePrices &&
    isMercadoPagoConnected &&
    accounts.mercadoPagoAccounts.length > 0 &&
    !accounts.effectiveSelectedPaymentIntegrationId;

  return { isMercadoPagoConnectionRequired, isPaymentIntegrationSelectionRequired };
}

/**
 * Disabled states of the price management controls.
 *
 * @param input - Permissions, pending work and the accounts model.
 * @returns Requirements and disabled flags.
 */
function getPriceManagementGuards(input: PriceManagementGuardInput) {
  const requirements = getPriceManagementRequirements(input);
  const { selectedMercadoPagoAccount } = input.accounts;
  const trimmedAccountLabel = input.accounts.accountLabel.trim();
  const isPriceManagementDisabled =
    Boolean(input.pendingAction) ||
    input.isVerifyingProviderPlans ||
    requirements.isMercadoPagoConnectionRequired ||
    requirements.isPaymentIntegrationSelectionRequired;
  const isAccountLabelUpdateDisabled =
    isPriceManagementDisabled ||
    !selectedMercadoPagoAccount ||
    !trimmedAccountLabel ||
    trimmedAccountLabel === selectedMercadoPagoAccount.accountLabel;

  return { ...requirements, isAccountLabelUpdateDisabled, isPriceManagementDisabled };
}

/**
 * State of the price management page: prices, accounts, the creation draft,
 * the inline editor, provider verification and diagnostics.
 *
 * @param props - Component props.
 * @returns Page state and its setters.
 */
function usePriceManagementState(props: TribeSubscriptionPriceManagementProps) {
  const { availableMercadoPagoAccounts = EMPTY_MERCADO_PAGO_ACCOUNTS, canManagePrices, isMercadoPagoConnected, prices, tribeSlug } = props;
  const [priceItems, setPriceItems] = useState(prices);
  const [isFreeJoinCurrent, setIsFreeJoinCurrent] =
    useState(props.freeJoinIsCurrent);
  const openFreeJoin = useOpenFreeJoinState(props.openFreeJoinEnabled);
  const accounts = useMercadoPagoAccounts(availableMercadoPagoAccounts);
  const draft = usePriceCreateDraft();
  const actions = usePriceActionState();
  const diagnostics = useSubscriberDiagnosticsState(props.subscriberDiagnostics);
  const linkedDeletion = useLinkedInvitationsDeletion({ setPriceItems, tribeSlug });
  const connection = useMercadoPagoConnectionStart({
    freeJoinIsCurrent: props.freeJoinIsCurrent,
    navigateToMercadoPagoConnection: props.navigateToMercadoPagoConnection,
    shouldAutoConnectMercadoPago: props.shouldAutoConnectMercadoPago ?? true,
  });
  const verification = useProviderPlanVerification({ canManagePrices, isMercadoPagoConnected, priceCount: prices.length, setIsFreeJoinCurrent, setPriceItems, tribeSlug });
  const sortedPrices = useMemo(
    () => selectVisiblePrices(priceItems, accounts.effectiveSelectedPaymentIntegrationId),
    [accounts.effectiveSelectedPaymentIntegrationId, priceItems]
  );
  /**
   * Applies one price mutation response to the local list.
   *
   * @param price - Mutated price returned by the API.
   * @returns Void.
   */
  const applyPriceMutationResponse = useCallback(
    (price: TribeSubscriptionPriceResult) => {
      setPriceItems((currentPrices) => applyPriceToList(currentPrices, price));
    },
    []
  );

  return { accounts, actions, applyPriceMutationResponse, connection, diagnostics, draft, isFreeJoinCurrent, linkedDeletion, openFreeJoin, priceItems, setIsFreeJoinCurrent, setPriceItems, sortedPrices, verification };
}

type PriceManagementState = ReturnType<typeof usePriceManagementState>;

/**
 * Builds the event handlers of the price management page.
 *
 * @param state - Page state.
 * @param props - Component props.
 * @param guards - Disabled states of the controls.
 * @returns Handlers grouped by section.
 */
function createPriceManagementHandlers(
  state: PriceManagementState,
  props: TribeSubscriptionPriceManagementProps,
  guards: ReturnType<typeof getPriceManagementGuards>
) {
  const { accounts, actions, applyPriceMutationResponse, setIsFreeJoinCurrent, setPriceItems } = state;
  const { tribeSlug } = props;
  const { effectiveSelectedPaymentIntegrationId } = accounts;
  const isSelectedAccountMismatch = (price: TribeSubscriptionPriceResult) =>
    Boolean(
      effectiveSelectedPaymentIntegrationId &&
        price.paymentIntegrationId &&
        price.paymentIntegrationId !== effectiveSelectedPaymentIntegrationId
    );
  const rowActionOptions: PriceRowActionOptions = {
    applyPriceMutationResponse,
    applyProviderPlanVerificationResponse:
      state.verification.applyProviderPlanVerificationResponse,
    isSelectedAccountMismatch,
    setIsFreeJoinCurrent,
    setLinkedInvitationsDeletion: state.linkedDeletion.setLinkedInvitationsDeletion,
    setPendingAction: actions.setPendingAction,
    setPriceItems,
    tribeSlug,
  };

  return {
    accountLabel: createAccountLabelHandlers({ accounts, isAccountLabelUpdateDisabled: guards.isAccountLabelUpdateDisabled, setPendingAction: actions.setPendingAction, setPriceItems, tribeSlug }),
    createPrice: createCreatePriceHandler({
      actions,
      applyPriceMutationResponse,
      draft: state.draft,
      effectiveSelectedPaymentIntegrationId,
      isBlocked: guards.isMercadoPagoConnectionRequired || guards.isPaymentIntegrationSelectionRequired,
      isCreateTrialFrequencyValid: !state.draft.isTrialEnabled || isValidDayTrialFrequency(state.draft.trialFrequency),
      tribeSlug,
    }),
    freeJoin: createFreeJoinHandlers({ ...state.openFreeJoin, setIsFreeJoinCurrent, setPendingAction: actions.setPendingAction, setPriceItems, tribeSlug }),
    reconcileDiagnostics: createReconcileSubscriberDiagnosticsHandler({ diagnostics: state.diagnostics, setPendingAction: actions.setPendingAction, tribeSlug }),
    rows: {
      ...createPriceLifecycleHandlers(rowActionOptions),
      ...createPriceVerificationHandlers(rowActionOptions),
      ...createPriceEditHandlers({ actions, applyPriceMutationResponse, isSelectedAccountMismatch, tribeSlug }),
    },
  };
}

/** Connection, verification and Mercado Pago requirement status lines. */
function PriceManagementStatusMessages({
  isMercadoPagoConnectionRequired,
  providerVerificationMessage,
  shouldStartAutomatically,
  statusMessage,
}: {
  isMercadoPagoConnectionRequired: boolean;
  providerVerificationMessage: string | null;
  shouldStartAutomatically: boolean;
  statusMessage: string | null | undefined;
}) {
  return (
    <>
      {statusMessage ? (
        <PriceStatusMessage>{statusMessage}</PriceStatusMessage>
      ) : null}

      {providerVerificationMessage ? (
        <PriceStatusMessage>{providerVerificationMessage}</PriceStatusMessage>
      ) : null}

      {isMercadoPagoConnectionRequired ? (
        <PriceStatusMessage>
          {shouldStartAutomatically
            ? PRICE_MANAGEMENT_COPY.disconnectedNotice
            : PRICE_MANAGEMENT_COPY.disconnectedFreeJoinNotice}
        </PriceStatusMessage>
      ) : null}
    </>
  );
}

type PriceManagementViewProps = {
  guards: ReturnType<typeof getPriceManagementGuards>;
  handlers: ReturnType<typeof createPriceManagementHandlers>;
  props: TribeSubscriptionPriceManagementProps;
  state: PriceManagementState;
};

/** Account context, status lines and subscriber diagnostics. */
function PriceManagementOverview({ guards, handlers, props, state }: PriceManagementViewProps) {
  const { accounts, actions, connection, diagnostics } = state;
  const { canManagePrices, isMercadoPagoConnected, tribeSlug } = props;
  const mercadoPagoConnectionEndpoint = buildMercadoPagoConnectionEndpoint(tribeSlug);
  const shouldStartAutomatically =
    guards.isMercadoPagoConnectionRequired && connection.shouldAutoConnectMercadoPagoOnLoad;
  const { subscriberDiagnosticsResult } = diagnostics;

  return (
    <>
      {shouldStartAutomatically ? (
        <MercadoPagoAutoConnect
          connectionEndpoint={mercadoPagoConnectionEndpoint}
          onStart={connection.startMercadoPagoConnectionOnce}
        />
      ) : null}
      <AccountContextSection
        accounts={accounts}
        canManagePrices={canManagePrices}
        handlers={handlers.accountLabel}
        isAccountLabelUpdateDisabled={guards.isAccountLabelUpdateDisabled}
        isMercadoPagoConnected={isMercadoPagoConnected}
        isPriceManagementDisabled={guards.isPriceManagementDisabled}
        isSavingLabel={actions.pendingAction === PRICE_MANAGEMENT_COPY.accountLabelSaveButton}
        onConnect={() => {
          connection.startMercadoPagoConnection(mercadoPagoConnectionEndpoint);
        }}
      />

      <Separator />

      <PriceManagementStatusMessages
        isMercadoPagoConnectionRequired={guards.isMercadoPagoConnectionRequired}
        providerVerificationMessage={state.verification.providerVerificationMessage}
        shouldStartAutomatically={shouldStartAutomatically}
        statusMessage={props.statusMessage}
      />

      {canManagePrices && subscriberDiagnosticsResult ? (
        <SubscriberDiagnosticsSection
          diagnostics={diagnostics}
          diagnosticsResult={subscriberDiagnosticsResult}
          isMercadoPagoConnected={isMercadoPagoConnected}
          isReconciling={actions.pendingAction === PRICE_MANAGEMENT_COPY.subscriberDiagnosticsUpdateButton}
          onReconcile={() => {
            void handlers.reconcileDiagnostics();
          }}
          pendingAction={actions.pendingAction}
          selectedMercadoPagoAccount={accounts.selectedMercadoPagoAccount}
        />
      ) : null}
    </>
  );
}

/** Free join and price rows with their actions and inline editor. */
function PriceTable({ guards, handlers, props, state }: PriceManagementViewProps) {
  const { actions, isFreeJoinCurrent } = state;
  const { canManagePrices } = props;

  return (
    <Table
      aria-label={PRICE_MANAGEMENT_COPY.priceListLabel}
      className={styles.TribeSubscriptionPriceManagement__table}
    >
      <PriceTableHeader />
      <TableBody>
        <FreeJoinRows
          canManagePrices={canManagePrices}
          handlers={handlers.freeJoin}
          isFreeJoinCurrent={isFreeJoinCurrent}
          isFreeJoinManagementDisabled={
            Boolean(actions.pendingAction) || state.verification.isVerifyingProviderPlans || isFreeJoinCurrent
          }
          isOpenFreeJoinEnabled={state.openFreeJoin.isOpenFreeJoinEnabled}
          isSavingOpenFreeJoin={state.openFreeJoin.isSavingOpenFreeJoin}
        />
        {state.sortedPrices.map((price) => (
          <PriceRow
            actions={actions}
            canManagePrices={canManagePrices}
            handlers={handlers.rows}
            isPriceManagementDisabled={guards.isPriceManagementDisabled}
            key={price.id}
            price={price}
            providerSubscriberCount={state.verification.providerSubscriberCountsByPriceId[price.id]}
          />
        ))}
      </TableBody>
    </Table>
  );
}

/** Price creation form for leaders, or the read-only notice for guardians. */
function PriceCreation({ guards, handlers, props, state }: PriceManagementViewProps) {
  const { actions, draft } = state;

  if (!props.canManagePrices) {
    return (
      <p className={styles.TribeSubscriptionPriceManagement__notice}>
        {PRICE_MANAGEMENT_COPY.guardianNotice}
      </p>
    );
  }

  return (
    <CreatePriceSection
      draft={draft}
      fieldErrors={actions.fieldErrors}
      isCreateTrialFrequencyValid={!draft.isTrialEnabled || isValidDayTrialFrequency(draft.trialFrequency)}
      isCreating={actions.pendingAction === PRICE_MANAGEMENT_COPY.createButton}
      isMercadoPagoConnectionRequired={guards.isMercadoPagoConnectionRequired}
      isPriceManagementDisabled={guards.isPriceManagementDisabled}
      onSubmit={handlers.createPrice}
      setFieldErrors={actions.setFieldErrors}
    />
  );
}

/**
 * Renders the subscription prices of a tribe: the Mercado Pago account
 * context, subscriber diagnostics, price creation and the price list.
 */
export function TribeSubscriptionPriceManagement(
  props: TribeSubscriptionPriceManagementProps
) {
  const state = usePriceManagementState(props);
  const { linkedDeletion } = state;
  const guards = getPriceManagementGuards({
    accounts: state.accounts,
    canManagePrices: props.canManagePrices,
    isMercadoPagoConnected: props.isMercadoPagoConnected,
    isVerifyingProviderPlans: state.verification.isVerifyingProviderPlans,
    pendingAction: state.actions.pendingAction,
  });
  const handlers = createPriceManagementHandlers(state, props, guards);
  const viewProps = { guards, handlers, props, state };

  return (
    <section className={styles.TribeSubscriptionPriceManagement}>
      <PriceManagementHeader />

      <Separator />

      <PriceManagementOverview {...viewProps} />

      <Separator />

      <PriceCreation {...viewProps} />

      <Separator />

      <PriceTable {...viewProps} />

      <Separator />

      <PricesHelp />
      <LinkedInvitationsDeletionDialog
        invitations={linkedDeletion.linkedInvitationsDeletion?.invitations ?? []}
        isSubmitting={linkedDeletion.isSubmittingLinkedInvitationsDeletion}
        onCancel={linkedDeletion.handleCancelLinkedInvitationsDeletion}
        onConfirm={(selections) => {
          void linkedDeletion.handleConfirmLinkedInvitationsDeletion(selections);
        }}
        open={linkedDeletion.linkedInvitationsDeletion !== null}
        targetPriceOptions={resolveLinkedInvitationTargetPrices(
          state.priceItems,
          linkedDeletion.linkedInvitationsDeletion?.priceId
        )}
      />
    </section>
  );
}

function resolveLinkedInvitationTargetPrices(
  priceItems: TribeSubscriptionPriceResult[],
  priceUnderDeletionId: string | undefined
): LinkedInvitationsDialogTargetPrice[] {
  if (!priceUnderDeletionId) {
    return [];
  }

  return priceItems
    .filter(
      (price) =>
        price.id !== priceUnderDeletionId && price.status === PRICE_STATUS_ACTIVE
    )
    .map((price) => ({
      amountCents: price.amountCents,
      id: price.id,
      name: price.name,
    }));
}
