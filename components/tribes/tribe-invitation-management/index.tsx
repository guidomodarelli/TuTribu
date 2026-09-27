"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckIcon,
  ClipboardIcon,
  LinkIcon,
  MoreHorizontalIcon,
  PencilIcon,
  TagIcon,
  Trash2Icon,
} from "lucide-react";
import { AnimatePresence } from "motion/react";
import { toast, Badge, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, AnimatedCollapse, AnimatedCount, AnimatedListItem, PresenceSwap, copyTextToClipboard, cn } from "beez-ui";

import { BUENOS_AIRES_TIME_ZONE } from "@/src/constants/date-time";
import {
  TRIBE_INVITATION_SUBSCRIPTION_ASSOCIATION_TYPE,
} from "@/src/modules/tribes/constants/tribe-invitations";
import type {
  TribeInvitationAssociatedPlanTrialResult,
  TribeInvitationListItemResult,
  TribeInvitationSubscriptionAssociationResult,
} from "@/src/modules/tribes/application/results/tribe-invitation-result";
import styles from "./styles.module.scss";

const REFERRAL_METADATA_LIMIT = {
  campaignNameMaxLength: 80,
  referrerHandleMaxLength: 80,
} as const;

const INVITATION_MANAGEMENT_COPY = {
  activeCountPluralSuffix: "links activos",
  activeCountSingularSuffix: "link activo",
  associatedPlanLabel: "Plan",
  campaignTooLongError: `La campaña puede tener hasta ${REFERRAL_METADATA_LIMIT.campaignNameMaxLength} caracteres.`,
  channelUpdatedMessage: "Canal de referido actualizado.",
  copiedButton: "Copiado",
  createdCopiedDescription: "El link ya está copiado en tu portapapeles.",
  createdMessage: "Link de invitación creado.",
  createdNotCopiedDescription: "Copialo desde la lista cuando lo necesites.",
  creatingButton: "Creando…",
  planUpdatedMessage: "Plan asociado actualizado.",
  referrerHandleInvalidError:
    "Usá letras, números, puntos, guiones o guion bajo, con @ opcional al inicio.",
  referrerHandleTooLongError: `El referente puede tener hasta ${REFERRAL_METADATA_LIMIT.referrerHandleMaxLength} caracteres.`,
  revokedMessage: "Invitación revocada.",
  revokingButton: "Revocando…",
  savingButton: "Guardando…",
  changePlanButton: "Cambiar plan",
  changePlanDialogDescription:
    "Elegí el plan al que quedará asociado este link. El cambio se aplica de inmediato sin invalidar la invitación.",
  changePlanDialogTitle: "Cambiar plan asociado",
  changePlanSubmit: "Guardar cambios",
  channelDirectLabel: "Directo",
  channelInstagramLabel: "Instagram",
  channelLabel: "Canal",
  channelOtherLabel: "Otro",
  channelPlaceholder: "Elegí un canal...",
  channelTiktokLabel: "TikTok",
  channelWhatsappLabel: "WhatsApp",
  channelYoutubeLabel: "YouTube",
  campaignLabel: "Campaña",
  campaignPlaceholder: "Lanzamiento mayo",
  copiedMessage: "Link copiado.",
  copyButton: "Copiar link",
  createButton: "Crear link",
  createDialogDescription:
    "Elegí a qué plan querés asociar este link antes de generarlo.",
  createDialogTitle: "Nuevo link de invitación",
  createdByFallback: "Otro miembro",
  description:
    "Creá links reutilizables para que nuevas personas entren a la tribu con Google.",
  emptyState: "Todavía no hay invitaciones activas.",
  emptyStateHint:
    "Generá un link, compartilo y cada persona que entre quedará asociada al plan que elijas.",
  editChannelButton: "Editar canal",
  editChannelDialogDescription:
    "Actualizá los datos de medición de este link sin cambiar el plan asociado.",
  editChannelDialogTitle: "Editar canal de referido",
  fallbackCopyError: "No pudimos copiar el link.",
  fallbackCreateError: "No pudimos crear la invitación.",
  fallbackUpdateChannelError: "No pudimos actualizar el canal de referido.",
  fallbackRevokeError: "No pudimos revocar la invitación.",
  fallbackUpdatePlanError: "No pudimos actualizar el plan asociado.",
  freeOptionLabel: "Plan gratuito",
  itemTitle: "Link activo",
  listLabel: "Invitaciones activas",
  missingPlanLabel: "Plan no disponible",
  moreActionsLabel: "Más acciones",
  noTrialLabel: "Sin prueba gratis",
  planSelectorLabel: "Plan asociado",
  planSelectorPlaceholder: "Elegí un plan...",
  referrerHandleLabel: "Referente",
  referrerHandlePlaceholder: "@partner",
  trialDaySuffix: "día gratis",
  trialDaysSuffix: "días gratis",
  trialMonthSuffix: "mes gratis",
  trialMonthsSuffix: "meses gratis",
  unknownAccountLabel: "Cuenta sin alias",
  revokeButton: "Revocar",
  revokeConfirmCancel: "Cancelar",
  revokeConfirmConfirm: "Revocar link",
  revokeConfirmDescription:
    "Si revocás este link, dejará de servir para nuevas personas. Esta acción no se puede deshacer.",
  revokeConfirmTitle: "¿Revocar este link?",
  submitDialogCancel: "Cancelar",
  submitDialogCreate: "Crear link",
  title: "Invitaciones",
  usesCurrentPlanLabel: "Plan actual",
} as const;

const INVITATION_MANAGEMENT_ROUTE = {
  apiTribes: "/api/tribes/",
  invitationsSegment: "/invitations",
  segmentSeparator: "/",
  subscriptionAssociationSegment: "/subscription-association",
} as const;

const INVITATION_MANAGEMENT_REQUEST = {
  buttonType: "button",
  dateStyle: "medium",
  deleteMethod: "DELETE",
  destructiveVariant: "destructive",
  iconSize: "icon",
  jsonContentType: "application/json",
  locale: "es",
  menuAlign: "end",
  outlineVariant: "outline",
  patchMethod: "PATCH",
  postMethod: "POST",
  secondaryVariant: "secondary",
  submitType: "submit",
  timeStyle: "short",
} as const;

const INVITATION_MANAGEMENT_PRICE_FORMAT = {
  currency: "ARS",
  divider: 100,
  maximumFractionDigits: 0,
  style: "currency",
} as const;

const INVITATION_MANAGEMENT_BADGE_TONE = {
  current: "current",
  free: "free",
  missing: "missing",
  specific: "specific",
} as const;

