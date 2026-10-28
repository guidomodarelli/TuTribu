"use client";

import { useState } from "react";
import { LoaderCircleIcon, Trash2Icon } from "lucide-react";

import { Button, Dialog, DialogContent, Select, AnimatedCollapse, cn, type SelectOption } from "@golfo/ui";

import type { TribeInvitationListItemResult } from "@/src/modules/tribes/application/results/tribe-invitation-result";
import styles from "./styles.module.scss";

const LINKED_INVITATIONS_DIALOG_COPY = {
  actionPlaceholder: "Elegí una acción...",
  cancelButton: "Cancelar",
  confirmButton: "Confirmar y eliminar plan",
  confirmPendingButton: "Eliminando plan...",
  dangerNotice:
    "Los usuarios que tengan este link perderán el acceso a la tribu.",
  description:
    "Este plan está asociado a los siguientes links de invitación. Decidí qué hacer con cada uno antes de eliminarlo.",
  intro: "Links vinculados",
  invitationCreatedByFallback: "Otro miembro",
  optionRevokeLabel: "Eliminar invitación (peligroso)",
  optionSwitchToCurrentLabel: "Cambiar a plan actual",
  optionSwitchToSpecificLabel: "Cambiar a otro plan",
  selectActionLabel: "Acción",
  selectTargetLabel: "Plan destino",
  selectTargetPlaceholder: "Elegí un plan...",
  targetUnavailableNotice:
    "No hay otros planes activos para reasignar este link. Elegí «Cambiar a plan actual» o eliminarlo.",
  title: "Plan con links de invitación asociados",
} as const;

const LINKED_INVITATIONS_DIALOG_FORMAT = {
  currency: "ARS",
  dateStyle: "medium",
  locale: "es",
  style: "currency",
  timeStyle: "short",
} as const;

const ACTION_VALUE = {
  none: "",
  revoke: "revoke",
  switchToCurrent: "switch_to_current",
  switchToSpecific: "switch_to_specific",
} as const;

const ACTION_INPUT_ID_PREFIX = "linked-invitation-action-";
const TARGET_INPUT_ID_PREFIX = "linked-invitation-target-";
const INVITATION_LABEL_SEPARATOR = " · ";
const TARGET_LABEL_SEPARATOR = " · ";

const ICON_SIZE = {
  notice: 14,
} as const;

const PRICE_FORMAT = {
  amountDivider: 100,
  amountMaximumFractionDigits: 0,
} as const;

const BUTTON_TYPE = "button";
const BUTTON_VARIANT = {
  danger: "danger",
  secondary: "secondary",
} as const;

const PRICE_STATUS_ACTIVE = "active";

const SELECTION_KEY_SEPARATOR = "|";

type ActionValue = (typeof ACTION_VALUE)[keyof typeof ACTION_VALUE];

const ARS_PRICE_FORMATTER = new Intl.NumberFormat(
  LINKED_INVITATIONS_DIALOG_FORMAT.locale,
  {
    currency: LINKED_INVITATIONS_DIALOG_FORMAT.currency,
    maximumFractionDigits: PRICE_FORMAT.amountMaximumFractionDigits,
    style: LINKED_INVITATIONS_DIALOG_FORMAT.style,
  }
);

const CREATED_AT_FORMATTER = new Intl.DateTimeFormat(
  LINKED_INVITATIONS_DIALOG_FORMAT.locale,
  {
    dateStyle: LINKED_INVITATIONS_DIALOG_FORMAT.dateStyle,
    timeStyle: LINKED_INVITATIONS_DIALOG_FORMAT.timeStyle,
  }
);

export type LinkedInvitationsDialogTargetPrice = {
  amountCents: number;
  id: string;
  name: string;
};

export type LinkedInvitationActionSelection =
  | { action: typeof ACTION_VALUE.switchToCurrent; invitationId: string }
  | {
      action: typeof ACTION_VALUE.switchToSpecific;
      invitationId: string;
      targetPriceId: string;
    }
  | { action: typeof ACTION_VALUE.revoke; invitationId: string };

type RowSelection = {
  action: ActionValue;
  targetPriceId: string;
};

type LinkedInvitationsDeletionDialogProps = {
  invitations: TribeInvitationListItemResult[];
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: (selections: LinkedInvitationActionSelection[]) => void;
  open: boolean;
  targetPriceOptions: LinkedInvitationsDialogTargetPrice[];
};

/**
 * Formats a plan amount in cents as whole Argentine pesos.
 *
 * @param amountCents - Amount in cents.
 * @returns Localized currency label.
 */
function formatPlanAmount(amountCents: number): string {
  return ARS_PRICE_FORMATTER.format(amountCents / PRICE_FORMAT.amountDivider);
}

