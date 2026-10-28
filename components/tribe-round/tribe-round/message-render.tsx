/**
 * @file Render helpers for round messages: content, poll, media, files, actions, and cards.
 */
import Image from "next/image";
import { createElement } from "react";
import {
  CalendarClockIcon,
  FileIcon,
  MessageCircleIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PinIcon,
  PlayIcon,
  TrashIcon,
  VideoIcon,
} from "lucide-react";
import {
  AnimatedCount,
  AnimatedListItem,
  Button,
  Carousel,
  Dialog,
  DialogContent,
  type DropdownItem,
  DropdownMenu,
  formatFileSize,
  ReactionButton,
  RichTextContent,
} from "@golfo/ui";
import { MessageLikesHoverCard } from "@/components/tribe-round/message-likes-hover-card";
import { MESSAGE_MEDIA_KIND } from "@/src/modules/messages/constants/message-round";
import type { TribeRoundMessageResult } from "@/src/modules/messages/application/results/tribe-round-result";
import { buildPlayerEmbedSource, PLAYER_IFRAME_ALLOW } from "@/src/modules/shared/application/video/build-player-embed-source";
import { buildVideoThumbnailSource } from "@/src/modules/shared/application/video/build-video-thumbnail-source";
import styles from "./styles.module.scss";
import {
  COLLAPSED_CONTENT_TEXT,
  formatImageCarouselSlideLabel,
  formatPollVoteCount,
  getAvatarRoleModifierClassName,
  getCommentCount,
  getDisplayedMessageContent,
  getLikeButtonClassName,
  getPersistedPollSelection,
  getPinButtonClassName,
  isLongMessageContent,
  isPendingMessage,
  MessagePollOption,
  renderAuthorIdentity,
  renderCommentAuthorsPreview,
  renderMessageCreatedTime,
  renderPinnedBadge,
  renderRoundAuthorAvatar,
  TRIBE_ROUND_ATTRIBUTES,
  TRIBE_ROUND_CAROUSEL,
  TRIBE_ROUND_CONTENT_PREVIEW_CLASS,
  TRIBE_ROUND_COPY,
  TRIBE_ROUND_ENDPOINT,
  TRIBE_ROUND_FORM,
  TRIBE_ROUND_FORMAT,
  TRIBE_ROUND_MEDIA,
  TRIBE_ROUND_SYMBOLS,
  type TribeRoundContentPreviewClass,
  type TribeRoundMessageImageResult,
  type TribeRoundMessageMediaResult,
  type TribeRoundMessageVideoResult,
  type TribeRoundVisibleMessageResult,
} from "./tribe-round-shared";
import type { TribeRoundController } from "./use-tribe-round-controller";
import {
  handleImageCarouselKeyDown,
  handleImageCarouselOpenChange,
  isLikeButtonDisabled,
  openEditCreatedAtDialog,
  openEditMessageDialog,
  openMessageDetails,
  openMessageMediaCarousel,
  stopMessageDetailsOpening,
  toggleMessageContentExpansion,
} from "./message-actions";
import { handlePollOptionSelection, handleToggleLike, handleTogglePin } from "./reaction-actions";

