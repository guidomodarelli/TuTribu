/**
 * @file State, refs, effects, and derived values of the tribe round, wired into one controller.
 */
import { useRouter } from "next/navigation";
import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast, useRichLinkEditor } from "@golfo/ui";
import { usePixelSnappedCentering } from "@/hooks/use-pixel-snapped-centering";
import { useTribeRoundNavigation } from "@/hooks/use-tribe-round-navigation";
import { MESSAGE_MEDIA_KIND } from "@/src/modules/messages/constants/message-round";
import type { TribeRoundMessageResult, TribeRoundResult } from "@/src/modules/messages/application/results/tribe-round-result";
import {
  type ActiveMessageMediaCarousel,
  applyLoadedReplies,
  COMPOSER_BODY_SCROLL,
  type ComposerFileDraft,
  type ComposerImageDraft,
  type ComposerMediaDraft,
  getImageDraftsFromMediaDrafts,
  getTribeRoundLocation,
  type LikeDebounceTimers,
  type ListRepliesResponse,
  type PendingCreateMessageIntent,
  type PendingCreateMessageKey,
  type PendingLikeIntents,
  type PendingPinIntents,
  type PendingPollVoteIntents,
  type PinDebounceTimers,
  type PollVoteDebounceTimers,
  readJsonRequest,
  type ReplyLoadStatus,
  revokeMessageImagePreviewUrl,
  submitJsonRequest,
  TRIBE_ROUND_COPY,
  TRIBE_ROUND_ENDPOINT,
  TRIBE_ROUND_FORM,
  TRIBE_ROUND_POLL,
  TRIBE_ROUND_REPLY_LOAD_STATUS,
  TRIBE_ROUND_RESET_KEY,
  type TribeRoundProps,
  type TribeRoundVisibleMessageResult,
  useRelativeTimeElementDefinition,
} from "./tribe-round-shared";

/**
 * Ref registries that deduplicate best-effort deletions of one kind of draft
 * asset (message images or message files).
 */
type DraftAssetCleanupRegistry = {
  cleanedAssetIdsRef: RefObject<Set<string>>;
  inFlightAssetIdsRef: RefObject<Set<string>>;
  queuedAssetIdsRef: RefObject<Set<string>>;
  buildEndpoint: (tribeSlug: string, assetId: string) => string;
};

/**
 * Best-effort deletion of a draft asset: it deduplicates concurrent calls per
 * asset and retries once when a deletion was queued while another was in
 * flight.
 */
function deleteDraftAsset({
  registry,
  assetId,
  actionTribeSlug,
}: {
  registry: DraftAssetCleanupRegistry;
  assetId: string;
  actionTribeSlug: string;
}): void {
  const { cleanedAssetIdsRef, inFlightAssetIdsRef, queuedAssetIdsRef } = registry;

  if (cleanedAssetIdsRef.current.has(assetId)) {
    return;
  }

  if (inFlightAssetIdsRef.current.has(assetId)) {
    queuedAssetIdsRef.current.add(assetId);
    return;
  }

  inFlightAssetIdsRef.current.add(assetId);
  void (async () => {
    let shouldRetryQueuedCleanup: boolean;

    do {
      shouldRetryQueuedCleanup = false;

      try {
        await submitJsonRequest(
          registry.buildEndpoint(actionTribeSlug, assetId),
          undefined,
          undefined,
          TRIBE_ROUND_FORM.deleteMethod
        );
        cleanedAssetIdsRef.current.add(assetId);
        queuedAssetIdsRef.current.delete(assetId);
      } catch {
        shouldRetryQueuedCleanup = queuedAssetIdsRef.current.delete(assetId);
      }
    } while (shouldRetryQueuedCleanup);

    inFlightAssetIdsRef.current.delete(assetId);
  })();
}

/**
 * Applies a state updater to the image projection of the media drafts and
 * merges the result back, keeping the relative position of images and videos.
 */
