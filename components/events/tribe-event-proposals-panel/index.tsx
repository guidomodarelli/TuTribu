"use client";

import { type ReactNode, useState } from "react";
import { AnimatePresence } from "motion/react";

import { Badge, Button, Dialog, DialogContent, Textarea, AnimatedCollapse, AnimatedListItem, PresenceSwap } from "@golfo/ui";

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
const BUTTON_ATTRIBUTE = {
  sizeSmall: "sm",
  typeButton: "button",
  variantDanger: "danger",
  variantGhost: "ghost",
  variantSecondary: "secondary",
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
    String(proposal.durationMinutes) +
    COPY.durationSuffix
  );
}

/** Body state of the panel; changing it cross-fades the body. */
function resolveBodyPresenceKey(loadState: TribeEventProposalsLoadState) {
  if (loadState.status === TRIBE_EVENT_PROPOSALS_LOAD_STATUS.error) {
    return BODY_PRESENCE_KEY.error;
  }

  if (loadState.status !== TRIBE_EVENT_PROPOSALS_LOAD_STATUS.loaded) {
    return BODY_PRESENCE_KEY.loading;
  }

  return loadState.proposals.length === 0 ? BODY_PRESENCE_KEY.empty : BODY_PRESENCE_KEY.list;
}

type ProposalViewProps = {
  canReviewProposals: boolean;
  proposal: TribeEventProposalResult;
};

/** Title, status, schedule, proposer, description and review note of a proposal. */
function ProposalSummary({ canReviewProposals, proposal }: ProposalViewProps) {
  return (
    <>
      <div className={styles.TribeEventProposalsPanel__heading}>
        <p className={styles.TribeEventProposalsPanel__title}>{proposal.title}</p>
        {canReviewProposals ? null : (
          <Badge>
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
    </>
  );
}

type ProposalRejectFormProps = {
  isOpen: boolean;
  isSubmitting: boolean;
  noteFieldId: string;
  onCancel: () => void;
  onConfirm: () => void;
  onReviewNoteChange: (reviewNote: string) => void;
  reviewNote: string;
};

/** Optional note and confirmation of a rejection, unfolded under its proposal. */
function ProposalRejectForm({
  isOpen,
  isSubmitting,
  noteFieldId,
  onCancel,
  onConfirm,
  onReviewNoteChange,
  reviewNote,
}: ProposalRejectFormProps) {
  return (
    <AnimatedCollapse isOpen={isOpen}>
      <div className={styles.TribeEventProposalsPanel__rejectForm}>
        <Textarea
          id={noteFieldId}
          label={COPY.reviewNoteLabel}
          maxLength={TRIBE_EVENT_PROPOSAL_LIMIT.reviewNoteMaxLength}
          value={reviewNote}
          onChange={(event) => onReviewNoteChange(event.currentTarget.value)}
        />
        <div className={styles.TribeEventProposalsPanel__actions}>
          <Button
            size={BUTTON_ATTRIBUTE.sizeSmall}
            type={BUTTON_ATTRIBUTE.typeButton}
            variant={BUTTON_ATTRIBUTE.variantGhost}
            onClick={onCancel}
          >
            {COPY.cancelReject}
          </Button>
          <Button
            disabled={isSubmitting}
            size={BUTTON_ATTRIBUTE.sizeSmall}
            type={BUTTON_ATTRIBUTE.typeButton}
            variant={BUTTON_ATTRIBUTE.variantDanger}
            onClick={onConfirm}
          >
            {COPY.confirmReject}
          </Button>
        </div>
      </div>
    </AnimatedCollapse>
  );
}

type ProposalActionsProps = ProposalViewProps & {
  isRejecting: boolean;
  isSubmitting: boolean;
  onReview: () => void;
  onStartRejecting: () => void;
  onWithdraw: () => void;
};

/** "Revisar y aprobar" and "Rechazar" for managers; "Retirar" for a pending own proposal. */
function ProposalActions({
  canReviewProposals,
  isRejecting,
  isSubmitting,
  onReview,
  onStartRejecting,
  onWithdraw,
  proposal,
}: ProposalActionsProps) {
  if (canReviewProposals) {
    return isRejecting ? null : (
      <div className={styles.TribeEventProposalsPanel__actions}>
        <Button
          disabled={isSubmitting}
          size={BUTTON_ATTRIBUTE.sizeSmall}
          type={BUTTON_ATTRIBUTE.typeButton}
          onClick={onReview}
        >
          {COPY.reviewButton}
        </Button>
        <Button
          disabled={isSubmitting}
          id={REJECT_BUTTON_ID_PREFIX + proposal.id}
          size={BUTTON_ATTRIBUTE.sizeSmall}
          type={BUTTON_ATTRIBUTE.typeButton}
          variant={BUTTON_ATTRIBUTE.variantSecondary}
          onClick={onStartRejecting}
        >
          {COPY.rejectButton}
        </Button>
      </div>
    );
  }

  return proposal.status === TRIBE_EVENT_PROPOSAL_STATUS.pending ? (
    <div className={styles.TribeEventProposalsPanel__actions}>
      <Button
        disabled={isSubmitting}
        size={BUTTON_ATTRIBUTE.sizeSmall}
        type={BUTTON_ATTRIBUTE.typeButton}
        variant={BUTTON_ATTRIBUTE.variantSecondary}
        onClick={onWithdraw}
      >
        {COPY.withdrawButton}
      </Button>
    </div>
  ) : null;
}

/** Failed load of the proposals, with a retry. */
function ProposalsLoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className={styles.TribeEventProposalsPanel__status} role="alert">
      <p>{message || COPY.loadError}</p>
      <Button
        size={BUTTON_ATTRIBUTE.sizeSmall}
        type={BUTTON_ATTRIBUTE.typeButton}
        variant={BUTTON_ATTRIBUTE.variantSecondary}
        onClick={onRetry}
      >
        {COPY.retry}
      </Button>
    </div>
  );
}