const INVITATION_MANAGEMENT_DIALOG_INPUT_ID = {
  createCampaign: "invitation-create-campaign",
  createChannel: "invitation-create-channel",
  createPlan: "invitation-create-plan",
  createReferrerHandle: "invitation-create-referrer-handle",
  editCampaign: "invitation-edit-campaign",
  editChannel: "invitation-edit-channel",
  editPlan: "invitation-edit-plan",
  editReferrerHandle: "invitation-edit-referrer-handle",
} as const;
const INVITATION_CREATED_AT_FORMATTER = new Intl.DateTimeFormat(
  INVITATION_MANAGEMENT_REQUEST.locale,
  {
    dateStyle: INVITATION_MANAGEMENT_REQUEST.dateStyle,
    timeStyle: INVITATION_MANAGEMENT_REQUEST.timeStyle,
    timeZone: BUENOS_AIRES_TIME_ZONE,
  }
);

const ARS_PRICE_FORMATTER = new Intl.NumberFormat(
  INVITATION_MANAGEMENT_REQUEST.locale,
  {
    currency: INVITATION_MANAGEMENT_PRICE_FORMAT.currency,
    maximumFractionDigits:
      INVITATION_MANAGEMENT_PRICE_FORMAT.maximumFractionDigits,
    style: INVITATION_MANAGEMENT_PRICE_FORMAT.style,
  }
);

const PLAN_SELECTOR_VALUE = {
  current: "current",
  free: "free",
} as const;

const TRIAL_FREQUENCY_TYPE = {
  days: "days",
  months: "months",
} as const;

const ACCOUNT_LABEL_FORMAT = {
  emailPrefix: " (",
  emailSuffix: ")",
} as const;

const INVITATION_CHANNEL = {
  direct: "direct",
  instagram: "instagram",
  other: "other",
  tiktok: "tiktok",
  whatsapp: "whatsapp",
  youtube: "youtube",
} as const;

const INVITATION_CHANNEL_OPTIONS = [
  {
    label: INVITATION_MANAGEMENT_COPY.channelDirectLabel,
    value: INVITATION_CHANNEL.direct,
  },
  {
    label: INVITATION_MANAGEMENT_COPY.channelInstagramLabel,
    value: INVITATION_CHANNEL.instagram,
  },
  {
    label: INVITATION_MANAGEMENT_COPY.channelYoutubeLabel,
    value: INVITATION_CHANNEL.youtube,
  },
  {
    label: INVITATION_MANAGEMENT_COPY.channelTiktokLabel,
    value: INVITATION_CHANNEL.tiktok,
  },
  {
    label: INVITATION_MANAGEMENT_COPY.channelWhatsappLabel,
    value: INVITATION_CHANNEL.whatsapp,
  },
  {
    label: INVITATION_MANAGEMENT_COPY.channelOtherLabel,
    value: INVITATION_CHANNEL.other,
  },
] as const;

const REFERRER_HANDLE_PATTERN = /^@?[A-Za-z0-9._-]+$/;

const TRIAL_PERIOD_FORMAT = {
  frequencyUnitSeparator: " ",
} as const;

const INVITATION_PLAN_LABEL_SEPARATOR = " · ";

/** Pending key reserved for the create mutation; invitation ids are UUIDs, so it never collides. */
const CREATE_MUTATION_PENDING_KEY = "create-invitation";

/** How long a row keeps its "Copiado" confirmation after copying its link. */
const COPY_FEEDBACK_DURATION_MS = 2000;

/** Suffix appended to an input id to build the id of its inline error message. */
const FIELD_ERROR_ID_SUFFIX = "-error";

/** Presence keys for the region that swaps between the list and the empty state. */
const INVITATION_REGION_PRESENCE_KEY = {
  empty: "empty",
  list: "list",
} as const;

/** Presence keys for the copy button label swap. */
const COPY_BUTTON_PRESENCE_KEY = {
  copied: "copied",
  idle: "idle",
} as const;

/** Error whose message is safe to show: it comes from the invitations API or a Spanish fallback. */
class InvitationRequestError extends Error {
  override name = "InvitationRequestError";
}

type AvailablePriceOption = {
  amountCents: number;
  currency: string;
  id: string;
  isCurrent: boolean;
  mercadoPagoAccountEmail: string | null;
  mercadoPagoAccountLabel: string | null;
  name: string;
  trial: TribeInvitationAssociatedPlanTrialResult | null;
};

type InvitationResponse = {
  invitation?: TribeInvitationListItemResult;
  invitationUrl?: string;
  message?: string;
};

type TribeInvitationManagementProps = {
  availablePrices: AvailablePriceOption[];
  canManagePrices: boolean;
  invitations: TribeInvitationListItemResult[];
  tribeSlug: string;
};

function buildInvitationsEndpoint(tribeSlug: string): string {
  return (
    INVITATION_MANAGEMENT_ROUTE.apiTribes +
    tribeSlug +
    INVITATION_MANAGEMENT_ROUTE.invitationsSegment
  );
}

function buildInvitationEndpoint(tribeSlug: string, invitationId: string): string {
  return (
    buildInvitationsEndpoint(tribeSlug) +
    INVITATION_MANAGEMENT_ROUTE.segmentSeparator +
    invitationId
  );
}

function buildInvitationAssociationEndpoint(
  tribeSlug: string,
  invitationId: string
): string {
  return (
    buildInvitationEndpoint(tribeSlug, invitationId) +
    INVITATION_MANAGEMENT_ROUTE.subscriptionAssociationSegment
  );
}

type ReferralMetadataFormState = {
  campaignName: string;
  channel: string;
  referrerHandle: string;
};

const EMPTY_REFERRAL_METADATA_FORM: ReferralMetadataFormState = {
  campaignName: "",
  channel: INVITATION_CHANNEL.direct,
  referrerHandle: "",
};

function buildReferralMetadataFormState(
  invitation: TribeInvitationListItemResult
): ReferralMetadataFormState {
  return {
    campaignName: invitation.campaignName ?? "",
    channel: invitation.channel ?? INVITATION_CHANNEL.direct,
    referrerHandle: invitation.referrerHandle ?? "",
  };
}

function normalizeReferralMetadataForm(
  formState: ReferralMetadataFormState
): {
  campaignName: string | null;
  channel: string | null;
  referrerHandle: string | null;
} {
  return {
    campaignName: formState.campaignName.trim() || null,
    channel: formState.channel || null,
    referrerHandle: formState.referrerHandle.trim() || null,
  };
}

/** Inline validation messages of the referral metadata fields; `null` means the field is valid. */
type ReferralMetadataErrors = {
  campaignName: string | null;
  referrerHandle: string | null;
};

/**
 * Validates the referral metadata form field by field so each message can be
 * rendered next to the input it belongs to.
 * @param formState - Current referral metadata inputs.
 * @returns The message of each invalid field.
 */