function mergeImageDraftsIntoMediaDrafts(
  currentMediaDrafts: ComposerMediaDraft[],
  updater:
    | ComposerImageDraft[]
    | ((currentImages: ComposerImageDraft[]) => ComposerImageDraft[])
): ComposerMediaDraft[] {
  const currentImageDrafts = getImageDraftsFromMediaDrafts(currentMediaDrafts);
  const nextImageDrafts =
    typeof updater === "function" ? updater(currentImageDrafts) : updater;
  const nextImageDraftsByLocalId = new Map(
    nextImageDrafts.map((imageDraft) => [imageDraft.localId, imageDraft])
  );
  const survivingMediaDrafts = currentMediaDrafts.filter(
    (mediaDraft) =>
      mediaDraft.kind === MESSAGE_MEDIA_KIND.video ||
      nextImageDraftsByLocalId.has(mediaDraft.localId)
  );
  const currentImageLocalIds = new Set(
    currentMediaDrafts
      .filter((mediaDraft) => mediaDraft.kind === MESSAGE_MEDIA_KIND.image)
      .map((mediaDraft) => mediaDraft.localId)
  );
  const appendedImageDrafts = nextImageDrafts.filter(
    (imageDraft) => !currentImageLocalIds.has(imageDraft.localId)
  );

  return [
    ...survivingMediaDrafts.map((mediaDraft) =>
      mediaDraft.kind === MESSAGE_MEDIA_KIND.image
        ? {
            kind: MESSAGE_MEDIA_KIND.image as typeof MESSAGE_MEDIA_KIND.image,
            ...(nextImageDraftsByLocalId.get(mediaDraft.localId) ??
              getImageDraftsFromMediaDrafts([mediaDraft])[0]),
          }
        : mediaDraft
    ),
    ...appendedImageDrafts.map((imageDraft) => ({
      kind: MESSAGE_MEDIA_KIND.image,
      ...imageDraft,
    })),
  ];
}

/**
 * Message composer state: title, rich content editor, poll, media and file
 * drafts, channel, validation errors, and the message being edited.
 */
function useMessageComposerState() {
  const [isMessageComposerOpen, setIsMessageComposerOpen] = useState(false);
  const [messageTitle, setMessageTitle] = useState("");
  const [isPollComposerEnabled, setIsPollComposerEnabled] = useState(false);
  const [pollOptions, setPollOptions] = useState<string[]>(
    Array.from({ length: TRIBE_ROUND_POLL.initialOptionCount }, () => "")
  );
  const [pollAllowsMultipleVotes, setPollAllowsMultipleVotes] = useState(false);
  const [mediaDrafts, setMediaDrafts] = useState<ComposerMediaDraft[]>([]);
  const [fileDrafts, setFileDrafts] = useState<ComposerFileDraft[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [messageComposerErrors, setMessageComposerErrors] = useState<string[]>([]);
  const messageEditor = useRichLinkEditor({
    onContentChange: () => setMessageComposerErrors([]),
  });
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);

  /**
   * Applies a state updater to the image projection of the media drafts and
   * merges the result back, keeping the relative position of images and videos.
   */
  const setMessageImageDrafts = useCallback(
    (
      updater:
        | ComposerImageDraft[]
        | ((currentImages: ComposerImageDraft[]) => ComposerImageDraft[])
    ) => {
      setMediaDrafts((currentMediaDrafts) =>
        mergeImageDraftsIntoMediaDrafts(currentMediaDrafts, updater)
      );
    },
    []
  );

  return {
    editingMessageId,
    fileDrafts,
    isMessageComposerOpen,
    isPollComposerEnabled,
    mediaDrafts,
    messageComposerErrors,
    messageEditor,
    messageTitle,
    pollAllowsMultipleVotes,
    pollOptions,
    selectedChannelId,
    setEditingMessageId,
    setFileDrafts,
    setIsMessageComposerOpen,
    setIsPollComposerEnabled,
    setMediaDrafts,
    setMessageComposerErrors,
    setMessageImageDrafts,
    setMessageTitle,
    setPollAllowsMultipleVotes,
    setPollOptions,
    setSelectedChannelId,
  };
}

/**
 * Round feed state: the round page on screen, its messages and pagination,
 * plus per-message reply, poll, expansion, and render-key state.
 */
function useRoundFeedState(serverRound: TribeRoundResult) {
  /**
   * Round page on screen: the server-rendered one until a channel chip, a
   * pagination link, or Back/Forward loads another page in place.
   */
  const [round, setRound] = useState(serverRound);
  const [messages, setMessages] =
    useState<TribeRoundVisibleMessageResult[]>(round.messages);
  const [visiblePagination, setVisiblePagination] = useState(round.pagination);
  const [selectedPollOptionIds, setSelectedPollOptionIds] = useState<
    Record<string, string[] | undefined>
  >({});
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  /**
   * Maps a server-confirmed message or reply id to the optimistic id it was
   * first rendered with, so animated lists keep one stable React key.
   */
  const [optimisticRenderKeys, setOptimisticRenderKeys] = useState<
    Record<string, string>
  >({});
  const [replyLoadStatuses, setReplyLoadStatuses] = useState<
    Record<string, ReplyLoadStatus | undefined>
  >({});
  const [expandedMessageIds, setExpandedMessageIds] = useState<Partial<Record<string, boolean>>>(
    {}
  );

  return {
    expandedMessageIds,
    messages,
    optimisticRenderKeys,
    replyDrafts,
    replyLoadStatuses,
    round,
    selectedPollOptionIds,
    setExpandedMessageIds,
    setMessages,
    setOptimisticRenderKeys,
    setReplyDrafts,
    setReplyLoadStatuses,
    setRound,
    setSelectedPollOptionIds,
    setVisiblePagination,
    visiblePagination,
  };
}