/**
 * Labels an invitation link by its creator and creation date.
 *
 * @param invitation - Linked invitation.
 * @returns Creator and date label.
 */
function formatInvitationLabel(invitation: TribeInvitationListItemResult): string {
  const createdAt = CREATED_AT_FORMATTER.format(new Date(invitation.createdAt));
  const createdBy =
    invitation.createdByName ??
    LINKED_INVITATIONS_DIALOG_COPY.invitationCreatedByFallback;

  return createdBy + INVITATION_LABEL_SEPARATOR + createdAt;
}

/**
 * Tells whether a row has every choice its action needs.
 *
 * @param selection - Row action and target plan.
 * @param hasTargetPriceOptions - Whether another active plan can be targeted.
 * @returns True when the row can be submitted.
 */
function isRowSelectionComplete(
  selection: RowSelection,
  hasTargetPriceOptions: boolean
): boolean {
  if (selection.action === ACTION_VALUE.none) {
    return false;
  }

  if (selection.action === ACTION_VALUE.switchToSpecific) {
    return hasTargetPriceOptions && Boolean(selection.targetPriceId);
  }

  return true;
}

/**
 * Builds an unresolved selection for every invitation.
 *
 * @param invitations - Linked invitations.
 * @returns Selections keyed by invitation id.
 */
function buildEmptySelections(
  invitations: TribeInvitationListItemResult[]
): Record<string, RowSelection> {
  return invitations.reduce<Record<string, RowSelection>>(
    (accumulator, invitation) => {
      accumulator[invitation.id] = {
        action: ACTION_VALUE.none,
        targetPriceId: "",
      };

      return accumulator;
    },
    {}
  );
}

/**
 * Builds a key that remounts the dialog body when the invitation set changes.
 *
 * @param invitations - Linked invitations.
 * @returns Stable key made of the invitation ids.
 */
function buildSelectionsKey(
  invitations: TribeInvitationListItemResult[]
): string {
  return invitations
    .map((invitation) => invitation.id)
    .join(SELECTION_KEY_SEPARATOR);
}

type DialogBodyProps = Omit<LinkedInvitationsDeletionDialogProps, "open">;

/**
 * Turns the resolved row selections into the actions sent to the server.
 *
 * @param invitations - Linked invitations.
 * @param selections - Resolved selection of each invitation.
 * @returns One action per invitation.
 */
function buildActionSelectionsPayload(
  invitations: TribeInvitationListItemResult[],
  selections: Record<string, RowSelection>
): LinkedInvitationActionSelection[] {
  return invitations.map(
    (invitation) => {
      const selection = selections[invitation.id];

      if (selection.action === ACTION_VALUE.revoke) {
        return { action: ACTION_VALUE.revoke, invitationId: invitation.id };
      }

      if (selection.action === ACTION_VALUE.switchToSpecific) {
        return {
          action: ACTION_VALUE.switchToSpecific,
          invitationId: invitation.id,
          targetPriceId: selection.targetPriceId,
        };
      }

      return {
        action: ACTION_VALUE.switchToCurrent,
        invitationId: invitation.id,
      };
    }
  );
}

/**
 * Options of the per-invitation action picker.
 *
 * @param hasTargetOptions - Whether another plan can receive the invitation.
 * @returns Select options.
 */
function buildActionOptions(hasTargetOptions: boolean): SelectOption[] {
  return [
    {
      label: LINKED_INVITATIONS_DIALOG_COPY.optionSwitchToCurrentLabel,
      value: ACTION_VALUE.switchToCurrent,
    },
    {
      disabled: !hasTargetOptions,
      label: LINKED_INVITATIONS_DIALOG_COPY.optionSwitchToSpecificLabel,
      value: ACTION_VALUE.switchToSpecific,
    },
    {
      label: LINKED_INVITATIONS_DIALOG_COPY.optionRevokeLabel,
      value: ACTION_VALUE.revoke,
    },
  ];
}

type LinkedInvitationTargetControlProps = {
  hasTargetOptions: boolean;
  invitationId: string;
  onTargetChange: (invitationId: string, value: string) => void;
  targetPriceId: string;
  targetPriceOptions: DialogBodyProps["targetPriceOptions"];
};

/**
 * Target plan picker, or a notice when no other plan can receive the link.
 *
 * @param props - Invitation, its target and the available plans.
 * @returns Target control.
 */
