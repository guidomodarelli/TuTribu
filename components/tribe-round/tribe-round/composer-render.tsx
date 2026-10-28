/**
 * @file Render helpers for the message composer dialog and its drafts.
 */
import Image from "next/image";
import {
  ChevronDownIcon,
  FileIcon,
  ImageIcon,
  ListPlusIcon,
  PaperclipIcon,
  RotateCcwIcon,
  SendIcon,
  TrashIcon,
  VideoIcon,
  VoteIcon,
  XIcon,
} from "lucide-react";
import {
  Avatar,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
  DropdownMenu,
  formatFileSize,
  RichLinkEditor,
} from "@golfo/ui";
import { ATTACHMENT_FILE_INPUT_ACCEPT } from "@/src/constants/attachment-files";
import { MESSAGE_FILES, MESSAGE_MEDIA, MESSAGE_MEDIA_KIND } from "@/src/modules/messages/constants/message-round";
import styles from "./styles.module.scss";
import {
  COMPOSER_FILE_UPLOAD_STATUS,
  COMPOSER_IMAGE_UPLOAD_STATUS,
  type ComposerFileDraft,
  type ComposerImageMediaDraft,
  type ComposerVideoMediaDraft,
  getUploadStatusLabel,
  MESSAGE_COMPOSER_FIELD_ANCHOR_KEY,
  MESSAGE_COMPOSER_POLL_ERROR_COPIES,
  safeParseVideoUrl,
  TRIBE_ROUND_ATTRIBUTES,
  TRIBE_ROUND_COPY,
  TRIBE_ROUND_FORM,
  TRIBE_ROUND_POLL,
  TRIBE_ROUND_SYMBOLS,
} from "./tribe-round-shared";
import type { TribeRoundController } from "./use-tribe-round-controller";
import {
  addVideoMediaDraft,
  handleMessageComposerOpenChange,
  handleMessageFileSelection,
  handleMessageImageSelection,
  removeMessageFileDraft,
  removeMessageImageDraft,
  removeVideoMediaDraft,
  retryMessageFileDraftUpload,
  updateVideoMediaDraftUrl,
} from "./composer-draft-actions";
import { handleCreateMessage } from "./message-create-actions";

/**
 * Renders the inline error message for a single composer field next to it,
 * shown only while that field's requirement is part of the active errors. The
 * general "Falta completar" summary keeps listing every error in parallel.
 */
const renderComposerFieldError = (controller: TribeRoundController, errorCopy: string) =>
  controller.messageComposerErrors.includes(errorCopy) ? (
    <p className={styles.TribeRound__fieldError}>{errorCopy}</p>
  ) : null;

/**
 * Whether an empty option shows its own "complete this option" error inline.
 * Only the first {@link TRIBE_ROUND_POLL.minimumOptionCount} options are
 * mandatory, and the error surfaces once the required-option validation fails,
 * so the user sees exactly which mandatory options are still empty.
 */
const shouldShowPollOptionRequiredError = (controller: TribeRoundController, 
  optionIndex: number,
  optionValue: string
) =>
  controller.messageComposerErrors.includes(
    TRIBE_ROUND_COPY.messageComposerPollOptionsRequired
  ) &&
  optionIndex < TRIBE_ROUND_POLL.minimumOptionCount &&
  optionValue.trim().length === 0;

/**
 * Renders the poll requirements that are not tied to a single option (option
 * count limit, options too long, duplicate options) inline at the foot of the
 * poll composer. The "missing required option" case is rendered per option
 * instead, by {@link shouldShowPollOptionRequiredError}.
 */
const renderComposerPollErrors = (controller: TribeRoundController) =>
  MESSAGE_COMPOSER_POLL_ERROR_COPIES.filter(
    (errorCopy) =>
      errorCopy !== TRIBE_ROUND_COPY.messageComposerPollOptionsRequired &&
      controller.messageComposerErrors.includes(errorCopy)
  ).map((errorCopy) => (
    <p className={styles.TribeRound__fieldError} key={errorCopy}>
      {errorCopy}
    </p>
  ));