/**
 * Overlay state: message details thread, media carousel, pending action,
 * delete confirmation, and the created-at editor.
 */
function useRoundOverlayState() {
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [activeImageCarousel, setActiveImageCarousel] =
    useState<ActiveMessageMediaCarousel | null>(null);
  const [activeImageCarouselSlideIndex, setActiveImageCarouselSlideIndex] =
    useState(0);
  // The slide that drives video iframe mounting. It only follows the carousel
  // once a scroll has come to rest (`onSettle`), so the heavy mount/unmount of
  // a cross-origin player never runs mid-transition.
  const [settledImageCarouselSlideIndex, setSettledImageCarouselSlideIndex] =
    useState(0);
  const [isMessageDetailsOpen, setIsMessageDetailsOpen] = useState(false);
  const messageDetailsDialogRef = usePixelSnappedCentering();
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [messagePendingDeletion, setMessagePendingDeletion] =
    useState<TribeRoundMessageResult | null>(null);
  const [editingCreatedAtMessageId, setEditingCreatedAtMessageId] = useState<
    string | null
  >(null);
  const [editingCreatedAtValue, setEditingCreatedAtValue] = useState("");

  return {
    activeImageCarousel,
    activeImageCarouselSlideIndex,
    editingCreatedAtMessageId,
    editingCreatedAtValue,
    isMessageDetailsOpen,
    messageDetailsDialogRef,
    messagePendingDeletion,
    pendingActionId,
    selectedMessageId,
    setActiveImageCarousel,
    setActiveImageCarouselSlideIndex,
    setEditingCreatedAtMessageId,
    setEditingCreatedAtValue,
    setIsMessageDetailsOpen,
    setMessagePendingDeletion,
    setPendingActionId,
    setSelectedMessageId,
    setSettledImageCarouselSlideIndex,
    settledImageCarouselSlideIndex,
  };
}

/**
 * Registries of composer blocks and inputs plus the stable callbacks that
 * register them and scroll or focus them once they mount.
 */
