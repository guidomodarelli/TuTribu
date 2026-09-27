"use client";

import { useState } from "react";
import { AnimatePresence } from "motion/react";

import { Badge, Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Textarea, AnimatedCollapse, AnimatedListItem, PresenceSwap } from "beez-ui";

import { TribeEventTypeBadge } from "@/components/events/tribe-event-type-badge";
import {
  formatBuenosAiresLongDate,
  formatBuenosAiresTime,
} from "@/lib/date-time/buenos-aires-format";
import {
  TRIBE_EVENT_PROPOSALS_LOAD_STATUS,
  type TribeEventProposalsLoadState,
} from "@/hooks/use-tribe-event-proposals";
import type { TribeEventProposalResult } from "@/src/modules/events/application/results/tribe-event-result";
import { TRIBE_EVENT_PROPOSAL_STATUS_LABEL } from "@/src/modules/events/constants/tribe-event-copy";
import {
  TRIBE_EVENT_PROPOSAL_LIMIT,
  TRIBE_EVENT_PROPOSAL_STATUS,
} from "@/src/modules/events/constants/tribe-events";
import styles from "./styles.module.scss";

type TribeEventProposalsPanelProps = {
  /**
   * Viewer role already known from the server render. It sets the panel
   * identity while the queue loads or after a failed load; once loaded, the
   * payload decides.
   */
  canManageEvents: boolean;
  isOpen: boolean;
  isSubmitting: boolean;
  loadState: TribeEventProposalsLoadState;
  onClose: () => void;
  onReject: (proposal: TribeEventProposalResult, reviewNote: string) => Promise<boolean>;
  onRetry: () => void;
  /** Opens the approval form prefilled with the proposal (managers). */
  onReview: (proposal: TribeEventProposalResult) => void;
  onWithdraw: (proposal: TribeEventProposalResult) => void;
};

const EMPTY_VALUE = "";
const REVIEW_NOTE_FIELD_ID_PREFIX = "tribe-event-proposal-note-";
/** Prefix of the per-proposal "Rechazar" button id, used to give focus back. */
const REJECT_BUTTON_ID_PREFIX = "tribe-event-proposal-reject-";
/** Presence keys of the panel body; changing between them cross-fades it. */
const BODY_PRESENCE_KEY = {
  empty: "empty",
  error: "error",
  list: "list",
  loading: "loading",
} as const;
const BADGE_VARIANT = {
  outline: "outline",
  secondary: "secondary",
} as const;
const BUTTON_ATTRIBUTE = {
  sizeSmall: "sm",
  typeButton: "button",
  variantDestructive: "destructive",
  variantGhost: "ghost",
  variantOutline: "outline",
} as const;
const COPY = {
  authorDescription: "Seguí tus propuestas y retirá las que ya no quieras.",
  authorEmpty: "Todavía no propusiste encuentros.",
  authorTitle: "Mis propuestas",
  cancelReject: "Volver",
  confirmReject: "Confirmar rechazo",
  durationSuffix: " min",
  loadError: "No pudimos cargar las propuestas.",
  loading: "Cargando propuestas…",
  managerDescription: "Aprobá una propuesta para publicarla o rechazala con una nota.",
  managerEmpty: "No hay propuestas pendientes.",
  managerTitle: "Propuestas de la tribu",
  proposedBy: "Propuesta por ",
  rejectButton: "Rechazar",
  retry: "Reintentar",
  reviewButton: "Revisar y aprobar",
  reviewNoteLabel: "Nota para quien la propuso (opcional)",
  reviewNotePrefix: "Nota: ",
  scheduleSeparator: " · ",
  withdrawButton: "Retirar",
} as const;

/**
 * Focuses the element with `elementId` after the current update commits, so
 * focus survives when the focused control is swapped for another.
 */
function focusElementAfterCommit(elementId: string): void {
  requestAnimationFrame(() => {
    document.getElementById(elementId)?.focus();
  });
}

function formatProposalSchedule(proposal: TribeEventProposalResult): string {
  return (
    formatBuenosAiresLongDate(proposal.startsAt) +
    COPY.scheduleSeparator +
    formatBuenosAiresTime(proposal.startsAt) +
    COPY.scheduleSeparator +
    proposal.durationMinutes +
    COPY.durationSuffix
  );
}