export const renderMessageContent = (controller: TribeRoundController, 
  message: TribeRoundMessageResult,
  {
    contentClassName = "",
    isContentAlwaysCollapsed = false,
    previewClassName = TRIBE_ROUND_CONTENT_PREVIEW_CLASS.details,
    shouldStopLinkPropagation = false,
  }: {
    contentClassName?: string;
    isContentAlwaysCollapsed?: boolean;
    previewClassName?: TribeRoundContentPreviewClass;
    shouldStopLinkPropagation?: boolean;
  } = {}
) => {
  const isExpanded =
    !isContentAlwaysCollapsed && Boolean(controller.expandedMessageIds[message.id]);
  const isExpandable = isLongMessageContent(message.content);
  const isRoundPreview =
    previewClassName === TRIBE_ROUND_CONTENT_PREVIEW_CLASS.round;
  const isRoundCollapsedPreview = isRoundPreview && !isExpanded;
  const isDetailsCollapsedPreview =
    isExpandable &&
    !isExpanded &&
    previewClassName === TRIBE_ROUND_CONTENT_PREVIEW_CLASS.details;
  const contentClassNames = [
    styles.TribeRound__content,
    ...(isRoundCollapsedPreview
      ? [
          styles["TribeRound__content--collapsed"],
          styles[previewClassName],
        ]
      : []),
    contentClassName,
  ]
    .filter(Boolean)
    .join(TRIBE_ROUND_FORMAT.standardSpace);
  const contentDataAttributes = {
    [TRIBE_ROUND_ATTRIBUTES.contentExpandedDataAttribute]: String(isExpanded),
  };
  const displayedContent = getDisplayedMessageContent({
    content: message.content,
    isDetailsCollapsedPreview,
    isRoundCollapsedPreview,
  });
  const wasDetailsContentTruncated =
    isDetailsCollapsedPreview &&
    displayedContent.length < message.content.length;
  return (
    <div
      className={contentClassNames}
      {...contentDataAttributes}
    >
      <RichTextContent
        content={displayedContent}
        onLinkClick={
          shouldStopLinkPropagation ? stopMessageDetailsOpening : undefined
        }
      />
      {wasDetailsContentTruncated ? (
        <>
          {COLLAPSED_CONTENT_TEXT.ellipsis}
          <button
            aria-expanded={isExpanded}
            className={styles.TribeRound__contentToggle}
            onClick={() => {
              toggleMessageContentExpansion(controller, message.id);
            }}
            type={TRIBE_ROUND_FORM.buttonType}
          >
            {TRIBE_ROUND_COPY.messageContentShowMore}
          </button>
        </>
      ) : null}
    </div>
  );
};

export const renderMessagePoll = (controller: TribeRoundController, 
  message: TribeRoundVisibleMessageResult,
  shouldStopDetailsOpening = false
) => {
  const poll = message.poll;

  if (!poll) {
    return null;
  }

  const pollAccessibleLabel = message.title ?? TRIBE_ROUND_COPY.pollSummaryLabel;

  if (shouldStopDetailsOpening) {
    return (
      <section
        aria-label={pollAccessibleLabel}
        className={styles.TribeRound__pollSummary}
      >
        <span className={styles.TribeRound__pollSummaryBadge}>
          {TRIBE_ROUND_COPY.pollSummaryLabel}
        </span>
        <span className={styles.TribeRound__pollSummaryText}>
          {formatPollVoteCount(poll.totalVoteCount)}
        </span>
      </section>
    );
  }

  const selectedOptionIds =
    controller.selectedPollOptionIds[message.id] ?? getPersistedPollSelection(poll);
  const canVote = controller.round.viewerPermissions.canReact && !isPendingMessage(message);

  return (
    <section
      aria-label={pollAccessibleLabel}
      className={styles.TribeRound__poll}
    >
      <div className={styles.TribeRound__pollHeader}>
        <div className={styles.TribeRound__pollHeading}>
          <span className={styles.TribeRound__pollMode}>
            {poll.allowMultipleVotes
              ? TRIBE_ROUND_COPY.pollToggleMultipleVotesLabel
              : TRIBE_ROUND_COPY.pollSubmitButton}
          </span>
        </div>
      </div>
      <div className={styles.TribeRound__pollOptions}>
        {poll.options.map((option) => (
          <MessagePollOption
            allowMultipleVotes={poll.allowMultipleVotes}
            canVote={canVote}
            isSelected={selectedOptionIds.includes(option.id)}
            key={option.id}
            onSelect={() => {
              handlePollOptionSelection(controller, {
                message,
                optionId: option.id,
              });
            }}
            option={option}
            pollId={poll.id}
            shouldShowResults={poll.viewerHasVoted}
          />
        ))}
      </div>
      <p className={styles.TribeRound__pollHint}>
        {formatPollVoteCount(poll.totalVoteCount)}
      </p>
    </section>
  );
};