function getReferralMetadataErrors(
  formState: ReferralMetadataFormState
): ReferralMetadataErrors {
  const campaignName = formState.campaignName.trim();
  const referrerHandle = formState.referrerHandle.trim();
  let referrerHandleError: string | null = null;

  if (referrerHandle.length > REFERRAL_METADATA_LIMIT.referrerHandleMaxLength) {
    referrerHandleError = INVITATION_MANAGEMENT_COPY.referrerHandleTooLongError;
  } else if (
    referrerHandle.length > 0 &&
    !REFERRER_HANDLE_PATTERN.test(referrerHandle)
  ) {
    referrerHandleError = INVITATION_MANAGEMENT_COPY.referrerHandleInvalidError;
  }

  return {
    campaignName:
      campaignName.length > REFERRAL_METADATA_LIMIT.campaignNameMaxLength
        ? INVITATION_MANAGEMENT_COPY.campaignTooLongError
        : null,
    referrerHandle: referrerHandleError,
  };
}

/**
 * Tells whether any referral metadata field is invalid.
 * @param errors - Result of `getReferralMetadataErrors`.
 * @returns True when at least one field has a message.
 */
function hasReferralMetadataErrors(errors: ReferralMetadataErrors): boolean {
  return Boolean(errors.campaignName || errors.referrerHandle);
}

/**
 * Builds the id of the inline error rendered under an input.
 * @param inputId - Id of the input the error describes.
 * @returns The error element id.
 */
function buildFieldErrorId(inputId: string): string {
  return inputId + FIELD_ERROR_ID_SUFFIX;
}

/**
 * Picks the message to show for a failed mutation: API messages are already
 * safe Spanish copy, anything else (network, parsing, bugs) maps to the fallback.
 * @param error - Caught error.
 * @param fallbackMessage - Operation-specific Spanish fallback.
 * @returns The user-facing message.
 */
function resolveMutationErrorMessage(
  error: unknown,
  fallbackMessage: string
): string {
  return error instanceof InvitationRequestError
    ? error.message
    : fallbackMessage;
}

/**
 * Replaces one invitation of the list with its updated version.
 * @param currentItems - Current invitations.
 * @param updatedInvitation - Invitation returned by the API.
 * @returns The new list.
 */
function replaceInvitation(
  currentItems: TribeInvitationListItemResult[],
  updatedInvitation: TribeInvitationListItemResult
): TribeInvitationListItemResult[] {
  return currentItems.map((invitation) =>
    invitation.id === updatedInvitation.id ? updatedInvitation : invitation
  );
}

function getChannelLabel(channel: string | null): string {
  const channelValue = channel ?? INVITATION_CHANNEL.direct;
  const option = INVITATION_CHANNEL_OPTIONS.find(
    (candidate) => candidate.value === channelValue
  );

  return option?.label ?? INVITATION_MANAGEMENT_COPY.channelDirectLabel;
}

/**
 * Sends an invitation mutation and returns the parsed body.
 * @param url - Invitations API endpoint.
 * @param method - HTTP method.
 * @param fallbackErrorMessage - Spanish message used when the API gives none or the network fails.
 * @param body - Optional JSON payload.
 * @returns The response body of a successful request.
 * @throws {InvitationRequestError} With a user-safe message when the request fails.
 */
async function submitInvitationRequest(
  url: string,
  method: string,
  fallbackErrorMessage: string,
  body?: Record<string, unknown>
): Promise<InvitationResponse> {
  let response: Response;

  try {
    response = await fetch(url, {
      body: body ? JSON.stringify(body) : undefined,
      headers: body
        ? { "Content-Type": INVITATION_MANAGEMENT_REQUEST.jsonContentType }
        : undefined,
      method,
    });
  } catch (networkError) {
    // Browsers report network failures in English ("Failed to fetch", "Load failed").
    throw new InvitationRequestError(fallbackErrorMessage, {
      cause: networkError,
    });
  }

  const responseBody = (await response.json().catch(() => ({}))) as InvitationResponse;

  if (!response.ok) {
    throw new InvitationRequestError(
      responseBody.message ?? fallbackErrorMessage
    );
  }

  return responseBody;
}

function formatCreatedAt(value: string): string {
  return INVITATION_CREATED_AT_FORMATTER.format(new Date(value));
}

function formatPlanAmount(amountCents: number): string {
  return ARS_PRICE_FORMATTER.format(
    amountCents / INVITATION_MANAGEMENT_PRICE_FORMAT.divider
  );
}

function formatMercadoPagoAccountLabel(
  accountLabel: string | null,
  accountEmail: string | null
): string | null {
  const trimmedLabel = accountLabel?.trim() ?? "";
  const trimmedEmail = accountEmail?.trim() ?? "";

  if (trimmedLabel && trimmedEmail) {
    return (
      trimmedLabel +
      ACCOUNT_LABEL_FORMAT.emailPrefix +
      trimmedEmail +
      ACCOUNT_LABEL_FORMAT.emailSuffix
    );
  }

  if (trimmedLabel) {
    return trimmedLabel;
  }

  if (trimmedEmail) {
    return trimmedEmail;
  }

  return null;
}

function formatTrialPeriod(
  trial: TribeInvitationAssociatedPlanTrialResult | null
): string | null {
  if (!trial) {
    return null;
  }

  const isSingular = trial.frequency === 1;
  const unitLabel =
    trial.frequencyType === TRIAL_FREQUENCY_TYPE.months
      ? isSingular
        ? INVITATION_MANAGEMENT_COPY.trialMonthSuffix
        : INVITATION_MANAGEMENT_COPY.trialMonthsSuffix
      : isSingular
      ? INVITATION_MANAGEMENT_COPY.trialDaySuffix
      : INVITATION_MANAGEMENT_COPY.trialDaysSuffix;

  return (
    String(trial.frequency) +
    TRIAL_PERIOD_FORMAT.frequencyUnitSeparator +
    unitLabel
  );
}

type PlanLabelSegmentsInput = {
  accountEmail: string | null;
  accountLabel: string | null;
  amountCents: number;
  name: string;
  trial: TribeInvitationAssociatedPlanTrialResult | null;
};

function buildPlanLabelSegments(input: PlanLabelSegmentsInput): string[] {
  const segments: string[] = [input.name, formatPlanAmount(input.amountCents)];
  const formattedAccount = formatMercadoPagoAccountLabel(
    input.accountLabel,
    input.accountEmail
  );

  if (formattedAccount) {
    segments.push(formattedAccount);
  }

  segments.push(
    formatTrialPeriod(input.trial) ?? INVITATION_MANAGEMENT_COPY.noTrialLabel
  );

  return segments;
}

function buildPriceOptionLabel(price: AvailablePriceOption): string {
  return buildPlanLabelSegments({
    accountEmail: price.mercadoPagoAccountEmail,
    accountLabel: price.mercadoPagoAccountLabel,
    amountCents: price.amountCents,
    name: price.name,
    trial: price.trial,
  }).join(INVITATION_PLAN_LABEL_SEPARATOR);
}

function serializeSelectorValueToAssociation(
  selectorValue: string
): { type: string; priceId?: string } | null {
  if (selectorValue === PLAN_SELECTOR_VALUE.current) {
    return { type: TRIBE_INVITATION_SUBSCRIPTION_ASSOCIATION_TYPE.current };
  }
  if (selectorValue === PLAN_SELECTOR_VALUE.free) {
    return { type: TRIBE_INVITATION_SUBSCRIPTION_ASSOCIATION_TYPE.free };
  }
  if (selectorValue) {
    return {
      priceId: selectorValue,
      type: TRIBE_INVITATION_SUBSCRIPTION_ASSOCIATION_TYPE.specific,
    };
  }

  return null;
}