const renderComposerImageMediaDraft = (controller: TribeRoundController, 
  mediaDraft: ComposerImageMediaDraft
) => (
  <div
    className={styles.TribeRound__imageDraft}
    key={mediaDraft.localId}
    ref={controller.registerComposerBlockTarget(mediaDraft.localId)}
  >
    <div className={styles.TribeRound__imageDraftPreview}>
      {mediaDraft.previewUrl ? (
        <Image
          alt={mediaDraft.altText || TRIBE_ROUND_COPY.imageAltInputLabel}
          className={styles.TribeRound__imageDraftImage}
          fill
          sizes="96px"
          src={mediaDraft.previewUrl}
          unoptimized
        />
      ) : (
        <ImageIcon />
      )}
      {mediaDraft.status === COMPOSER_IMAGE_UPLOAD_STATUS.uploading ? (
        <div
          aria-label={TRIBE_ROUND_COPY.imageUploadingLabel}
          className={styles.TribeRound__imageDraftLoadingOverlay}
          role="status"
        >
          <span className={styles.TribeRound__imageDraftSpinner} />
        </div>
      ) : null}
    </div>
    <input
      aria-label={TRIBE_ROUND_COPY.imageAltInputLabel}
      className={styles.TribeRound__imageAltInput}
      ref={controller.registerComposerFocusTarget(mediaDraft.localId)}
      disabled={controller.isBusy}
      onChange={(event) => {
        const altText = event.currentTarget.value;

        controller.setMessageImageDrafts((currentImages) =>
          currentImages.map((image) =>
            image.localId === mediaDraft.localId
              ? { ...image, altText }
              : image
          )
        );
      }}
      placeholder={TRIBE_ROUND_COPY.imageAltInputPlaceholder}
      value={mediaDraft.altText}
    />
    <span className={styles.TribeRound__imageDraftStatus}>
      {getUploadStatusLabel({
        errorLabel: TRIBE_ROUND_COPY.imageUploadError,
        hasFailed: mediaDraft.status === COMPOSER_IMAGE_UPLOAD_STATUS.error,
        isUploading: mediaDraft.status === COMPOSER_IMAGE_UPLOAD_STATUS.uploading,
        uploadingLabel: TRIBE_ROUND_COPY.imageUploadingLabel,
      })}
    </span>
    <Button
      aria-label={TRIBE_ROUND_COPY.imageRemoveButton}
      className={styles.TribeRound__imageRemoveButton}
      disabled={controller.isBusy}
      onClick={() => {
        removeMessageImageDraft(controller, {
          altText: mediaDraft.altText,
          assetId: mediaDraft.assetId,
          isPersisted: mediaDraft.isPersisted,
          localId: mediaDraft.localId,
          previewUrl: mediaDraft.previewUrl,
          status: mediaDraft.status,
        });
      }}
      size={TRIBE_ROUND_FORM.iconSize}
      type={TRIBE_ROUND_FORM.buttonType}
      variant={TRIBE_ROUND_FORM.ghostVariant}
    >
      <XIcon />
    </Button>
  </div>
);