/**
 * Renders the lightweight poster shown for inactive video slides. Only the
 * active slide mounts the heavy provider iframe, so inactive videos fall back
 * to their thumbnail (or a safe placeholder) to avoid booting several
 * third-party players at once and stealing keyboard focus.
 */
const renderCarouselVideoPoster = (
  mediaItem: TribeRoundMessageVideoResult
) => {
  const videoThumbnailSource =
    buildVideoThumbnailSource(mediaItem.provider, mediaItem.externalId) ??
    mediaItem.thumbnailUrl ??
    null;

  return (
    <span aria-hidden="true" className={styles.TribeRound__videoTile}>
      {videoThumbnailSource ? (
        <>
          {createElement(TRIBE_ROUND_MEDIA.imageElementTag, {
            alt: "",
            className: styles.TribeRound__videoThumbnail,
            decoding: TRIBE_ROUND_CAROUSEL.imageDecoding,
            loading: TRIBE_ROUND_MEDIA.lazyLoading,
            src: videoThumbnailSource,
          })}
          <span className={styles.TribeRound__videoPlayBadge}>
            <PlayIcon />
          </span>
        </>
      ) : (
        renderVideoThumbnailFallback(true)
      )}
    </span>
  );
};

const getMessageMediaAltText = (
  mediaItem: TribeRoundMessageImageResult,
  message: TribeRoundMessageResult
) =>
  mediaItem.altText ||
  message.title ||
  TRIBE_ROUND_COPY.messageDetailsDialogTitle;

const renderVideoThumbnailFallback = (shouldShowThumbnailHint: boolean) => (
  <>
    <VideoIcon />
    <span className={styles.TribeRound__videoFallbackLabel}>
      {TRIBE_ROUND_COPY.videoAttachedFallbackLabel}
    </span>
    {shouldShowThumbnailHint ? (
      <span className={styles.TribeRound__videoFallbackHint}>
        {TRIBE_ROUND_COPY.videoThumbnailUnavailableLabel}
      </span>
    ) : null}
  </>
);

type MessageMediaItemInput<MediaItem> = {
  canOpenCarousel: boolean;
  mediaIndex: number;
  mediaItem: MediaItem;
  message: TribeRoundMessageResult;
};

const renderMessageVideoItem = (controller: TribeRoundController, {
  canOpenCarousel,
  mediaIndex,
  mediaItem,
  message,
}: MessageMediaItemInput<TribeRoundMessageVideoResult>) => {
  const videoThumbnailSource =
    buildVideoThumbnailSource(
      mediaItem.provider,
      mediaItem.externalId
    ) ??
    mediaItem.thumbnailUrl ??
    null;
  const videoTile = videoThumbnailSource ? (
    <span
      aria-hidden="true"
      className={styles.TribeRound__videoTile}
    >
      {createElement(TRIBE_ROUND_MEDIA.imageElementTag, {
        alt: "",
        className: styles.TribeRound__videoThumbnail,
        decoding: "async",
        loading: TRIBE_ROUND_MEDIA.lazyLoading,
        src: videoThumbnailSource,
      })}
      <span className={styles.TribeRound__videoPlayBadge}>
        <PlayIcon />
      </span>
    </span>
  ) : (
    <span
      aria-hidden="true"
      className={styles.TribeRound__videoTile}
    >
      {renderVideoThumbnailFallback(true)}
    </span>
  );

  const videoFrameInner = canOpenCarousel ? (
    <button
      aria-label={`${TRIBE_ROUND_COPY.imageCarouselVideoOpenButtonPrefix} ${String(
        mediaIndex + 1
      )}: ${TRIBE_ROUND_COPY.videoProviderLabel[mediaItem.provider]}`}
      className={styles.TribeRound__imageOpenButton}
      onClick={(event) => {
        openMessageMediaCarousel(controller, {
          event,
          mediaIndex,
          messageId: message.id,
        });
      }}
      type={TRIBE_ROUND_FORM.buttonType}
    >
      {videoTile}
    </button>
  ) : (
    videoTile
  );

  if (!videoThumbnailSource && canOpenCarousel) {
    return (
      <div
        className={styles.TribeRound__mediaColumn}
        key={mediaItem.id}
      >
        <div className={styles.TribeRound__imageFrame}>
          {videoFrameInner}
        </div>
        <span className={styles.TribeRound__mediaPlayHint}>
          {TRIBE_ROUND_COPY.videoPlayHintLabel}
        </span>
      </div>
    );
  }

  return (
    <div className={styles.TribeRound__imageFrame} key={mediaItem.id}>
      {videoFrameInner}
    </div>
  );
};

