"use client";

import { useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
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
import { toast, Badge, Button, Dialog, DialogContent, DropdownMenu, Input, Select, type SelectOption, AnimatedCount, AnimatedListItem, PresenceSwap, SplitButton, copyTextToClipboard, cn, type SplitButtonAction  } from "@golfo/ui";

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
  dangerBadgeTone: "danger",
  dangerVariant: "danger",
  iconSize: "sm",
  jsonContentType: "application/json",
  locale: "es",
  menuAlign: "end",
  secondaryVariant: "secondary",
  patchMethod: "PATCH",
  postMethod: "POST",
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
// The dialog actions live in `DialogContent`'s footer, outside each form, and
// reach it through the `form` attribute.
const INVITATION_MANAGEMENT_DIALOG_FORM_ID = {
  create: "invitation-create-form",
  editPlan: "invitation-edit-plan-form",
  editReferral: "invitation-edit-referral-form",
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

/** Presence keys for the region that swaps between the list and the empty state. */
const INVITATION_REGION_PRESENCE_KEY = {
  empty: "empty",
  list: "list",
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

function getTrialMonthSuffix(isSingular: boolean): string {
  return isSingular
    ? INVITATION_MANAGEMENT_COPY.trialMonthSuffix
    : INVITATION_MANAGEMENT_COPY.trialMonthsSuffix;
}

function getTrialDaySuffix(isSingular: boolean): string {
  return isSingular
    ? INVITATION_MANAGEMENT_COPY.trialDaySuffix
    : INVITATION_MANAGEMENT_COPY.trialDaysSuffix;
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
      ? getTrialMonthSuffix(isSingular)
      : getTrialDaySuffix(isSingular);

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
      tone={
        description.tone === INVITATION_MANAGEMENT_BADGE_TONE.missing
          ? INVITATION_MANAGEMENT_REQUEST.dangerBadgeTone
          : undefined
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
  const options: SelectOption[] = [
    {
      label: INVITATION_MANAGEMENT_COPY.usesCurrentPlanLabel,
      value: PLAN_SELECTOR_VALUE.current,
    },
    ...(canManagePrices
      ? [
          {
            label: INVITATION_MANAGEMENT_COPY.freeOptionLabel,
            value: PLAN_SELECTOR_VALUE.free,
          },
          ...availablePrices.map((price) => ({
            label: buildPriceOptionLabel(price),
            value: price.id,
          })),
        ]
      : []),
  ];

  return (
    <Select
      id={inputId}
      label={INVITATION_MANAGEMENT_COPY.planSelectorLabel}
      onValueChange={onValueChange}
      options={options}
      placeholder={INVITATION_MANAGEMENT_COPY.planSelectorPlaceholder}
      value={value}
    />
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
  return (
    <>
      <Select
        id={channelInputId}
        label={INVITATION_MANAGEMENT_COPY.channelLabel}
        onValueChange={(value) => {
          onChange({ ...formState, channel: value });
        }}
        options={INVITATION_CHANNEL_OPTIONS}
        placeholder={INVITATION_MANAGEMENT_COPY.channelPlaceholder}
        value={formState.channel}
      />
      <Input
        error={errors.campaignName ?? undefined}
        id={campaignInputId}
        label={INVITATION_MANAGEMENT_COPY.campaignLabel}
        maxLength={REFERRAL_METADATA_LIMIT.campaignNameMaxLength}
        onChange={(event) => {
          onChange({ ...formState, campaignName: event.target.value });
        }}
        placeholder={INVITATION_MANAGEMENT_COPY.campaignPlaceholder}
        value={formState.campaignName}
      />
      <Input
        error={errors.referrerHandle ?? undefined}
        id={referrerHandleInputId}
        label={INVITATION_MANAGEMENT_COPY.referrerHandleLabel}
        maxLength={REFERRAL_METADATA_LIMIT.referrerHandleMaxLength}
        onChange={(event) => {
          onChange({ ...formState, referrerHandle: event.target.value });
        }}
        placeholder={INVITATION_MANAGEMENT_COPY.referrerHandlePlaceholder}
        value={formState.referrerHandle}
      />
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

type FormattedInvitation = TribeInvitationListItemResult & {
  channelLabel: string;
  createdAtLabel: string;
  planDescription: PlanDescription;
};

type RunInvitationMutation = (
  pendingKey: string,
  fallbackErrorMessage: string,
  mutation: () => Promise<void>
) => Promise<void>;

type SetInvitationItems = Dispatch<SetStateAction<TribeInvitationListItemResult[]>>;

/**
 * Runs one invitation mutation at a time, exposing its pending key to the UI
 * and turning any failure into a safe Spanish toast.
 * @returns The pending key and the mutation runner.
 */
function useInvitationMutationRunner() {
  const [pendingInvitationId, setPendingInvitationId] = useState<string | null>(null);
  // Synchronous guard: state updates land after the event, so a fast double
  // activation (double click, Enter + click) could otherwise start two mutations.
  const mutationInFlightRef = useRef(false);

  const runMutation: RunInvitationMutation = async (
    pendingKey,
    fallbackErrorMessage,
    mutation
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

  return { pendingInvitationId, runMutation };
}

/**
 * Marks the invitation whose link was just copied for a short moment.
 * @returns The copied invitation and its setter.
 */
function useCopyFeedback() {
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedback | null>(null);

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

  return { copyFeedback, showCopyFeedback };
}

type InvitationDialogOptions = {
  pendingInvitationId: string | null;
  runMutation: RunInvitationMutation;
  setInvitationItems: SetInvitationItems;
  tribeSlug: string;
};

/** Puts a created link first, replacing an earlier copy of it. */
function prependInvitation(
  currentItems: TribeInvitationListItemResult[],
  createdInvitation: TribeInvitationListItemResult
): TribeInvitationListItemResult[] {
  return [
    createdInvitation,
    ...currentItems.filter((invitation) => invitation.id !== createdInvitation.id),
  ];
}

/**
 * State and submission of the create dialog. A created link is copied right
 * away when the browser still allows it.
 */
function useCreateInvitationDialog({
  pendingInvitationId,
  runMutation,
  setInvitationItems,
  showCopyFeedback,
  tribeSlug,
}: InvitationDialogOptions & { showCopyFeedback: (invitationId: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectorValue, setSelectorValue] = useState<string>("");
  const [referralMetadata, setReferralMetadata] =
    useState<ReferralMetadataFormState>(EMPTY_REFERRAL_METADATA_FORM);
  const inProgress = pendingInvitationId === CREATE_MUTATION_PENDING_KEY;
  const referralMetadataErrors = getReferralMetadataErrors(referralMetadata);

  const createInvitation = async (
    subscriptionAssociation: NonNullable<
      ReturnType<typeof serializeSelectorValueToAssociation>
    >
  ) => {
    const response = await submitInvitationRequest(
      buildInvitationsEndpoint(tribeSlug),
      INVITATION_MANAGEMENT_REQUEST.postMethod,
      INVITATION_MANAGEMENT_COPY.fallbackCreateError,
      {
        ...normalizeReferralMetadataForm(referralMetadata),
        subscriptionAssociation,
      }
    );
    const createdInvitation = response.invitation;

    if (createdInvitation) {
      setInvitationItems((currentItems) =>
        prependInvitation(currentItems, createdInvitation)
      );
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
    setIsOpen(false);
    setSelectorValue("");
    setReferralMetadata(EMPTY_REFERRAL_METADATA_FORM);
  };

  const handleSubmit = async () => {
    const subscriptionAssociation =
      serializeSelectorValueToAssociation(selectorValue);

    if (
      !subscriptionAssociation ||
      hasReferralMetadataErrors(referralMetadataErrors)
    ) {
      return;
    }

    await runMutation(
      CREATE_MUTATION_PENDING_KEY,
      INVITATION_MANAGEMENT_COPY.fallbackCreateError,
      () => createInvitation(subscriptionAssociation)
    );
  };

  const handleOpenChange = (open: boolean) => {
    if (inProgress) {
      return;
    }

    setIsOpen(open);

    if (!open) {
      setSelectorValue("");
      setReferralMetadata(EMPTY_REFERRAL_METADATA_FORM);
    }
  };

  return { handleOpenChange, handleSubmit, inProgress, isOpen, referralMetadata, referralMetadataErrors, selectorValue, setIsOpen, setReferralMetadata, setSelectorValue };
}

/** State and submission of the dialog that changes the plan of a link. */
function useEditPlanDialog({
  pendingInvitationId,
  runMutation,
  setInvitationItems,
  tribeSlug,
}: InvitationDialogOptions) {
  const [candidateId, setCandidateId] = useState<string | null>(null);
  const [selectorValue, setSelectorValue] = useState<string>("");
  const inProgress = candidateId !== null && pendingInvitationId === candidateId;

  const handleSubmit = async () => {
    const invitationId = candidateId;
    const subscriptionAssociation =
      serializeSelectorValueToAssociation(selectorValue);

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
        setCandidateId(null);
        setSelectorValue("");
      }
    );
  };

  const handleOpenChange = (open: boolean) => {
    if (inProgress) {
      return;
    }

    if (!open) {
      setCandidateId(null);
      setSelectorValue("");
    }
  };

  const openDialog = (invitation: TribeInvitationListItemResult) => {
    setCandidateId(invitation.id);
    setSelectorValue(
      serializeAssociationToSelectorValue(invitation.subscriptionAssociation)
    );
  };

  return { candidateId, handleOpenChange, handleSubmit, inProgress, openDialog, selectorValue, setSelectorValue };
}

/** State and submission of the dialog that edits the channel of a link. */
function useEditReferralDialog({
  pendingInvitationId,
  runMutation,
  setInvitationItems,
  tribeSlug,
}: InvitationDialogOptions) {
  const [candidateId, setCandidateId] = useState<string | null>(null);
  const [referralMetadata, setReferralMetadata] =
    useState<ReferralMetadataFormState>(EMPTY_REFERRAL_METADATA_FORM);
  const inProgress = candidateId !== null && pendingInvitationId === candidateId;
  const referralMetadataErrors = getReferralMetadataErrors(referralMetadata);

  const handleSubmit = async () => {
    const invitationId = candidateId;

    if (!invitationId || hasReferralMetadataErrors(referralMetadataErrors)) {
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
          normalizeReferralMetadataForm(referralMetadata)
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
        setCandidateId(null);
        setReferralMetadata(EMPTY_REFERRAL_METADATA_FORM);
      }
    );
  };

  const handleOpenChange = (open: boolean) => {
    if (inProgress) {
      return;
    }

    if (!open) {
      setCandidateId(null);
      setReferralMetadata(EMPTY_REFERRAL_METADATA_FORM);
    }
  };

  const openDialog = (invitation: TribeInvitationListItemResult) => {
    setCandidateId(invitation.id);
    setReferralMetadata(buildReferralMetadataFormState(invitation));
  };

  return { candidateId, handleOpenChange, handleSubmit, inProgress, openDialog, referralMetadata, referralMetadataErrors, setReferralMetadata };
}

/** State and confirmation of the dialog that revokes a link. */
function useRevokeInvitationDialog({
  pendingInvitationId,
  runMutation,
  setInvitationItems,
  tribeSlug,
}: InvitationDialogOptions) {
  const [candidateId, setCandidateId] = useState<string | null>(null);
  const inProgress = candidateId !== null && pendingInvitationId === candidateId;

  const handleRevoke = async (invitationId: string) => {
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
        setCandidateId(null);
      }
    );
  };

  const handleOpenChange = (open: boolean) => {
    if (open || inProgress) {
      return;
    }

    setCandidateId(null);
  };

  return { candidateId, handleOpenChange, handleRevoke, inProgress, setCandidateId };
}

/**
 * Copies a link and confirms it, or reports that the browser blocked it.
 * @param invitationUrl - Link to copy.
 * @param onCopied - Marks the copied invitation.
 */
async function copyInvitationUrl(invitationUrl: string, onCopied: () => void) {
  const isCopied = await copyTextToClipboard(invitationUrl);

  if (!isCopied) {
    toast.error(INVITATION_MANAGEMENT_COPY.fallbackCopyError);

    return;
  }

  onCopied();
  toast.success(INVITATION_MANAGEMENT_COPY.copiedMessage);
}

/** Title, description and the create action of the page. */
function InvitationManagementHeader({
  disabled,
  onCreate,
}: {
  disabled: boolean;
  onCreate: () => void;
}) {
  return (
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
          disabled={disabled}
          onClick={onCreate}
          type={INVITATION_MANAGEMENT_REQUEST.buttonType}
        >
          <LinkIcon />
          {INVITATION_MANAGEMENT_COPY.createButton}
        </Button>
      </div>
    </header>
  );
}

/** Associated plan and channel of a link. */
function InvitationItemDetails({ invitation }: { invitation: FormattedInvitation }) {
  return (
    <dl className={styles.TribeInvitationManagement__details}>
      <div className={styles.TribeInvitationManagement__detail}>
        <dt className={styles.TribeInvitationManagement__detailLabel}>
          {INVITATION_MANAGEMENT_COPY.associatedPlanLabel}
        </dt>
        <dd
          className={cn(
            styles.TribeInvitationManagement__detailValue,
            styles["TribeInvitationManagement__detailValue--stacked"]
          )}
        >
          <InvitationPlanValue description={invitation.planDescription} />
        </dd>
      </div>
      <div className={styles.TribeInvitationManagement__detail}>
        <dt className={styles.TribeInvitationManagement__detailLabel}>
          {INVITATION_MANAGEMENT_COPY.channelLabel}
        </dt>
        <dd className={styles.TribeInvitationManagement__detailValue}>
          <Badge>{invitation.channelLabel}</Badge>
          {invitation.campaignName ? (
            <span className={styles.TribeInvitationManagement__detailSegment}>
              {invitation.campaignName}
            </span>
          ) : null}
          {invitation.referrerHandle ? (
            <span className={styles.TribeInvitationManagement__detailSegment}>
              {invitation.referrerHandle}
            </span>
          ) : null}
        </dd>
      </div>
    </dl>
  );
}

type InvitationItemActionsProps = {
  actions: SplitButtonAction[];
  invitation: FormattedInvitation;
  isCopied: boolean;
  isPending: boolean;
  onCopy: (invitationId: string, invitationUrl: string) => void;
};

/** Copy action joined to the related actions, or only the actions menu when the link has no URL. */
function InvitationItemActions({
  actions,
  invitation,
  isCopied,
  isPending,
  onCopy,
}: InvitationItemActionsProps) {
  const { invitationUrl } = invitation;

  if (invitationUrl) {
    // Copying is the main action of an invitation, joined to its related actions.
    return (
      <SplitButton
        className={cn(
          styles.TribeInvitationManagement__splitButton,
          isCopied && styles["TribeInvitationManagement__splitButton--copied"]
        )}
        label={
          isCopied
            ? INVITATION_MANAGEMENT_COPY.copiedButton
            : INVITATION_MANAGEMENT_COPY.copyButton
        }
        icon={isCopied ? <CheckIcon aria-hidden /> : <ClipboardIcon aria-hidden />}
        variant={INVITATION_MANAGEMENT_REQUEST.secondaryVariant}
        disabled={isPending}
        onClick={() => {
          onCopy(invitation.id, invitationUrl);
        }}
        menuLabel={INVITATION_MANAGEMENT_COPY.moreActionsLabel}
        actions={actions}
      />
    );
  }

  // Without a link there is nothing to copy, so only the actions menu remains.
  return (
    <DropdownMenu
      align={INVITATION_MANAGEMENT_REQUEST.menuAlign}
      contentClassName={styles.TribeInvitationManagement__menu}
      items={actions}
      label={INVITATION_MANAGEMENT_COPY.moreActionsLabel}
      trigger={
        <Button
          aria-label={INVITATION_MANAGEMENT_COPY.moreActionsLabel}
          className={styles.TribeInvitationManagement__moreButton}
          disabled={isPending}
          size={INVITATION_MANAGEMENT_REQUEST.iconSize}
          type={INVITATION_MANAGEMENT_REQUEST.buttonType}
          variant={INVITATION_MANAGEMENT_REQUEST.secondaryVariant}
        >
          <MoreHorizontalIcon />
        </Button>
      }
    />
  );
}

type InvitationRowHandlers = {
  onCopy: (invitationId: string, invitationUrl: string) => void;
  onEditPlan: (invitation: TribeInvitationListItemResult) => void;
  onEditReferral: (invitation: TribeInvitationListItemResult) => void;
  onRevoke: (invitationId: string) => void;
};

/**
 * Related actions of a link: changing its plan (for price managers), editing
 * its channel and revoking it.
 */
function buildInvitationActions(
  invitation: FormattedInvitation,
  canManagePrices: boolean,
  { onEditPlan, onEditReferral, onRevoke }: Omit<InvitationRowHandlers, "onCopy">
): SplitButtonAction[] {
  return [
    ...(canManagePrices
      ? [
          {
            label: INVITATION_MANAGEMENT_COPY.changePlanButton,
            icon: <PencilIcon />,
            onSelect: () => onEditPlan(invitation),
          },
        ]
      : []),
    {
      label: INVITATION_MANAGEMENT_COPY.editChannelButton,
      icon: <TagIcon />,
      onSelect: () => onEditReferral(invitation),
    },
    {
      label: INVITATION_MANAGEMENT_COPY.revokeButton,
      icon: <Trash2Icon />,
      destructive: true,
      onSelect: () => onRevoke(invitation.id),
    },
  ];
}

type InvitationListItemContentProps = InvitationRowHandlers & {
  canManagePrices: boolean;
  invitation: FormattedInvitation;
  isCopied: boolean;
  isPending: boolean;
};

/** Heading, details and actions of one active link. */
function InvitationListItemContent({
  canManagePrices,
  invitation,
  isCopied,
  isPending,
  onCopy,
  ...handlers
}: InvitationListItemContentProps) {
  return (
    <>
      <div className={styles.TribeInvitationManagement__itemBody}>
        <div className={styles.TribeInvitationManagement__itemHeading}>
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
        <InvitationItemDetails invitation={invitation} />
      </div>
      <div className={styles.TribeInvitationManagement__itemActions}>
        <InvitationItemActions
          actions={buildInvitationActions(invitation, canManagePrices, handlers)}
          invitation={invitation}
          isCopied={isCopied}
          isPending={isPending}
          onCopy={onCopy}
        />
      </div>
    </>
  );
}

type InvitationListRegionProps = InvitationRowHandlers & {
  canManagePrices: boolean;
  copiedInvitationId: string | null;
  invitations: FormattedInvitation[];
  pendingInvitationId: string | null;
};

/** Active links with their count, or the empty state. */
function InvitationListRegion({
  canManagePrices,
  copiedInvitationId,
  invitations,
  pendingInvitationId,
  ...handlers
}: InvitationListRegionProps) {
  const activeInvitationCount = invitations.length;
  const hasActiveInvitations = activeInvitationCount > 0;

  return (
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
                {invitations.map((invitation) => (
                  <AnimatedListItem
                    as="li"
                    className={styles.TribeInvitationManagement__item}
                    key={invitation.id}
                  >
                    <InvitationListItemContent
                      canManagePrices={canManagePrices}
                      invitation={invitation}
                      isCopied={copiedInvitationId === invitation.id}
                      isPending={pendingInvitationId === invitation.id}
                      {...handlers}
                    />
                  </AnimatedListItem>
                ))}
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
  );
}

type InvitationFormDialogFooterProps = {
  busyLabel: string;
  formId: string;
  icon: ReactNode;
  idleLabel: string;
  inProgress: boolean;
  isSubmitDisabled: boolean;
  onCancel: () => void;
};

/** Cancel and submit actions of a link form dialog. */
function InvitationFormDialogFooter({
  busyLabel,
  formId,
  icon,
  idleLabel,
  inProgress,
  isSubmitDisabled,
  onCancel,
}: InvitationFormDialogFooterProps) {
  return (
    <>
      <Button
        disabled={inProgress}
        onClick={onCancel}
        type={INVITATION_MANAGEMENT_REQUEST.buttonType}
        variant={INVITATION_MANAGEMENT_REQUEST.secondaryVariant}
      >
        {INVITATION_MANAGEMENT_COPY.submitDialogCancel}
      </Button>
      <Button
        aria-busy={inProgress || undefined}
        disabled={isSubmitDisabled}
        form={formId}
        type={INVITATION_MANAGEMENT_REQUEST.submitType}
      >
        {icon}
        {inProgress ? busyLabel : idleLabel}
      </Button>
    </>
  );
}

type InvitationFormDialogProps = {
  children: ReactNode;
  description: string;
  footer: ReactNode;
  formId: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => Promise<void>;
  open: boolean;
  title: string;
};

/** Dialog whose body is a form submitted from its footer. */
function InvitationFormDialog({
  children,
  description,
  footer,
  formId,
  onOpenChange,
  onSubmit,
  open,
  title,
}: InvitationFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} description={description} footer={footer}>
        <form
          id={formId}
          className={styles.TribeInvitationManagement__dialogForm}
          onSubmit={(event) => {
            event.preventDefault();
            void onSubmit();
          }}
        >
          <div className={styles.TribeInvitationManagement__dialogBody}>
            {children}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type PlanOptionsProps = Pick<
  TribeInvitationManagementProps,
  "availablePrices" | "canManagePrices"
>;

/** Dialog that creates a link with its plan and channel. */
function CreateInvitationDialog({
  availablePrices,
  canManagePrices,
  dialog,
}: PlanOptionsProps & { dialog: ReturnType<typeof useCreateInvitationDialog> }) {
  return (
    <InvitationFormDialog
      description={INVITATION_MANAGEMENT_COPY.createDialogDescription}
      footer={
        <InvitationFormDialogFooter
          busyLabel={INVITATION_MANAGEMENT_COPY.creatingButton}
          formId={INVITATION_MANAGEMENT_DIALOG_FORM_ID.create}
          icon={<LinkIcon />}
          idleLabel={INVITATION_MANAGEMENT_COPY.submitDialogCreate}
          inProgress={dialog.inProgress}
          isSubmitDisabled={
            dialog.inProgress ||
            !dialog.selectorValue ||
            hasReferralMetadataErrors(dialog.referralMetadataErrors)
          }
          onCancel={() => {
            dialog.handleOpenChange(false);
          }}
        />
      }
      formId={INVITATION_MANAGEMENT_DIALOG_FORM_ID.create}
      onOpenChange={dialog.handleOpenChange}
      onSubmit={dialog.handleSubmit}
      open={dialog.isOpen}
      title={INVITATION_MANAGEMENT_COPY.createDialogTitle}
    >
      <PlanSelectorField
        availablePrices={availablePrices}
        canManagePrices={canManagePrices}
        inputId={INVITATION_MANAGEMENT_DIALOG_INPUT_ID.createPlan}
        onValueChange={dialog.setSelectorValue}
        value={dialog.selectorValue}
      />
      <ReferralMetadataFields
        campaignInputId={INVITATION_MANAGEMENT_DIALOG_INPUT_ID.createCampaign}
        channelInputId={INVITATION_MANAGEMENT_DIALOG_INPUT_ID.createChannel}
        errors={dialog.referralMetadataErrors}
        formState={dialog.referralMetadata}
        onChange={dialog.setReferralMetadata}
        referrerHandleInputId={
          INVITATION_MANAGEMENT_DIALOG_INPUT_ID.createReferrerHandle
        }
      />
    </InvitationFormDialog>
  );
}

/** Dialog that changes the plan of a link. */
function EditPlanDialog({
  availablePrices,
  canManagePrices,
  dialog,
}: PlanOptionsProps & { dialog: ReturnType<typeof useEditPlanDialog> }) {
  return (
    <InvitationFormDialog
      description={INVITATION_MANAGEMENT_COPY.changePlanDialogDescription}
      footer={
        <InvitationFormDialogFooter
          busyLabel={INVITATION_MANAGEMENT_COPY.savingButton}
          formId={INVITATION_MANAGEMENT_DIALOG_FORM_ID.editPlan}
          icon={<PencilIcon />}
          idleLabel={INVITATION_MANAGEMENT_COPY.changePlanSubmit}
          inProgress={dialog.inProgress}
          isSubmitDisabled={dialog.inProgress || !dialog.selectorValue}
          onCancel={() => {
            dialog.handleOpenChange(false);
          }}
        />
      }
      formId={INVITATION_MANAGEMENT_DIALOG_FORM_ID.editPlan}
      onOpenChange={dialog.handleOpenChange}
      onSubmit={dialog.handleSubmit}
      open={dialog.candidateId !== null}
      title={INVITATION_MANAGEMENT_COPY.changePlanDialogTitle}
    >
      <PlanSelectorField
        availablePrices={availablePrices}
        canManagePrices={canManagePrices}
        inputId={INVITATION_MANAGEMENT_DIALOG_INPUT_ID.editPlan}
        onValueChange={dialog.setSelectorValue}
        value={dialog.selectorValue}
      />
    </InvitationFormDialog>
  );
}

/** Dialog that edits the channel of a link. */
function EditReferralDialog({
  dialog,
}: {
  dialog: ReturnType<typeof useEditReferralDialog>;
}) {
  return (
    <InvitationFormDialog
      description={INVITATION_MANAGEMENT_COPY.editChannelDialogDescription}
      footer={
        <InvitationFormDialogFooter
          busyLabel={INVITATION_MANAGEMENT_COPY.savingButton}
          formId={INVITATION_MANAGEMENT_DIALOG_FORM_ID.editReferral}
          icon={<PencilIcon />}
          idleLabel={INVITATION_MANAGEMENT_COPY.changePlanSubmit}
          inProgress={dialog.inProgress}
          isSubmitDisabled={
            dialog.inProgress ||
            hasReferralMetadataErrors(dialog.referralMetadataErrors)
          }
          onCancel={() => {
            dialog.handleOpenChange(false);
          }}
        />
      }
      formId={INVITATION_MANAGEMENT_DIALOG_FORM_ID.editReferral}
      onOpenChange={dialog.handleOpenChange}
      onSubmit={dialog.handleSubmit}
      open={dialog.candidateId !== null}
      title={INVITATION_MANAGEMENT_COPY.editChannelDialogTitle}
    >
      <ReferralMetadataFields
        campaignInputId={INVITATION_MANAGEMENT_DIALOG_INPUT_ID.editCampaign}
        channelInputId={INVITATION_MANAGEMENT_DIALOG_INPUT_ID.editChannel}
        errors={dialog.referralMetadataErrors}
        formState={dialog.referralMetadata}
        onChange={dialog.setReferralMetadata}
        referrerHandleInputId={
          INVITATION_MANAGEMENT_DIALOG_INPUT_ID.editReferrerHandle
        }
      />
    </InvitationFormDialog>
  );
}

/** Confirmation dialog that revokes a link. */
function RevokeInvitationDialog({
  dialog,
}: {
  dialog: ReturnType<typeof useRevokeInvitationDialog>;
}) {
  const { candidateId, inProgress } = dialog;

  return (
    <Dialog open={candidateId !== null} onOpenChange={dialog.handleOpenChange}>
      <DialogContent
        title={INVITATION_MANAGEMENT_COPY.revokeConfirmTitle}
        description={INVITATION_MANAGEMENT_COPY.revokeConfirmDescription}
        footer={
          <>
            <Button
              disabled={inProgress}
              onClick={() => {
                dialog.handleOpenChange(false);
              }}
              type={INVITATION_MANAGEMENT_REQUEST.buttonType}
              variant={INVITATION_MANAGEMENT_REQUEST.secondaryVariant}
            >
              {INVITATION_MANAGEMENT_COPY.revokeConfirmCancel}
            </Button>
            <Button
              aria-busy={inProgress || undefined}
              disabled={inProgress || candidateId === null}
              onClick={() => {
                if (candidateId) {
                  void dialog.handleRevoke(candidateId);
                }
              }}
              type={INVITATION_MANAGEMENT_REQUEST.buttonType}
              variant={INVITATION_MANAGEMENT_REQUEST.dangerVariant}
            >
              <Trash2Icon />
              {inProgress
                ? INVITATION_MANAGEMENT_COPY.revokingButton
                : INVITATION_MANAGEMENT_COPY.revokeConfirmConfirm}
            </Button>
          </>
        }
      />
    </Dialog>
  );
}

export function TribeInvitationManagement({
  availablePrices,
  canManagePrices,
  invitations,
  tribeSlug,
}: TribeInvitationManagementProps) {
  const [invitationItems, setInvitationItems] = useState(invitations);
  const { pendingInvitationId, runMutation } = useInvitationMutationRunner();
  const { copyFeedback, showCopyFeedback } = useCopyFeedback();
  const dialogOptions = { pendingInvitationId, runMutation, setInvitationItems, tribeSlug };
  const createDialog = useCreateInvitationDialog({ ...dialogOptions, showCopyFeedback });
  const editPlanDialog = useEditPlanDialog(dialogOptions);
  const editReferralDialog = useEditReferralDialog(dialogOptions);
  const revokeDialog = useRevokeInvitationDialog(dialogOptions);
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

  return (
    <section className={styles.TribeInvitationManagement}>
      <InvitationManagementHeader
        disabled={Boolean(pendingInvitationId)}
        onCreate={() => {
          createDialog.setIsOpen(true);
        }}
      />
      <InvitationListRegion
        canManagePrices={canManagePrices}
        copiedInvitationId={copyFeedback?.invitationId ?? null}
        invitations={formattedInvitations}
        onCopy={(invitationId, invitationUrl) => {
          void copyInvitationUrl(invitationUrl, () => {
            showCopyFeedback(invitationId);
          });
        }}
        onEditPlan={editPlanDialog.openDialog}
        onEditReferral={editReferralDialog.openDialog}
        onRevoke={revokeDialog.setCandidateId}
        pendingInvitationId={pendingInvitationId}
      />
      <CreateInvitationDialog
        availablePrices={availablePrices}
        canManagePrices={canManagePrices}
        dialog={createDialog}
      />
      <EditPlanDialog
        availablePrices={availablePrices}
        canManagePrices={canManagePrices}
        dialog={editPlanDialog}
      />
      <EditReferralDialog dialog={editReferralDialog} />
      <RevokeInvitationDialog dialog={revokeDialog} />
    </section>
  );
}