function serializeAssociationToSelectorValue(
  association: TribeInvitationSubscriptionAssociationResult
): string {
  if (
    association.type ===
    TRIBE_INVITATION_SUBSCRIPTION_ASSOCIATION_TYPE.specific
  ) {
    return association.priceId;
  }

  if (
    association.type === TRIBE_INVITATION_SUBSCRIPTION_ASSOCIATION_TYPE.free
  ) {
    return PLAN_SELECTOR_VALUE.free;
  }

  return PLAN_SELECTOR_VALUE.current;
}

type PlanDescription = {
  segments: string[];
  tone: (typeof INVITATION_MANAGEMENT_BADGE_TONE)[keyof typeof INVITATION_MANAGEMENT_BADGE_TONE];
};

function describeAssociation(
  association: TribeInvitationSubscriptionAssociationResult
): PlanDescription {
  if (
    association.type === TRIBE_INVITATION_SUBSCRIPTION_ASSOCIATION_TYPE.specific
  ) {
    if (!association.plan) {
      return {
        segments: [INVITATION_MANAGEMENT_COPY.missingPlanLabel],
        tone: INVITATION_MANAGEMENT_BADGE_TONE.missing,
      };
    }

    return {
      segments: buildPlanLabelSegments({
        accountEmail: association.plan.mercadoPagoAccountEmail,
        accountLabel: association.plan.mercadoPagoAccountLabel,
        amountCents: association.plan.amountCents,
        name: association.plan.name,
        trial: association.plan.trial,
      }),
      tone: INVITATION_MANAGEMENT_BADGE_TONE.specific,
    };
  }

  if (
    association.type === TRIBE_INVITATION_SUBSCRIPTION_ASSOCIATION_TYPE.free
  ) {
    return {
      segments: [INVITATION_MANAGEMENT_COPY.freeOptionLabel],
      tone: INVITATION_MANAGEMENT_BADGE_TONE.free,
    };
  }

  return {
    segments: [INVITATION_MANAGEMENT_COPY.usesCurrentPlanLabel],
    tone: INVITATION_MANAGEMENT_BADGE_TONE.current,
  };
}

/**
 * Renders the associated plan of an invitation row: a specific plan shows
 * its name followed by the amount, account and trial details, while the
 * generic associations (current, free, missing) render as a single badge.
 */
function InvitationPlanValue({ description }: { description: PlanDescription }) {
  if (description.tone === INVITATION_MANAGEMENT_BADGE_TONE.specific) {
    const [planName, ...planDetails] = description.segments;

    return (
      <>
        <span className={styles.TribeInvitationManagement__planName}>
          {planName}
        </span>
        {planDetails.map((planDetail, planDetailIndex) => (
          <span
            className={styles.TribeInvitationManagement__detailSegment}
            key={`${planDetailIndex}-${planDetail}`}
          >
            {planDetail}
          </span>
        ))}
      </>
    );
  }

  return (
    <Badge
      className={
        description.tone === INVITATION_MANAGEMENT_BADGE_TONE.missing
          ? styles["TribeInvitationManagement__planBadge--missing"]
          : undefined
      }
      variant={
        description.tone === INVITATION_MANAGEMENT_BADGE_TONE.missing
          ? INVITATION_MANAGEMENT_REQUEST.destructiveVariant
          : INVITATION_MANAGEMENT_REQUEST.secondaryVariant
      }
    >
      {description.segments.join(INVITATION_PLAN_LABEL_SEPARATOR)}
    </Badge>
  );
}

type PlanSelectorFieldProps = {
  availablePrices: AvailablePriceOption[];
  canManagePrices: boolean;
  inputId: string;
  onValueChange: (value: string) => void;
  value: string;
};

/**
 * Shared "Plan asociado" selector used by the create and change-plan
 * dialogs. Price-specific options only appear for viewers who can manage
 * prices.
 */
function PlanSelectorField({
  availablePrices,
  canManagePrices,
  inputId,
  onValueChange,
  value,
}: PlanSelectorFieldProps) {
  return (
    <div className={styles.TribeInvitationManagement__field}>
      <label
        className={styles.TribeInvitationManagement__dialogLabel}
        htmlFor={inputId}
      >
        {INVITATION_MANAGEMENT_COPY.planSelectorLabel}
      </label>
      <Select onValueChange={onValueChange} value={value}>
        <SelectTrigger
          className={styles.TribeInvitationManagement__selectTrigger}
          id={inputId}
        >
          <SelectValue
            placeholder={INVITATION_MANAGEMENT_COPY.planSelectorPlaceholder}
          />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={PLAN_SELECTOR_VALUE.current}>
            {INVITATION_MANAGEMENT_COPY.usesCurrentPlanLabel}
          </SelectItem>
          {canManagePrices ? (
            <>
              <SelectItem value={PLAN_SELECTOR_VALUE.free}>
                {INVITATION_MANAGEMENT_COPY.freeOptionLabel}
              </SelectItem>
              {availablePrices.map((price) => (
                <SelectItem key={price.id} value={price.id}>
                  {buildPriceOptionLabel(price)}
                </SelectItem>
              ))}
            </>
          ) : null}
        </SelectContent>
      </Select>
    </div>
  );
}

type InvitationFieldErrorProps = {
  id: string;
  message: string | null;
};

/**
 * Inline validation message that expands under its field and collapses once
 * the value is fixed. The last message is kept while collapsing so the text
 * does not vanish before the height animation ends.
 */
function InvitationFieldError({ id, message }: InvitationFieldErrorProps) {
  const [visibleMessage, setVisibleMessage] = useState(message);

  if (message && message !== visibleMessage) {
    setVisibleMessage(message);
  }

  return (
    <AnimatedCollapse isOpen={Boolean(message)}>
      <p
        className={styles.TribeInvitationManagement__fieldError}
        id={id}
        role="alert"
      >
        {message ?? visibleMessage}
      </p>
    </AnimatedCollapse>
  );
}

type ReferralMetadataFieldsProps = {
  campaignInputId: string;
  channelInputId: string;
  errors: ReferralMetadataErrors;
  formState: ReferralMetadataFormState;
  onChange: (formState: ReferralMetadataFormState) => void;
  referrerHandleInputId: string;
};

/**
 * Shared channel, campaign and referrer inputs used by the create and
 * edit-channel dialogs, with each validation message rendered under the
 * input it belongs to and linked through `aria-describedby`.
 */
