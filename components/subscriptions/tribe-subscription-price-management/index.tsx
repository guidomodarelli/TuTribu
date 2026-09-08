"use client";

/**
 * Renders tribe subscription price management for leaders and guardians.
 *
 * @module tribe-subscription-price-management
 */

import {
  FormEvent,
  Fragment,
  KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
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
import { toast, Badge, Button, Checkbox, Input, Separator, Switch, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "beez-ui";









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
  trialDaysPlaceholder: "7",
  trialDaysRangeError: "La prueba gratis debe ser de entre 1 y 14 días.",
  trialDaySuffix: "día",
  trialEmptyLabel: "Sin prueba gratis",
  trialDaysSuffix: "días",
  trialMonthSuffix: "mes",
  trialMonthsSuffix: "meses",
  providerSubscribersMetaSuffix: "suscriptores vigentes en Mercado Pago",
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
  destructiveBadgeVariant: "destructive",
  enterKey: "Enter",
  jsonContentType: "application/json",
  postMethod: "POST",
  patchMethod: "PATCH",
  putMethod: "PUT",
  pricesProperty: "prices",
  submitType: "submit",
  outlineVariant: "outline",
  readonlyBadgeVariant: "secondary",
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
  ) as Promise<SubscriberDiagnosticsReconciliationResponse>;
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
  availableMercadoPagoAccounts = EMPTY_MERCADO_PAGO_ACCOUNTS,
  canManagePrices,
  freeJoinIsCurrent,
  isMercadoPagoConnected,
  openFreeJoinEnabled: initialOpenFreeJoinEnabled,
  navigateToMercadoPagoConnection,
  prices,
  shouldAutoConnectMercadoPago = true,
  subscriberDiagnostics,
  statusMessage,
  tribeSlug,
}: TribeSubscriptionPriceManagementProps) {
  const [priceItems, setPriceItems] = useState(prices);
  const [
    accountLabelDraftByPaymentIntegrationId,
    setAccountLabelDraftByPaymentIntegrationId,
  ] = useState<Record<string, string>>({});
  const [
    accountLabelOverrideByPaymentIntegrationId,
    setAccountLabelOverrideByPaymentIntegrationId,
  ] = useState<Record<string, string>>({});
  const [linkedInvitationsDeletion, setLinkedInvitationsDeletion] = useState<{
    invitations: TribeInvitationListItemResult[];
    priceId: string;
  } | null>(null);
  const [
    isSubmittingLinkedInvitationsDeletion,
    setIsSubmittingLinkedInvitationsDeletion,
  ] = useState(false);
  const [isFreeJoinCurrent, setIsFreeJoinCurrent] =
    useState(freeJoinIsCurrent);
  const [isOpenFreeJoinEnabled, setIsOpenFreeJoinEnabled] = useState(
    initialOpenFreeJoinEnabled
  );
  const [isSavingOpenFreeJoin, setIsSavingOpenFreeJoin] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [isTrialEnabled, setIsTrialEnabled] = useState(false);
  const [trialFrequency, setTrialFrequency] = useState("");
  const [selectedPaymentIntegrationId, setSelectedPaymentIntegrationId] =
    useState(() => availableMercadoPagoAccounts[0]?.id ?? "");
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
  const [subscriberDiagnosticsResult, setSubscriberDiagnosticsResult] =
    useState<TribeSubscriberDiagnosticsResult | null>(
      subscriberDiagnostics ?? null
    );
  const [subscriberDiagnosticsMessage, setSubscriberDiagnosticsMessage] =
    useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const hasStartedMercadoPagoConnection = useRef(false);
  const [shouldAutoConnectMercadoPagoOnLoad] = useState(
    () => shouldAutoConnectMercadoPago && freeJoinIsCurrent
  );
  const accountSelectId = useId();
  const accountLabelInputId = useId();
  const nameInputId = useId();
  const amountInputId = useId();
  const trialFrequencyToggleId = useId();
  const trialFrequencyInputId = useId();
  const amountErrorId = useId();
  const trialFrequencyErrorId = useId();
  const editAmountErrorId = useId();
  const editTrialFrequencyErrorId = useId();
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
  const sortedPrices = useMemo(() => {
    const visiblePrices = effectiveSelectedPaymentIntegrationId
      ? priceItems.filter(
          (price) =>
            !price.paymentIntegrationId ||
            price.paymentIntegrationId === effectiveSelectedPaymentIntegrationId
        )
      : priceItems;

    return visiblePrices.toSorted((firstPrice, secondPrice) =>
      firstPrice.createdAt < secondPrice.createdAt ? 1 : -1
    );
  }, [effectiveSelectedPaymentIntegrationId, priceItems]);
  const isMercadoPagoConnectionRequired =
    canManagePrices && !isMercadoPagoConnected;
  const isPaymentIntegrationSelectionRequired =
    canManagePrices &&
    isMercadoPagoConnected &&
    mercadoPagoAccounts.length > 0 &&
    !effectiveSelectedPaymentIntegrationId;
  const isPriceManagementDisabled =
    Boolean(pendingAction) ||
    isVerifyingProviderPlans ||
    isMercadoPagoConnectionRequired ||
    isPaymentIntegrationSelectionRequired;
  const accountLabel =
    (selectedMercadoPagoAccount
      ? accountLabelDraftByPaymentIntegrationId[selectedMercadoPagoAccount.id]
      : undefined) ??
    selectedMercadoPagoAccount?.accountLabel ??
    "";
  const trimmedAccountLabel = accountLabel.trim();
  const isAccountLabelUpdateDisabled =
    isPriceManagementDisabled ||
    !selectedMercadoPagoAccount ||
    !trimmedAccountLabel ||
    trimmedAccountLabel === selectedMercadoPagoAccount.accountLabel;
  const isFreeJoinManagementDisabled =
    Boolean(pendingAction) || isVerifyingProviderPlans || isFreeJoinCurrent;
  const shouldStartMercadoPagoConnectionAutomatically =
    isMercadoPagoConnectionRequired && shouldAutoConnectMercadoPagoOnLoad;
  const shouldShowSubscriberDiagnostics =
    canManagePrices && Boolean(subscriberDiagnosticsResult);
  const mercadoPagoConnectionStatusLabel = isMercadoPagoConnected
    ? PRICE_MANAGEMENT_COPY.connectedStatus
    : PRICE_MANAGEMENT_COPY.requiresReconnectionStatus;
  const mercadoPagoConnectionEndpoint = buildMercadoPagoConnectionEndpoint(
    tribeSlug
  );
  const trialFrequencyError = getCreateTrialFrequencyError({
    fieldError: fieldErrors.trialFrequency,
    isTrialEnabled,
    trialFrequency,
  });
  const isCreateTrialFrequencyValid =
    !isTrialEnabled || isValidDayTrialFrequency(trialFrequency);
  const editTrialFrequencyError = editingPrice
    ? getEditTrialFrequencyError({
        fieldError: fieldErrors.trialFrequency,
        originalTrialFrequency: editingPrice.originalTrialFrequency,
        originalTrialFrequencyType: editingPrice.originalTrialFrequencyType,
        trialFrequency: editingPrice.trialFrequency,
        trialFrequencyType: editingPrice.trialFrequencyType,
      })
    : undefined;
  const isEditTrialFrequencyValid =
    !editingPrice ||
    !editingPrice.trialFrequency.trim() ||
    editingPrice.trialFrequencyType !==
      PRICE_MANAGEMENT_FORMAT.trialFrequencyType ||
    isValidDayTrialFrequency(editingPrice.trialFrequency) ||
    (editingPrice.trialFrequency.trim() ===
      editingPrice.originalTrialFrequency &&
      editingPrice.trialFrequencyType ===
        editingPrice.originalTrialFrequencyType);
  const subscriberDiagnosticsItems = subscriberDiagnosticsResult
    ? [
        {
          icon: <UsersRoundIcon />,
          label: PRICE_MANAGEMENT_COPY.localActiveSubscribersLabel,
          tone: styles.TribeSubscriptionPriceManagement__diagnosticsIconBlue,
          value: subscriberDiagnosticsResult.localActiveSubscribersCount,
        },
        {
          icon: <CheckCircle2Icon />,
          label: PRICE_MANAGEMENT_COPY.mercadoPagoAuthorizedSubscribersLabel,
          tone: styles.TribeSubscriptionPriceManagement__diagnosticsIconGreen,
          value:
            subscriberDiagnosticsResult.mercadoPagoAuthorizedSubscribersCount,
        },
        {
          icon: <Clock3Icon />,
          label: PRICE_MANAGEMENT_COPY.mercadoPagoPendingSubscribersLabel,
          tone: styles.TribeSubscriptionPriceManagement__diagnosticsIconOrange,
          value: subscriberDiagnosticsResult.mercadoPagoPendingSubscribersCount,
        },
        {
          icon: <PauseCircleIcon />,
          label: PRICE_MANAGEMENT_COPY.mercadoPagoPausedSubscribersLabel,
          tone: styles.TribeSubscriptionPriceManagement__diagnosticsIconPurple,
          value: subscriberDiagnosticsResult.mercadoPagoPausedSubscribersCount,
        },
        {
          icon: <UserRoundXIcon />,
          label:
            PRICE_MANAGEMENT_COPY.mercadoPagoCanceledOrMissingSubscribersLabel,
          tone: styles.TribeSubscriptionPriceManagement__diagnosticsIconRed,
          value:
            subscriberDiagnosticsResult.mercadoPagoCanceledOrMissingSubscribersCount,
        },
      ]
    : [];
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
      setPriceItems((currentPrices) =>
        mergePriceListAccountMetadata(response.prices, currentPrices)
      );
      if (typeof response.freeJoinIsCurrent === "boolean") {
        setIsFreeJoinCurrent(response.freeJoinIsCurrent);
      }

      return;
    }

    if (typeof response.freeJoinIsCurrent === "boolean") {
      setIsFreeJoinCurrent(response.freeJoinIsCurrent);
    }

    if (response.price) {
      setPriceItems((currentPrices) =>
        currentPrices.map((price) =>
          price.id === response.price!.id
            ? mergePriceAccountMetadata(response.price!, price)
            : price
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
              currentPrice.id === price.id
                ? mergePriceAccountMetadata(price, currentPrice)
                : currentPrice
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
      !shouldStartMercadoPagoConnectionAutomatically ||
      hasStartedMercadoPagoConnection.current
    ) {
      return;
    }

    hasStartedMercadoPagoConnection.current = true;
    startMercadoPagoConnection(mercadoPagoConnectionEndpoint);
  }, [
    isMercadoPagoConnectionRequired,
    mercadoPagoConnectionEndpoint,
    shouldStartMercadoPagoConnectionAutomatically,
    startMercadoPagoConnection,
  ]);

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

      if (response.account) {
        setAccountLabelOverrideByPaymentIntegrationId((currentLabels) => ({
          ...currentLabels,
          [response.account!.id]: response.account!.accountLabel,
        }));
        setAccountLabelDraftByPaymentIntegrationId((currentLabels) => ({
          ...currentLabels,
          [response.account!.id]: response.account!.accountLabel,
        }));
        setPriceItems((currentPrices) =>
          currentPrices.map((price) =>
            price.paymentIntegrationId === response.account!.id
              ? {
                  ...price,
                  mercadoPagoAccountLabel: response.account!.accountLabel,
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

  /**
   * Creates a new provider-backed price.
   *
   * @param event - Form submission event.
   * @returns Promise resolved after the request completes.
   */
  const handleCreatePrice = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isMercadoPagoConnectionRequired || isPaymentIntegrationSelectionRequired) {
      return;
    }

    if (!isCreateTrialFrequencyValid) {
      setFieldErrors((currentFieldErrors) => ({
        ...currentFieldErrors,
        trialFrequency: PRICE_MANAGEMENT_COPY.trialDaysRangeError,
      }));

      return;
    }

    setPendingAction(PRICE_MANAGEMENT_COPY.createButton);
    setFieldErrors({});

    try {
      const submittedTrialFrequency = isTrialEnabled ? trialFrequency : "";
      const response = await submitPriceRequest(
        buildPricesEndpoint(tribeSlug),
        PRICE_MANAGEMENT_REQUEST.postMethod,
        {
          amount,
          name,
          ...(effectiveSelectedPaymentIntegrationId
            ? { paymentIntegrationId: effectiveSelectedPaymentIntegrationId }
            : {}),
          trialFrequency: submittedTrialFrequency,
          trialFrequencyType: PRICE_MANAGEMENT_FORMAT.trialFrequencyType,
        }
      );

      if (response.price) {
        applyPriceMutationResponse(response.price);
      }

      setAmount("");
      setName("");
      setIsTrialEnabled(false);
      setTrialFrequency("");
      toast.success(response.message ?? PRICE_MANAGEMENT_COPY.createButton);
    } catch (error) {
      if (
        error instanceof PriceRequestError &&
        (error.fieldErrors.amount || error.fieldErrors.trialFrequency)
      ) {
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
    if (isSelectedAccountMismatch(price)) {
      toast.error(PRICE_MANAGEMENT_COPY.accountMismatchMessage);

      return;
    }

    const originalTrialFrequency = price.trial
      ? String(price.trial.frequency)
      : "";
    const originalTrialFrequencyType =
      price.trial?.frequencyType ?? PRICE_MANAGEMENT_FORMAT.trialFrequencyType;

    setEditingPrice({
      amount: formatAmountInputValue(price.amountCents),
      id: price.id,
      name: price.name,
      originalTrialFrequency,
      originalTrialFrequencyType,
      trialFrequency: originalTrialFrequency,
      trialFrequencyType: originalTrialFrequencyType,
    });
    setFieldErrors({});
  };

  const isSelectedAccountMismatch = (price: TribeSubscriptionPriceResult) =>
    Boolean(
      effectiveSelectedPaymentIntegrationId &&
        price.paymentIntegrationId &&
        price.paymentIntegrationId !== effectiveSelectedPaymentIntegrationId
    );

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
      trialFrequency: undefined,
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

    if (!isEditTrialFrequencyValid) {
      setFieldErrors((currentFieldErrors) => ({
        ...currentFieldErrors,
        trialFrequency: PRICE_MANAGEMENT_COPY.trialDaysRangeError,
      }));

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
          trialFrequency: editingPrice.trialFrequency,
          trialFrequencyType: editingPrice.trialFrequencyType,
        }
      );

      if (response.price) {
        applyPriceMutationResponse(response.price);
      }

      setEditingPrice(null);
      toast.success(response.message ?? PRICE_MANAGEMENT_COPY.saveEditButton);
    } catch (error) {
      if (
        error instanceof PriceRequestError &&
        (error.fieldErrors.amount || error.fieldErrors.trialFrequency)
      ) {
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
   * @param price - Price to mark current.
   * @returns Promise resolved after the request completes.
   */
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
      setIsFreeJoinCurrent(false);

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

  const FREE_JOIN_PENDING_ACTION_KEY = "free-join";

  const handleMakeFreeJoinCurrent = async () => {
    setPendingAction(FREE_JOIN_PENDING_ACTION_KEY);

    try {
      const response = await submitPriceRequest(
        PRICE_MANAGEMENT_ROUTE.apiTribes +
          tribeSlug +
          PRICE_MANAGEMENT_ROUTE.freeJoinMakeCurrentSegment,
        PRICE_MANAGEMENT_REQUEST.postMethod
      );

      setIsFreeJoinCurrent(true);
      setPriceItems((currentPrices) =>
        currentPrices.map((price) =>
          price.isCurrent ? { ...price, isCurrent: false } : price
        )
      );

      toast.success(response.message ?? PRICE_MANAGEMENT_COPY.freeJoinSuccess);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : PRICE_MANAGEMENT_COPY.fallbackFreeJoinError
      );
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
    const previousValue = isOpenFreeJoinEnabled;

    setIsOpenFreeJoinEnabled(enabled);
    setIsSavingOpenFreeJoin(true);

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
      setIsOpenFreeJoinEnabled(previousValue);
      toast.error(
        error instanceof Error
          ? error.message
          : PRICE_MANAGEMENT_COPY.openFreeJoinFallbackError
      );
    } finally {
      setIsSavingOpenFreeJoin(false);
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
      if (response.deletedPriceId) {
        setPriceItems((currentPrices) =>
          currentPrices.filter((price) => price.id !== response.deletedPriceId)
        );
      }
      toast.success(response.message ?? PRICE_MANAGEMENT_COPY.removeButton);
    } catch (error) {
      if (
        error instanceof PriceRequestError &&
        error.status === PRICE_DELETION_STATUS.hasLinkedInvitations &&
        Array.isArray(error.linkedInvitations)
      ) {
        setLinkedInvitationsDeletion({
          invitations: error.linkedInvitations,
          priceId: price.id,
        });
        setPendingAction(null);
        return;
      }

      toast.error(
        error instanceof Error
          ? error.message
          : PRICE_MANAGEMENT_COPY.fallbackDeleteError
      );
    } finally {
      setPendingAction((current) => (current === price.id ? null : current));
    }
  };

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
        { invitationActions: selections } as unknown as Record<string, string>
      );

      if (response.deletedPriceId) {
        setPriceItems((currentPrices) =>
          currentPrices.filter((price) => price.id !== response.deletedPriceId)
        );
      }

      toast.success(response.message ?? PRICE_MANAGEMENT_COPY.removeButton);
      setLinkedInvitationsDeletion(null);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : PRICE_MANAGEMENT_COPY.fallbackDeleteError
      );
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

  /**
   * Verifies one price provider plan and removes it locally when missing.
   *
   * @param price - Price whose provider plan should be verified.
   * @returns Promise resolved after the request completes.
   */
  const handleVerifyProviderPlan = async (price: TribeSubscriptionPriceResult) => {
    if (isSelectedAccountMismatch(price)) {
      toast.error(PRICE_MANAGEMENT_COPY.accountMismatchMessage);

      return;
    }

    setPendingAction(PRICE_MANAGEMENT_COPY.verifyProviderPlanButton + price.id);

    try {
      const response =
        await submitProviderPlanVerificationRequest<ProviderPlanVerificationResponse>(
          buildProviderPlanVerificationEndpoint(tribeSlug, price.id)
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
   * @param price - Price whose subscribers should be verified.
   * @returns Promise resolved after the request completes.
   */
  const handleVerifyProviderSubscribers = async (
    price: TribeSubscriptionPriceResult
  ) => {
    if (isSelectedAccountMismatch(price)) {
      toast.error(PRICE_MANAGEMENT_COPY.accountMismatchMessage);

      return;
    }

    setPendingAction(
      PRICE_MANAGEMENT_COPY.verifyProviderSubscribersButton + price.id
    );

    try {
      const response =
        await submitProviderPlanVerificationRequest<ProviderPlanVerificationResponse>(
          buildProviderSubscribersVerificationEndpoint(tribeSlug, price.id)
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

  /**
   * Reconciles aggregate subscriber diagnostics with Mercado Pago.
   *
   * @returns Promise resolved after diagnostics state is refreshed.
   */
  const handleReconcileSubscriberDiagnostics = async () => {
    setPendingAction(PRICE_MANAGEMENT_COPY.subscriberDiagnosticsUpdateButton);
    setSubscriberDiagnosticsMessage(
      PRICE_MANAGEMENT_COPY.subscriberDiagnosticsUpdating
    );

    try {
      const response = await submitSubscriberDiagnosticsReconciliationRequest(
        tribeSlug
      );

      if (response.diagnostics) {
        setSubscriberDiagnosticsResult(response.diagnostics);
      }

      setSubscriberDiagnosticsMessage(response.message ?? null);
      toast.success(
        response.message ??
          PRICE_MANAGEMENT_COPY.subscriberDiagnosticsUpdateButton
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : PRICE_MANAGEMENT_COPY.fallbackSubscriberDiagnosticsError;

      setSubscriberDiagnosticsMessage(message);
      toast.error(message);
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <section className={styles.TribeSubscriptionPriceManagement}>
      <header className={styles.TribeSubscriptionPriceManagement__header}>
        <h1 className={styles.TribeSubscriptionPriceManagement__title}>
          {PRICE_MANAGEMENT_COPY.title}
        </h1>
        <p className={styles.TribeSubscriptionPriceManagement__description}>
          {PRICE_MANAGEMENT_COPY.description}
        </p>
      </header>

      <Separator />

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
            <Badge variant={PRICE_MANAGEMENT_REQUEST.readonlyBadgeVariant}>
              {PRICE_MANAGEMENT_COPY.readonlyBadge}
            </Badge>
          ) : null}
        </div>

        {mercadoPagoAccounts.length > 0 ? (
          <>
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
                  onValueChange={setSelectedPaymentIntegrationId}
                  value={effectiveSelectedPaymentIntegrationId}
                >
                  <SelectTrigger
                    aria-label={PRICE_MANAGEMENT_COPY.accountSelectorLabel}
                    className={
                      styles.TribeSubscriptionPriceManagement__accountSelect
                    }
                    id={accountSelectId}
                  >
                    <SelectValue
                      placeholder={
                        PRICE_MANAGEMENT_COPY.accountSelectorPlaceholder
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {mercadoPagoAccounts.map((account) => (
                      <SelectItem
                        disabled={
                          account.status !==
                          MERCADO_PAGO_CONNECTION_STATUS.connected
                        }
                        key={account.id}
                        value={account.id}
                      >
                        {account.providerAccountEmail ?? account.accountLabel}
                        {account.status !==
                        MERCADO_PAGO_CONNECTION_STATUS.connected
                          ? ` (${PRICE_MANAGEMENT_COPY.requiresReconnectionStatus})`
                          : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {canManagePrices ? (
                  <Badge
                    variant={
                      isMercadoPagoConnected
                        ? undefined
                        : PRICE_MANAGEMENT_REQUEST.destructiveBadgeVariant
                    }
                  >
                    {isMercadoPagoConnected ? (
                      <CheckCircle2Icon />
                    ) : (
                      <RefreshCwIcon />
                    )}
                    {mercadoPagoConnectionStatusLabel}
                  </Badge>
                ) : null}
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
                  {PRICE_MANAGEMENT_COPY.connectAnotherAccountButton}
                </Button>
              ) : null}
            </div>

            {canManagePrices ? (
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

                    setAccountLabelDraftByPaymentIntegrationId(
                      (currentLabels) => ({
                        ...currentLabels,
                        [selectedMercadoPagoAccount.id]: nextValue,
                      })
                    );
                  }}
                  onKeyDown={handleAccountLabelKeyDown}
                  value={accountLabel}
                />
                <Button
                  disabled={isAccountLabelUpdateDisabled}
                  onClick={() => {
                    void handleUpdateMercadoPagoAccountLabel();
                  }}
                  type={PRICE_MANAGEMENT_REQUEST.buttonType}
                  variant={PRICE_MANAGEMENT_REQUEST.outlineVariant}
                >
                  <CheckCircle2Icon />
                  {pendingAction ===
                  PRICE_MANAGEMENT_COPY.accountLabelSaveButton
                    ? PRICE_MANAGEMENT_COPY.accountLabelUpdating
                    : PRICE_MANAGEMENT_COPY.accountLabelSaveButton}
                </Button>
              </div>
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
            ) : null}
          </div>
        )}
      </section>

      <Separator />

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
          {shouldStartMercadoPagoConnectionAutomatically
            ? PRICE_MANAGEMENT_COPY.disconnectedNotice
            : PRICE_MANAGEMENT_COPY.disconnectedFreeJoinNotice}
        </p>
      ) : null}

      {shouldShowSubscriberDiagnostics && subscriberDiagnosticsResult ? (
        <section
          aria-labelledby={
            PRICE_MANAGEMENT_ELEMENT_ID.subscriberDiagnosticsTitle
          }
          className={styles.TribeSubscriptionPriceManagement__diagnostics}
        >
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
              {subscriberDiagnosticsResult.lastReconciledAt ? (
                <p className={styles.TribeSubscriptionPriceManagement__meta}>
                  {PRICE_MANAGEMENT_COPY.subscriberDiagnosticsLastReconciledPrefix}{" "}
                  {SUBSCRIBER_DIAGNOSTICS_RECONCILED_AT_FORMATTER.format(
                    new Date(subscriberDiagnosticsResult.lastReconciledAt)
                  )}
                </p>
              ) : null}
            </div>
            {isMercadoPagoConnected ? (
              <Button
                disabled={Boolean(pendingAction)}
                onClick={() => {
                  void handleReconcileSubscriberDiagnostics();
                }}
                type={PRICE_MANAGEMENT_REQUEST.buttonType}
                variant={PRICE_MANAGEMENT_REQUEST.outlineVariant}
              >
                <RefreshCwIcon />
                {PRICE_MANAGEMENT_COPY.subscriberDiagnosticsUpdateButton}
              </Button>
            ) : null}
          </div>
          {subscriberDiagnosticsMessage ? (
            <p
              className={styles.TribeSubscriptionPriceManagement__status}
              role={PRICE_MANAGEMENT_REQUEST.statusRole}
            >
              <CheckCircle2Icon />
              {subscriberDiagnosticsMessage}
            </p>
          ) : null}
          {!subscriberDiagnosticsMessage && isMercadoPagoConnected ? (
            <p
              className={styles.TribeSubscriptionPriceManagement__status}
              role={PRICE_MANAGEMENT_REQUEST.statusRole}
            >
              <CheckCircle2Icon />
              {PRICE_MANAGEMENT_COPY.freshSubscriberDiagnosticsStatus}
            </p>
          ) : null}
          <dl
            className={
              styles.TribeSubscriptionPriceManagement__diagnosticsList
            }
          >
            {subscriberDiagnosticsItems.map((item) => (
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
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <Separator />

      {canManagePrices ? (
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
            onSubmit={handleCreatePrice}
          >
            <div
              className={styles.TribeSubscriptionPriceManagement__formMainRow}
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
                      className={
                        styles.TribeSubscriptionPriceManagement__fieldError
                      }
                      id={amountErrorId}
                    >
                      {fieldErrors.amount}
                    </span>
                  ) : null}
                </div>
              </div>

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

                      setIsTrialEnabled(nextIsTrialEnabled);
                      setFieldErrors((currentFieldErrors) => ({
                        ...currentFieldErrors,
                        trialFrequency: undefined,
                      }));

                      if (!nextIsTrialEnabled) {
                        setTrialFrequency("");
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
                        setTrialFrequency(event.currentTarget.value);
                        setFieldErrors((currentFieldErrors) => ({
                          ...currentFieldErrors,
                          trialFrequency: undefined,
                        }));
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
              </div>

              <div
                className={styles.TribeSubscriptionPriceManagement__formActions}
              >
                <Button
                  disabled={
                    isPriceManagementDisabled ||
                    !name.trim() ||
                    !amount.trim() ||
                    !isCreateTrialFrequencyValid
                  }
                  type={PRICE_MANAGEMENT_REQUEST.submitType}
                >
                  <PlusIcon />
                  {PRICE_MANAGEMENT_COPY.createButton}
                </Button>
              </div>
          </form>
        </section>
      ) : (
        <p className={styles.TribeSubscriptionPriceManagement__notice}>
          {PRICE_MANAGEMENT_COPY.guardianNotice}
        </p>
      )}

      <Separator />

      <Table
        aria-label={PRICE_MANAGEMENT_COPY.priceListLabel}
        className={styles.TribeSubscriptionPriceManagement__table}
      >
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
        <TableBody>
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
              <span
                className={styles.TribeSubscriptionPriceManagement__badges}
              >
                {isFreeJoinCurrent ? (
                  <Badge>
                    <CheckCircle2Icon />
                    {PRICE_MANAGEMENT_COPY.currentBadge}
                  </Badge>
                ) : (
                  <Badge
                    variant={PRICE_MANAGEMENT_REQUEST.readonlyBadgeVariant}
                  >
                    {PRICE_MANAGEMENT_COPY.activeBadge}
                  </Badge>
                )}
              </span>
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
                      void handleMakeFreeJoinCurrent();
                    }}
                    type={PRICE_MANAGEMENT_REQUEST.buttonType}
                    variant={PRICE_MANAGEMENT_REQUEST.outlineVariant}
                  >
                    <StarIcon />
                    {PRICE_MANAGEMENT_COPY.makeCurrentButton}
                  </Button>
                </div>
              ) : null}
            </TableCell>
          </TableRow>
          {canManagePrices ? (
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
                        void handleToggleOpenFreeJoin(checked === true);
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
          {sortedPrices.map((price) => (
            <Fragment key={price.id}>
              <TableRow className={styles.TribeSubscriptionPriceManagement__tableRow}>
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
                      {price.activeSubscribersCount} miembros asociados
                    </span>
                    {providerSubscriberCountsByPriceId[price.id] !== undefined ? (
                      <span className={styles.TribeSubscriptionPriceManagement__meta}>
                        {providerSubscriberCountsByPriceId[price.id]}{" "}
                        {PRICE_MANAGEMENT_COPY.providerSubscribersMetaSuffix}
                      </span>
                    ) : null}
                  </span>
                </TableCell>
                <TableCell className={styles.TribeSubscriptionPriceManagement__amount}>
                  {formatAmount(price.amountCents)}
                </TableCell>
                <TableCell className={styles.TribeSubscriptionPriceManagement__meta}>
                  {formatTrialPeriod(price)}
                </TableCell>
                <TableCell>
                  <span className={styles.TribeSubscriptionPriceManagement__badges}>
                    {price.isCurrent ? (
                      <Badge>
                        <CheckCircle2Icon />
                        {PRICE_MANAGEMENT_COPY.currentBadge}
                      </Badge>
                    ) : null}
                    {price.status === PRICE_MANAGEMENT_STATUS.canceled ? (
                      <Badge
                        className={styles.TribeSubscriptionPriceManagement__canceledBadge}
                        variant={PRICE_MANAGEMENT_REQUEST.destructiveBadgeVariant}
                      >
                        {PRICE_MANAGEMENT_COPY.canceledBadge}
                      </Badge>
                    ) : null}
                    {price.status === PRICE_MANAGEMENT_STATUS.paused ? (
                      <Badge variant={PRICE_MANAGEMENT_REQUEST.readonlyBadgeVariant}>
                        {PRICE_MANAGEMENT_COPY.pausedBadge}
                      </Badge>
                    ) : null}
                    {!price.isCurrent &&
                    price.status !== PRICE_MANAGEMENT_STATUS.canceled &&
                    price.status !== PRICE_MANAGEMENT_STATUS.paused ? (
                      <Badge variant={PRICE_MANAGEMENT_REQUEST.readonlyBadgeVariant}>
                        {PRICE_MANAGEMENT_COPY.activeBadge}
                      </Badge>
                    ) : null}
                  </span>
                </TableCell>
                <TableCell>
                  {canManagePrices ? (
                    <div className={styles.TribeSubscriptionPriceManagement__actions}>
                      {price.status !== PRICE_MANAGEMENT_STATUS.canceled &&
                      price.status !== PRICE_MANAGEMENT_STATUS.paused ? (
                        <Button
                          disabled={isPriceManagementDisabled}
                          onClick={() => {
                            handleStartEditingPrice(price);
                          }}
                          type={PRICE_MANAGEMENT_REQUEST.buttonType}
                          variant={PRICE_MANAGEMENT_REQUEST.outlineVariant}
                        >
                          <PencilIcon />
                          {PRICE_MANAGEMENT_COPY.editButton}
                        </Button>
                      ) : null}
                      <Button
                        disabled={
                          isPriceManagementDisabled ||
                          price.isCurrent ||
                          price.status === PRICE_MANAGEMENT_STATUS.canceled ||
                          price.status === PRICE_MANAGEMENT_STATUS.paused
                        }
                        onClick={() => {
                          void handleMakeCurrent(price);
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
                          price.status !== PRICE_MANAGEMENT_STATUS.canceled
                        }
                        onClick={() => {
                          void handleDeletePrice(price);
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
                          void handleVerifyProviderPlan(price);
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
                          (price.status === PRICE_MANAGEMENT_STATUS.canceled &&
                            price.activeSubscribersCount === 0)
                        }
                        onClick={() => {
                          void handleVerifyProviderSubscribers(price);
                        }}
                        type={PRICE_MANAGEMENT_REQUEST.buttonType}
                        variant={PRICE_MANAGEMENT_REQUEST.outlineVariant}
                      >
                        <RefreshCwIcon />
                        {PRICE_MANAGEMENT_COPY.verifyProviderSubscribersButton}
                      </Button>
                      </div>
                    ) : null}
                  </TableCell>
                </TableRow>
                {editingPrice?.id === price.id ? (
                  <TableRow className={styles.TribeSubscriptionPriceManagement__editRow}>
                    <TableCell colSpan={PRICE_MANAGEMENT_REQUEST.tableColumnCount}>
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
                        <div className={styles.TribeSubscriptionPriceManagement__field}>
                          <label
                            className={styles.TribeSubscriptionPriceManagement__label}
                            htmlFor={`${price.id}${PRICE_MANAGEMENT_EDIT_FIELD_ID_SUFFIX.trialFrequency}`}
                          >
                            {PRICE_MANAGEMENT_COPY.trialDaysLabel}
                          </label>
                          <Input
                            aria-describedby={
                              editTrialFrequencyError
                                ? editTrialFrequencyErrorId
                                : undefined
                            }
                            aria-invalid={
                              editTrialFrequencyError ? true : undefined
                            }
                            id={`${price.id}${PRICE_MANAGEMENT_EDIT_FIELD_ID_SUFFIX.trialFrequency}`}
                            inputMode={PRICE_MANAGEMENT_FORMAT.numericInputMode}
                            onChange={(event) => {
                              updateEditingPrice({
                                trialFrequency: event.currentTarget.value,
                                trialFrequencyType:
                                  PRICE_MANAGEMENT_FORMAT.trialFrequencyType,
                              });
                            }}
                            value={editingPrice.trialFrequency}
                          />
                          {editTrialFrequencyError ? (
                            <span
                              className={
                                styles.TribeSubscriptionPriceManagement__fieldError
                              }
                              id={editTrialFrequencyErrorId}
                            >
                              {editTrialFrequencyError}
                            </span>
                          ) : null}
                        </div>
                        <div className={styles.TribeSubscriptionPriceManagement__actions}>
                          <Button
                            disabled={
                              isPriceManagementDisabled ||
                              !editingPrice.name.trim() ||
                              !editingPrice.amount.trim() ||
                              !isEditTrialFrequencyValid
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
                    </TableCell>
                  </TableRow>
                ) : null}
              </Fragment>
            ))}
          </TableBody>
        </Table>

      <Separator />

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
      <LinkedInvitationsDeletionDialog
        invitations={linkedInvitationsDeletion?.invitations ?? []}
        isSubmitting={isSubmittingLinkedInvitationsDeletion}
        onCancel={handleCancelLinkedInvitationsDeletion}
        onConfirm={(selections) => {
          void handleConfirmLinkedInvitationsDeletion(selections);
        }}
        open={linkedInvitationsDeletion !== null}
        targetPriceOptions={resolveLinkedInvitationTargetPrices(
          priceItems,
          linkedInvitationsDeletion?.priceId
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