const renderComposerVideoMediaDraft = (controller: TribeRoundController, 
  mediaDraft: ComposerVideoMediaDraft
) => {
  const detectedVideo = safeParseVideoUrl(mediaDraft.url);
  const trimmedVideoUrl = mediaDraft.url.trim();
  const showVideoParseError = trimmedVideoUrl.length > 0 && !detectedVideo;
  const showVideoMissingError =
    trimmedVideoUrl.length === 0 &&
    controller.messageComposerErrors.includes(TRIBE_ROUND_COPY.videoMissing);
  let videoErrorMessage: string | null = null;
  if (showVideoParseError) {
    videoErrorMessage = TRIBE_ROUND_COPY.videoInvalidUrl;
  } else if (showVideoMissingError) {
    videoErrorMessage = TRIBE_ROUND_COPY.videoMissing;
  }

  return (
    <div
      className={styles.TribeRound__videoComposer}
      key={mediaDraft.localId}
      ref={controller.registerComposerBlockTarget(mediaDraft.localId)}
    >
      <div className={styles.TribeRound__videoComposerHeader}>
        <label className={styles.TribeRound__videoComposerLabel}>
          <span>{TRIBE_ROUND_COPY.videoComposerHeading}</span>
          <input
            aria-describedby={
              controller.hasMessageComposerErrors
                ? TRIBE_ROUND_ATTRIBUTES.messageComposerErrorId
                : undefined
            }
            aria-invalid={showVideoParseError || showVideoMissingError}
            className={styles.TribeRound__videoInput}
            ref={controller.registerComposerFocusTarget(mediaDraft.localId)}
            disabled={controller.isBusy}
            onChange={(event) => {
              updateVideoMediaDraftUrl(controller,
                mediaDraft.localId,
                event.currentTarget.value
              );
            }}
            placeholder={TRIBE_ROUND_COPY.videoUrlPlaceholder}
            type={TRIBE_ROUND_FORM.urlInputType}
            value={mediaDraft.url}
          />
        </label>
        <Button
          aria-label={TRIBE_ROUND_COPY.videoRemoveButton}
          className={styles.TribeRound__videoComposerCloseButton}
          disabled={controller.isBusy}
          onClick={() => {
            removeVideoMediaDraft(controller, mediaDraft.localId);
          }}
          type={TRIBE_ROUND_FORM.buttonType}
          variant={TRIBE_ROUND_FORM.ghostVariant}
        >
          <XIcon />
        </Button>
      </div>
      {detectedVideo ? (
        <p className={styles.TribeRound__videoComposerHint}>
          {TRIBE_ROUND_COPY.videoProviderDetectedPrefix}{" "}
          {TRIBE_ROUND_COPY.videoProviderLabel[detectedVideo.provider]}
        </p>
      ) : null}
      {videoErrorMessage ? (
        <p
          className={`${styles.TribeRound__fieldError} ${styles["TribeRound__fieldError--video"]}`}
        >
          {videoErrorMessage}
        </p>
      ) : null}
    </div>
  );
};

const renderComposerMediaDrafts = (controller: TribeRoundController) => {
  if (controller.mediaDrafts.length === 0) {
    return null;
  }

  return (
    <div className={styles.TribeRound__imageDraftList}>
      {controller.mediaDrafts.map((mediaDraft) =>
        mediaDraft.kind === MESSAGE_MEDIA_KIND.image
          ? renderComposerImageMediaDraft(controller, mediaDraft)
          : renderComposerVideoMediaDraft(controller, mediaDraft)
      )}
    </div>
  );
};

const renderComposerFileDraft = (controller: TribeRoundController, fileDraft: ComposerFileDraft) => {
  const isUploadingFileDraft =
    fileDraft.status === COMPOSER_FILE_UPLOAD_STATUS.uploading;
  const hasFileDraftUploadFailed =
    fileDraft.status === COMPOSER_FILE_UPLOAD_STATUS.error;
  const canRetryFileDraftUpload =
    hasFileDraftUploadFailed && Boolean(fileDraft.sourceFile);

  return (
    <div
      className={styles.TribeRound__fileDraft}
      key={fileDraft.localId}
      ref={controller.registerComposerBlockTarget(fileDraft.localId)}
    >
      <span aria-hidden="true" className={styles.TribeRound__fileDraftIcon}>
        <FileIcon />
      </span>
      <span className={styles.TribeRound__fileDraftName}>
        {fileDraft.fileName}
      </span>
      <span className={styles.TribeRound__fileDraftSize}>
        {formatFileSize(fileDraft.fileSizeBytes)}
      </span>
      <span className={styles.TribeRound__fileDraftStatus} role="status">
        {getUploadStatusLabel({
          errorLabel: TRIBE_ROUND_COPY.fileUploadError,
          hasFailed: hasFileDraftUploadFailed,
          isUploading: isUploadingFileDraft,
          uploadingLabel: TRIBE_ROUND_COPY.fileUploadingLabel,
        })}
      </span>
      <span className={styles.TribeRound__fileDraftActions}>
        {canRetryFileDraftUpload ? (
          <Button
            aria-label={TRIBE_ROUND_COPY.fileRetryButton}
            className={styles.TribeRound__fileDraftRetryButton}
            disabled={controller.isBusy}
            onClick={() => {
              retryMessageFileDraftUpload(controller, fileDraft);
            }}
            size={TRIBE_ROUND_FORM.iconSize}
            type={TRIBE_ROUND_FORM.buttonType}
            variant={TRIBE_ROUND_FORM.ghostVariant}
          >
            <RotateCcwIcon />
          </Button>
        ) : null}
        <Button
          aria-label={TRIBE_ROUND_COPY.fileRemoveButton}
          className={styles.TribeRound__fileRemoveButton}
          disabled={controller.isBusy}
          onClick={() => {
            removeMessageFileDraft(controller, fileDraft);
          }}
          size={TRIBE_ROUND_FORM.iconSize}
          type={TRIBE_ROUND_FORM.buttonType}
          variant={TRIBE_ROUND_FORM.ghostVariant}
        >
          <XIcon />
        </Button>
      </span>
    </div>
  );
};

