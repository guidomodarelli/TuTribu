"use client";

import { TrashIcon } from "lucide-react";
import { AnimatePresence } from "motion/react";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  Input,
  Pagination,
} from "@golfo/ui";
import { MorphLoader } from "@/components/loaders/morph-loader";
import { buildTribeRoundPageHref } from "@/lib/messages/tribe-round-location";
import { RoundChannelFilters } from "@/components/tribe-round/round-channel-filters";
import { TRIBE_ROUND_FIRST_PAGE } from "@/src/modules/messages/constants/tribe-round-query";
import styles from "./styles.module.scss";
import {
  buildRoundStateResetKey,
  RoundParticipationNotice,
  TRIBE_ROUND_ATTRIBUTES,
  TRIBE_ROUND_COPY,
  TRIBE_ROUND_FORM,
  TRIBE_ROUND_LOADER_SIZE_PX,
  type TribeRoundProps,
} from "./tribe-round-shared";
import { type TribeRoundController, useTribeRoundController } from "./use-tribe-round-controller";
import {
  applyNavigatedRound,
  handleConfirmMessageDeletion,
  handleDeleteConfirmationOpenChange,
  handleEditCreatedAtOpenChange,
  handleRoundPageChange,
  handleSubmitCreatedAt,
} from "./message-actions";
import { renderMessageComposerDialog } from "./composer-render";
import { renderMessageImageCarouselDialog, renderRoundMessageCard } from "./message-render";
import { renderMessageDetailsDialog } from "./message-details-render";

/**
 * Tribe round of one server-rendered page: wires the round controller and
 * renders the round section from it.
 */
function TribeRoundContent(props: TribeRoundProps) {
  const controller = useTribeRoundController(props, applyNavigatedRound);

  return renderTribeRoundContent(controller);
}

/**
 * Renders the round section: composer, channel filters, feed, pagination, and dialogs.
 */
function renderTribeRoundContent(controller: TribeRoundController) {
  return (
    <section
      className={styles.TribeRound}
      aria-label={TRIBE_ROUND_COPY.sectionLabel}
      ref={controller.roundSectionRef}
    >
      {renderDeleteMessageDialog(controller)}
      {renderRoundParticipationNotice(controller)}

      {renderMessageComposerDialog(controller)}

      {renderRoundChannelFilters(controller)}

      {renderRoundNavigationStatus(controller)}
      {renderRoundNavigationError(controller)}

      {renderRoundMessageList(controller)}
      {renderRoundPagination(controller)}
      {renderMessageImageCarouselDialog(controller)}
      {renderMessageDetailsDialog(controller)}
      {renderEditCreatedAtDialog(controller)}
    </section>
  );
}

/**
 * Renders the confirmation dialog shown before deleting a message.
 */
function renderDeleteMessageDialog(controller: TribeRoundController) {
  return (
    <Dialog
      open={Boolean(controller.messagePendingDeletion)}
      onOpenChange={(isOpen) => handleDeleteConfirmationOpenChange(controller, isOpen)}
    >
      <DialogContent
        className={styles.TribeRound__deleteMessageDialog}
        showCloseButton={!controller.isBusy}
        title={TRIBE_ROUND_COPY.messageDeleteConfirmTitle}
        description={TRIBE_ROUND_COPY.messageDeleteConfirmDescription}
        footer={
          <>
            <Button
              disabled={controller.isBusy}
              onClick={() => controller.setMessagePendingDeletion(null)}
              type={TRIBE_ROUND_FORM.buttonType}
              variant={TRIBE_ROUND_FORM.secondaryVariant}
            >
              {TRIBE_ROUND_COPY.messageDeleteConfirmCancel}
            </Button>
            <Button
              className={styles.TribeRound__deleteMessageConfirmButton}
              disabled={controller.isBusy}
              onClick={() => handleConfirmMessageDeletion(controller)}
              type={TRIBE_ROUND_FORM.buttonType}
              variant={TRIBE_ROUND_FORM.dangerVariant}
            >
              <TrashIcon />
              {TRIBE_ROUND_COPY.messageDeleteConfirmSubmit}
            </Button>
          </>
        }
      />
    </Dialog>
  );
}

/**
 * Renders the participation notice for viewers who cannot create messages.
 */
function renderRoundParticipationNotice(controller: TribeRoundController) {
  return !controller.round.viewerPermissions.canCreateMessage ? (
    <RoundParticipationNotice
      requiresAcademyToParticipate={
        controller.round.viewerPermissions.requiresAcademyToParticipate
      }
      tribeSlug={controller.tribeSlug}
    />
  ) : null;
}

/**
 * Renders the channel filter chips when the tribe has channels.
 */
function renderRoundChannelFilters(controller: TribeRoundController) {
  return controller.round.channels.length > 0 ? (
    <RoundChannelFilters
      activeChannelId={controller.round.activeChannelId ?? null}
      allChannelsLabel={TRIBE_ROUND_COPY.tribeChannelFilterAll}
      buildChannelHref={(channelSlug) =>
        buildTribeRoundPageHref({
          channelSlug,
          page: 1,
          tribeSlug: controller.tribeSlug,
        })
      }
      channels={controller.round.channels}
      navigationLabel={TRIBE_ROUND_COPY.tribeChannelLabel}
      onChannelSelect={(channelSlug) =>
        controller.roundNavigation.navigateToLocation({
          channelSlug,
          page: TRIBE_ROUND_FIRST_PAGE,
        })
      }
    />
  ) : null;
}