type ProposalsBodyProps = Pick<TribeEventProposalsPanelProps, "loadState" | "onRetry"> & {
  canReviewProposals: boolean;
  renderProposal: (proposal: TribeEventProposalResult) => ReactNode;
};

/** Error, loading, empty or the list of proposals. */
function ProposalsBody({ canReviewProposals, loadState, onRetry, renderProposal }: ProposalsBodyProps) {
  if (loadState.status === TRIBE_EVENT_PROPOSALS_LOAD_STATUS.error) {
    return <ProposalsLoadError message={loadState.message} onRetry={onRetry} />;
  }

  if (loadState.status !== TRIBE_EVENT_PROPOSALS_LOAD_STATUS.loaded) {
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
}

/**
 * Rejection in progress: the proposal whose note is open and the note.
 * Opening it moves the focus into the note; "Volver" returns it to "Rechazar".
 *
 * @param onReject - Sends the rejection; resolves true when it was saved.
 * @returns Rejection state and its actions.
 */
function useProposalRejection(onReject: TribeEventProposalsPanelProps["onReject"]) {
  const [rejectingProposalId, setRejectingProposalId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState(EMPTY_VALUE);

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

  return { cancelRejecting, confirmReject, rejectingProposalId, reviewNote, setReviewNote, startRejecting };
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
  const { cancelRejecting, confirmReject, rejectingProposalId, reviewNote, setReviewNote, startRejecting } =
    useProposalRejection(onReject);
  const isLoaded = loadState.status === TRIBE_EVENT_PROPOSALS_LOAD_STATUS.loaded;
  const canReviewProposals = isLoaded ? loadState.canReviewProposals : canManageEvents;

  const renderProposal = (proposal: TribeEventProposalResult) => {
    const isRejecting = rejectingProposalId === proposal.id;

    return (
      <AnimatedListItem className={styles.TribeEventProposalsPanel__item} key={proposal.id}>
        <ProposalSummary canReviewProposals={canReviewProposals} proposal={proposal} />
        <ProposalRejectForm
          isOpen={canReviewProposals && isRejecting}
          isSubmitting={isSubmitting}
          noteFieldId={REVIEW_NOTE_FIELD_ID_PREFIX + proposal.id}
          reviewNote={reviewNote}
          onCancel={() => cancelRejecting(proposal)}
          onConfirm={() => {
            void confirmReject(proposal);
          }}
          onReviewNoteChange={setReviewNote}
        />
        <ProposalActions
          canReviewProposals={canReviewProposals}
          isRejecting={isRejecting}
          isSubmitting={isSubmitting}
          proposal={proposal}
          onReview={() => onReview(proposal)}
          onStartRejecting={() => startRejecting(proposal)}
          onWithdraw={() => onWithdraw(proposal)}
        />
      </AnimatedListItem>
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
      <DialogContent
        className={styles.TribeEventProposalsPanel}
        title={canReviewProposals ? COPY.managerTitle : COPY.authorTitle}
        description={canReviewProposals ? COPY.managerDescription : COPY.authorDescription}
      >
        <PresenceSwap presenceKey={resolveBodyPresenceKey(loadState)}>
          <ProposalsBody
            canReviewProposals={canReviewProposals}
            loadState={loadState}
            renderProposal={renderProposal}
            onRetry={onRetry}
          />
        </PresenceSwap>
      </DialogContent>
    </Dialog>
  );
}