const renderComposerFileDrafts = (controller: TribeRoundController) => {
  if (controller.fileDrafts.length === 0) {
    return null;
  }

  return (
    <div className={styles.TribeRound__fileDraftList}>
      {controller.fileDrafts.map((fileDraft) => renderComposerFileDraft(controller, fileDraft))}
    </div>
  );
};

/**
 * Renders the message composer dialog and its trigger when the viewer can create messages.
 */
export function renderMessageComposerDialog(controller: TribeRoundController) {
  return controller.round.viewerPermissions.canCreateMessage ? (
    <Dialog
      open={controller.isMessageComposerOpen}
      onOpenChange={(isOpen) => handleMessageComposerOpenChange(controller, isOpen)}
    >
      {renderMessageComposerTrigger(controller)}
      <DialogContent
        className={`${styles.TribeRound__composerDialog} ${styles["TribeRound__composerDialog--form"]}`}
        showCloseButton={false}
        title={
          controller.isEditingMessage
            ? TRIBE_ROUND_COPY.messageEditTitle
            : TRIBE_ROUND_COPY.messageComposerDialogTitle
        }
        description={
          controller.isEditingMessage
            ? TRIBE_ROUND_COPY.messageEditDescription
            : TRIBE_ROUND_COPY.messageComposerDescription
        }
        footer={renderMessageComposerFooter(controller)}
          footerClassName={styles.TribeRound__composerFooter}
          headerClassName={`${styles.TribeRound__composerDialogHeader} ${styles["TribeRound__composerDialogHeader--hidden"]}`}
          titleClassName={styles.TribeRound__composerDialogTitle}
          descriptionClassName={styles.TribeRound__composerDialogDescription}
        >
        {renderMessageComposerIdentity(controller)}
        {renderMessageComposerForm(controller)}
      </DialogContent>
    </Dialog>
  ) : null;
}

/**
 * Renders the collapsed composer button that opens the composer dialog.
 */
function renderMessageComposerTrigger(controller: TribeRoundController) {
  return (
    <DialogTrigger asChild>
      <button
        aria-label={TRIBE_ROUND_COPY.messageComposerCollapsed}
        className={styles.TribeRound__composerTrigger}
        type={TRIBE_ROUND_FORM.buttonType}
      >
        <Avatar
          className={styles.TribeRound__composerAvatar}
          fallback={controller.authenticatedMember.avatarFallback}
          name={controller.authenticatedMember.name}
          size={TRIBE_ROUND_ATTRIBUTES.composerAvatarSize}
          src={controller.authenticatedMember.image}
        />
        <span className={styles.TribeRound__composerTriggerText}>
          {TRIBE_ROUND_COPY.messageComposerCollapsed}
        </span>
      </button>
    </DialogTrigger>
  );
}

/**
 * Renders the cancel and submit buttons of the composer dialog.
 */
function renderMessageComposerFooter(controller: TribeRoundController) {
  return (
    <>
      <DialogClose asChild>
        <Button
          disabled={controller.isBusy}
          type={TRIBE_ROUND_FORM.buttonType}
          variant={TRIBE_ROUND_FORM.secondaryVariant}
        >
          {TRIBE_ROUND_COPY.messageCancelButton}
        </Button>
      </DialogClose>
      <Button
        disabled={controller.isBusy}
        form={TRIBE_ROUND_ATTRIBUTES.composerFormId}
        type={TRIBE_ROUND_FORM.submitType}
      >
        {controller.isEditingMessage ? null : <SendIcon />}
        {controller.isEditingMessage
          ? TRIBE_ROUND_COPY.messageEditSubmit
          : TRIBE_ROUND_COPY.messageButton}
      </Button>
    </>
  );
}