const renderMessageImageItem = (controller: TribeRoundController, {
  canOpenCarousel,
  mediaIndex,
  mediaItem,
  message,
  shouldLoadFirstImageEagerly,
}: MessageMediaItemInput<TribeRoundMessageImageResult> & {
  shouldLoadFirstImageEagerly: boolean;
}) => {
  const isTemporaryImage = mediaItem.url.startsWith(
    TRIBE_ROUND_SYMBOLS.blobUrlPrefix
  );
  const imageLoading =
    shouldLoadFirstImageEagerly && mediaIndex === 0
      ? TRIBE_ROUND_MEDIA.eagerLoading
      : TRIBE_ROUND_MEDIA.lazyLoading;
  const imageAlt = getMessageMediaAltText(mediaItem, message);

  const messageImage = (
    <Image
      alt={imageAlt}
      className={styles.TribeRound__image}
      height={0}
      loading={imageLoading}
      sizes="(max-width: 768px) 26vw, 8.5rem"
      src={mediaItem.url}
      unoptimized={isTemporaryImage}
      width={0}
    />
  );

  return (
    <div className={styles.TribeRound__imageFrame} key={mediaItem.id}>
      {canOpenCarousel ? (
      <button
        aria-label={`${TRIBE_ROUND_COPY.imageCarouselOpenButtonPrefix} ${String(mediaIndex + 1)}: ${imageAlt}`}
        className={styles.TribeRound__imageOpenButton}
        onClick={(event) => {
          openMessageMediaCarousel(controller, {
            event,
            mediaIndex,
            messageId: message.id,
          });
        }}
        type={TRIBE_ROUND_FORM.buttonType}
      >
        {messageImage}
      </button>
      ) : (
        messageImage
      )}
    </div>
  );
};

export const renderMessageMedia = (controller: TribeRoundController, 
  message: TribeRoundMessageResult,
  {
    canOpenCarousel = false,
    shouldLoadFirstImageEagerly = false,
  }: {
    canOpenCarousel?: boolean;
    shouldLoadFirstImageEagerly?: boolean;
  } = {}
) => {
  const messageMedia = message.media ?? [];

  if (messageMedia.length === 0) {
    return null;
  }

  return (
    <div className={styles.TribeRound__imageGallery}>
      {messageMedia.map((mediaItem, mediaIndex) =>
        mediaItem.kind === MESSAGE_MEDIA_KIND.video
          ? renderMessageVideoItem(controller, { canOpenCarousel, mediaIndex, mediaItem, message })
          : renderMessageImageItem(controller, {
              canOpenCarousel,
              mediaIndex,
              mediaItem,
              message,
              shouldLoadFirstImageEagerly,
            })
      )}
    </div>
  );
};