function useComposerBlockTargets() {
  /**
   * Registry of composer block containers (a media draft card or the poll
   * composer section) keyed by a stable token, so {@link revealComposerBlock} and
   * {@link scrollPollComposerIntoView} can scroll the whole block into view rather
   * than a single input.
   */
  const composerBlockTargetsRef = useRef(new Map<string, HTMLElement | null>());

  /**
   * Scrolls the poll composer into view aligning its bottom edge with the
   * scrollport, so a newly appended option becomes visible. Deferred to the next
   * frame so the new option is in the DOM and the section is taller;
   * `scrollIntoView` degrades to an instant alignment on older WebKit, keeping it
   * visible on both engines.
   */
  const scrollPollComposerIntoView = useCallback(() => {
    window.requestAnimationFrame(() => {
      composerBlockTargetsRef.current
        .get(TRIBE_ROUND_POLL.composerBlockKey)
        ?.scrollIntoView({
          behavior: COMPOSER_BODY_SCROLL.bottomBehavior,
          block: COMPOSER_BODY_SCROLL.pollBlockAlignment,
        });
    });
  }, []);

  /**
   * Registry of composer inputs that should receive focus right after being
   * added, keyed by a stable token. Media drafts register by their `localId`;
   * poll options register by their draft key. Using element refs instead of a
   * DOM query avoids fragile attribute-selector escaping for file-name-derived
   * image ids.
   */
  const composerFocusTargetsRef = useRef(
    new Map<string, HTMLInputElement | null>()
  );

  /**
   * Returns a ref callback that registers (or unregisters on unmount) a composer
   * block under {@link key} in {@link composerBlockTargetsRef}, so the whole
   * block can later be scrolled into view once it mounts. The registry is read
   * only inside the returned ref callback (commit phase), never during render.
   */
  const registerComposerBlockTarget = useCallback(
    (key: string) => (node: HTMLElement | null) => {
      if (node) {
        composerBlockTargetsRef.current.set(key, node);
      } else {
        composerBlockTargetsRef.current.delete(key);
      }
    },
    []
  );

  /**
   * Returns a ref callback that registers (or unregisters on unmount) a composer
   * input under {@link key} in {@link composerFocusTargetsRef}, so it can later
   * receive focus once it mounts. The registry is read only inside the returned
   * ref callback (commit phase), never during render.
   */
  const registerComposerFocusTarget = useCallback(
    (key: string) => (node: HTMLInputElement | null) => {
      if (node) {
        composerFocusTargetsRef.current.set(key, node);
      } else {
        composerFocusTargetsRef.current.delete(key);
      }
    },
    []
  );

  /**
   * On the next frame, after React has committed the new nodes to the DOM,
   * scrolls a just-added composer block fully into view and moves the caret to
   * its first input. `block: "nearest"` reveals the whole block (its top and
   * bottom) whenever it fits the scrollport, instead of pinning a single input
   * and clipping the rest. Focus runs with `preventScroll` so it never overrides
   * that smooth scroll with an instant jump; older WebKit that ignores
   * `preventScroll` still falls back to native focus scrolling.
   */
  const revealComposerBlock = useCallback(
    (blockKey: string, inputKey: string) => {
      window.requestAnimationFrame(() => {
        composerBlockTargetsRef.current.get(blockKey)?.scrollIntoView({
          behavior: COMPOSER_BODY_SCROLL.bottomBehavior,
          block: COMPOSER_BODY_SCROLL.focusBlockAlignment,
        });
        composerFocusTargetsRef.current
          .get(inputKey)
          ?.focus({ preventScroll: true });
      });
    },
    []
  );

  return {
    composerBlockTargetsRef,
    composerFocusTargetsRef,
    registerComposerBlockTarget,
    registerComposerFocusTarget,
    revealComposerBlock,
    scrollPollComposerIntoView,
  };
}

/**
 * Counters and bookkeeping refs for optimistic messages, replies, drafts, and
 * the round view version.
 */
function useRoundBookkeepingRefs() {
  const pendingCreateMessageKeyRef = useRef<PendingCreateMessageKey | null>(null);
  /**
   * Bumped whenever another round page replaces the visible one, so an
   * in-flight message creation never writes its optimistic outcome (or its
   * rollback snapshot) into a page it was not started from.
   */
  const roundViewVersionRef = useRef(0);
  const roundSectionRef = useRef<HTMLElement | null>(null);
  const messageImageCounterRef = useRef(0);
  const messageFileCounterRef = useRef(0);
  const optimisticMessageCounterRef = useRef(0);
  const optimisticReplyCounterRef = useRef(0);
  const mediaDraftCounterRef = useRef(0);
  const discardedMessageFileLocalIdsRef = useRef<Set<string>>(new Set());
  const persistingMessageFileAssetIdsRef = useRef<Set<string>>(new Set());

  return {
    discardedMessageFileLocalIdsRef,
    mediaDraftCounterRef,
    messageFileCounterRef,
    messageImageCounterRef,
    optimisticMessageCounterRef,
    optimisticReplyCounterRef,
    pendingCreateMessageKeyRef,
    persistingMessageFileAssetIdsRef,
    roundSectionRef,
    roundViewVersionRef,
  };
}

/**
 * Values derived during render from the round, composer, and overlay state.
 */
function deriveTribeRoundView({
  activeImageCarousel,
  editingMessageId,
  mediaDrafts,
  messageComposerErrors,
  messages,
  pendingActionId,
  round,
  selectedChannelId,
  selectedMessageId,
}: {
  activeImageCarousel: ActiveMessageMediaCarousel | null;
  editingMessageId: string | null;
  mediaDrafts: ComposerMediaDraft[];
  messageComposerErrors: string[];
  messages: TribeRoundVisibleMessageResult[];
  pendingActionId: string | null;
  round: TribeRoundResult;
  selectedChannelId: string;
  selectedMessageId: string | null;
}) {
  const selectedMessage =
    messages.find((message) => message.id === selectedMessageId) ?? null;
  const activeImageCarouselMessage = activeImageCarousel
    ? messages.find((message) => message.id === activeImageCarousel.messageId) ??
      null
    : null;

  return {
    activeChannel:
      round.channels.find((channel) => channel.id === round.activeChannelId) ?? null,
    activeImageCarouselMedia: activeImageCarouselMessage?.media ?? [],
    activeImageCarouselMessage,
    hasMessageComposerErrors: messageComposerErrors.length > 0,
    isBusy: Boolean(pendingActionId),
    isEditingMessage: editingMessageId !== null,
    isMessageChannelInvalid: messageComposerErrors.includes(
      TRIBE_ROUND_COPY.messageComposerMissingChannel
    ),
    isMessageContentInvalid: messageComposerErrors.includes(
      TRIBE_ROUND_COPY.messageComposerMissingContent
    ),
    isMessageTitleInvalid: messageComposerErrors.includes(
      TRIBE_ROUND_COPY.messageComposerMissingTitle
    ),
    /**
     * Image projection of the unified media draft list. The Cloudflare upload and
     * cleanup machinery reads and writes this view; updates are merged back into
     * `mediaDrafts` so the author-chosen global order is preserved.
     */
    messageImageDrafts: getImageDraftsFromMediaDrafts(mediaDrafts),
    selectedChannel:
      round.channels.find((channel) => channel.id === selectedChannelId) ?? null,
    selectedMessage,
  };
}