/**
 * Renders the loader shown while another round page loads in place.
 */
function renderRoundNavigationStatus(controller: TribeRoundController) {
  return controller.roundNavigation.isLoading ? (
    <div className={styles.TribeRound__navigationStatus}>
      <MorphLoader
        label={TRIBE_ROUND_COPY.roundPageLoading}
        size={TRIBE_ROUND_LOADER_SIZE_PX}
      />
    </div>
  ) : null;
}

/**
 * Renders the error shown when a round page failed to load, with a retry button.
 */
function renderRoundNavigationError(controller: TribeRoundController) {
  return controller.roundNavigation.errorMessage ? (
    <div className={styles.TribeRound__navigationError} role="alert">
      <p className={styles.TribeRound__navigationErrorText}>
        {controller.roundNavigation.errorMessage}
      </p>
      <Button
        onClick={controller.roundNavigation.retry}
        type={TRIBE_ROUND_FORM.buttonType}
        variant={TRIBE_ROUND_FORM.secondaryVariant}
      >
        {TRIBE_ROUND_COPY.roundPageRetry}
      </Button>
    </div>
  ) : null;
}

/**
 * Renders the round messages, or the empty state when there are none.
 */
function renderRoundMessageList(controller: TribeRoundController) {
  return controller.messages.length === 0 ? (
    <div
      aria-busy={controller.roundNavigation.isLoading || undefined}
      className={
        controller.roundNavigation.isLoading
          ? `${styles.TribeRound__empty} ${styles["TribeRound__empty--loading"]}`
          : styles.TribeRound__empty
      }
    >
      <h3 className={styles.TribeRound__emptyTitle}>
        {TRIBE_ROUND_COPY.emptyTitle}
      </h3>
      <p className={styles.TribeRound__emptyDescription}>
        {TRIBE_ROUND_COPY.emptyDescription}
      </p>
    </div>
  ) : (
    <ol
      aria-busy={controller.roundNavigation.isLoading || undefined}
      className={
        controller.roundNavigation.isLoading
          ? `${styles.TribeRound__messageList} ${styles["TribeRound__messageList--loading"]}`
          : styles.TribeRound__messageList
      }
    >
      <AnimatePresence initial={false}>
      {controller.messages.map((message, messageIndex) =>
          renderRoundMessageCard(controller, message, messageIndex)
        )}
      </AnimatePresence>
    </ol>
  );
}

/**
 * Renders the round pagination when there is more than one page.
 */
function renderRoundPagination(controller: TribeRoundController) {
  return controller.visiblePagination.hasPreviousPage ||
    controller.visiblePagination.hasNextPage ? (
    <Pagination
      className={styles.TribeRound__pagination}
      getHref={(page) =>
        buildTribeRoundPageHref({
          channelSlug: controller.activeChannel?.slug ?? null,
          page,
          tribeSlug: controller.tribeSlug,
        })
      }
      hasNextPage={controller.visiblePagination.hasNextPage}
      onPageChange={(page, event) => handleRoundPageChange(controller, page, event)}
      page={controller.visiblePagination.currentPage}
    />
  ) : null;
}

/**
 * Renders the dialog that edits the created date of a message.
 */
function renderEditCreatedAtDialog(controller: TribeRoundController) {
  return (
    <Dialog
      open={Boolean(controller.editingCreatedAtMessageId)}
      onOpenChange={(isOpen) => handleEditCreatedAtOpenChange(controller, isOpen)}
    >
      <DialogContent
        className={styles.TribeRound__editCreatedAtDialog}
        title={TRIBE_ROUND_COPY.messageEditCreatedAtTitle}
        description={TRIBE_ROUND_COPY.messageEditCreatedAtDescription}
        footer={
          <>
            <DialogClose asChild>
              <Button
                disabled={controller.isBusy}
                type={TRIBE_ROUND_FORM.buttonType}
                variant={TRIBE_ROUND_FORM.secondaryVariant}
              >
                {TRIBE_ROUND_COPY.messageEditCreatedAtCancel}
              </Button>
            </DialogClose>
            <Button
              disabled={controller.isBusy || !controller.editingCreatedAtValue.trim()}
              form={TRIBE_ROUND_ATTRIBUTES.editCreatedAtFormId}
              type={TRIBE_ROUND_FORM.submitType}
            >
              {TRIBE_ROUND_COPY.messageEditCreatedAtSubmit}
            </Button>
          </>
        }
      >
        <form
          className={styles.TribeRound__editCreatedAtForm}
          id={TRIBE_ROUND_ATTRIBUTES.editCreatedAtFormId}
          onSubmit={(event) => {
            void handleSubmitCreatedAt(controller, event);
          }}
        >
          <Input
            disabled={controller.isBusy}
            label={TRIBE_ROUND_COPY.messageEditCreatedAtInputLabel}
            onChange={(event) => {
              controller.setEditingCreatedAtValue(event.target.value);
            }}
            required
            step={TRIBE_ROUND_FORM.dateTimeLocalStep}
            type={TRIBE_ROUND_FORM.dateTimeLocalInputType}
            value={controller.editingCreatedAtValue}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TribeRound(props: TribeRoundProps) {
  const resetKey = buildRoundStateResetKey(props.tribeSlug, props.round);

  return <TribeRoundContent key={resetKey} {...props} />;
}