const renderMessageFeedMedia = (
  message: TribeRoundMessageResult,
  { shouldLoadEagerly = false }: { shouldLoadEagerly?: boolean } = {}
) => {
  const [firstMediaItem] = message.media ?? [];

  if (!firstMediaItem) {
    return null;
  }

  const mediaLoading = shouldLoadEagerly
    ? TRIBE_ROUND_MEDIA.eagerLoading
    : TRIBE_ROUND_MEDIA.lazyLoading;

  if (firstMediaItem.kind === MESSAGE_MEDIA_KIND.video) {
    const videoThumbnailSource =
      buildVideoThumbnailSource(
        firstMediaItem.provider,
        firstMediaItem.externalId
      ) ??
      firstMediaItem.thumbnailUrl ??
      null;

    return (
      <div className={styles.TribeRound__feedMedia}>
        {videoThumbnailSource ? (
          <span
            aria-hidden="true"
            className={styles.TribeRound__videoTile}
          >
            {createElement(TRIBE_ROUND_MEDIA.imageElementTag, {
              alt: "",
              className: styles.TribeRound__videoThumbnail,
              decoding: "async",
              loading: mediaLoading,
              src: videoThumbnailSource,
            })}
            <span className={styles.TribeRound__videoPlayBadge}>
              <PlayIcon />
            </span>
          </span>
        ) : (
          <span
            aria-hidden="true"
            className={styles.TribeRound__videoTile}
          >
            {renderVideoThumbnailFallback(false)}
          </span>
        )}
      </div>
    );
  }

  const isTemporaryImage = firstMediaItem.url.startsWith(
    TRIBE_ROUND_SYMBOLS.blobUrlPrefix
  );

  return (
    <div className={styles.TribeRound__feedMedia}>
      <Image
        alt={getMessageMediaAltText(firstMediaItem, message)}
        className={styles.TribeRound__feedMediaImage}
        fill
        loading={mediaLoading}
        sizes="(max-width: 768px) 28vw, 8.5rem"
        src={firstMediaItem.url}
        unoptimized={isTemporaryImage}
      />
    </div>
  );
};

/**
 * Renders the message's downloadable attachments as a list of plain links
 * to the authorized download route, shown under the message content and
 * separate from the image/video gallery.
 */