/**
 * Renders the author identity shown at the top of the composer dialog.
 */
function renderMessageComposerIdentity(controller: TribeRoundController) {
  return (
    <div className={styles.TribeRound__composerIdentity}>
      {/* Decorative: the name is shown next to it. */}
      <Avatar
        aria-hidden
        className={styles.TribeRound__composerDialogAvatar}
        fallback={controller.authenticatedMember.avatarFallback}
        name={controller.authenticatedMember.name}
        src={controller.authenticatedMember.image}
      />
      <p className={styles.TribeRound__composerIdentityText}>
        <strong>{controller.authenticatedMember.name}</strong>{" "}
        {TRIBE_ROUND_COPY.messageComposerContext}
      </p>
    </div>
  );
}

/**
 * Renders the composer form: its fields and its action bar.
 */
function renderMessageComposerForm(controller: TribeRoundController) {
  return (
    <form
      className={styles.TribeRound__composer}
      id={TRIBE_ROUND_ATTRIBUTES.composerFormId}
      onSubmit={(event) => handleCreateMessage(controller, event)}
    >
      {renderMessageComposerBody(controller)}
      {renderMessageComposerActions(controller)}
    </form>
  );
}

/**
 * Renders the composer fields, drafts, and validation errors.
 */
function renderMessageComposerBody(controller: TribeRoundController) {
  return (
    <div className={styles.TribeRound__composerBody}>
      {renderMessageComposerTitleField(controller)}
      {renderMessageComposerContentField(controller)}
      {renderPollComposer(controller)}
      {renderComposerMediaDrafts(controller)}
      {renderComposerFileDrafts(controller)}
      {renderComposerFieldError(controller,
        TRIBE_ROUND_COPY.imageUploadPendingError
      )}
      {renderComposerFieldError(controller, TRIBE_ROUND_COPY.imageUploadError)}
      {renderComposerFieldError(controller,
        TRIBE_ROUND_COPY.fileUploadPendingError
      )}
      {renderComposerFieldError(controller, TRIBE_ROUND_COPY.fileUploadError)}
      {renderComposerFieldError(controller, TRIBE_ROUND_COPY.mediaLimitError)}
      {renderMessageComposerErrorSummary(controller)}
    </div>
  );
}

/**
 * Renders the composer title input and its field error.
 */
function renderMessageComposerTitleField(controller: TribeRoundController) {
  return (
    <div
      ref={controller.registerComposerBlockTarget(
        MESSAGE_COMPOSER_FIELD_ANCHOR_KEY.title
      )}
    >
      <input
        aria-describedby={
          controller.hasMessageComposerErrors
            ? TRIBE_ROUND_ATTRIBUTES.messageComposerErrorId
            : undefined
        }
        aria-label={TRIBE_ROUND_COPY.messageComposerTitleLabel}
        aria-invalid={controller.isMessageTitleInvalid}
        className={
          controller.isMessageTitleInvalid
            ? `${styles.TribeRound__titleInput} ${styles["TribeRound__titleInput--invalid"]}`
            : styles.TribeRound__titleInput
        }
        disabled={controller.isBusy}
        onChange={(event) => {
          controller.setMessageTitle(event.currentTarget.value);
          controller.setMessageComposerErrors([]);
        }}
        placeholder={TRIBE_ROUND_COPY.messageComposerTitlePlaceholder}
        value={controller.messageTitle}
      />
      {renderComposerFieldError(controller,
        TRIBE_ROUND_COPY.messageComposerMissingTitle
      )}
    </div>
  );
}

/**
 * Renders the composer rich content editor and its field error.
 */