/**
 * Reply load status of the message open in the details thread: an explicit
 * status when one was recorded, otherwise loading while its replies are
 * still missing.
 */
function getSelectedMessageReplyLoadStatus(
  selectedMessage: TribeRoundVisibleMessageResult | null,
  replyLoadStatuses: Record<string, ReplyLoadStatus | undefined>
): ReplyLoadStatus {
  if (!selectedMessage) {
    return TRIBE_ROUND_REPLY_LOAD_STATUS.loaded;
  }

  return (
    replyLoadStatuses[selectedMessage.id] ??
    (selectedMessage.replyCount > 0 && selectedMessage.hasLoadedReplies === false
      ? TRIBE_ROUND_REPLY_LOAD_STATUS.loading
      : TRIBE_ROUND_REPLY_LOAD_STATUS.loaded)
  );
}

/**
 * Releases every transient resource of an unmounting round: revokes and
 * deletes unpersisted image drafts, drops the pending create intent,
 * invalidates in-flight actions, and clears the debounce timers and intents.
 */
function disposeTribeRoundResources({
  refs,
  discardedMessageImageLocalIds,
  persistingMessageImageAssetIds,
  deleteMessageImageAsset,
}: {
  refs: TribeRoundResourceRefs;
  discardedMessageImageLocalIds: Set<string>;
  persistingMessageImageAssetIds: Set<string>;
  deleteMessageImageAsset: (assetId: string, actionTribeSlug?: string) => void;
}): void {
  const actionTribeSlug = refs.currentTribeSlugRef.current;
  const revokedMessageImagePreviewUrls = new Set<string>();

  refs.currentMessageImageDraftsRef.current
    .filter(
      (imageDraft) =>
        !imageDraft.isPersisted &&
        (!imageDraft.assetId ||
          !persistingMessageImageAssetIds.has(imageDraft.assetId))
    )
    .forEach((imageDraft) => {
      discardedMessageImageLocalIds.add(imageDraft.localId);
      revokeMessageImagePreviewUrl(imageDraft.previewUrl);
      revokedMessageImagePreviewUrls.add(imageDraft.previewUrl);

      if (imageDraft.assetId) {
        deleteMessageImageAsset(imageDraft.assetId, actionTribeSlug);
      }
    });

  getImageDraftsFromMediaDrafts(
    refs.pendingCreateMessageIntentRef.current?.draft.mediaDrafts ?? []
  ).forEach((imageDraft) => {
    if (!revokedMessageImagePreviewUrls.has(imageDraft.previewUrl)) {
      revokeMessageImagePreviewUrl(imageDraft.previewUrl);
    }
  });
  refs.pendingCreateMessageIntentRef.current = null;

  refs.currentActionTokenRef.current += 1;
  refs.currentTribeSlugRef.current = TRIBE_ROUND_RESET_KEY.empty;
  clearTribeRoundDebounceState(refs);
}

/**
 * Cancels every like, pin, and poll vote debounce timer and forgets their
 * pending intents.
 */
function clearTribeRoundDebounceState(refs: TribeRoundResourceRefs): void {
  Object.values(refs.likeDebounceTimersRef.current).forEach((timer) => {
    clearTimeout(timer);
  });
  Object.values(refs.pinDebounceTimersRef.current).forEach((timer) => {
    clearTimeout(timer);
  });
  Object.values(refs.pollVoteDebounceTimersRef.current).forEach((timer) => {
    clearTimeout(timer);
  });
  refs.likeDebounceTimersRef.current = {};
  refs.pendingLikeIntentsRef.current = {};
  refs.pinDebounceTimersRef.current = {};
  refs.pendingPinIntentsRef.current = {};
  refs.pollVoteDebounceTimersRef.current = {};
  refs.pendingPollVoteIntentsRef.current = {};
}

