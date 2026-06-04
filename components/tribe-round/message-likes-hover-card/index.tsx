"use client";

import {
  type MouseEventHandler,
  type ReactNode,
  type TouchEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import type { MessageLikerResult } from "@/src/modules/messages/application/results/tribe-round-result";

import styles from "./styles.module.scss";

const MESSAGE_LIKES_HOVER_CARD_API = {
  base: "/api/tribes/",
  likesSegment: "/likes",
  messagesSegment: "/messages/",
} as const;

const MESSAGE_LIKES_HOVER_CARD_COPY = {
  emptyMessage: "Todavía nadie dio me gusta.",
  errorMessage: "No pudimos cargar las reacciones.",
  loadingMessage: "Cargando reacciones...",
  title: "Le gustó a",
  buildMoreLabel: (remainingCount: number) => `y otros ${remainingCount}...`,
} as const;

const LIKERS_LOAD_STATUS = {
  error: "error",
  idle: "idle",
  loaded: "loaded",
  loading: "loading",
} as const;

type LikersLoadStatus =
  (typeof LIKERS_LOAD_STATUS)[keyof typeof LIKERS_LOAD_STATUS];

type ListLikersResponse = {
  likers?: MessageLikerResult[];
  totalCount?: number;
};

type MessageLikesHoverCardProps = {
  children: ReactNode;
  isTriggerDisabled?: boolean;
  likeCount: number;
  messageId: string;
  onTriggerClick?: MouseEventHandler<HTMLSpanElement>;
  tribeSlug: string;
};

/**
 * Builds the API endpoint that returns the preview list of likers for a message.
 *
 * @param tribeSlug - Slug of the tribe that owns the message.
 * @param messageId - Identifier of the message whose likers are requested.
 * @returns The relative URL of the message likers endpoint.
 */
function buildLikesEndpoint(tribeSlug: string, messageId: string): string {
  return (
    MESSAGE_LIKES_HOVER_CARD_API.base +
    tribeSlug +
    MESSAGE_LIKES_HOVER_CARD_API.messagesSegment +
    messageId +
    MESSAGE_LIKES_HOVER_CARD_API.likesSegment
  );
}

/**
 * Keeps Radix HoverCardTrigger's touch handler from cancelling the synthesized
 * click emitted by mobile browsers for the nested like button.
 *
 * @param event - Touch event started inside the actionable trigger content.
 */
function stopTriggerTouchStartPropagation(
  event: TouchEvent<HTMLSpanElement>
) {
  event.stopPropagation();
}

/**
 * Shows, on hover over a message like control, a HoverCard listing the members
 * who liked the message. The likers are fetched on demand the first time the
 * card opens, displaying up to the server-side preview limit plus a collapsed
 * "y otros X..." row when more members reacted.
 *
 * @param props - Component props.
 * @param props.children - The hover trigger, typically the like button.
 * @param props.isTriggerDisabled - Whether the wrapped trigger control is disabled.
 * @param props.likeCount - Current like count, used to render the empty state.
 * @param props.messageId - Identifier of the message whose likers are shown.
 * @param props.onTriggerClick - Optional click handler for the trigger wrapper.
 * @param props.tribeSlug - Slug of the tribe that owns the message.
 * @returns The hover card wrapping the provided trigger.
 */
export function MessageLikesHoverCard({
  children,
  isTriggerDisabled = false,
  likeCount,
  messageId,
  onTriggerClick,
  tribeSlug,
}: MessageLikesHoverCardProps) {
  const [status, setStatus] = useState<LikersLoadStatus>(
    LIKERS_LOAD_STATUS.idle
  );
  const [likers, setLikers] = useState<MessageLikerResult[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const loadLikers = useCallback(async () => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setLikers([]);
    setTotalCount(0);
    setStatus(LIKERS_LOAD_STATUS.loading);

    try {
      const response = await fetch(
        buildLikesEndpoint(tribeSlug, messageId),
        { signal: controller.signal }
      );

      if (!response.ok) {
        throw new Error(response.statusText);
      }

      const body = (await response.json().catch(() => ({}))) as ListLikersResponse;

      if (controller.signal.aborted) {
        return;
      }

      setLikers(Array.isArray(body.likers) ? body.likers : []);
      setTotalCount(typeof body.totalCount === "number" ? body.totalCount : 0);
      setStatus(LIKERS_LOAD_STATUS.loaded);
    } catch {
      if (controller.signal.aborted) {
        return;
      }

      setLikers([]);
      setTotalCount(0);
      setStatus(LIKERS_LOAD_STATUS.error);
    }
  }, [messageId, tribeSlug]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        abortControllerRef.current?.abort();

        return;
      }

      void loadLikers();
    },
    [loadLikers]
  );

  const remainingCount = Math.max(totalCount - likers.length, 0);
  const hasLikers = likers.length > 0;
  const isEmpty =
    status === LIKERS_LOAD_STATUS.loaded && !hasLikers && likeCount === 0;
  const triggerClassName = [
    styles.MessageLikesHoverCard__trigger,
    ...(isTriggerDisabled
      ? [styles["MessageLikesHoverCard__trigger--disabled"]]
      : []),
  ].join(" ");

  return (
    <HoverCard onOpenChange={handleOpenChange}>
      <HoverCardTrigger asChild>
        <span
          aria-disabled={isTriggerDisabled || undefined}
          className={triggerClassName}
          onClick={isTriggerDisabled ? onTriggerClick : undefined}
          tabIndex={isTriggerDisabled ? 0 : undefined}
        >
          <span
            className={styles.MessageLikesHoverCard__triggerInteraction}
            onTouchStart={stopTriggerTouchStartPropagation}
          >
            {children}
          </span>
        </span>
      </HoverCardTrigger>
      <HoverCardContent className={styles.MessageLikesHoverCard} side="top">
        <p className={styles.MessageLikesHoverCard__title}>
          {MESSAGE_LIKES_HOVER_CARD_COPY.title}
        </p>
        {status === LIKERS_LOAD_STATUS.loading && !hasLikers ? (
          <p className={styles.MessageLikesHoverCard__feedback}>
            {MESSAGE_LIKES_HOVER_CARD_COPY.loadingMessage}
          </p>
        ) : null}
        {status === LIKERS_LOAD_STATUS.error ? (
          <p className={styles.MessageLikesHoverCard__feedback}>
            {MESSAGE_LIKES_HOVER_CARD_COPY.errorMessage}
          </p>
        ) : null}
        {isEmpty ? (
          <p className={styles.MessageLikesHoverCard__feedback}>
            {MESSAGE_LIKES_HOVER_CARD_COPY.emptyMessage}
          </p>
        ) : null}
        {hasLikers ? (
          <ul className={styles.MessageLikesHoverCard__list}>
            {likers.map((liker) => (
              <li
                className={styles.MessageLikesHoverCard__item}
                key={liker.id}
              >
                <Avatar
                  className={styles.MessageLikesHoverCard__avatar}
                  size="sm"
                >
                  {liker.image ? (
                    <AvatarImage alt={liker.name} src={liker.image} />
                  ) : null}
                  <AvatarFallback>{liker.avatarFallback}</AvatarFallback>
                </Avatar>
                <span className={styles.MessageLikesHoverCard__name}>
                  {liker.name}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {remainingCount > 0 ? (
          <p className={styles.MessageLikesHoverCard__more}>
            {MESSAGE_LIKES_HOVER_CARD_COPY.buildMoreLabel(remainingCount)}
          </p>
        ) : null}
      </HoverCardContent>
    </HoverCard>
  );
}