function renderMessageComposerContentField(controller: TribeRoundController) {
  return (
    <div
      ref={controller.registerComposerBlockTarget(
        MESSAGE_COMPOSER_FIELD_ANCHOR_KEY.content
      )}
    >
      <RichLinkEditor
        ariaDescribedBy={
          controller.hasMessageComposerErrors
            ? TRIBE_ROUND_ATTRIBUTES.messageComposerErrorId
            : undefined
        }
        ariaLabel={TRIBE_ROUND_COPY.messageComposerLabel}
        copy={{
          editAction: TRIBE_ROUND_COPY.messageLinkEditAction,
          editCancel: TRIBE_ROUND_COPY.messageLinkEditCancel,
          editSave: TRIBE_ROUND_COPY.messageLinkEditSave,
          popoverTextLabel:
            TRIBE_ROUND_COPY.messageLinkPopoverTextLabel,
          popoverUrlLabel:
            TRIBE_ROUND_COPY.messageLinkPopoverUrlLabel,
          removeAction: TRIBE_ROUND_COPY.messageLinkRemoveAction,
        }}
        editor={controller.messageEditor}
        isDisabled={controller.isBusy}
        isInvalid={controller.isMessageContentInvalid}
        placeholder={TRIBE_ROUND_COPY.messagePlaceholder}
      />
      {renderComposerFieldError(controller,
        TRIBE_ROUND_COPY.messageComposerMissingContent
      )}
    </div>
  );
}

/**
 * Renders the poll composer section when the poll is enabled.
 */
function renderPollComposer(controller: TribeRoundController) {
  return controller.isPollComposerEnabled ? (
    <section
      className={styles.TribeRound__pollComposer}
      ref={controller.registerComposerBlockTarget(
        TRIBE_ROUND_POLL.composerBlockKey
      )}
    >
      <div className={styles.TribeRound__pollComposerHeader}>
        {!controller.isEditingMessage ? (
          <Button
            disabled={controller.isBusy}
            onClick={() => {
              controller.setIsPollComposerEnabled(false);
            }}
            type={TRIBE_ROUND_FORM.buttonType}
            variant={TRIBE_ROUND_FORM.ghostVariant}
            aria-label={TRIBE_ROUND_COPY.pollRemoveButton}
            className={styles.TribeRound__pollComposerCloseButton}
          >
            <XIcon />
          </Button>
        ) : null}
      </div>
      <div className={styles.TribeRound__pollComposerOptions}>
        {controller.pollOptions.map((option, optionIndex) =>
          renderPollOptionDraft(controller, option, optionIndex)
        )}
      </div>
      {renderPollComposerControls(controller)}
      {renderComposerPollErrors(controller)}
    </section>
  ) : null;
}

/**
 * Renders one editable poll option with its remove button and required error.
 */
