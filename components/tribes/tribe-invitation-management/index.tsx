"use client";

import { useMemo, useState } from "react";
import { ClipboardIcon, LinkIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

const INVITATION_MANAGEMENT_COPY = {
  associatedPlanLabel: "Plan asociado",
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
  editChannelButton: "Editar canal",
  editChannelDialogDescription:
    "Actualizá los datos de medición de este link sin cambiar el plan asociado.",
  editChannelDialogTitle: "Editar canal de referido",
  fallbackCopyError: "No pudimos copiar el link.",
  fallbackCreateError: "No pudimos crear la invitación.",
  fallbackReferralValidationError:
    "Revisá el canal, la campaña y el referente antes de guardar.",
  fallbackUpdateChannelError: "No pudimos actualizar el canal de referido.",
  fallbackRevokeError: "No pudimos revocar la invitación.",
  fallbackUpdatePlanError: "No pudimos actualizar el plan asociado.",
  freeOptionLabel: "Plan gratuito",
  itemTitle: "Link activo",
  missingPlanLabel: "Plan no disponible",
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
  defaultVariant: "default",
  deleteMethod: "DELETE",
  destructiveVariant: "destructive",
  jsonContentType: "application/json",
  locale: "es",
  outlineVariant: "outline",
  patchMethod: "PATCH",
  postMethod: "POST",
  secondaryVariant: "secondary",
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

const REFERRAL_METADATA_LIMIT = {
  campaignNameMaxLength: 80,
  referrerHandleMaxLength: 80,
} as const;

const REFERRER_HANDLE_PATTERN = /^@?[A-Za-z0-9._-]+$/;

const TRIAL_PERIOD_FORMAT = {
  frequencyUnitSeparator: " ",
} as const;

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

function getReferralMetadataError(
  formState: ReferralMetadataFormState
): string | null {
  if (
    formState.campaignName.trim().length >
    REFERRAL_METADATA_LIMIT.campaignNameMaxLength
  ) {
    return INVITATION_MANAGEMENT_COPY.fallbackReferralValidationError;
  }

  const referrerHandle = formState.referrerHandle.trim();

  if (
    referrerHandle.length >
      REFERRAL_METADATA_LIMIT.referrerHandleMaxLength ||
    (referrerHandle.length > 0 &&
      !REFERRER_HANDLE_PATTERN.test(referrerHandle))
  ) {
    return INVITATION_MANAGEMENT_COPY.fallbackReferralValidationError;
  }

  return null;
}

function getChannelLabel(channel: string | null): string {
  const channelValue = channel ?? INVITATION_CHANNEL.direct;
  const option = INVITATION_CHANNEL_OPTIONS.find(
    (candidate) => candidate.value === channelValue
  );

  return option?.label ?? INVITATION_MANAGEMENT_COPY.channelDirectLabel;
}

async function submitInvitationRequest(
  url: string,
  method: string,
  body?: Record<string, unknown>
): Promise<InvitationResponse> {
  const response = await fetch(url, {
    body: body ? JSON.stringify(body) : undefined,
    headers: body
      ? { "Content-Type": INVITATION_MANAGEMENT_REQUEST.jsonContentType }
      : undefined,
    method,
  });
  const responseBody = (await response.json().catch(() => ({}))) as InvitationResponse;

  if (!response.ok) {
    throw new Error(
      responseBody.message ?? INVITATION_MANAGEMENT_COPY.fallbackCreateError
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
  } else if (input.accountLabel === null && input.accountEmail === null) {
    // No-op: free plans or plans without payment integration omit the account segment.
  }

  segments.push(
    formatTrialPeriod(input.trial) ?? INVITATION_MANAGEMENT_COPY.noTrialLabel
  );

  return segments;
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

const INVITATION_PLAN_LABEL_SEPARATOR = " · ";

function describeAssociation(
  association: TribeInvitationSubscriptionAssociationResult
): {
  segments: string[];
  tone: (typeof INVITATION_MANAGEMENT_BADGE_TONE)[keyof typeof INVITATION_MANAGEMENT_BADGE_TONE];
} {
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
  const hasActiveInvitations = invitationItems.length > 0;
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
  const createInProgress =
    pendingInvitationId === INVITATION_MANAGEMENT_COPY.createButton;
  const editInProgress =
    editCandidateId !== null && pendingInvitationId === editCandidateId;
  const editReferralInProgress =
    editReferralCandidateId !== null &&
    pendingInvitationId === editReferralCandidateId;
  const createReferralMetadataError = getReferralMetadataError(
    createReferralMetadata
  );
  const editReferralMetadataError = getReferralMetadataError(
    editReferralMetadata
  );

  const copyInvitationUrl = async (invitationUrl: string) => {
    try {
      await navigator.clipboard.writeText(invitationUrl);
      toast.success(INVITATION_MANAGEMENT_COPY.copiedMessage);
    } catch {
      toast.error(INVITATION_MANAGEMENT_COPY.fallbackCopyError);
    }
  };

  const handleSubmitCreate = async () => {
    const subscriptionAssociation =
      serializeSelectorValueToAssociation(createSelectorValue);

    if (!subscriptionAssociation) {
      return;
    }

    const referralMetadataError =
      getReferralMetadataError(createReferralMetadata);

    if (referralMetadataError) {
      toast.error(referralMetadataError);

      return;
    }

    setPendingInvitationId(INVITATION_MANAGEMENT_COPY.createButton);

    try {
      const referralMetadata = normalizeReferralMetadataForm(
        createReferralMetadata
      );
      const response = await submitInvitationRequest(
        buildInvitationsEndpoint(tribeSlug),
        INVITATION_MANAGEMENT_REQUEST.postMethod,
        { ...referralMetadata, subscriptionAssociation }
      );

      if (response.invitation) {
        setInvitationItems((currentItems) => [
          response.invitation!,
          ...currentItems,
        ]);
      }

      if (response.invitationUrl) {
        await copyInvitationUrl(response.invitationUrl);
      }

      toast.success(response.message ?? INVITATION_MANAGEMENT_COPY.createButton);
      setIsCreateDialogOpen(false);
      setCreateSelectorValue("");
      setCreateReferralMetadata(EMPTY_REFERRAL_METADATA_FORM);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : INVITATION_MANAGEMENT_COPY.fallbackCreateError
      );
    } finally {
      setPendingInvitationId(null);
    }
  };

  const handleSubmitReferralEdit = async () => {
    if (!editReferralCandidateId) {
      return;
    }

    const referralMetadataError = getReferralMetadataError(editReferralMetadata);

    if (referralMetadataError) {
      toast.error(referralMetadataError);

      return;
    }

    setPendingInvitationId(editReferralCandidateId);

    try {
      const response = await submitInvitationRequest(
        buildInvitationEndpoint(tribeSlug, editReferralCandidateId),
        INVITATION_MANAGEMENT_REQUEST.patchMethod,
        normalizeReferralMetadataForm(editReferralMetadata)
      );

      if (response.invitation) {
        const updated = response.invitation;
        setInvitationItems((currentItems) =>
          currentItems.map((invitation) =>
            invitation.id === updated.id ? updated : invitation
          )
        );
      }

      toast.success(
        response.message ?? INVITATION_MANAGEMENT_COPY.editChannelButton
      );
      setEditReferralCandidateId(null);
      setEditReferralMetadata(EMPTY_REFERRAL_METADATA_FORM);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : INVITATION_MANAGEMENT_COPY.fallbackUpdateChannelError
      );
    } finally {
      setPendingInvitationId(null);
    }
  };

  const handleSubmitEdit = async () => {
    if (!editCandidateId) {
      return;
    }

    const subscriptionAssociation =
      serializeSelectorValueToAssociation(editSelectorValue);

    if (!subscriptionAssociation) {
      return;
    }

    setPendingInvitationId(editCandidateId);

    try {
      const response = await submitInvitationRequest(
        buildInvitationAssociationEndpoint(tribeSlug, editCandidateId),
        INVITATION_MANAGEMENT_REQUEST.patchMethod,
        { subscriptionAssociation }
      );

      if (response.invitation) {
        const updated = response.invitation;
        setInvitationItems((currentItems) =>
          currentItems.map((invitation) =>
            invitation.id === updated.id ? updated : invitation
          )
        );
      }

      toast.success(
        response.message ?? INVITATION_MANAGEMENT_COPY.changePlanSubmit
      );
      setEditCandidateId(null);
      setEditSelectorValue("");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : INVITATION_MANAGEMENT_COPY.fallbackUpdatePlanError
      );
    } finally {
      setPendingInvitationId(null);
    }
  };

  const handleRevokeInvitation = async (invitationId: string) => {
    setPendingInvitationId(invitationId);

    try {
      const response = await submitInvitationRequest(
        buildInvitationEndpoint(tribeSlug, invitationId),
        INVITATION_MANAGEMENT_REQUEST.deleteMethod
      );

      setInvitationItems((currentItems) =>
        currentItems.filter((invitation) => invitation.id !== invitationId)
      );
      toast.success(response.message ?? INVITATION_MANAGEMENT_COPY.revokeButton);
      setRevokeCandidateId(null);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : INVITATION_MANAGEMENT_COPY.fallbackRevokeError
      );
    } finally {
      setPendingInvitationId(null);
    }
  };

  const handleRevokeDialogChange = (open: boolean) => {
    if (open) {
      return;
    }

    if (pendingInvitationId && pendingInvitationId === revokeCandidateId) {
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
        <h1 className={styles.TribeInvitationManagement__title}>
          {INVITATION_MANAGEMENT_COPY.title}
        </h1>
        <p className={styles.TribeInvitationManagement__description}>
          {INVITATION_MANAGEMENT_COPY.description}
        </p>
      </header>
      <div className={styles.TribeInvitationManagement__actions}>
        <Button
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
      {hasActiveInvitations ? (
        <ol
          aria-label="Invitaciones activas"
          className={styles.TribeInvitationManagement__list}
        >
          {formattedInvitations.map((invitation) => (
            <li
              className={styles.TribeInvitationManagement__item}
              key={invitation.id}
            >
              <div className={styles.TribeInvitationManagement__itemSummary}>
                <p className={styles.TribeInvitationManagement__itemTitle}>
                  {INVITATION_MANAGEMENT_COPY.itemTitle}
                </p>
                <span className={styles.TribeInvitationManagement__meta}>
                  {invitation.createdByName ??
                    INVITATION_MANAGEMENT_COPY.createdByFallback}{" "}
                  · {invitation.createdAtLabel}
                </span>
                <span className={styles.TribeInvitationManagement__plan}>
                  <span className={styles.TribeInvitationManagement__planLabel}>
                    {INVITATION_MANAGEMENT_COPY.associatedPlanLabel}:
                  </span>{" "}
                  {invitation.planDescription.segments.map(
                    (planSegment, planSegmentIndex) => (
                      <Badge
                        className={
                          invitation.planDescription.tone ===
                          INVITATION_MANAGEMENT_BADGE_TONE.missing
                            ? styles[
                                "TribeInvitationManagement__planBadge--missing"
                              ]
                            : undefined
                        }
                        key={`${invitation.id}-plan-${planSegmentIndex}`}
                        variant={
                          invitation.planDescription.tone ===
                          INVITATION_MANAGEMENT_BADGE_TONE.missing
                            ? INVITATION_MANAGEMENT_REQUEST.destructiveVariant
                            : invitation.planDescription.tone ===
                              INVITATION_MANAGEMENT_BADGE_TONE.specific
                            ? INVITATION_MANAGEMENT_REQUEST.defaultVariant
                            : INVITATION_MANAGEMENT_REQUEST.secondaryVariant
                        }
                      >
                        {planSegment}
                      </Badge>
                    )
                  )}
                </span>
                <span className={styles.TribeInvitationManagement__plan}>
                  <span className={styles.TribeInvitationManagement__planLabel}>
                    {INVITATION_MANAGEMENT_COPY.channelLabel}:
                  </span>{" "}
                  <Badge variant={INVITATION_MANAGEMENT_REQUEST.secondaryVariant}>
                    {invitation.channelLabel}
                  </Badge>
                </span>
              </div>
              <div className={styles.TribeInvitationManagement__itemActions}>
                {invitation.invitationUrl ? (
                  <Button
                    disabled={pendingInvitationId === invitation.id}
                    onClick={() => {
                      void copyInvitationUrl(invitation.invitationUrl!);
                    }}
                    type={INVITATION_MANAGEMENT_REQUEST.buttonType}
                    variant={INVITATION_MANAGEMENT_REQUEST.outlineVariant}
                  >
                    <ClipboardIcon />
                    {INVITATION_MANAGEMENT_COPY.copyButton}
                  </Button>
                ) : null}
                {canManagePrices ? (
                  <Button
                    disabled={pendingInvitationId === invitation.id}
                    onClick={() => {
                      openEditDialog(invitation);
                    }}
                    type={INVITATION_MANAGEMENT_REQUEST.buttonType}
                    variant={INVITATION_MANAGEMENT_REQUEST.outlineVariant}
                  >
                    <PencilIcon />
                    {INVITATION_MANAGEMENT_COPY.changePlanButton}
                  </Button>
                ) : null}
                <Button
                  disabled={pendingInvitationId === invitation.id}
                  onClick={() => {
                    openReferralEditDialog(invitation);
                  }}
                  type={INVITATION_MANAGEMENT_REQUEST.buttonType}
                  variant={INVITATION_MANAGEMENT_REQUEST.outlineVariant}
                >
                  <PencilIcon />
                  {INVITATION_MANAGEMENT_COPY.editChannelButton}
                </Button>
                <Button
                  disabled={pendingInvitationId === invitation.id}
                  onClick={() => {
                    setRevokeCandidateId(invitation.id);
                  }}
                  type={INVITATION_MANAGEMENT_REQUEST.buttonType}
                  variant={INVITATION_MANAGEMENT_REQUEST.outlineVariant}
                >
                  <Trash2Icon />
                  {INVITATION_MANAGEMENT_COPY.revokeButton}
                </Button>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.TribeInvitationManagement__empty}>
          {INVITATION_MANAGEMENT_COPY.emptyState}
        </p>
      )}
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
          <div className={styles.TribeInvitationManagement__dialogBody}>
            <label
              className={styles.TribeInvitationManagement__dialogLabel}
              htmlFor={INVITATION_MANAGEMENT_DIALOG_INPUT_ID.createPlan}
            >
              {INVITATION_MANAGEMENT_COPY.planSelectorLabel}
            </label>
            <Select
              onValueChange={setCreateSelectorValue}
              value={createSelectorValue}
            >
              <SelectTrigger
                className={styles.TribeInvitationManagement__planTrigger}
                id={INVITATION_MANAGEMENT_DIALOG_INPUT_ID.createPlan}
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
                        {buildPlanLabelSegments({
                          accountEmail: price.mercadoPagoAccountEmail,
                          accountLabel: price.mercadoPagoAccountLabel,
                          amountCents: price.amountCents,
                          name: price.name,
                          trial: price.trial,
                        }).join(INVITATION_PLAN_LABEL_SEPARATOR)}
                      </SelectItem>
                    ))}
                  </>
                ) : null}
              </SelectContent>
            </Select>
            <label
              className={styles.TribeInvitationManagement__dialogLabel}
              htmlFor={INVITATION_MANAGEMENT_DIALOG_INPUT_ID.createChannel}
            >
              {INVITATION_MANAGEMENT_COPY.channelLabel}
            </label>
            <Select
              onValueChange={(value) => {
                setCreateReferralMetadata((currentState) => ({
                  ...currentState,
                  channel: value,
                }));
              }}
              value={createReferralMetadata.channel}
            >
              <SelectTrigger
                className={styles.TribeInvitationManagement__planTrigger}
                id={INVITATION_MANAGEMENT_DIALOG_INPUT_ID.createChannel}
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
            <label
              className={styles.TribeInvitationManagement__dialogLabel}
              htmlFor={INVITATION_MANAGEMENT_DIALOG_INPUT_ID.createCampaign}
            >
              {INVITATION_MANAGEMENT_COPY.campaignLabel}
            </label>
            <Input
              id={INVITATION_MANAGEMENT_DIALOG_INPUT_ID.createCampaign}
              maxLength={REFERRAL_METADATA_LIMIT.campaignNameMaxLength}
              onChange={(event) => {
                setCreateReferralMetadata((currentState) => ({
                  ...currentState,
                  campaignName: event.target.value,
                }));
              }}
              placeholder={INVITATION_MANAGEMENT_COPY.campaignPlaceholder}
              value={createReferralMetadata.campaignName}
            />
            <label
              className={styles.TribeInvitationManagement__dialogLabel}
              htmlFor={
                INVITATION_MANAGEMENT_DIALOG_INPUT_ID.createReferrerHandle
              }
            >
              {INVITATION_MANAGEMENT_COPY.referrerHandleLabel}
            </label>
            <Input
              id={INVITATION_MANAGEMENT_DIALOG_INPUT_ID.createReferrerHandle}
              maxLength={REFERRAL_METADATA_LIMIT.referrerHandleMaxLength}
              onChange={(event) => {
                setCreateReferralMetadata((currentState) => ({
                  ...currentState,
                  referrerHandle: event.target.value,
                }));
              }}
              placeholder={INVITATION_MANAGEMENT_COPY.referrerHandlePlaceholder}
              value={createReferralMetadata.referrerHandle}
            />
            {createReferralMetadataError ? (
              <p className={styles.TribeInvitationManagement__fieldError}>
                {createReferralMetadataError}
              </p>
            ) : null}
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
              disabled={
                createInProgress ||
                !createSelectorValue ||
                Boolean(createReferralMetadataError)
              }
              onClick={() => {
                void handleSubmitCreate();
              }}
              type={INVITATION_MANAGEMENT_REQUEST.buttonType}
            >
              <LinkIcon />
              {INVITATION_MANAGEMENT_COPY.submitDialogCreate}
            </Button>
          </DialogFooter>
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
          <div className={styles.TribeInvitationManagement__dialogBody}>
            <label
              className={styles.TribeInvitationManagement__dialogLabel}
              htmlFor={INVITATION_MANAGEMENT_DIALOG_INPUT_ID.editPlan}
            >
              {INVITATION_MANAGEMENT_COPY.planSelectorLabel}
            </label>
            <Select
              onValueChange={setEditSelectorValue}
              value={editSelectorValue}
            >
              <SelectTrigger
                className={styles.TribeInvitationManagement__planTrigger}
                id={INVITATION_MANAGEMENT_DIALOG_INPUT_ID.editPlan}
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
                        {buildPlanLabelSegments({
                          accountEmail: price.mercadoPagoAccountEmail,
                          accountLabel: price.mercadoPagoAccountLabel,
                          amountCents: price.amountCents,
                          name: price.name,
                          trial: price.trial,
                        }).join(INVITATION_PLAN_LABEL_SEPARATOR)}
                      </SelectItem>
                    ))}
                  </>
                ) : null}
              </SelectContent>
            </Select>
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
              disabled={editInProgress || !editSelectorValue}
              onClick={() => {
                void handleSubmitEdit();
              }}
              type={INVITATION_MANAGEMENT_REQUEST.buttonType}
            >
              <PencilIcon />
              {INVITATION_MANAGEMENT_COPY.changePlanSubmit}
            </Button>
          </DialogFooter>
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
          <div className={styles.TribeInvitationManagement__dialogBody}>
            <label
              className={styles.TribeInvitationManagement__dialogLabel}
              htmlFor={INVITATION_MANAGEMENT_DIALOG_INPUT_ID.editChannel}
            >
              {INVITATION_MANAGEMENT_COPY.channelLabel}
            </label>
            <Select
              onValueChange={(value) => {
                setEditReferralMetadata((currentState) => ({
                  ...currentState,
                  channel: value,
                }));
              }}
              value={editReferralMetadata.channel}
            >
              <SelectTrigger
                className={styles.TribeInvitationManagement__planTrigger}
                id={INVITATION_MANAGEMENT_DIALOG_INPUT_ID.editChannel}
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
            <label
              className={styles.TribeInvitationManagement__dialogLabel}
              htmlFor={INVITATION_MANAGEMENT_DIALOG_INPUT_ID.editCampaign}
            >
              {INVITATION_MANAGEMENT_COPY.campaignLabel}
            </label>
            <Input
              id={INVITATION_MANAGEMENT_DIALOG_INPUT_ID.editCampaign}
              maxLength={REFERRAL_METADATA_LIMIT.campaignNameMaxLength}
              onChange={(event) => {
                setEditReferralMetadata((currentState) => ({
                  ...currentState,
                  campaignName: event.target.value,
                }));
              }}
              placeholder={INVITATION_MANAGEMENT_COPY.campaignPlaceholder}
              value={editReferralMetadata.campaignName}
            />
            <label
              className={styles.TribeInvitationManagement__dialogLabel}
              htmlFor={INVITATION_MANAGEMENT_DIALOG_INPUT_ID.editReferrerHandle}
            >
              {INVITATION_MANAGEMENT_COPY.referrerHandleLabel}
            </label>
            <Input
              id={INVITATION_MANAGEMENT_DIALOG_INPUT_ID.editReferrerHandle}
              maxLength={REFERRAL_METADATA_LIMIT.referrerHandleMaxLength}
              onChange={(event) => {
                setEditReferralMetadata((currentState) => ({
                  ...currentState,
                  referrerHandle: event.target.value,
                }));
              }}
              placeholder={INVITATION_MANAGEMENT_COPY.referrerHandlePlaceholder}
              value={editReferralMetadata.referrerHandle}
            />
            {editReferralMetadataError ? (
              <p className={styles.TribeInvitationManagement__fieldError}>
                {editReferralMetadataError}
              </p>
            ) : null}
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
              disabled={
                editReferralInProgress || Boolean(editReferralMetadataError)
              }
              onClick={() => {
                void handleSubmitReferralEdit();
              }}
              type={INVITATION_MANAGEMENT_REQUEST.buttonType}
            >
              <PencilIcon />
              {INVITATION_MANAGEMENT_COPY.changePlanSubmit}
            </Button>
          </DialogFooter>
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
              disabled={pendingInvitationId === revokeCandidateId}
              onClick={() => {
                setRevokeCandidateId(null);
              }}
              type={INVITATION_MANAGEMENT_REQUEST.buttonType}
              variant={INVITATION_MANAGEMENT_REQUEST.outlineVariant}
            >
              {INVITATION_MANAGEMENT_COPY.revokeConfirmCancel}
            </Button>
            <Button
              disabled={pendingInvitationId === revokeCandidateId}
              onClick={() => {
                if (revokeCandidateId) {
                  void handleRevokeInvitation(revokeCandidateId);
                }
              }}
              type={INVITATION_MANAGEMENT_REQUEST.buttonType}
              variant={INVITATION_MANAGEMENT_REQUEST.destructiveVariant}
            >
              <Trash2Icon />
              {INVITATION_MANAGEMENT_COPY.revokeConfirmConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