/** Refs released by {@link disposeTribeRoundResources} on unmount. */
type TribeRoundResourceRefs = Pick<
  ReturnType<typeof useTribeRoundResources>,
  | "currentActionTokenRef"
  | "currentMessageImageDraftsRef"
  | "currentTribeSlugRef"
  | "likeDebounceTimersRef"
  | "pendingCreateMessageIntentRef"
  | "pendingLikeIntentsRef"
  | "pendingPinIntentsRef"
  | "pendingPollVoteIntentsRef"
  | "pinDebounceTimersRef"
  | "pollVoteDebounceTimersRef"
>;

/**
 * Ref registries and a stable callback that deletes draft assets of one kind
 * (message images or message files) on a best-effort basis.
 *
 * @param currentTribeSlugRef - Tribe the round currently belongs to; the
 * default tribe of a deletion.
 * @param buildEndpoint - Builds the delete endpoint of one asset.
 */
function useDraftAssetCleanup(
  currentTribeSlugRef: RefObject<string>,
  buildEndpoint: (tribeSlug: string, assetId: string) => string
) {
  const cleanedAssetIdsRef = useRef<Set<string>>(new Set());
  const inFlightAssetIdsRef = useRef<Set<string>>(new Set());
  const queuedAssetIdsRef = useRef<Set<string>>(new Set());
  const deleteAsset = useCallback(
    (assetId: string, actionTribeSlug: string = currentTribeSlugRef.current) => {
      deleteDraftAsset({
        actionTribeSlug,
        assetId,
        registry: {
          buildEndpoint,
          cleanedAssetIdsRef,
          inFlightAssetIdsRef,
          queuedAssetIdsRef,
        },
      });
    },
    [buildEndpoint, currentTribeSlugRef]
  );

  return { cleanedAssetIdsRef, deleteAsset };
}

/**
 * Action, debounce, and draft asset refs, the draft asset cleanup callbacks,
 * and the effects that keep them in sync and release them on unmount.
 */
function useTribeRoundResources(tribeSlug: string, mediaDrafts: ComposerMediaDraft[]) {
  const currentTribeSlugRef = useRef(tribeSlug);
  const currentActionTokenRef = useRef(0);
  const likeDebounceTimersRef = useRef<LikeDebounceTimers>({});
  const pendingLikeIntentsRef = useRef<PendingLikeIntents>({});
  const pinDebounceTimersRef = useRef<PinDebounceTimers>({});
  const pendingPinIntentsRef = useRef<PendingPinIntents>({});
  const pollVoteDebounceTimersRef = useRef<PollVoteDebounceTimers>({});
  const pendingPollVoteIntentsRef = useRef<PendingPollVoteIntents>({});
  const pendingCreateMessageIntentRef =
    useRef<PendingCreateMessageIntent | null>(null);
  const discardedMessageImageLocalIdsRef = useRef<Set<string>>(new Set());
  const currentMessageImageDraftsRef = useRef<ComposerImageDraft[]>([]);
  const persistingMessageImageAssetIdsRef = useRef<Set<string>>(new Set());

  const imageAssetCleanup = useDraftAssetCleanup(
    currentTribeSlugRef,
    TRIBE_ROUND_ENDPOINT.messageImageItem
  );
  /**
   * Best-effort deletion of a draft file asset, mirroring
   * `deleteMessageImageAsset`: it deduplicates concurrent calls per
   * asset and retries once when a deletion was queued while another was in
   * flight.
   */
  const fileAssetCleanup = useDraftAssetCleanup(
    currentTribeSlugRef,
    TRIBE_ROUND_ENDPOINT.messageFileItem
  );
  const deleteMessageImageAsset = imageAssetCleanup.deleteAsset;

  useEffect(() => {
    currentTribeSlugRef.current = tribeSlug;
  }, [tribeSlug]);

  useEffect(() => {
    currentMessageImageDraftsRef.current =
      getImageDraftsFromMediaDrafts(mediaDrafts);
  }, [mediaDrafts]);

  useEffect(() => {
    const discardedMessageImageLocalIds =
      discardedMessageImageLocalIdsRef.current;
    const persistingMessageImageAssetIds =
      persistingMessageImageAssetIdsRef.current;

    return () => {
      disposeTribeRoundResources({
        deleteMessageImageAsset,
        discardedMessageImageLocalIds,
        persistingMessageImageAssetIds,
        refs: {
          currentActionTokenRef,
          currentMessageImageDraftsRef,
          currentTribeSlugRef,
          likeDebounceTimersRef,
          pendingCreateMessageIntentRef,
          pendingLikeIntentsRef,
          pendingPinIntentsRef,
          pendingPollVoteIntentsRef,
          pinDebounceTimersRef,
          pollVoteDebounceTimersRef,
        },
      });
    };
  }, [deleteMessageImageAsset]);

  return {
    cleanedMessageFileAssetIdsRef: fileAssetCleanup.cleanedAssetIdsRef,
    cleanedMessageImageAssetIdsRef: imageAssetCleanup.cleanedAssetIdsRef,
    currentActionTokenRef,
    currentMessageImageDraftsRef,
    currentTribeSlugRef,
    deleteMessageFileAsset: fileAssetCleanup.deleteAsset,
    deleteMessageImageAsset,
    discardedMessageImageLocalIdsRef,
    likeDebounceTimersRef,
    pendingCreateMessageIntentRef,
    pendingLikeIntentsRef,
    pendingPinIntentsRef,
    pendingPollVoteIntentsRef,
    persistingMessageImageAssetIdsRef,
    pinDebounceTimersRef,
    pollVoteDebounceTimersRef,
  };
}