function renderPollOptionDraft(controller: TribeRoundController, option: string, optionIndex: number) {
  return (
    <div
      className={styles.TribeRound__pollComposerLabel}
      key={TRIBE_ROUND_POLL.draftKeyPrefix + String(optionIndex)}
    >
      <div className={styles.TribeRound__pollOptionDraft}>
        <input
          aria-label={`${TRIBE_ROUND_COPY.pollOptionPlaceholder} ${
            optionIndex + 1
          }`}
          className={styles.TribeRound__pollInput}
          ref={controller.registerComposerFocusTarget(
            TRIBE_ROUND_POLL.draftKeyPrefix +
              String(optionIndex)
          )}
          disabled={controller.isBusy}
          onChange={(event) => {
            const nextValue = event.currentTarget.value;

            controller.setPollOptions((currentOptions) =>
              currentOptions.map((currentOption, currentIndex) =>
                currentIndex === optionIndex
                  ? nextValue
                  : currentOption
              )
            );
            controller.setMessageComposerErrors([]);
          }}
          placeholder={`${TRIBE_ROUND_COPY.pollOptionPlaceholder} ${
            optionIndex + 1
          }`}
          value={option}
        />
        {controller.pollOptions.length > TRIBE_ROUND_POLL.minimumOptionCount ? (
          <Button
            aria-label={TRIBE_ROUND_COPY.pollRemoveOptionButton}
            className={styles.TribeRound__pollOptionRemoveButton}
            disabled={controller.isBusy}
            onClick={() => {
              controller.setPollOptions((currentOptions) =>
                currentOptions.filter(
                  (_option, currentIndex) =>
                    currentIndex !== optionIndex
                )
              );
            }}
            type={TRIBE_ROUND_FORM.buttonType}
            variant={TRIBE_ROUND_FORM.ghostVariant}
          >
            <TrashIcon />
          </Button>
        ) : null}
      </div>
      {shouldShowPollOptionRequiredError(controller,
        optionIndex,
        option
      ) ? (
        <p
          className={`${styles.TribeRound__fieldError} ${styles["TribeRound__fieldError--pollOption"]}`}
        >
          {TRIBE_ROUND_COPY.pollOptionRequired}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Renders the poll controls: add option and allow multiple votes.
 */
function renderPollComposerControls(controller: TribeRoundController) {
  return (
    <div className={styles.TribeRound__pollComposerControls}>
      <Button
        className={styles.TribeRound__pollAddOptionButton}
        disabled={controller.isBusy}
        onClick={() => {
          controller.setPollOptions((currentOptions) => [
            ...currentOptions,
            "",
          ]);
          controller.scrollPollComposerIntoView();
        }}
        type={TRIBE_ROUND_FORM.buttonType}
        variant={TRIBE_ROUND_FORM.ghostVariant}
      >
        <ListPlusIcon />
        {TRIBE_ROUND_COPY.pollAddOptionButton}
      </Button>
      <label className={styles.TribeRound__pollMultipleToggle}>
        <input
          checked={controller.pollAllowsMultipleVotes}
          disabled={controller.isBusy}
          onChange={(event) => {
            controller.setPollAllowsMultipleVotes(event.currentTarget.checked);
          }}
          type={TRIBE_ROUND_POLL.multipleInputType}
        />
        <span>{TRIBE_ROUND_COPY.pollAllowMultipleVotesLabel}</span>
      </label>
    </div>
  );
}

/**
 * Renders the summary of missing composer requirements.
 */
function renderMessageComposerErrorSummary(controller: TribeRoundController) {
  return controller.hasMessageComposerErrors ? (
    <div
      className={styles.TribeRound__composerError}
      id={TRIBE_ROUND_ATTRIBUTES.messageComposerErrorId}
    >
      <p className={styles.TribeRound__composerErrorTitle}>
        {TRIBE_ROUND_COPY.messageComposerRequirementsTitle}
      </p>
      <ul
        aria-label={
          TRIBE_ROUND_ATTRIBUTES.messageComposerRequirementsLabel
        }
        className={styles.TribeRound__composerErrorList}
      >
        {controller.messageComposerErrors.map((messageComposerError) => (
          <li
            className={styles.TribeRound__composerErrorItem}
            key={messageComposerError}
          >
            <span
              aria-hidden={
                TRIBE_ROUND_ATTRIBUTES.missingRequirementBulletHidden
              }
              className={styles.TribeRound__composerErrorBullet}
            >
              {TRIBE_ROUND_SYMBOLS.missingRequirementBullet}
            </span>
            {messageComposerError}
          </li>
        ))}
      </ul>
    </div>
  ) : null;
}

/**
 * Renders the composer action bar: attachments, poll, video, and channel picker.
 */
function renderMessageComposerActions(controller: TribeRoundController) {
  return (
    <div className={styles.TribeRound__composerActions}>
      {renderComposerImageInput(controller)}
      {renderComposerFileInput(controller)}
      {renderPollAddButton(controller)}
      {renderVideoAddButton(controller)}
      {renderComposerChannelPicker(controller)}
    </div>
  );
}

/**
 * Renders the image picker of the composer action bar.
 */
function renderComposerImageInput(controller: TribeRoundController) {
  return (
    <label
      aria-label={TRIBE_ROUND_COPY.imageAddButton}
      className={styles.TribeRound__imageAddButton}
    >
      <ImageIcon />
      <input
        accept={TRIBE_ROUND_FORM.imageAccept}
        className={styles.TribeRound__fileInput}
        disabled={
          controller.isBusy || controller.mediaDrafts.length >= MESSAGE_MEDIA.maxCount
        }
        multiple
        onChange={(event) => handleMessageImageSelection(controller, event)}
        type={TRIBE_ROUND_FORM.fileInputType}
      />
    </label>
  );
}

/**
 * Renders the file picker of the composer action bar.
 */
function renderComposerFileInput(controller: TribeRoundController) {
  return (
    <label
      aria-label={TRIBE_ROUND_COPY.fileAddButton}
      className={styles.TribeRound__fileAddButton}
    >
      <PaperclipIcon />
      <input
        accept={ATTACHMENT_FILE_INPUT_ACCEPT}
        className={styles.TribeRound__fileInput}
        disabled={
          controller.isBusy || controller.fileDrafts.length >= MESSAGE_FILES.maxCount
        }
        multiple
        onChange={(event) => handleMessageFileSelection(controller, event)}
        type={TRIBE_ROUND_FORM.fileInputType}
      />
    </label>
  );
}

/**
 * Renders the button that enables the poll composer, unless editing or already enabled.
 */
function renderPollAddButton(controller: TribeRoundController) {
  return !controller.isEditingMessage && !controller.isPollComposerEnabled ? (
    <Button
      aria-label={TRIBE_ROUND_COPY.pollAddButton}
      className={styles.TribeRound__pollAddButton}
      disabled={controller.isBusy}
      onClick={() => {
        controller.setIsPollComposerEnabled(true);
        controller.revealComposerBlock(
          TRIBE_ROUND_POLL.composerBlockKey,
          TRIBE_ROUND_POLL.draftKeyPrefix +
            String(TRIBE_ROUND_POLL.firstOptionIndex)
        );
      }}
      size={TRIBE_ROUND_FORM.iconSize}
      type={TRIBE_ROUND_FORM.buttonType}
      variant={TRIBE_ROUND_FORM.ghostVariant}
    >
      <VoteIcon />
    </Button>
  ) : null;
}

/**
 * Renders the button that appends a video draft.
 */
function renderVideoAddButton(controller: TribeRoundController) {
  return (
    <Button
      aria-label={TRIBE_ROUND_COPY.videoAddButton}
      className={styles.TribeRound__videoAddButton}
      disabled={
        controller.isBusy || controller.mediaDrafts.length >= MESSAGE_MEDIA.maxCount
      }
      onClick={() => addVideoMediaDraft(controller)}
      size={TRIBE_ROUND_FORM.iconSize}
      type={TRIBE_ROUND_FORM.buttonType}
      variant={TRIBE_ROUND_FORM.ghostVariant}
    >
      <VideoIcon />
    </Button>
  );
}

/**
 * Renders the channel picker of a new message, hidden while editing.
 */
function renderComposerChannelPicker(controller: TribeRoundController) {
  return !controller.isEditingMessage ? (
    <div className={styles.TribeRound__channelPicker}>
    <DropdownMenu
      align={TRIBE_ROUND_ATTRIBUTES.dropdownAlign}
      contentClassName={styles.TribeRound__channelMenuContent}
      items={controller.round.channels.map((channel) => ({
        className: styles.TribeRound__channelMenuItem,
        icon: (
          <span
            aria-hidden={TRIBE_ROUND_ATTRIBUTES.channelFilterEmojiHidden}
            className={styles.TribeRound__channelMenuEmoji}
          >
            {channel.emoji}
          </span>
        ),
        id: channel.id,
        label: channel.name,
        onSelect: () => {
          controller.setSelectedChannelId(channel.id);
          controller.setMessageComposerErrors([]);
        },
      }))}
      label={TRIBE_ROUND_COPY.tribeChannelLabel}
      trigger={
        <button
          aria-describedby={
            controller.hasMessageComposerErrors
              ? TRIBE_ROUND_ATTRIBUTES.messageComposerErrorId
              : undefined
          }
          aria-label={TRIBE_ROUND_COPY.tribeChannelLabel}
          className={
            controller.isMessageChannelInvalid
              ? `${styles.TribeRound__channelTrigger} ${styles["TribeRound__channelTrigger--invalid"]}`
              : styles.TribeRound__channelTrigger
          }
          disabled={controller.isBusy}
          ref={controller.registerComposerBlockTarget(
            MESSAGE_COMPOSER_FIELD_ANCHOR_KEY.channel
          )}
          type={TRIBE_ROUND_FORM.buttonType}
        >
          <span>
            {controller.selectedChannel
              ? `${controller.selectedChannel.emoji} ${controller.selectedChannel.name}`
              : TRIBE_ROUND_COPY.tribeChannelSelect}
          </span>
          <ChevronDownIcon />
        </button>
      }
    />
    {renderComposerFieldError(controller,
      TRIBE_ROUND_COPY.messageComposerMissingChannel
    )}
    </div>
  ) : null;
}