/**
 * Proposals panel. Managers see the pending queue with "Revisar y aprobar"
 * and "Rechazar" (optional note); members see their own proposals with
 * their status, the review note when rejected, and "Retirar" while pending.
 * Proposals that leave the queue fold away, the rejection note unfolds
 * under its proposal with the focus in the note, and "Volver" returns the
 * focus to "Rechazar".
 */
export function TribeEventProposalsPanel({
  canManageEvents,
  isOpen,
  isSubmitting,
  loadState,
  onClose,
  onReject,
  onRetry,
  onReview,
  onWithdraw,
}: TribeEventProposalsPanelProps) {
  const [rejectingProposalId, setRejectingProposalId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState(EMPTY_VALUE);
  const isLoaded = loadState.status === TRIBE_EVENT_PROPOSALS_LOAD_STATUS.loaded;
  const canReviewProposals = isLoaded ? loadState.canReviewProposals : canManageEvents;

  const startRejecting = (proposal: TribeEventProposalResult) => {
    setRejectingProposalId(proposal.id);
    setReviewNote(EMPTY_VALUE);
    focusElementAfterCommit(REVIEW_NOTE_FIELD_ID_PREFIX + proposal.id);
  };

  const cancelRejecting = (proposal: TribeEventProposalResult) => {
    setRejectingProposalId(null);
    focusElementAfterCommit(REJECT_BUTTON_ID_PREFIX + proposal.id);
  };

  const confirmReject = async (proposal: TribeEventProposalResult) => {
    if (await onReject(proposal, reviewNote)) {
      setRejectingProposalId(null);
    }
  };

  const renderProposal = (proposal: TribeEventProposalResult) => {
    const isPending = proposal.status === TRIBE_EVENT_PROPOSAL_STATUS.pending;
    const isRejecting = rejectingProposalId === proposal.id;
    const noteFieldId = REVIEW_NOTE_FIELD_ID_PREFIX + proposal.id;

    return (
      <AnimatedListItem className={styles.TribeEventProposalsPanel__item} key={proposal.id}>
        <div className={styles.TribeEventProposalsPanel__heading}>
          <p className={styles.TribeEventProposalsPanel__title}>{proposal.title}</p>
          {canReviewProposals ? null : (
            <Badge variant={isPending ? BADGE_VARIANT.outline : BADGE_VARIANT.secondary}>
              {TRIBE_EVENT_PROPOSAL_STATUS_LABEL[proposal.status]}
            </Badge>
          )}
        </div>
        <div className={styles.TribeEventProposalsPanel__meta}>
          <TribeEventTypeBadge eventType={proposal.eventType} />
          <span>{formatProposalSchedule(proposal)}</span>
        </div>
        {canReviewProposals && proposal.proposerName ? (
          <p className={styles.TribeEventProposalsPanel__muted}>
            {COPY.proposedBy}
            {proposal.proposerName}
          </p>
        ) : null}
        {proposal.description ? (
          <p className={styles.TribeEventProposalsPanel__description}>{proposal.description}</p>
        ) : null}
        {!canReviewProposals && proposal.reviewNote ? (
          <p className={styles.TribeEventProposalsPanel__muted}>
            {COPY.reviewNotePrefix}
            {proposal.reviewNote}
          </p>
        ) : null}
        <AnimatedCollapse isOpen={canReviewProposals && isRejecting}>
          <div className={styles.TribeEventProposalsPanel__rejectForm}>
            <label className={styles.TribeEventProposalsPanel__label} htmlFor={noteFieldId}>
              {COPY.reviewNoteLabel}
            </label>
            <Textarea
              id={noteFieldId}
              maxLength={TRIBE_EVENT_PROPOSAL_LIMIT.reviewNoteMaxLength}
              value={reviewNote}
              onChange={(event) => setReviewNote(event.currentTarget.value)}
            />
            <div className={styles.TribeEventProposalsPanel__actions}>
              <Button
                size={BUTTON_ATTRIBUTE.sizeSmall}
                type={BUTTON_ATTRIBUTE.typeButton}
                variant={BUTTON_ATTRIBUTE.variantGhost}
                onClick={() => cancelRejecting(proposal)}
              >
                {COPY.cancelReject}
              </Button>
              <Button
                disabled={isSubmitting}
                size={BUTTON_ATTRIBUTE.sizeSmall}
                type={BUTTON_ATTRIBUTE.typeButton}
                variant={BUTTON_ATTRIBUTE.variantDestructive}
                onClick={() => {
                  void confirmReject(proposal);
                }}
              >
                {COPY.confirmReject}
              </Button>
            </div>
          </div>
        </AnimatedCollapse>
        {canReviewProposals && !isRejecting ? (
          <div className={styles.TribeEventProposalsPanel__actions}>
            <Button
              disabled={isSubmitting}
              size={BUTTON_ATTRIBUTE.sizeSmall}
              type={BUTTON_ATTRIBUTE.typeButton}
              onClick={() => onReview(proposal)}
            >
              {COPY.reviewButton}
            </Button>
            <Button
              disabled={isSubmitting}
              id={REJECT_BUTTON_ID_PREFIX + proposal.id}
              size={BUTTON_ATTRIBUTE.sizeSmall}
              type={BUTTON_ATTRIBUTE.typeButton}
              variant={BUTTON_ATTRIBUTE.variantOutline}
              onClick={() => startRejecting(proposal)}
            >
              {COPY.rejectButton}
            </Button>
          </div>
        ) : null}
        {!canReviewProposals && isPending ? (
          <div className={styles.TribeEventProposalsPanel__actions}>
            <Button
              disabled={isSubmitting}
              size={BUTTON_ATTRIBUTE.sizeSmall}
              type={BUTTON_ATTRIBUTE.typeButton}
              variant={BUTTON_ATTRIBUTE.variantOutline}
              onClick={() => onWithdraw(proposal)}
            >
              {COPY.withdrawButton}
            </Button>
          </div>
        ) : null}
      </AnimatedListItem>
    );
  };

  const bodyPresenceKey =
    loadState.status === TRIBE_EVENT_PROPOSALS_LOAD_STATUS.error
      ? BODY_PRESENCE_KEY.error
      : !isLoaded
        ? BODY_PRESENCE_KEY.loading
        : loadState.proposals.length === 0
          ? BODY_PRESENCE_KEY.empty
          : BODY_PRESENCE_KEY.list;

  const renderBody = () => {
    if (loadState.status === TRIBE_EVENT_PROPOSALS_LOAD_STATUS.error) {
      return (
        <div className={styles.TribeEventProposalsPanel__status} role="alert">
          <p>{loadState.message || COPY.loadError}</p>
          <Button
            size={BUTTON_ATTRIBUTE.sizeSmall}
            type={BUTTON_ATTRIBUTE.typeButton}
            variant={BUTTON_ATTRIBUTE.variantOutline}
            onClick={onRetry}
          >
            {COPY.retry}
          </Button>
        </div>
      );
    }

    if (!isLoaded) {
      return (
        <p aria-live="polite" className={styles.TribeEventProposalsPanel__status}>
          {COPY.loading}
        </p>
      );
    }

    if (loadState.proposals.length === 0) {
      return (
        <p className={styles.TribeEventProposalsPanel__status}>
          {canReviewProposals ? COPY.managerEmpty : COPY.authorEmpty}
        </p>
      );
    }

    return (
      <ul className={styles.TribeEventProposalsPanel__list}>
        <AnimatePresence initial={false}>{loadState.proposals.map(renderProposal)}</AnimatePresence>
      </ul>
    );
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent className={styles.TribeEventProposalsPanel}>
        <DialogHeader>
          <DialogTitle>{canReviewProposals ? COPY.managerTitle : COPY.authorTitle}</DialogTitle>
          <DialogDescription>
            {canReviewProposals ? COPY.managerDescription : COPY.authorDescription}
          </DialogDescription>
        </DialogHeader>
        <PresenceSwap presenceKey={bodyPresenceKey}>{renderBody()}</PresenceSwap>
      </DialogContent>
    </Dialog>
  );
}
