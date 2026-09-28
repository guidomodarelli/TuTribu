"use client";

import { Fragment, useState } from "react";
import { LoaderCircleIcon, Trash2Icon } from "lucide-react";

import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, AnimatedCollapse, cn } from "beez-ui";

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
  destructive: "destructive",
  outline: "outline",
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
  const [selections, setSelections] = useState<Record<string, RowSelection>>(
    () => buildEmptySelections(invitations)
  );

  const hasTargetOptions = targetPriceOptions.length > 0;
  const allRowsResolved = invitations.every((invitation) =>
    isRowSelectionComplete(
      selections[invitation.id] ?? {
        action: ACTION_VALUE.none,
        targetPriceId: "",
      },
      hasTargetOptions
    )
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

  const handleConfirm = () => {
    if (!allRowsResolved) {
      return;
    }

    const payload: LinkedInvitationActionSelection[] = invitations.map(
      (invitation) => {
        const selection = selections[invitation.id]!;

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

    onConfirm(payload);
  };

  return (
    <Fragment>
      <p className={styles.LinkedInvitationsDeletionDialog__intro}>
        {LINKED_INVITATIONS_DIALOG_COPY.intro} ({invitations.length})
      </p>
      <ol className={styles.LinkedInvitationsDeletionDialog__list}>
        {invitations.map((invitation) => {
          const selection = selections[invitation.id] ?? {
            action: ACTION_VALUE.none,
            targetPriceId: "",
          };

          return (
            <li
              className={styles.LinkedInvitationsDeletionDialog__item}
              key={invitation.id}
            >
              <span
                className={styles.LinkedInvitationsDeletionDialog__itemLabel}
              >
                {formatInvitationLabel(invitation)}
              </span>
              <div
                className={styles.LinkedInvitationsDeletionDialog__itemControls}
              >
                <label
                  className={
                    styles.LinkedInvitationsDeletionDialog__controlLabel
                  }
                  htmlFor={ACTION_INPUT_ID_PREFIX + invitation.id}
                >
                  {LINKED_INVITATIONS_DIALOG_COPY.selectActionLabel}
                </label>
                <Select
                  onValueChange={(value) =>
                    handleActionChange(invitation.id, value)
                  }
                  value={selection.action}
                >
                  <SelectTrigger id={ACTION_INPUT_ID_PREFIX + invitation.id}>
                    <SelectValue
                      placeholder={
                        LINKED_INVITATIONS_DIALOG_COPY.actionPlaceholder
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ACTION_VALUE.switchToCurrent}>
                      {
                        LINKED_INVITATIONS_DIALOG_COPY.optionSwitchToCurrentLabel
                      }
                    </SelectItem>
                    <SelectItem
                      disabled={!hasTargetOptions}
                      value={ACTION_VALUE.switchToSpecific}
                    >
                      {
                        LINKED_INVITATIONS_DIALOG_COPY.optionSwitchToSpecificLabel
                      }
                    </SelectItem>
                    <SelectItem value={ACTION_VALUE.revoke}>
                      {LINKED_INVITATIONS_DIALOG_COPY.optionRevokeLabel}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <AnimatedCollapse
                  className={
                    styles.LinkedInvitationsDeletionDialog__conditionalControls
                  }
                  isOpen={selection.action === ACTION_VALUE.switchToSpecific}
                >
                  <label
                    className={
                      styles.LinkedInvitationsDeletionDialog__controlLabel
                    }
                    htmlFor={TARGET_INPUT_ID_PREFIX + invitation.id}
                  >
                    {LINKED_INVITATIONS_DIALOG_COPY.selectTargetLabel}
                  </label>
                  {hasTargetOptions ? (
                    <Select
                      onValueChange={(value) =>
                        handleTargetChange(invitation.id, value)
                      }
                      value={selection.targetPriceId}
                    >
                      <SelectTrigger
                        id={TARGET_INPUT_ID_PREFIX + invitation.id}
                      >
                        <SelectValue
                          placeholder={
                            LINKED_INVITATIONS_DIALOG_COPY.selectTargetPlaceholder
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {targetPriceOptions.map((price) => (
                          <SelectItem key={price.id} value={price.id}>
                            {price.name}
                            {TARGET_LABEL_SEPARATOR}
                            {formatPlanAmount(price.amountCents)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p
                      className={
                        styles.LinkedInvitationsDeletionDialog__notice
                      }
                    >
                      {
                        LINKED_INVITATIONS_DIALOG_COPY.targetUnavailableNotice
                      }
                    </p>
                  )}
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
        })}
      </ol>
      <DialogFooter>
        <Button
          disabled={isSubmitting}
          onClick={onCancel}
          type={BUTTON_TYPE}
          variant={BUTTON_VARIANT.outline}
        >
          {LINKED_INVITATIONS_DIALOG_COPY.cancelButton}
        </Button>
        <Button
          aria-busy={isSubmitting || undefined}
          disabled={isSubmitting || !allRowsResolved}
          onClick={handleConfirm}
          type={BUTTON_TYPE}
          variant={BUTTON_VARIANT.destructive}
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
      </DialogFooter>
    </Fragment>
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

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent className={styles.LinkedInvitationsDeletionDialog}>
        <DialogHeader>
          <DialogTitle>{LINKED_INVITATIONS_DIALOG_COPY.title}</DialogTitle>
          <DialogDescription>
            {LINKED_INVITATIONS_DIALOG_COPY.description}
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <LinkedInvitationsDeletionDialogBody
            invitations={invitations}
            isSubmitting={isSubmitting}
            key={buildSelectionsKey(invitations)}
            onCancel={onCancel}
            onConfirm={onConfirm}
            targetPriceOptions={targetPriceOptions}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