export const renderMessageFiles = (controller: TribeRoundController, 
  message: TribeRoundMessageResult,
  shouldStopDetailsOpening = false
) => {
  const messageFiles = message.files ?? [];

  if (messageFiles.length === 0) {
    return null;
  }

  const sortedMessageFiles = [...messageFiles].sort(
    (firstFile, secondFile) => firstFile.sortOrder - secondFile.sortOrder
  );

  return (
    <ul
      aria-label={TRIBE_ROUND_COPY.fileListLabel}
      className={styles.TribeRound__fileList}
    >
      {sortedMessageFiles.map((messageFile) => (
        <li className={styles.TribeRound__fileItem} key={messageFile.id}>
          <a
            aria-label={`${TRIBE_ROUND_COPY.fileDownloadAriaLabelPrefix}: ${messageFile.fileName} (${formatFileSize(messageFile.fileSizeBytes)})`}
            className={styles.TribeRound__fileLink}
            href={TRIBE_ROUND_ENDPOINT.messageFileDownload(
              controller.tribeSlug,
              messageFile.id
            )}
            onClick={
              shouldStopDetailsOpening ? stopMessageDetailsOpening : undefined
            }
          >
            <FileIcon
              aria-hidden="true"
              className={styles.TribeRound__fileLinkIcon}
            />
            <span className={styles.TribeRound__fileLinkName}>
              {messageFile.fileName}
            </span>
            <span className={styles.TribeRound__fileLinkSize}>
              {formatFileSize(messageFile.fileSizeBytes)}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
};

const renderCarouselMediaSlide = (controller: TribeRoundController, 
  mediaItem: TribeRoundMessageMediaResult,
  mediaIndex: number
) => {
  if (mediaItem.kind === MESSAGE_MEDIA_KIND.video) {
    const isActiveSlide =
      mediaIndex === controller.settledImageCarouselSlideIndex;

    return (
      <div className={styles.TribeRound__videoEmbed} key={mediaItem.id}>
        {isActiveSlide ? (
          <iframe
            allow={PLAYER_IFRAME_ALLOW}
            allowFullScreen
            className={styles.TribeRound__videoEmbedIframe}
            src={buildPlayerEmbedSource(
              mediaItem.provider,
              mediaItem.externalId
            )}
            title={`${TRIBE_ROUND_COPY.videoEmbedTitlePrefix}${
              controller.activeImageCarouselMessage?.title
                ? `: ${controller.activeImageCarouselMessage.title}`
                : ""
            }`}
          />
        ) : (
          renderCarouselVideoPoster(mediaItem)
        )}
      </div>
    );
  }

  const imageAlt =
    mediaItem.altText ||
    controller.activeImageCarouselMessage?.title ||
    TRIBE_ROUND_COPY.messageDetailsDialogTitle;

  return (
    <div className={styles.TribeRound__imageCarouselFrame} key={mediaItem.id}>
      {createElement(TRIBE_ROUND_MEDIA.imageElementTag, {
        alt: imageAlt,
        className: styles.TribeRound__imageCarouselImage,
        decoding: TRIBE_ROUND_CAROUSEL.imageDecoding,
        fetchPriority: TRIBE_ROUND_CAROUSEL.imageFetchPriority,
        loading: TRIBE_ROUND_MEDIA.eagerLoading,
        src: mediaItem.url,
      })}
    </div>
  );
};

export const renderMessageImageCarouselDialog = (controller: TribeRoundController) => {
  const messageMedia = controller.activeImageCarouselMedia;
  return (
    <Dialog
      open={messageMedia.length > 0}
      onOpenChange={(isOpen) => handleImageCarouselOpenChange(controller, isOpen)}
    >
      <DialogContent
        className={styles.TribeRound__imageCarouselDialog}
        onKeyDownCapture={(event) => handleImageCarouselKeyDown(controller, event)}
        showCloseButton
        title={TRIBE_ROUND_COPY.imageCarouselDialogTitle}
        description={TRIBE_ROUND_COPY.imageCarouselDialogDescription}
        headerClassName={styles.TribeRound__imageCarouselHeader}
        titleClassName={styles.TribeRound__srOnly}
        descriptionClassName={styles.TribeRound__srOnly}
      >
        <Carousel
          className={styles.TribeRound__imageCarousel}
          duration={TRIBE_ROUND_CAROUSEL.transitionDuration}
          index={controller.activeImageCarouselSlideIndex}
          label={TRIBE_ROUND_COPY.imageCarouselDialogTitle}
          loop={messageMedia.length > 1}
          nextLabel={TRIBE_ROUND_COPY.imageCarouselNextButton}
          onIndexChange={controller.setActiveImageCarouselSlideIndex}
          onSettle={controller.setSettledImageCarouselSlideIndex}
          previousLabel={TRIBE_ROUND_COPY.imageCarouselPreviousButton}
          slideClassName={styles.TribeRound__imageCarouselItem}
          slideLabel={formatImageCarouselSlideLabel}
          slideSize={TRIBE_ROUND_CAROUSEL.slideSize}
          trackClassName={styles.TribeRound__imageCarouselTrack}
          viewportClassName={styles.TribeRound__imageCarouselViewport}
          // A focused video iframe would keep snapping the carousel back to
          // its slide, cancelling arrow navigation. Media slides are
          // navigated explicitly, so focus must not drive scroll position.
          watchFocus={false}
        >
          {messageMedia.map(((mediaItem, mediaIndex) => renderCarouselMediaSlide(controller, mediaItem, mediaIndex)))}
        </Carousel>
      </DialogContent>
    </Dialog>
  );
};

const renderMessagePinControl = (controller: TribeRoundController, 
  message: TribeRoundVisibleMessageResult,
  shouldStopDetailsOpening = false
) => {
  const isPinned = Boolean(message.isPinned);
  const isPending = isPendingMessage(message);

  if (!controller.round.viewerPermissions.canPinMessages) {
    return renderPinnedBadge(message);
  }

  return (
    <Button
      aria-label={
        isPinned
          ? TRIBE_ROUND_COPY.unpinButtonAriaLabel
          : TRIBE_ROUND_COPY.pinButtonAriaLabel
      }
      aria-pressed={isPinned}
      className={getPinButtonClassName(isPinned)}
      disabled={isPending}
      onClick={(event) => {
        if (shouldStopDetailsOpening) {
          stopMessageDetailsOpening(event);
        }

        handleTogglePin(controller, message.id);
      }}
      size={TRIBE_ROUND_FORM.iconSize}
      type={TRIBE_ROUND_FORM.buttonType}
      variant={TRIBE_ROUND_FORM.secondaryVariant}
    >
      <PinIcon />
    </Button>
  );
};

export const renderMessageActionsMenu = (controller: TribeRoundController, 
  message: TribeRoundVisibleMessageResult,
  shouldStopDetailsOpening = false
) => {
  if (isPendingMessage(message)) {
    return null;
  }

  const canDelete = Boolean(message.permissions?.canDelete);
  const canEdit = Boolean(message.permissions?.canEdit);
  const canEditCreatedAt = Boolean(
    controller.round.viewerPermissions.canEditMessageCreatedAt
  );

  if (!canDelete && !canEdit && !canEditCreatedAt) {
    return null;
  }

  const menuItems: DropdownItem[] = [
    ...(canEdit
      ? [
          {
            className: styles.TribeRound__messageMenuItem,
            disabled: controller.isBusy,
            icon: <PencilIcon />,
            label: TRIBE_ROUND_COPY.messageEditButton,
            onSelect: () => openEditMessageDialog(controller, message),
          },
        ]
      : []),
    ...(canEditCreatedAt
      ? [
          {
            className: styles.TribeRound__messageMenuItem,
            disabled: controller.isBusy,
            icon: <CalendarClockIcon />,
            label: TRIBE_ROUND_COPY.messageEditCreatedAtButton,
            onSelect: () => openEditCreatedAtDialog(controller, message),
          },
        ]
      : []),
    ...(canDelete
      ? [
          {
            className: styles.TribeRound__messageMenuItem,
            destructive: true,
            disabled: controller.isBusy,
            icon: <TrashIcon />,
            label: TRIBE_ROUND_COPY.messageDeleteButton,
            onSelect: () => controller.setMessagePendingDeletion(message),
          },
        ]
      : []),
  ];

  return (
    // The menu panel keeps its clicks inside it; a click on the trigger
    // still bubbles, so it is stopped here to keep the message details
    // behind the menu closed.
    <DropdownMenu
      align={TRIBE_ROUND_ATTRIBUTES.messageActionsDropdownAlign}
      contentClassName={styles.TribeRound__messageMenuContent}
      items={menuItems}
      label={TRIBE_ROUND_COPY.messageMoreActionsAriaLabel}
      trigger={
        <Button
          aria-label={TRIBE_ROUND_COPY.messageMoreActionsAriaLabel}
          className={styles.TribeRound__messageMoreButton}
          onClick={
            shouldStopDetailsOpening ? stopMessageDetailsOpening : undefined
          }
          size={TRIBE_ROUND_FORM.iconSize}
          type={TRIBE_ROUND_FORM.buttonType}
          variant={TRIBE_ROUND_FORM.ghostVariant}
        >
          <MoreHorizontalIcon />
        </Button>
      }
    />
  );
};

const renderRoundMessageActions = (controller: TribeRoundController, message: TribeRoundVisibleMessageResult) => (
  <div className={styles.TribeRound__messageActions}>
    <MessageLikesHoverCard
      isTriggerDisabled={isLikeButtonDisabled(controller, message)}
      likeCount={message.likeCount}
      messageId={message.id}
      tribeSlug={controller.tribeSlug}
    >
      <ReactionButton
        activeColor="currentColor"
        ariaLabel={`${TRIBE_ROUND_COPY.likeButtonAriaLabel} ${message.likeCount}`}
        className={getLikeButtonClassName(message.likedByViewer)}
        isDisabled={isLikeButtonDisabled(controller, message)}
        isActive={message.likedByViewer}
        count={message.likeCount}
        onClick={(event) => {
          stopMessageDetailsOpening(event);
          handleToggleLike(controller, message.id);
        }}
      />
    </MessageLikesHoverCard>
    <Button
      aria-label={`${TRIBE_ROUND_COPY.commentButtonAriaLabel} ${getCommentCount(message)}`}
      className={styles.TribeRound__commentButton}
      disabled={isPendingMessage(message)}
      onClick={(event) => {
        stopMessageDetailsOpening(event);
        openMessageDetails(controller, message.id);
      }}
      type={TRIBE_ROUND_FORM.buttonType}
      variant={TRIBE_ROUND_FORM.secondaryVariant}
    >
      <MessageCircleIcon />
      <AnimatedCount value={getCommentCount(message)} />
    </Button>
    {renderCommentAuthorsPreview(message)}
  </div>
);

export const renderRoundMessageCard = (controller: TribeRoundController, 
  message: TribeRoundVisibleMessageResult,
  messageIndex: number
) => (
  <AnimatedListItem
    aria-busy={isPendingMessage(message) || undefined}
    className={
      isPendingMessage(message)
        ? `${styles.TribeRound__message} ${styles["TribeRound__message--pending"]}`
        : styles.TribeRound__message
    }
    key={controller.optimisticRenderKeys[message.id] ?? message.id}
    layout={false}
  >
    <div
      className={styles.TribeRound__messageCard}
      role="presentation"
      onClick={() => {
        openMessageDetails(controller, message.id);
      }}
    >
      <article
        className={
          (message.media?.length ?? 0) > 0
            ? `${styles.TribeRound__messageArticle} ${styles["TribeRound__messageArticle--withMedia"]}`
            : styles.TribeRound__messageArticle
        }
      >
        <div className={styles.TribeRound__messageMeta}>
          {renderMessagePinControl(controller, message, true)}
          {renderMessageActionsMenu(controller, message, true)}
        </div>
        <div className={styles.TribeRound__messageBody}>
          <button
            aria-label={`${TRIBE_ROUND_COPY.openMessageDetailsAriaLabelPrefix}: ${message.title || message.content}`}
            className={styles.TribeRound__messageDetailsTrigger}
            disabled={isPendingMessage(message)}
            type={TRIBE_ROUND_FORM.buttonType}
          >
            <div className={styles.TribeRound__messageHeader}>
              {renderRoundAuthorAvatar(
                message.author,
                styles.TribeRound__avatar,
                getAvatarRoleModifierClassName(message.author.role)
              )}
              <div className={styles.TribeRound__author}>
                {renderAuthorIdentity(message.author)}
                {renderMessageCreatedTime(
                  message.createdAt,
                  message.channel
                )}
              </div>
            </div>
          </button>
          <div className={styles.TribeRound__messageContent}>
            {message.title ? (
              <h3 className={styles.TribeRound__messageTitle}>
                {message.title}
              </h3>
            ) : null}
            {renderMessageContent(controller, message, {
              contentClassName: "",
              isContentAlwaysCollapsed: true,
              previewClassName: TRIBE_ROUND_CONTENT_PREVIEW_CLASS.round,
              shouldStopLinkPropagation: true,
            })}
            {renderMessageFiles(controller, message, true)}
          </div>
          {renderMessagePoll(controller, message, true)}

          {renderRoundMessageActions(controller, message)}
        </div>
        {renderMessageFeedMedia(message, {
          shouldLoadEagerly: messageIndex === 0,
        })}
    </article>
    </div>
  </AnimatedListItem>
);