/**
 * Loads the replies of the message open in the details thread when they are
 * still missing, and records whether the load succeeded or failed.
 */
function useSelectedMessageRepliesLoader({
  currentTribeSlugRef,
  isMessageDetailsOpen,
  selectedMessageHasLoadedReplies,
  selectedMessageRepliesId,
  selectedMessageReplyLoadStatus,
  setMessages,
  setReplyLoadStatuses,
  tribeSlug,
}: {
  currentTribeSlugRef: RefObject<string>;
  isMessageDetailsOpen: boolean;
  selectedMessageHasLoadedReplies: boolean | undefined;
  selectedMessageRepliesId: string | undefined;
  selectedMessageReplyLoadStatus: ReplyLoadStatus;
  setMessages: Dispatch<SetStateAction<TribeRoundVisibleMessageResult[]>>;
  setReplyLoadStatuses: Dispatch<
    SetStateAction<Record<string, ReplyLoadStatus | undefined>>
  >;
  tribeSlug: string;
}): void {
  useEffect(() => {
    if (
      !isMessageDetailsOpen ||
      !selectedMessageRepliesId ||
      selectedMessageHasLoadedReplies !== false ||
      selectedMessageReplyLoadStatus !== TRIBE_ROUND_REPLY_LOAD_STATUS.loading
    ) {
      return;
    }

    const controller = new AbortController();
    let isActive = true;
    const actionTribeSlug = tribeSlug;
    const messageId = selectedMessageRepliesId;

    void readJsonRequest<ListRepliesResponse>(
      TRIBE_ROUND_ENDPOINT.reply(actionTribeSlug, messageId),
      controller.signal
    )
      .then((response) => {
        if (!isActive || currentTribeSlugRef.current !== actionTribeSlug) {
          return;
        }

        const replies = Array.isArray(response.replies) ? response.replies : [];

        setMessages((currentMessages) =>
          applyLoadedReplies(currentMessages, messageId, replies)
        );
        setReplyLoadStatuses((currentStatuses) => ({
          ...currentStatuses,
          [messageId]: TRIBE_ROUND_REPLY_LOAD_STATUS.loaded,
        }));
      })
      .catch((error: unknown) => {
        if (!isActive || controller.signal.aborted) {
          return;
        }

        setReplyLoadStatuses((currentStatuses) => ({
          ...currentStatuses,
          [messageId]: TRIBE_ROUND_REPLY_LOAD_STATUS.error,
        }));
        toast.error(
          error instanceof Error
            ? error.message
            : TRIBE_ROUND_COPY.repliesLoadError
        );
      });

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [
    currentTribeSlugRef,
    isMessageDetailsOpen,
    selectedMessageHasLoadedReplies,
    selectedMessageRepliesId,
    selectedMessageReplyLoadStatus,
    setMessages,
    setReplyLoadStatuses,
    tribeSlug,
  ]);
}

/**
 * Message details body ref plus the auto-focus handler that moves focus to it
 * when the thread dialog opens.
 */
function useMessageDetailsBodyFocus() {
  const messageDetailsBodyRef = useRef<HTMLElement>(null);

  /**
   * Starts the message details modal on its scrollable body instead of Radix's
   * first tabbable element. When the viewer has no message actions menu, that
   * element is the like button, and focusing it opens the "Le gustó a" hover
   * card (Radix HoverCardTrigger opens on focus) without any hover. The body
   * keeps the dialog name announced, scrolls with the keyboard right away and
   * hands Tab to the first control; Radix's default applies when no message is
   * selected.
   *
   * @param event - Radix auto-focus event, cancelable.
   */
  const focusMessageDetailsBody = useCallback((event: Event) => {
    const messageDetailsBody = messageDetailsBodyRef.current;

    if (!messageDetailsBody) {
      return;
    }

    event.preventDefault();
    messageDetailsBody.focus({ preventScroll: true });
  }, []);

  return { focusMessageDetailsBody, messageDetailsBodyRef };
}

/**
 * Everything the round handlers and render helpers read: props, state,
 * refs, derived values, and hook results of one render of
 * {@link TribeRoundContent}.
 */
export type TribeRoundController = Omit<TribeRoundProps, "round"> & {
  router: ReturnType<typeof useRouter>;
  serverRound: TribeRoundResult;
  roundNavigation: ReturnType<typeof useTribeRoundNavigation>;
  selectedMessageReplyLoadStatus: ReplyLoadStatus;
} & ReturnType<typeof useMessageComposerState> &
  ReturnType<typeof useRoundFeedState> &
  ReturnType<typeof useRoundOverlayState> &
  ReturnType<typeof useComposerBlockTargets> &
  ReturnType<typeof useRoundBookkeepingRefs> &
  ReturnType<typeof deriveTribeRoundView> &
  ReturnType<typeof useTribeRoundResources> &
  ReturnType<typeof useMessageDetailsBodyFocus>;

/**
 * Wires the round state, refs, derived values, navigation, and effects of one
 * render of {@link TribeRoundContent} into a single controller read by the
 * round handlers and render helpers. `onRoundLoaded` applies a round loaded by
 * navigation; the caller passes it so this hook does not import the handlers
 * that read the controller.
 */
export function useTribeRoundController(
  { authenticatedMember, tribeSlug, round: serverRound }: TribeRoundProps,
  onRoundLoaded: (controller: TribeRoundController, nextRound: TribeRoundResult) => void
): TribeRoundController {
  const router = useRouter();
  useRelativeTimeElementDefinition();

  const composerState = useMessageComposerState();
  const feedState = useRoundFeedState(serverRound);
  const overlayState = useRoundOverlayState();
  const composerTargets = useComposerBlockTargets();
  const bookkeepingRefs = useRoundBookkeepingRefs();
  const derivedView = deriveTribeRoundView({
    ...composerState,
    ...feedState,
    ...overlayState,
  });
  const selectedMessageReplyLoadStatus = getSelectedMessageReplyLoadStatus(
    derivedView.selectedMessage,
    feedState.replyLoadStatuses
  );
  const roundNavigation = useTribeRoundNavigation({
    initialLocation: getTribeRoundLocation(serverRound),
    onRoundLoaded: (nextRound) => onRoundLoaded(controller, nextRound),
    tribeSlug,
  });
  const resources = useTribeRoundResources(tribeSlug, composerState.mediaDrafts);

  useSelectedMessageRepliesLoader({
    currentTribeSlugRef: resources.currentTribeSlugRef,
    isMessageDetailsOpen: overlayState.isMessageDetailsOpen,
    selectedMessageHasLoadedReplies: derivedView.selectedMessage?.hasLoadedReplies,
    selectedMessageRepliesId: derivedView.selectedMessage?.id,
    selectedMessageReplyLoadStatus,
    setMessages: feedState.setMessages,
    setReplyLoadStatuses: feedState.setReplyLoadStatuses,
    tribeSlug,
  });

  const messageDetailsBodyFocus = useMessageDetailsBodyFocus();
  const controller: TribeRoundController = {
    authenticatedMember,
    tribeSlug,
    ...composerState,
    ...feedState,
    ...overlayState,
    ...composerTargets,
    ...bookkeepingRefs,
    ...derivedView,
    ...resources,
    ...messageDetailsBodyFocus,
    roundNavigation,
    router,
    selectedMessageReplyLoadStatus,
    serverRound,
  };

  return controller;
}

export const isCurrentAction = (controller: TribeRoundController, actionToken: number, actionTribeSlug: string) =>
  controller.currentActionTokenRef.current === actionToken &&
  controller.currentTribeSlugRef.current === actionTribeSlug;