function LinkedInvitationTargetControl({
  hasTargetOptions,
  invitationId,
  onTargetChange,
  targetPriceId,
  targetPriceOptions,
}: LinkedInvitationTargetControlProps) {
  if (!hasTargetOptions) {
    return (
      <p
        className={
          styles.LinkedInvitationsDeletionDialog__notice
        }
      >
        {
          LINKED_INVITATIONS_DIALOG_COPY.targetUnavailableNotice
        }
      </p>
    );
  }

  return (
    <Select
      id={TARGET_INPUT_ID_PREFIX + invitationId}
      label={LINKED_INVITATIONS_DIALOG_COPY.selectTargetLabel}
      onValueChange={(value) =>
        onTargetChange(invitationId, value)
      }
      options={targetPriceOptions.map((price) => ({
        label:
          price.name +
          TARGET_LABEL_SEPARATOR +
          formatPlanAmount(price.amountCents),
        value: price.id,
      }))}
      placeholder={
        LINKED_INVITATIONS_DIALOG_COPY.selectTargetPlaceholder
      }
      value={targetPriceId}
    />
  );
}

type LinkedInvitationRowProps = {
  hasTargetOptions: boolean;
  invitation: TribeInvitationListItemResult;
  onActionChange: (invitationId: string, value: string) => void;
  onTargetChange: (invitationId: string, value: string) => void;
  selection: RowSelection;
  targetPriceOptions: DialogBodyProps["targetPriceOptions"];
};

/**
 * One linked invitation with its action picker and the controls that the
 * chosen action reveals.
 *
 * @param props - Invitation, its selection, the target plans and callbacks.
 * @returns Invitation row.
 */
function LinkedInvitationRow({
  hasTargetOptions,
  invitation,
  onActionChange,
  onTargetChange,
  selection,
  targetPriceOptions,
}: LinkedInvitationRowProps) {
  return (
    <li
      className={styles.LinkedInvitationsDeletionDialog__item}
    >
      <span
        className={styles.LinkedInvitationsDeletionDialog__itemLabel}
      >
        {formatInvitationLabel(invitation)}
      </span>
      <div
        className={styles.LinkedInvitationsDeletionDialog__itemControls}
      >
        <Select
          id={ACTION_INPUT_ID_PREFIX + invitation.id}
          label={LINKED_INVITATIONS_DIALOG_COPY.selectActionLabel}
          onValueChange={(value) =>
            onActionChange(invitation.id, value)
          }
          options={buildActionOptions(hasTargetOptions)}
          placeholder={LINKED_INVITATIONS_DIALOG_COPY.actionPlaceholder}
          value={selection.action}
        />
        <AnimatedCollapse
          className={
            styles.LinkedInvitationsDeletionDialog__conditionalControls
          }
          isOpen={selection.action === ACTION_VALUE.switchToSpecific}
        >
          <LinkedInvitationTargetControl
            hasTargetOptions={hasTargetOptions}
            invitationId={invitation.id}
            onTargetChange={onTargetChange}
            targetPriceId={selection.targetPriceId}
            targetPriceOptions={targetPriceOptions}
          />
        </AnimatedCollapse>
        <AnimatedCollapse
          className={
            styles.LinkedInvitationsDeletionDialog__conditionalControls
          }
          isOpen={selection.action === ACTION_VALUE.revoke}
        >
          <p
            className={cn(
              styles.LinkedInvitationsDeletionDialog__notice,
              styles["LinkedInvitationsDeletionDialog__notice--danger"]
            )}
          >
            <Trash2Icon aria-hidden size={ICON_SIZE.notice} />
            {LINKED_INVITATIONS_DIALOG_COPY.dangerNotice}
          </p>
        </AnimatedCollapse>
      </div>
    </li>
  );
}