function ReferralMetadataFields({
  campaignInputId,
  channelInputId,
  errors,
  formState,
  onChange,
  referrerHandleInputId,
}: ReferralMetadataFieldsProps) {
  const campaignErrorId = buildFieldErrorId(campaignInputId);
  const referrerHandleErrorId = buildFieldErrorId(referrerHandleInputId);

  return (
    <>
      <div className={styles.TribeInvitationManagement__field}>
        <label
          className={styles.TribeInvitationManagement__dialogLabel}
          htmlFor={channelInputId}
        >
          {INVITATION_MANAGEMENT_COPY.channelLabel}
        </label>
        <Select
          onValueChange={(value) => {
            onChange({ ...formState, channel: value });
          }}
          value={formState.channel}
        >
          <SelectTrigger
            className={styles.TribeInvitationManagement__selectTrigger}
            id={channelInputId}
          >
            <SelectValue
              placeholder={INVITATION_MANAGEMENT_COPY.channelPlaceholder}
            />
          </SelectTrigger>
          <SelectContent>
            {INVITATION_CHANNEL_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className={styles.TribeInvitationManagement__field}>
        <label
          className={styles.TribeInvitationManagement__dialogLabel}
          htmlFor={campaignInputId}
        >
          {INVITATION_MANAGEMENT_COPY.campaignLabel}
        </label>
        <Input
          aria-describedby={errors.campaignName ? campaignErrorId : undefined}
          aria-invalid={errors.campaignName ? true : undefined}
          id={campaignInputId}
          maxLength={REFERRAL_METADATA_LIMIT.campaignNameMaxLength}
          onChange={(event) => {
            onChange({ ...formState, campaignName: event.target.value });
          }}
          placeholder={INVITATION_MANAGEMENT_COPY.campaignPlaceholder}
          value={formState.campaignName}
        />
        <InvitationFieldError
          id={campaignErrorId}
          message={errors.campaignName}
        />
      </div>
      <div className={styles.TribeInvitationManagement__field}>
        <label
          className={styles.TribeInvitationManagement__dialogLabel}
          htmlFor={referrerHandleInputId}
        >
          {INVITATION_MANAGEMENT_COPY.referrerHandleLabel}
        </label>
        <Input
          aria-describedby={
            errors.referrerHandle ? referrerHandleErrorId : undefined
          }
          aria-invalid={errors.referrerHandle ? true : undefined}
          id={referrerHandleInputId}
          maxLength={REFERRAL_METADATA_LIMIT.referrerHandleMaxLength}
          onChange={(event) => {
            onChange({ ...formState, referrerHandle: event.target.value });
          }}
          placeholder={INVITATION_MANAGEMENT_COPY.referrerHandlePlaceholder}
          value={formState.referrerHandle}
        />
        <InvitationFieldError
          id={referrerHandleErrorId}
          message={errors.referrerHandle}
        />
      </div>
    </>
  );
}

/**
 * Row that shows the "Copiado" confirmation. A fresh object is stored on every
 * copy so repeated copies of the same row restart the confirmation timer.
 */
type CopyFeedback = {
  invitationId: string;
};

export function TribeInvitationManagement({
  availablePrices,
  canManagePrices,
  invitations,
  tribeSlug,
}: TribeInvitationManagementProps) {
  const [invitationItems, setInvitationItems] = useState(invitations);
  const [pendingInvitationId, setPendingInvitationId] = useState<string | null>(null);
  const [revokeCandidateId, setRevokeCandidateId] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [createSelectorValue, setCreateSelectorValue] = useState<string>("");
  const [createReferralMetadata, setCreateReferralMetadata] =
    useState<ReferralMetadataFormState>(EMPTY_REFERRAL_METADATA_FORM);
  const [editCandidateId, setEditCandidateId] = useState<string | null>(null);
  const [editSelectorValue, setEditSelectorValue] = useState<string>("");
  const [editReferralCandidateId, setEditReferralCandidateId] = useState<
    string | null
  >(null);
  const [editReferralMetadata, setEditReferralMetadata] =
    useState<ReferralMetadataFormState>(EMPTY_REFERRAL_METADATA_FORM);
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedback | null>(null);
  // Synchronous guard: state updates land after the event, so a fast double
  // activation (double click, Enter + click) could otherwise start two mutations.
  const mutationInFlightRef = useRef(false);
  const activeInvitationCount = invitationItems.length;
  const hasActiveInvitations = activeInvitationCount > 0;
  const formattedInvitations = useMemo(
    () =>
      invitationItems.map((invitation) => ({
        ...invitation,
        channelLabel: getChannelLabel(invitation.channel),
        createdAtLabel: formatCreatedAt(invitation.createdAt),
        planDescription: describeAssociation(invitation.subscriptionAssociation),
      })),
    [invitationItems]
  );
  const createInProgress = pendingInvitationId === CREATE_MUTATION_PENDING_KEY;
  const editInProgress =
    editCandidateId !== null && pendingInvitationId === editCandidateId;
  const editReferralInProgress =
    editReferralCandidateId !== null &&
    pendingInvitationId === editReferralCandidateId;
  const revokeInProgress =
    revokeCandidateId !== null && pendingInvitationId === revokeCandidateId;
  const createReferralMetadataErrors = getReferralMetadataErrors(
    createReferralMetadata
  );
  const editReferralMetadataErrors = getReferralMetadataErrors(
    editReferralMetadata
  );

  useEffect(() => {
    if (!copyFeedback) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setCopyFeedback(null);
    }, COPY_FEEDBACK_DURATION_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [copyFeedback]);

  const showCopyFeedback = (invitationId: string) => {
    setCopyFeedback({ invitationId });
  };

  /**
   * Runs one invitation mutation at a time, exposing its pending key to the UI
   * and turning any failure into a safe Spanish toast.
   */
  const runMutation = async (
    pendingKey: string,
    fallbackErrorMessage: string,
    mutation: () => Promise<void>
  ) => {
    if (mutationInFlightRef.current) {
      return;
    }

    mutationInFlightRef.current = true;
    setPendingInvitationId(pendingKey);

    try {
      await mutation();
    } catch (error) {
      toast.error(resolveMutationErrorMessage(error, fallbackErrorMessage));
    } finally {
      mutationInFlightRef.current = false;
      setPendingInvitationId(null);
    }
  };

  const copyInvitationUrl = async (
    invitationId: string,
    invitationUrl: string
  ) => {
    const isCopied = await copyTextToClipboard(invitationUrl);

    if (!isCopied) {
      toast.error(INVITATION_MANAGEMENT_COPY.fallbackCopyError);

      return;
    }

    showCopyFeedback(invitationId);
    toast.success(INVITATION_MANAGEMENT_COPY.copiedMessage);
  };

  const handleSubmitCreate = async () => {
    const subscriptionAssociation =
      serializeSelectorValueToAssociation(createSelectorValue);

    if (
      !subscriptionAssociation ||
      hasReferralMetadataErrors(createReferralMetadataErrors)
    ) {
      return;
    }

    await runMutation(
      CREATE_MUTATION_PENDING_KEY,
      INVITATION_MANAGEMENT_COPY.fallbackCreateError,
      async () => {
        const response = await submitInvitationRequest(
          buildInvitationsEndpoint(tribeSlug),
          INVITATION_MANAGEMENT_REQUEST.postMethod,
          INVITATION_MANAGEMENT_COPY.fallbackCreateError,
          {
            ...normalizeReferralMetadataForm(createReferralMetadata),
            subscriptionAssociation,
          }
        );
        const createdInvitation = response.invitation;

        if (createdInvitation) {
          setInvitationItems((currentItems) => [
            createdInvitation,
            ...currentItems.filter(
              (invitation) => invitation.id !== createdInvitation.id
            ),
          ]);
        }

        // WebKit drops the user activation across the request, so copying can
        // fail here; the new row keeps its own copy button as the fallback.
        const isCopied = response.invitationUrl
          ? await copyTextToClipboard(response.invitationUrl)
          : false;

        if (isCopied && createdInvitation) {
          showCopyFeedback(createdInvitation.id);
        }

        toast.success(
          response.message ?? INVITATION_MANAGEMENT_COPY.createdMessage,
          {
            description: isCopied
              ? INVITATION_MANAGEMENT_COPY.createdCopiedDescription
              : INVITATION_MANAGEMENT_COPY.createdNotCopiedDescription,
          }
        );
        setIsCreateDialogOpen(false);
        setCreateSelectorValue("");
        setCreateReferralMetadata(EMPTY_REFERRAL_METADATA_FORM);
      }
    );
  };

  const handleSubmitReferralEdit = async () => {
    const invitationId = editReferralCandidateId;

    if (
      !invitationId ||
      hasReferralMetadataErrors(editReferralMetadataErrors)
    ) {
      return;
    }

    await runMutation(
      invitationId,
      INVITATION_MANAGEMENT_COPY.fallbackUpdateChannelError,
      async () => {
        const response = await submitInvitationRequest(
          buildInvitationEndpoint(tribeSlug, invitationId),
          INVITATION_MANAGEMENT_REQUEST.patchMethod,
          INVITATION_MANAGEMENT_COPY.fallbackUpdateChannelError,
          normalizeReferralMetadataForm(editReferralMetadata)
        );
        const updatedInvitation = response.invitation;

        if (updatedInvitation) {
          setInvitationItems((currentItems) =>
            replaceInvitation(currentItems, updatedInvitation)
          );
        }

        toast.success(
          response.message ?? INVITATION_MANAGEMENT_COPY.channelUpdatedMessage
        );
        setEditReferralCandidateId(null);
        setEditReferralMetadata(EMPTY_REFERRAL_METADATA_FORM);
      }
    );
  };

  const handleSubmitEdit = async () => {
    const invitationId = editCandidateId;
    const subscriptionAssociation =
      serializeSelectorValueToAssociation(editSelectorValue);

    if (!invitationId || !subscriptionAssociation) {
      return;
    }

    await runMutation(
      invitationId,
      INVITATION_MANAGEMENT_COPY.fallbackUpdatePlanError,
      async () => {
        const response = await submitInvitationRequest(
          buildInvitationAssociationEndpoint(tribeSlug, invitationId),
          INVITATION_MANAGEMENT_REQUEST.patchMethod,
          INVITATION_MANAGEMENT_COPY.fallbackUpdatePlanError,
          { subscriptionAssociation }
        );
        const updatedInvitation = response.invitation;

        if (updatedInvitation) {
          setInvitationItems((currentItems) =>
            replaceInvitation(currentItems, updatedInvitation)
          );
        }

        toast.success(
          response.message ?? INVITATION_MANAGEMENT_COPY.planUpdatedMessage
        );
        setEditCandidateId(null);
        setEditSelectorValue("");
      }
    );
  };

  const handleRevokeInvitation = async (invitationId: string) => {
    await runMutation(
      invitationId,
      INVITATION_MANAGEMENT_COPY.fallbackRevokeError,
      async () => {
        const response = await submitInvitationRequest(
          buildInvitationEndpoint(tribeSlug, invitationId),
          INVITATION_MANAGEMENT_REQUEST.deleteMethod,
          INVITATION_MANAGEMENT_COPY.fallbackRevokeError
        );

        setInvitationItems((currentItems) =>
          currentItems.filter((invitation) => invitation.id !== invitationId)
        );
        toast.success(
          response.message ?? INVITATION_MANAGEMENT_COPY.revokedMessage
        );
        setRevokeCandidateId(null);
      }
    );
  };

  const handleRevokeDialogChange = (open: boolean) => {
    if (open || revokeInProgress) {
      return;
    }

    setRevokeCandidateId(null);
  };

  const handleCreateDialogChange = (open: boolean) => {
    if (createInProgress) {
      return;
    }

    setIsCreateDialogOpen(open);

    if (!open) {
      setCreateSelectorValue("");
      setCreateReferralMetadata(EMPTY_REFERRAL_METADATA_FORM);
    }
  };

  const handleReferralEditDialogChange = (open: boolean) => {
    if (editReferralInProgress) {
      return;
    }

    if (!open) {
      setEditReferralCandidateId(null);
      setEditReferralMetadata(EMPTY_REFERRAL_METADATA_FORM);
    }
  };

  const handleEditDialogChange = (open: boolean) => {
    if (editInProgress) {
      return;
    }

    if (!open) {
      setEditCandidateId(null);
      setEditSelectorValue("");
    }
  };

  const openEditDialog = (invitation: TribeInvitationListItemResult) => {
    setEditCandidateId(invitation.id);
    setEditSelectorValue(
      serializeAssociationToSelectorValue(invitation.subscriptionAssociation)
    );
  };

  const openReferralEditDialog = (invitation: TribeInvitationListItemResult) => {
    setEditReferralCandidateId(invitation.id);
    setEditReferralMetadata(buildReferralMetadataFormState(invitation));
  };

  return (
    <section className={styles.TribeInvitationManagement}>
      <header className={styles.TribeInvitationManagement__header}>
        <div className={styles.TribeInvitationManagement__headingGroup}>
          <h1 className={styles.TribeInvitationManagement__title}>
            {INVITATION_MANAGEMENT_COPY.title}
          </h1>
          <p className={styles.TribeInvitationManagement__description}>
            {INVITATION_MANAGEMENT_COPY.description}
          </p>
        </div>
        <div className={styles.TribeInvitationManagement__headerActions}>
          <Button
            className={styles.TribeInvitationManagement__createButton}
            disabled={Boolean(pendingInvitationId)}
            onClick={() => {
              setIsCreateDialogOpen(true);
            }}
            type={INVITATION_MANAGEMENT_REQUEST.buttonType}
          >
            <LinkIcon />
            {INVITATION_MANAGEMENT_COPY.createButton}
          </Button>
        </div>
      </header>
      <div className={styles.TribeInvitationManagement__region}>
        <PresenceSwap
          presenceKey={
            hasActiveInvitations
              ? INVITATION_REGION_PRESENCE_KEY.list
              : INVITATION_REGION_PRESENCE_KEY.empty
          }
        >
          {hasActiveInvitations ? (
            <div className={styles.TribeInvitationManagement__listRegion}>
              <p className={styles.TribeInvitationManagement__listMeta}>
                <AnimatedCount
                  className={styles.TribeInvitationManagement__listCount}
                  value={activeInvitationCount}
                />{" "}
                {activeInvitationCount === 1
                  ? INVITATION_MANAGEMENT_COPY.activeCountSingularSuffix
                  : INVITATION_MANAGEMENT_COPY.activeCountPluralSuffix}
              </p>
              <ol
                aria-label={INVITATION_MANAGEMENT_COPY.listLabel}
                className={styles.TribeInvitationManagement__list}
              >
                <AnimatePresence initial={false}>
                  {formattedInvitations.map((invitation) => {
                    const isInvitationPending =
                      pendingInvitationId === invitation.id;
                    const isCopied =
                      copyFeedback?.invitationId === invitation.id;

                    return (
                      <AnimatedListItem
                        as="li"
                        className={styles.TribeInvitationManagement__item}
                        key={invitation.id}
                      >
                        <div className={styles.TribeInvitationManagement__itemBody}>
                          <div
                            className={styles.TribeInvitationManagement__itemHeading}
                          >
                            <p className={styles.TribeInvitationManagement__itemTitle}>
                              <span
                                aria-hidden
                                className={styles.TribeInvitationManagement__statusDot}
                              />
                              {INVITATION_MANAGEMENT_COPY.itemTitle}
                            </p>
                            <p className={styles.TribeInvitationManagement__meta}>
                              {invitation.createdByName ??
                                INVITATION_MANAGEMENT_COPY.createdByFallback}{" "}
                              · {invitation.createdAtLabel}
                            </p>
                          </div>
                          <dl className={styles.TribeInvitationManagement__details}>
                            <div className={styles.TribeInvitationManagement__detail}>
                              <dt
                                className={styles.TribeInvitationManagement__detailLabel}
                              >
                                {INVITATION_MANAGEMENT_COPY.associatedPlanLabel}
                              </dt>
                              <dd
                                className={cn(
                                  styles.TribeInvitationManagement__detailValue,
                                  styles["TribeInvitationManagement__detailValue--stacked"]
                                )}
                              >
                                <InvitationPlanValue
                                  description={invitation.planDescription}
                                />
                              </dd>
                            </div>
                            <div className={styles.TribeInvitationManagement__detail}>
                              <dt
                                className={styles.TribeInvitationManagement__detailLabel}
                              >
                                {INVITATION_MANAGEMENT_COPY.channelLabel}
                              </dt>
                              <dd
                                className={styles.TribeInvitationManagement__detailValue}
                              >
                                <Badge
                                  variant={INVITATION_MANAGEMENT_REQUEST.outlineVariant}
                                >
                                  {invitation.channelLabel}
                                </Badge>
                                {invitation.campaignName ? (
                                  <span
                                    className={
                                      styles.TribeInvitationManagement__detailSegment
                                    }
                                  >
                                    {invitation.campaignName}
                                  </span>
                                ) : null}
                                {invitation.referrerHandle ? (
                                  <span
                                    className={
                                      styles.TribeInvitationManagement__detailSegment
                                    }
                                  >
                                    {invitation.referrerHandle}
                                  </span>
                                ) : null}
                              </dd>
                            </div>
                          </dl>
                        </div>
                        <div className={styles.TribeInvitationManagement__itemActions}>
                          {invitation.invitationUrl ? (
                            <Button
                              className={cn(
                                styles.TribeInvitationManagement__copyButton,
                                isCopied &&
                                  styles["TribeInvitationManagement__copyButton--copied"]
                              )}
                              disabled={isInvitationPending}
                              onClick={() => {
                                void copyInvitationUrl(
                                  invitation.id,
                                  invitation.invitationUrl!
                                );
                              }}
                              type={INVITATION_MANAGEMENT_REQUEST.buttonType}
                              variant={INVITATION_MANAGEMENT_REQUEST.outlineVariant}
                            >
                              <PresenceSwap
                                as="span"
                                className={styles.TribeInvitationManagement__copyLabel}
                                mode="popLayout"
                                presenceKey={
                                  isCopied
                                    ? COPY_BUTTON_PRESENCE_KEY.copied
                                    : COPY_BUTTON_PRESENCE_KEY.idle
                                }
                              >
                                {isCopied ? <CheckIcon aria-hidden /> : <ClipboardIcon aria-hidden />}
                                {isCopied
                                  ? INVITATION_MANAGEMENT_COPY.copiedButton
                                  : INVITATION_MANAGEMENT_COPY.copyButton}
                              </PresenceSwap>
                            </Button>
                          ) : null}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                aria-label={INVITATION_MANAGEMENT_COPY.moreActionsLabel}
                                className={styles.TribeInvitationManagement__moreButton}
                                disabled={isInvitationPending}
                                size={INVITATION_MANAGEMENT_REQUEST.iconSize}
                                type={INVITATION_MANAGEMENT_REQUEST.buttonType}
                                variant={INVITATION_MANAGEMENT_REQUEST.outlineVariant}
                              >
                                <MoreHorizontalIcon />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align={INVITATION_MANAGEMENT_REQUEST.menuAlign}
                              className={styles.TribeInvitationManagement__menu}
                            >
                              {canManagePrices ? (
                                <DropdownMenuItem
                                  onSelect={() => {
                                    openEditDialog(invitation);
                                  }}
                                >
                                  <PencilIcon />
                                  {INVITATION_MANAGEMENT_COPY.changePlanButton}
                                </DropdownMenuItem>
                              ) : null}
                              <DropdownMenuItem
                                onSelect={() => {
                                  openReferralEditDialog(invitation);
                                }}
                              >
                                <TagIcon />
                                {INVITATION_MANAGEMENT_COPY.editChannelButton}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onSelect={() => {
                                  setRevokeCandidateId(invitation.id);
                                }}
                                variant={INVITATION_MANAGEMENT_REQUEST.destructiveVariant}
                              >
                                <Trash2Icon />
                                {INVITATION_MANAGEMENT_COPY.revokeButton}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </AnimatedListItem>
                    );
                  })}
                </AnimatePresence>
              </ol>
            </div>
          ) : (
            <div className={styles.TribeInvitationManagement__empty}>
              <p className={styles.TribeInvitationManagement__emptyTitle}>
                {INVITATION_MANAGEMENT_COPY.emptyState}
              </p>
              <p className={styles.TribeInvitationManagement__emptyHint}>
                {INVITATION_MANAGEMENT_COPY.emptyStateHint}
              </p>
            </div>
          )}
        </PresenceSwap>
      </div>
      <Dialog open={isCreateDialogOpen} onOpenChange={handleCreateDialogChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {INVITATION_MANAGEMENT_COPY.createDialogTitle}
            </DialogTitle>
            <DialogDescription>
              {INVITATION_MANAGEMENT_COPY.createDialogDescription}
            </DialogDescription>
          </DialogHeader>
          <form
            className={styles.TribeInvitationManagement__dialogForm}
            onSubmit={(event) => {
              event.preventDefault();
              void handleSubmitCreate();
            }}
          >
            <div className={styles.TribeInvitationManagement__dialogBody}>
              <PlanSelectorField
                availablePrices={availablePrices}
                canManagePrices={canManagePrices}
                inputId={INVITATION_MANAGEMENT_DIALOG_INPUT_ID.createPlan}
                onValueChange={setCreateSelectorValue}
                value={createSelectorValue}
              />
              <ReferralMetadataFields
                campaignInputId={INVITATION_MANAGEMENT_DIALOG_INPUT_ID.createCampaign}
                channelInputId={INVITATION_MANAGEMENT_DIALOG_INPUT_ID.createChannel}
                errors={createReferralMetadataErrors}
                formState={createReferralMetadata}
                onChange={setCreateReferralMetadata}
                referrerHandleInputId={
                  INVITATION_MANAGEMENT_DIALOG_INPUT_ID.createReferrerHandle
                }
              />
            </div>
            <DialogFooter>
              <Button
                disabled={createInProgress}
                onClick={() => {
                  handleCreateDialogChange(false);
                }}
                type={INVITATION_MANAGEMENT_REQUEST.buttonType}
                variant={INVITATION_MANAGEMENT_REQUEST.outlineVariant}
              >
                {INVITATION_MANAGEMENT_COPY.submitDialogCancel}
              </Button>
              <Button
                aria-busy={createInProgress || undefined}
                disabled={
                  createInProgress ||
                  !createSelectorValue ||
                  hasReferralMetadataErrors(createReferralMetadataErrors)
                }
                type={INVITATION_MANAGEMENT_REQUEST.submitType}
              >
                <LinkIcon />
                {createInProgress
                  ? INVITATION_MANAGEMENT_COPY.creatingButton
                  : INVITATION_MANAGEMENT_COPY.submitDialogCreate}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={editCandidateId !== null}
        onOpenChange={handleEditDialogChange}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {INVITATION_MANAGEMENT_COPY.changePlanDialogTitle}
            </DialogTitle>
            <DialogDescription>
              {INVITATION_MANAGEMENT_COPY.changePlanDialogDescription}
            </DialogDescription>
          </DialogHeader>
          <form
            className={styles.TribeInvitationManagement__dialogForm}
            onSubmit={(event) => {
              event.preventDefault();
              void handleSubmitEdit();
            }}
          >
            <div className={styles.TribeInvitationManagement__dialogBody}>
              <PlanSelectorField
                availablePrices={availablePrices}
                canManagePrices={canManagePrices}
                inputId={INVITATION_MANAGEMENT_DIALOG_INPUT_ID.editPlan}
                onValueChange={setEditSelectorValue}
                value={editSelectorValue}
              />
            </div>
            <DialogFooter>
              <Button
                disabled={editInProgress}
                onClick={() => {
                  handleEditDialogChange(false);
                }}
                type={INVITATION_MANAGEMENT_REQUEST.buttonType}
                variant={INVITATION_MANAGEMENT_REQUEST.outlineVariant}
              >
                {INVITATION_MANAGEMENT_COPY.submitDialogCancel}
              </Button>
              <Button
                aria-busy={editInProgress || undefined}
                disabled={editInProgress || !editSelectorValue}
                type={INVITATION_MANAGEMENT_REQUEST.submitType}
              >
                <PencilIcon />
                {editInProgress
                  ? INVITATION_MANAGEMENT_COPY.savingButton
                  : INVITATION_MANAGEMENT_COPY.changePlanSubmit}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={editReferralCandidateId !== null}
        onOpenChange={handleReferralEditDialogChange}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {INVITATION_MANAGEMENT_COPY.editChannelDialogTitle}
            </DialogTitle>
            <DialogDescription>
              {INVITATION_MANAGEMENT_COPY.editChannelDialogDescription}
            </DialogDescription>
          </DialogHeader>
          <form
            className={styles.TribeInvitationManagement__dialogForm}
            onSubmit={(event) => {
              event.preventDefault();
              void handleSubmitReferralEdit();
            }}
          >
            <div className={styles.TribeInvitationManagement__dialogBody}>
              <ReferralMetadataFields
                campaignInputId={INVITATION_MANAGEMENT_DIALOG_INPUT_ID.editCampaign}
                channelInputId={INVITATION_MANAGEMENT_DIALOG_INPUT_ID.editChannel}
                errors={editReferralMetadataErrors}
                formState={editReferralMetadata}
                onChange={setEditReferralMetadata}
                referrerHandleInputId={
                  INVITATION_MANAGEMENT_DIALOG_INPUT_ID.editReferrerHandle
                }
              />
            </div>
            <DialogFooter>
              <Button
                disabled={editReferralInProgress}
                onClick={() => {
                  handleReferralEditDialogChange(false);
                }}
                type={INVITATION_MANAGEMENT_REQUEST.buttonType}
                variant={INVITATION_MANAGEMENT_REQUEST.outlineVariant}
              >
                {INVITATION_MANAGEMENT_COPY.submitDialogCancel}
              </Button>
              <Button
                aria-busy={editReferralInProgress || undefined}
                disabled={
                  editReferralInProgress ||
                  hasReferralMetadataErrors(editReferralMetadataErrors)
                }
                type={INVITATION_MANAGEMENT_REQUEST.submitType}
              >
                <PencilIcon />
                {editReferralInProgress
                  ? INVITATION_MANAGEMENT_COPY.savingButton
                  : INVITATION_MANAGEMENT_COPY.changePlanSubmit}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={revokeCandidateId !== null}
        onOpenChange={handleRevokeDialogChange}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {INVITATION_MANAGEMENT_COPY.revokeConfirmTitle}
            </DialogTitle>
            <DialogDescription>
              {INVITATION_MANAGEMENT_COPY.revokeConfirmDescription}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              disabled={revokeInProgress}
              onClick={() => {
                handleRevokeDialogChange(false);
              }}
              type={INVITATION_MANAGEMENT_REQUEST.buttonType}
              variant={INVITATION_MANAGEMENT_REQUEST.outlineVariant}
            >
              {INVITATION_MANAGEMENT_COPY.revokeConfirmCancel}
            </Button>
            <Button
              aria-busy={revokeInProgress || undefined}
              disabled={revokeInProgress || revokeCandidateId === null}
              onClick={() => {
                if (revokeCandidateId) {
                  void handleRevokeInvitation(revokeCandidateId);
                }
              }}
              type={INVITATION_MANAGEMENT_REQUEST.buttonType}
              variant={INVITATION_MANAGEMENT_REQUEST.destructiveVariant}
            >
              <Trash2Icon />
              {revokeInProgress
                ? INVITATION_MANAGEMENT_COPY.revokingButton
                : INVITATION_MANAGEMENT_COPY.revokeConfirmConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