type LinkedInvitationsDialogFooterProps = {
  canConfirm: boolean;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

/**
 * Cancel and confirm actions of the dialog.
 *
 * @param props - Submission state, whether every row is resolved and callbacks.
 * @returns Dialog footer.
 */
function LinkedInvitationsDialogFooter({
  canConfirm,
  isSubmitting,
  onCancel,
  onConfirm,
}: LinkedInvitationsDialogFooterProps) {
  return (
    <>
      <Button
        disabled={isSubmitting}
        onClick={onCancel}
        type={BUTTON_TYPE}
        variant={BUTTON_VARIANT.secondary}
      >
        {LINKED_INVITATIONS_DIALOG_COPY.cancelButton}
      </Button>
      <Button
        aria-busy={isSubmitting || undefined}
        disabled={isSubmitting || !canConfirm}
        onClick={onConfirm}
        type={BUTTON_TYPE}
        variant={BUTTON_VARIANT.danger}
      >
        {isSubmitting ? (
          <LoaderCircleIcon
            aria-hidden
            className={styles.LinkedInvitationsDeletionDialog__spinner}
          />
        ) : (
          <Trash2Icon aria-hidden />
        )}
        {isSubmitting
          ? LINKED_INVITATIONS_DIALOG_COPY.confirmPendingButton
          : LINKED_INVITATIONS_DIALOG_COPY.confirmButton}
      </Button>
    </>
  );
}

/**
 * Reads the selection of a row, unresolved when it has none yet.
 *
 * @param selections - Selections keyed by invitation id.
 * @param invitationId - Invitation id.
 * @returns Row selection.
 */
function getRowSelection(
  selections: Record<string, RowSelection>,
  invitationId: string
): RowSelection {
  return (
    selections[invitationId] ?? {
      action: ACTION_VALUE.none,
      targetPriceId: "",
    }
  );
}

/**
 * Per-invitation action and target plan chosen in the dialog.
 *
 * @param invitations - Linked invitations.
 * @returns Selections and their change handlers.
 */
function useLinkedInvitationSelections(
  invitations: TribeInvitationListItemResult[]
) {
  const [selections, setSelections] = useState<Record<string, RowSelection>>(
    () => buildEmptySelections(invitations)
  );

  const handleActionChange = (invitationId: string, value: string) => {
    setSelections((current) => ({
      ...current,
      [invitationId]: {
        action: value as ActionValue,
        targetPriceId:
          value === ACTION_VALUE.switchToSpecific
            ? current[invitationId]?.targetPriceId ?? ""
            : "",
      },
    }));
  };

  const handleTargetChange = (invitationId: string, value: string) => {
    setSelections((current) => ({
      ...current,
      [invitationId]: {
        action: ACTION_VALUE.switchToSpecific,
        targetPriceId: value,
      },
    }));
  };

  return { handleActionChange, handleTargetChange, selections };
}

/**
 * Per-invitation action pickers and the confirm footer of the dialog.
 *
 * @param props - Invitations, target plans, submission state and callbacks.
 * @returns Dialog body.
 */
function LinkedInvitationsDeletionDialogBody({
  invitations,
  isSubmitting,
  onCancel,
  onConfirm,
  targetPriceOptions,
}: DialogBodyProps) {
  const { handleActionChange, handleTargetChange, selections } =
    useLinkedInvitationSelections(invitations);
  const hasTargetOptions = targetPriceOptions.length > 0;
  const allRowsResolved = invitations.every((invitation) =>
    isRowSelectionComplete(
      getRowSelection(selections, invitation.id),
      hasTargetOptions
    )
  );

  const handleConfirm = () => {
    if (!allRowsResolved) {
      return;
    }

    onConfirm(buildActionSelectionsPayload(invitations, selections));
  };

  return (
    <DialogContent
      className={styles.LinkedInvitationsDeletionDialog}
      title={LINKED_INVITATIONS_DIALOG_COPY.title}
      description={LINKED_INVITATIONS_DIALOG_COPY.description}
      footer={
        <LinkedInvitationsDialogFooter
          canConfirm={allRowsResolved}
          isSubmitting={isSubmitting}
          onCancel={onCancel}
          onConfirm={handleConfirm}
        />
      }
    >
      <p className={styles.LinkedInvitationsDeletionDialog__intro}>
        {LINKED_INVITATIONS_DIALOG_COPY.intro} ({invitations.length})
      </p>
      <ol className={styles.LinkedInvitationsDeletionDialog__list}>
        {invitations.map((invitation) => {
          const selection = getRowSelection(selections, invitation.id);

          return (
            <LinkedInvitationRow
              hasTargetOptions={hasTargetOptions}
              invitation={invitation}
              key={invitation.id}
              onActionChange={handleActionChange}
              onTargetChange={handleTargetChange}
              selection={selection}
              targetPriceOptions={targetPriceOptions}
            />
          );
        })}
      </ol>
    </DialogContent>
  );
}

export { PRICE_STATUS_ACTIVE };

/**
 * Asks what to do with each invitation link tied to a plan before deleting it.
 *
 * @param props - Open state, invitations, target plans and callbacks.
 * @returns Controlled dialog.
 */
export function LinkedInvitationsDeletionDialog({
  invitations,
  isSubmitting,
  onCancel,
  onConfirm,
  open,
  targetPriceOptions,
}: LinkedInvitationsDeletionDialogProps) {
  const handleDialogChange = (nextOpen: boolean) => {
    if (isSubmitting) {
      return;
    }

    if (!nextOpen) {
      onCancel();
    }
  };

  // Each opening starts from empty selections. The body stays mounted while
  // the dialog closes, so the panel animates out with the rows it showed.
  const [openingCount, setOpeningCount] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);

  if (open !== wasOpen) {
    setWasOpen(open);

    if (open) {
      setOpeningCount((currentCount) => currentCount + 1);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <LinkedInvitationsDeletionDialogBody
        invitations={invitations}
        isSubmitting={isSubmitting}
        key={`${openingCount}-${buildSelectionsKey(invitations)}`}
        onCancel={onCancel}
        onConfirm={onConfirm}
        targetPriceOptions={targetPriceOptions}
      />
    </Dialog>
  );
}
