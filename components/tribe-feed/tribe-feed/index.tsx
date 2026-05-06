"use client";

import {
  createElement,
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  FormEvent,
  MouseEvent,
} from "react";
import {
  ChevronDownIcon,
  HeartIcon,
  SendIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { AuthenticatedMemberResult } from "@/src/modules/auth/application/results/authenticated-member-result";
import type {
  TribeFeedCommentResult,
  TribeFeedPostResult,
  TribeFeedResult,
} from "@/src/modules/posts/application/results/tribe-feed-result";
import styles from "./styles.module.scss";

const TRIBE_FEED_ROUTE = {
  apiTribes: "/api/tribes/",
  commentsSegment: "/comments",
  likeSegment: "/like",
  postsBaseSegment: "/posts",
  postsSegment: "/posts/",
} as const;

const TRIBE_FEED_ENDPOINT = {
  comment: (tribeSlug: string, postId: string) =>
    TRIBE_FEED_ROUTE.apiTribes +
    tribeSlug +
    TRIBE_FEED_ROUTE.postsSegment +
    postId +
    TRIBE_FEED_ROUTE.commentsSegment,
  like: (tribeSlug: string, postId: string) =>
    TRIBE_FEED_ROUTE.apiTribes +
    tribeSlug +
    TRIBE_FEED_ROUTE.postsSegment +
    postId +
    TRIBE_FEED_ROUTE.likeSegment,
  post: (tribeSlug: string) =>
    TRIBE_FEED_ROUTE.apiTribes +
    tribeSlug +
    TRIBE_FEED_ROUTE.postsBaseSegment,
} as const;

const TRIBE_FEED_COPY = {
  openPostDetailsAriaLabelPrefix: "Abrir publicación",
  commentInputLabel: "Escribir un comentario",
  commentSendButtonAriaLabel: "Enviar comentario",
  commentPlaceholder: "Escribi un comentario",
  commentsTitle: "Comentarios",
  postDetailsDialogDescription: "Detalle de la publicación y sus comentarios.",
  postDetailsDialogTitle: "Publicación",
  postDetailsContentLabel: "Contenido de la publicación",
  postContentShowLess: "Ver menos",
  postContentShowMore: "Ver más",
  emptyDescription:
    "Todavia no hay publicaciones. Cuando alguien comparta una novedad, va a aparecer aca.",
  emptyTitle: "El feed esta listo para la primera publicacion",
  likeButton: "Me gusta",
  likeButtonAriaLabel: "Me gusta",
  mutedNotice: "Podes leer el feed, pero tu estado actual no permite participar.",
  postButton: "Publicar",
  postCancelButton: "Cancelar",
  tribeChannelFilterAll: "Todas",
  tribeChannelLabel: "Canal de la publicación",
  tribeChannelSelect: "Seleccionar canal",
  postComposerCollapsed: "Escribí algo",
  postComposerContext: "publicando en la tribu",
  postComposerDescription:
    "Completá el título y el contenido para compartir una publicación en la tribu.",
  postComposerDialogTitle: "Crear publicación",
  postComposerMissingChannel: "Seleccionar canal",
  postComposerMissingContent: "Publicar el contenido",
  postComposerMissingTitle: "Completar título",
  postComposerRequirementsTitle: "Falta completar:",
  postCreatedTooltipPrefix: "Publicacion creada:",
  postComposerLabel: "Contenido de la publicación",
  postComposerTitleLabel: "Título de la publicación",
  postComposerTitlePlaceholder: "Título",
  postPlaceholder: "Compartí una novedad, pregunta o recurso para la tribu",
  roleLabel: {
    guardian: "Guardián",
    leader: "Líder",
    tribemate: "Integrante",
  },
  sectionLabel: "Feed de publicaciones",
  submitCommentError: "No pudimos publicar el comentario.",
  submitCommentSuccess: "Comentario publicado.",
  submitPostError: "No pudimos crear la publicacion.",
  submitPostSuccess: "Publicacion creada.",
  toggleLikeError: "No pudimos actualizar la reaccion.",
} as const;

const TRIBE_FEED_FORM = {
  buttonType: "button",
  contentTypeHeader: "Content-Type",
  defaultVariant: "default",
  jsonContentType: "application/json",
  method: "POST",
  outlineVariant: "outline",
  submitType: "submit",
} as const;

const TRIBE_FEED_ATTRIBUTES = {
  channelFilterEmojiHidden: true,
  composerAvatarSize: "lg",
  contentExpandedDataAttribute: "data-expanded",
  dropdownAlign: "center",
  postMetaSeparatorHidden: true,
  relativeTimeFormat: "relative",
  relativeTimeNoTitleAttribute: "no-title",
  relativeTimeTag: "relative-time",
  tooltipCollisionPadding: 16,
  tooltipSideOffset: 8,
  missingRequirementBulletHidden: true,
  postComposerErrorId: "tribe-post-composer-error",
  postComposerRequirementsLabel: "Requisitos pendientes",
  postDetailsTitleHidden: true,
  regionRole: "region",
} as const;

const TRIBE_FEED_LIMITS = {
  collapsedContentCharacters: 320,
  likeDebounceMs: 300,
} as const;

const TRIBE_FEED_OPTIMISTIC = {
  commentIdPrefix: "optimistic-comment-",
} as const;

const TRIBE_FEED_AUTHOR_ROLE = {
  guardian: "guardian",
  leader: "leader",
} as const;

const TRIBE_FEED_PRIVILEGED_AUTHOR_ROLES = new Set<
  TribeFeedCommentResult["author"]["role"]
>([TRIBE_FEED_AUTHOR_ROLE.guardian, TRIBE_FEED_AUTHOR_ROLE.leader]);

const TRIBE_FEED_CONTENT_PREVIEW_CLASS = {
  details: "TribeFeed__content--detailsPreview",
  feed: "TribeFeed__content--feedPreview",
} as const;

type TribeFeedContentPreviewClass =
  (typeof TRIBE_FEED_CONTENT_PREVIEW_CLASS)[keyof typeof TRIBE_FEED_CONTENT_PREVIEW_CLASS];

const TRIBE_FEED_SYMBOLS = {
  missingRequirementBullet: "-",
  postMetaSeparator: "·",
} as const;

const TRIBE_FEED_FORMAT = {
  dateStyle: "medium",
  day: "numeric",
  locale: "es-AR",
  month: "short",
  nonBreakingSpacePattern: /[\u00a0\u202f]/g,
  roleBadgeModifierPrefix: "TribeFeed__roleBadge--",
  standardSpace: " ",
  timeStyle: "short",
  year: "numeric",
} as const;

type TribeFeedProps = {
  authenticatedMember: AuthenticatedMemberResult;
  tribeSlug: string;
  feed: TribeFeedResult;
};

type ApiErrorResponse = {
  message?: string;
};

type CreatePostResponse = {
  message?: string;
  post?: TribeFeedPostResult;
};

type CreateCommentResponse = {
  comment?: TribeFeedCommentResult;
  message?: string;
};

type ToggleLikeResponse = {
  likedByViewer?: boolean;
  likeCount?: number;
  message?: string;
};

type PendingLikeIntent = {
  baselineLikedByViewer: boolean;
  baselineLikeCount: number;
  intendedLikedByViewer: boolean;
  isRequestInFlight: boolean;
  shouldFlushAfterRequest: boolean;
};

type LikeDebounceTimers = Record<string, ReturnType<typeof setTimeout>>;

type PendingLikeIntents = Record<string, PendingLikeIntent | undefined>;

const TRIBE_FEED_RESET_KEY = {
  empty: "",
  false: "0",
  fieldSeparator: ":",
  keySeparator: "::",
  postSeparator: "|",
  true: "1",
} as const;

function buildFeedStateResetKey(
  tribeSlug: string,
  feed: TribeFeedResult
): string {
  const postFingerprint = feed.posts
    .map((post) =>
      [
        post.id,
        post.createdAt,
        String(post.comments.length),
        String(post.likeCount),
        post.likedByViewer
          ? TRIBE_FEED_RESET_KEY.true
          : TRIBE_FEED_RESET_KEY.false,
      ].join(TRIBE_FEED_RESET_KEY.fieldSeparator)
    )
    .join(TRIBE_FEED_RESET_KEY.postSeparator);

  return [
    tribeSlug,
    feed.activeChannelId ?? TRIBE_FEED_RESET_KEY.empty,
    postFingerprint,
  ].join(TRIBE_FEED_RESET_KEY.keySeparator);
}

function renderFeedAuthorAvatar(
  author: TribeFeedPostResult["author"],
  className: string
) {
  return (
    <Avatar className={className}>
      {author.image ? <AvatarImage alt={author.name} src={author.image} /> : null}
      <AvatarFallback>{author.avatarFallback}</AvatarFallback>
    </Avatar>
  );
}

async function readApiErrorMessage(response: Response): Promise<string | null> {
  const body = (await response.json().catch(() => null)) as ApiErrorResponse | null;

  return typeof body?.message === "string" ? body.message : null;
}

async function submitJsonRequest<ResponseBody>(
  url: string,
  body?: Record<string, string>
): Promise<ResponseBody> {
  const response = await fetch(url, {
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      [TRIBE_FEED_FORM.contentTypeHeader]:
        TRIBE_FEED_FORM.jsonContentType,
    },
    method: TRIBE_FEED_FORM.method,
  });

  if (!response.ok) {
    throw new Error((await readApiErrorMessage(response)) ?? response.statusText);
  }

  return (await response.json().catch(() => ({}))) as ResponseBody;
}

function normalizeFormattedDateTime(formattedDateTime: string): string {
  return formattedDateTime
    .replace(
      TRIBE_FEED_FORMAT.nonBreakingSpacePattern,
      TRIBE_FEED_FORMAT.standardSpace
    );
}

function formatPostFullDateTime(dateTime: string): string {
  return normalizeFormattedDateTime(
    new Intl.DateTimeFormat(TRIBE_FEED_FORMAT.locale, {
      dateStyle: TRIBE_FEED_FORMAT.dateStyle,
      timeStyle: TRIBE_FEED_FORMAT.timeStyle,
    }).format(new Date(dateTime))
  );
}

function formatPostSummaryDate(dateTime: string): string {
  const postDate = new Date(dateTime);
  const currentDate = new Date();
  const dateOptions: Intl.DateTimeFormatOptions =
    postDate.getFullYear() === currentDate.getFullYear()
      ? {
          day: TRIBE_FEED_FORMAT.day,
          month: TRIBE_FEED_FORMAT.month,
        }
      : {
          month: TRIBE_FEED_FORMAT.month,
          year: TRIBE_FEED_FORMAT.year,
        };

  return normalizeFormattedDateTime(
    new Intl.DateTimeFormat(TRIBE_FEED_FORMAT.locale, dateOptions).format(
      postDate
    )
  );
}

function formatPostCreatedTooltip(dateTime: string): string {
  return [
    TRIBE_FEED_COPY.postCreatedTooltipPrefix,
    formatPostFullDateTime(dateTime),
  ].join(TRIBE_FEED_FORMAT.standardSpace);
}

function PostRelativeTime({ dateTime }: { dateTime: string }) {
  return createElement(
    TRIBE_FEED_ATTRIBUTES.relativeTimeTag,
    {
      datetime: dateTime,
      format: TRIBE_FEED_ATTRIBUTES.relativeTimeFormat,
      [TRIBE_FEED_ATTRIBUTES.relativeTimeNoTitleAttribute]: "",
    },
    formatPostSummaryDate(dateTime)
  );
}

function useRelativeTimeElementDefinition() {
  useEffect(() => {
    if (!globalThis.customElements?.get(TRIBE_FEED_ATTRIBUTES.relativeTimeTag)) {
      void import("@github/relative-time-element");
    }
  }, []);
}

function getMissingPostRequirements(input: {
  channelId: string;
  content: string;
  title: string;
}): string[] {
  const missingRequirements: string[] = [];

  if (!input.title.trim()) {
    missingRequirements.push(TRIBE_FEED_COPY.postComposerMissingTitle);
  }

  if (!input.content.trim()) {
    missingRequirements.push(TRIBE_FEED_COPY.postComposerMissingContent);
  }

  if (!input.channelId) {
    missingRequirements.push(TRIBE_FEED_COPY.postComposerMissingChannel);
  }

  return missingRequirements;
}

function isLongPostContent(content: string): boolean {
  return content.length > TRIBE_FEED_LIMITS.collapsedContentCharacters;
}

function getLikeButtonClassName(likedByViewer: boolean): string {
  return [
    styles.TribeFeed__likeButton,
    ...(likedByViewer
      ? [styles["TribeFeed__likeButton--active"]]
      : []),
  ].join(TRIBE_FEED_FORMAT.standardSpace);
}

function renderAuthorRoleBadge(role: TribeFeedCommentResult["author"]["role"]) {
  if (!TRIBE_FEED_PRIVILEGED_AUTHOR_ROLES.has(role)) {
    return null;
  }

  return (
    <span
      className={`${styles.TribeFeed__roleBadge} ${
        styles[TRIBE_FEED_FORMAT.roleBadgeModifierPrefix + role]
      }`}
    >
      {TRIBE_FEED_COPY.roleLabel[role]}
    </span>
  );
}

function findViewerTribeAuthor(
  posts: TribeFeedPostResult[],
  viewerId: string
): TribeFeedCommentResult["author"] | null {
  for (const post of posts) {
    if (post.author.id === viewerId) {
      return post.author;
    }

    const commentAuthor = post.comments.find(
      (comment) => comment.author.id === viewerId
    )?.author;

    if (commentAuthor) {
      return commentAuthor;
    }
  }

  return null;
}

function replacePostComment(
  post: TribeFeedPostResult,
  commentId: string,
  nextComment: TribeFeedCommentResult
): TribeFeedPostResult {
  return {
    ...post,
    comments: post.comments.map((comment) =>
      comment.id === commentId ? nextComment : comment
    ),
  };
}

function removePostComment(
  post: TribeFeedPostResult,
  commentId: string
): TribeFeedPostResult {
  return {
    ...post,
    comments: post.comments.filter((comment) => comment.id !== commentId),
  };
}

function TribeFeedContent({
  authenticatedMember,
  tribeSlug,
  feed,
}: TribeFeedProps) {
  useRelativeTimeElementDefinition();

  const currentTribeSlugRef = useRef(tribeSlug);
  const currentActionTokenRef = useRef(0);
  const likeDebounceTimersRef = useRef<LikeDebounceTimers>({});
  const pendingLikeIntentsRef = useRef<PendingLikeIntents>({});
  const [posts, setPosts] = useState<TribeFeedPostResult[]>(feed.posts);
  const [isPostComposerOpen, setIsPostComposerOpen] = useState(false);
  const [postTitle, setPostTitle] = useState("");
  const [postContent, setPostContent] = useState("");
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [activeChannelId, setActiveChannelId] = useState<string | null>(
    feed.activeChannelId
  );
  const [postComposerErrors, setPostComposerErrors] = useState<string[]>([]);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [expandedPostIds, setExpandedPostIds] = useState<Record<string, boolean>>(
    {}
  );
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [isPostDetailsOpen, setIsPostDetailsOpen] = useState(false);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const optimisticCommentCounterRef = useRef(0);
  const isBusy = Boolean(pendingActionId);
  const selectedChannel =
    feed.channels.find((channel) => channel.id === selectedChannelId) ?? null;
  const filteredPosts = activeChannelId
    ? posts.filter((post) => post.channel.id === activeChannelId)
    : posts;
  const hasPostComposerErrors = postComposerErrors.length > 0;
  const selectedPost =
    posts.find((post) => post.id === selectedPostId) ?? null;

  useEffect(() => {
    currentTribeSlugRef.current = tribeSlug;
  }, [tribeSlug]);

  useEffect(() => {
    return () => {
      currentActionTokenRef.current += 1;
      currentTribeSlugRef.current = TRIBE_FEED_RESET_KEY.empty;
      Object.values(likeDebounceTimersRef.current).forEach((timer) => {
        clearTimeout(timer);
      });
      likeDebounceTimersRef.current = {};
      pendingLikeIntentsRef.current = {};
    };
  }, []);

  const isCurrentAction = (actionToken: number, actionTribeSlug: string) =>
    currentActionTokenRef.current === actionToken &&
    currentTribeSlugRef.current === actionTribeSlug;

  const resetPostComposer = () => {
    setPostTitle("");
    setPostContent("");
    setSelectedChannelId("");
    setPostComposerErrors([]);
  };

  const handlePostComposerOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      resetPostComposer();
    }

    setIsPostComposerOpen(isOpen);
  };

  const handleCreatePost = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = postTitle.trim();
    const content = postContent.trim();
    const missingRequirements = getMissingPostRequirements({
      channelId: selectedChannelId,
      content,
      title,
    });

    if (missingRequirements.length > 0) {
      setPostComposerErrors(missingRequirements);
      return;
    }

    const actionTribeSlug = tribeSlug;
    const actionToken = currentActionTokenRef.current + 1;

    currentActionTokenRef.current = actionToken;
    setPendingActionId(TRIBE_FEED_COPY.postButton);

    try {
      const response = await submitJsonRequest<CreatePostResponse>(
        TRIBE_FEED_ENDPOINT.post(actionTribeSlug),
        {
          channelId: selectedChannelId,
          content,
          title,
        }
      );

      if (!isCurrentAction(actionToken, actionTribeSlug)) {
        return;
      }

      if (!response.post) {
        throw new Error(TRIBE_FEED_COPY.submitPostError);
      }

      setPosts((currentPosts) => [response.post as TribeFeedPostResult, ...currentPosts]);
      resetPostComposer();
      setIsPostComposerOpen(false);
      toast.success(TRIBE_FEED_COPY.submitPostSuccess);
    } catch (error) {
      if (!isCurrentAction(actionToken, actionTribeSlug)) {
        return;
      }

      toast.error(
        error instanceof Error ? error.message : TRIBE_FEED_COPY.submitPostError
      );
    } finally {
      if (isCurrentAction(actionToken, actionTribeSlug)) {
        setPendingActionId(null);
      }
    }
  };

  const handleCreateComment = async (
    event: FormEvent<HTMLFormElement>,
    postId: string
  ) => {
    event.preventDefault();
    const content = (commentDrafts[postId] ?? "").trim();

    if (!content) {
      toast.warning(TRIBE_FEED_COPY.commentPlaceholder);
      return;
    }

    const actionTribeSlug = tribeSlug;
    const actionToken = currentActionTokenRef.current + 1;
    optimisticCommentCounterRef.current += 1;
    const optimisticCommentId =
      TRIBE_FEED_OPTIMISTIC.commentIdPrefix +
      String(optimisticCommentCounterRef.current);
    const viewerTribeAuthor = findViewerTribeAuthor(
      posts,
      authenticatedMember.id
    );
    const optimisticComment: TribeFeedCommentResult = {
      author: {
        avatarFallback:
          viewerTribeAuthor?.avatarFallback ?? authenticatedMember.avatarFallback,
        id: authenticatedMember.id,
        image: viewerTribeAuthor?.image ?? authenticatedMember.image,
        name: viewerTribeAuthor?.name ?? authenticatedMember.name,
        role:
          viewerTribeAuthor?.role ??
          (authenticatedMember.role as TribeFeedCommentResult["author"]["role"]),
      },
      content,
      createdAt: new Date().toISOString(),
      id: optimisticCommentId,
    };

    currentActionTokenRef.current = actionToken;
    setPendingActionId(postId);
    setPosts((currentPosts) =>
      currentPosts.map((post) =>
        post.id === postId
          ? {
              ...post,
              comments: [...post.comments, optimisticComment],
            }
          : post
      )
    );
    setCommentDrafts((currentDrafts) => ({
      ...currentDrafts,
      [postId]: "",
    }));

    try {
      const response = await submitJsonRequest<CreateCommentResponse>(
        TRIBE_FEED_ENDPOINT.comment(actionTribeSlug, postId),
        {
          content,
        }
      );

      if (!isCurrentAction(actionToken, actionTribeSlug)) {
        return;
      }

      if (!response.comment) {
        throw new Error(TRIBE_FEED_COPY.submitCommentError);
      }

      setPosts((currentPosts) =>
        currentPosts.map((post) =>
          post.id === postId
            ? replacePostComment(
                post,
                optimisticCommentId,
                response.comment as TribeFeedCommentResult
              )
            : post
        )
      );
      toast.success(TRIBE_FEED_COPY.submitCommentSuccess);
    } catch (error) {
      if (!isCurrentAction(actionToken, actionTribeSlug)) {
        return;
      }

      toast.error(
        error instanceof Error
          ? error.message
          : TRIBE_FEED_COPY.submitCommentError
      );
      setPosts((currentPosts) =>
        currentPosts.map((post) =>
          post.id === postId
            ? removePostComment(post, optimisticCommentId)
            : post
        )
      );
      setCommentDrafts((currentDrafts) => ({
        ...currentDrafts,
        [postId]: content,
      }));
    } finally {
      if (isCurrentAction(actionToken, actionTribeSlug)) {
        setPendingActionId(null);
      }
    }
  };

  const clearLikeDebounceTimer = (postId: string) => {
    const timer = likeDebounceTimersRef.current[postId];

    if (!timer) {
      return;
    }

    clearTimeout(timer);
    delete likeDebounceTimersRef.current[postId];
  };

  const applyPostLikeState = (
    postId: string,
    likedByViewer: boolean,
    likeCount: number
  ) => {
    setPosts((currentPosts) =>
      currentPosts.map((post) =>
        post.id === postId
          ? {
              ...post,
              likedByViewer,
              likeCount,
            }
          : post
      )
    );
  };

  const flushPendingLikeIntent = async (postId: string) => {
    clearLikeDebounceTimer(postId);

    const pendingLikeIntent = pendingLikeIntentsRef.current[postId];

    if (!pendingLikeIntent) {
      return;
    }

    if (pendingLikeIntent.isRequestInFlight) {
      pendingLikeIntentsRef.current[postId] = {
        ...pendingLikeIntent,
        shouldFlushAfterRequest: true,
      };
      return;
    }

    if (
      pendingLikeIntent.intendedLikedByViewer ===
      pendingLikeIntent.baselineLikedByViewer
    ) {
      delete pendingLikeIntentsRef.current[postId];
      return;
    }

    const actionTribeSlug = tribeSlug;

    pendingLikeIntentsRef.current[postId] = {
      ...pendingLikeIntent,
      isRequestInFlight: true,
      shouldFlushAfterRequest: false,
    };

    try {
      const response = await submitJsonRequest<ToggleLikeResponse>(
        TRIBE_FEED_ENDPOINT.like(actionTribeSlug, postId)
      );

      if (currentTribeSlugRef.current !== actionTribeSlug) {
        return;
      }

      if (
        typeof response.likedByViewer !== "boolean" ||
        typeof response.likeCount !== "number"
      ) {
        throw new Error(TRIBE_FEED_COPY.toggleLikeError);
      }

      const latestPendingLikeIntent = pendingLikeIntentsRef.current[postId];

      if (!latestPendingLikeIntent) {
        applyPostLikeState(postId, response.likedByViewer, response.likeCount);
        return;
      }

      if (latestPendingLikeIntent.intendedLikedByViewer === response.likedByViewer) {
        applyPostLikeState(postId, response.likedByViewer, response.likeCount);
        delete pendingLikeIntentsRef.current[postId];
        return;
      }

      pendingLikeIntentsRef.current[postId] = {
        baselineLikedByViewer: response.likedByViewer,
        baselineLikeCount: response.likeCount,
        intendedLikedByViewer: latestPendingLikeIntent.intendedLikedByViewer,
        isRequestInFlight: false,
        shouldFlushAfterRequest: latestPendingLikeIntent.shouldFlushAfterRequest,
      };

      applyPostLikeState(
        postId,
        latestPendingLikeIntent.intendedLikedByViewer,
        Math.max(
          0,
          response.likeCount +
            (latestPendingLikeIntent.intendedLikedByViewer ? 1 : -1)
        )
      );

      void flushPendingLikeIntent(postId);
    } catch (error) {
      if (currentTribeSlugRef.current !== actionTribeSlug) {
        return;
      }

      const latestPendingLikeIntent = pendingLikeIntentsRef.current[postId];

      if (latestPendingLikeIntent) {
        applyPostLikeState(
          postId,
          latestPendingLikeIntent.baselineLikedByViewer,
          latestPendingLikeIntent.baselineLikeCount
        );
        delete pendingLikeIntentsRef.current[postId];
      }

      toast.error(
        error instanceof Error ? error.message : TRIBE_FEED_COPY.toggleLikeError
      );
    }
  };

  const schedulePendingLikeIntentFlush = (postId: string) => {
    clearLikeDebounceTimer(postId);
    likeDebounceTimersRef.current[postId] = setTimeout(() => {
      void flushPendingLikeIntent(postId);
    }, TRIBE_FEED_LIMITS.likeDebounceMs);
  };

  const handleToggleLike = (postId: string) => {
    setPosts((currentPosts) =>
      currentPosts.map((post) => {
        if (post.id !== postId) {
          return post;
        }

        const pendingLikeIntent = pendingLikeIntentsRef.current[postId];
        const baselineLikedByViewer =
          pendingLikeIntent?.baselineLikedByViewer ?? post.likedByViewer;
        const baselineLikeCount =
          pendingLikeIntent?.baselineLikeCount ?? post.likeCount;
        const intendedLikedByViewer = !post.likedByViewer;
        const optimisticLikeCount = Math.max(
          0,
          post.likeCount + (intendedLikedByViewer ? 1 : -1)
        );

        pendingLikeIntentsRef.current[postId] = {
          baselineLikedByViewer,
          baselineLikeCount,
          intendedLikedByViewer,
          isRequestInFlight: pendingLikeIntent?.isRequestInFlight ?? false,
          shouldFlushAfterRequest: pendingLikeIntent?.shouldFlushAfterRequest ?? false,
        };

        schedulePendingLikeIntentFlush(postId);

        return {
          ...post,
          likedByViewer: intendedLikedByViewer,
          likeCount: optimisticLikeCount,
        };
      })
    );
  };

  const openPostDetails = (postId: string) => {
    setExpandedPostIds((currentExpandedPostIds) => ({
      ...currentExpandedPostIds,
      [postId]: false,
    }));
    setSelectedPostId(postId);
    setIsPostDetailsOpen(true);
  };

  const stopPostDetailsOpening = (event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();
  };

  const togglePostContentExpansion = (postId: string) => {
    setExpandedPostIds((currentExpandedPostIds) => ({
      ...currentExpandedPostIds,
      [postId]: !currentExpandedPostIds[postId],
    }));
  };

  const renderPostContentToggle = (post: TribeFeedPostResult) => {
    const isExpanded = Boolean(expandedPostIds[post.id]);
    const isExpandable = isLongPostContent(post.content);

    return isExpandable ? (
      <button
        aria-expanded={isExpanded}
        className={styles.TribeFeed__contentToggle}
        onClick={() => {
          togglePostContentExpansion(post.id);
        }}
        type={TRIBE_FEED_FORM.buttonType}
      >
        {isExpanded
          ? TRIBE_FEED_COPY.postContentShowLess
          : TRIBE_FEED_COPY.postContentShowMore}
      </button>
    ) : null;
  };

  const renderPostContent = (
    post: TribeFeedPostResult,
    contentClassName = "",
    isContentAlwaysCollapsed = false,
    previewClassName: TribeFeedContentPreviewClass =
      TRIBE_FEED_CONTENT_PREVIEW_CLASS.details
  ) => {
    const isExpanded =
      !isContentAlwaysCollapsed && Boolean(expandedPostIds[post.id]);
    const isExpandable = isLongPostContent(post.content);
    const contentClassNames = [
      styles.TribeFeed__content,
      ...(isExpandable && !isExpanded
        ? [
            styles["TribeFeed__content--collapsed"],
            styles[previewClassName],
          ]
        : []),
      contentClassName,
    ]
      .filter(Boolean)
      .join(TRIBE_FEED_FORMAT.standardSpace);

    return (
      <p
        className={contentClassNames}
        {...{
          [TRIBE_FEED_ATTRIBUTES.contentExpandedDataAttribute]:
            String(isExpanded),
        }}
      >
        {post.content}
      </p>
    );
  };

  return (
    <TooltipProvider>
      <section
        className={styles.TribeFeed}
        aria-label={TRIBE_FEED_COPY.sectionLabel}
      >
      {!feed.viewerPermissions.canCreatePost ? (
        <p className={styles.TribeFeed__notice}>
          {TRIBE_FEED_COPY.mutedNotice}
        </p>
      ) : null}

      {feed.viewerPermissions.canCreatePost ? (
        <Dialog
          open={isPostComposerOpen}
          onOpenChange={handlePostComposerOpenChange}
        >
          <DialogTrigger asChild>
            <button
              aria-label={TRIBE_FEED_COPY.postComposerCollapsed}
              className={styles.TribeFeed__composerTrigger}
              type={TRIBE_FEED_FORM.buttonType}
            >
              <Avatar
                className={styles.TribeFeed__composerAvatar}
                size={TRIBE_FEED_ATTRIBUTES.composerAvatarSize}
              >
                {authenticatedMember.image ? (
                  <AvatarImage
                    alt={authenticatedMember.name}
                    src={authenticatedMember.image}
                  />
                ) : null}
                <AvatarFallback>{authenticatedMember.avatarFallback}</AvatarFallback>
              </Avatar>
              <span className={styles.TribeFeed__composerTriggerText}>
                {TRIBE_FEED_COPY.postComposerCollapsed}
              </span>
            </button>
          </DialogTrigger>
          <DialogContent
            className={styles.TribeFeed__composerDialog}
            showCloseButton={false}
          >
            <DialogHeader className={styles.TribeFeed__composerDialogHeader}>
              <DialogTitle className={styles.TribeFeed__composerDialogTitle}>
                {TRIBE_FEED_COPY.postComposerDialogTitle}
              </DialogTitle>
              <DialogDescription
                className={styles.TribeFeed__composerDialogDescription}
              >
                {TRIBE_FEED_COPY.postComposerDescription}
              </DialogDescription>
              <div className={styles.TribeFeed__composerIdentity}>
                <Avatar className={styles.TribeFeed__composerDialogAvatar}>
                  {authenticatedMember.image ? (
                    <AvatarImage
                      alt={authenticatedMember.name}
                      src={authenticatedMember.image}
                    />
                  ) : null}
                  <AvatarFallback>{authenticatedMember.avatarFallback}</AvatarFallback>
                </Avatar>
                <p className={styles.TribeFeed__composerIdentityText}>
                  <strong>{authenticatedMember.name}</strong>{" "}
                  {TRIBE_FEED_COPY.postComposerContext}
                </p>
              </div>
            </DialogHeader>
            <form
              className={styles.TribeFeed__composer}
              onSubmit={handleCreatePost}
            >
              <input
                aria-describedby={
                  hasPostComposerErrors
                    ? TRIBE_FEED_ATTRIBUTES.postComposerErrorId
                    : undefined
                }
                aria-label={TRIBE_FEED_COPY.postComposerTitleLabel}
                className={styles.TribeFeed__titleInput}
                disabled={isBusy}
                onChange={(event) => {
                  setPostTitle(event.currentTarget.value);
                  setPostComposerErrors([]);
                }}
                placeholder={TRIBE_FEED_COPY.postComposerTitlePlaceholder}
                value={postTitle}
              />
              <textarea
                aria-describedby={
                  hasPostComposerErrors
                    ? TRIBE_FEED_ATTRIBUTES.postComposerErrorId
                    : undefined
                }
                aria-label={TRIBE_FEED_COPY.postComposerLabel}
                className={styles.TribeFeed__textarea}
                disabled={isBusy}
                onChange={(event) => {
                  setPostContent(event.currentTarget.value);
                  setPostComposerErrors([]);
                }}
                placeholder={TRIBE_FEED_COPY.postPlaceholder}
                value={postContent}
              />
              <div className={styles.TribeFeed__channelPicker}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      aria-label={TRIBE_FEED_COPY.tribeChannelLabel}
                      className={styles.TribeFeed__channelTrigger}
                      disabled={isBusy}
                      type={TRIBE_FEED_FORM.buttonType}
                    >
                      <span>
                        {selectedChannel
                          ? `${selectedChannel.emoji} ${selectedChannel.name}`
                          : TRIBE_FEED_COPY.tribeChannelSelect}
                      </span>
                      <ChevronDownIcon />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align={TRIBE_FEED_ATTRIBUTES.dropdownAlign}>
                    {feed.channels.map((channel) => (
                      <DropdownMenuItem
                        key={channel.id}
                        onSelect={() => {
                          setSelectedChannelId(channel.id);
                          setPostComposerErrors([]);
                        }}
                      >
                        {channel.emoji} {channel.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {hasPostComposerErrors ? (
                <div
                  className={styles.TribeFeed__composerError}
                  id={TRIBE_FEED_ATTRIBUTES.postComposerErrorId}
                >
                  <p className={styles.TribeFeed__composerErrorTitle}>
                    {TRIBE_FEED_COPY.postComposerRequirementsTitle}
                  </p>
                  <ul
                    aria-label={
                      TRIBE_FEED_ATTRIBUTES.postComposerRequirementsLabel
                    }
                    className={styles.TribeFeed__composerErrorList}
                  >
                    {postComposerErrors.map((postComposerError) => (
                      <li
                        className={styles.TribeFeed__composerErrorItem}
                        key={postComposerError}
                      >
                        <span
                          aria-hidden={
                            TRIBE_FEED_ATTRIBUTES.missingRequirementBulletHidden
                          }
                          className={styles.TribeFeed__composerErrorBullet}
                        >
                          {TRIBE_FEED_SYMBOLS.missingRequirementBullet}
                        </span>
                        {postComposerError}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <DialogFooter className={styles.TribeFeed__composerFooter}>
                <DialogClose asChild>
                  <Button
                    disabled={isBusy}
                    type={TRIBE_FEED_FORM.buttonType}
                    variant={TRIBE_FEED_FORM.outlineVariant}
                  >
                    {TRIBE_FEED_COPY.postCancelButton}
                  </Button>
                </DialogClose>
                <Button
                  disabled={isBusy}
                  type={TRIBE_FEED_FORM.submitType}
                >
                  <SendIcon />
                  {TRIBE_FEED_COPY.postButton}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}

      {feed.channels.length > 0 ? (
        <nav
          aria-label={TRIBE_FEED_COPY.tribeChannelLabel}
          className={styles.TribeFeed__channelFilters}
        >
          <button
            className={`${styles.TribeFeed__channelFilter} ${
              !activeChannelId ? styles["TribeFeed__channelFilter--active"] : ""
            }`}
            onClick={() => {
              setActiveChannelId(null);
            }}
            type={TRIBE_FEED_FORM.buttonType}
          >
            <span className={styles.TribeFeed__channelFilterText}>
              {TRIBE_FEED_COPY.tribeChannelFilterAll}
            </span>
          </button>
          {feed.channels.map((channel) => (
            <button
              className={`${styles.TribeFeed__channelFilter} ${
                activeChannelId === channel.id
                  ? styles["TribeFeed__channelFilter--active"]
                  : ""
              }`}
              key={channel.id}
              onClick={() => {
                setActiveChannelId(channel.id);
              }}
              type={TRIBE_FEED_FORM.buttonType}
            >
              <span
                aria-hidden={TRIBE_FEED_ATTRIBUTES.channelFilterEmojiHidden}
                className={styles.TribeFeed__channelFilterEmoji}
              >
                {channel.emoji}
              </span>
              <span className={styles.TribeFeed__channelFilterText}>
                {channel.name}
              </span>
            </button>
          ))}
        </nav>
      ) : null}

      {filteredPosts.length === 0 ? (
        <div className={styles.TribeFeed__empty}>
          <h3 className={styles.TribeFeed__emptyTitle}>
            {TRIBE_FEED_COPY.emptyTitle}
          </h3>
          <p className={styles.TribeFeed__emptyDescription}>
            {TRIBE_FEED_COPY.emptyDescription}
          </p>
        </div>
      ) : (
        <ol className={styles.TribeFeed__postList}>
          {filteredPosts.map((post) => (
            <li className={styles.TribeFeed__post} key={post.id}>
              <Card
                className={styles.TribeFeed__postCard}
                onClick={() => {
                  openPostDetails(post.id);
                }}
              >
                <article className={styles.TribeFeed__postArticle}>
                  <button
                    aria-label={`${TRIBE_FEED_COPY.openPostDetailsAriaLabelPrefix}: ${post.title || post.content}`}
                    className={styles.TribeFeed__postDetailsTrigger}
                    type={TRIBE_FEED_FORM.buttonType}
                  >
                    <CardHeader className={styles.TribeFeed__postHeader}>
                      {renderFeedAuthorAvatar(
                        post.author,
                        styles.TribeFeed__avatar
                      )}
                      <div className={styles.TribeFeed__author}>
                        <p className={styles.TribeFeed__authorName}>
                          {post.author.name}
                        </p>
                        {renderAuthorRoleBadge(post.author.role)}
                      </div>
                      <div className={styles.TribeFeed__postMeta}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className={styles.TribeFeed__time}>
                              <PostRelativeTime dateTime={post.createdAt} />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent
                            className={styles.TribeFeed__postCreatedTooltip}
                            collisionPadding={
                              TRIBE_FEED_ATTRIBUTES.tooltipCollisionPadding
                            }
                            sideOffset={TRIBE_FEED_ATTRIBUTES.tooltipSideOffset}
                          >
                            {formatPostCreatedTooltip(post.createdAt)}
                          </TooltipContent>
                        </Tooltip>
                        <span
                          aria-hidden={TRIBE_FEED_ATTRIBUTES.postMetaSeparatorHidden}
                          className={styles.TribeFeed__postMetaSeparator}
                        >
                          {TRIBE_FEED_SYMBOLS.postMetaSeparator}
                        </span>
                        <span className={styles.TribeFeed__channelBadge}>
                          {post.channel.emoji} {post.channel.name}
                        </span>
                      </div>
                    </CardHeader>

                    <CardContent className={styles.TribeFeed__postContent}>
                      {post.title ? (
                        <h3 className={styles.TribeFeed__postTitle}>
                          {post.title}
                        </h3>
                      ) : null}
                      {renderPostContent(
                        post,
                        "",
                        true,
                        TRIBE_FEED_CONTENT_PREVIEW_CLASS.feed
                      )}
                    </CardContent>
                  </button>

                  <div className={styles.TribeFeed__postActions}>
                    <Button
                      aria-label={`${TRIBE_FEED_COPY.likeButtonAriaLabel} ${post.likeCount}`}
                      className={getLikeButtonClassName(post.likedByViewer)}
                      disabled={!feed.viewerPermissions.canReact}
                      onClick={(event) => {
                        stopPostDetailsOpening(event);
                        handleToggleLike(post.id);
                      }}
                      type={TRIBE_FEED_FORM.buttonType}
                      variant={TRIBE_FEED_FORM.outlineVariant}
                    >
                      <HeartIcon />
                      {post.likeCount}
                    </Button>
                  </div>
              </article>
              </Card>
            </li>
          ))}
        </ol>
      )}
      <Dialog open={isPostDetailsOpen} onOpenChange={setIsPostDetailsOpen}>
        <DialogContent className={styles.TribeFeed__composerDialog}>
          <DialogHeader className={styles.TribeFeed__composerDialogHeader}>
            <DialogTitle
              className={
                TRIBE_FEED_ATTRIBUTES.postDetailsTitleHidden
                  ? styles.TribeFeed__composerDialogTitle
                  : undefined
              }
            >
              {TRIBE_FEED_COPY.postDetailsDialogTitle}
            </DialogTitle>
            <DialogDescription
              className={styles.TribeFeed__composerDialogDescription}
            >
              {TRIBE_FEED_COPY.postDetailsDialogDescription}
            </DialogDescription>
          </DialogHeader>
          {selectedPost ? (
            <article
              aria-label={TRIBE_FEED_COPY.postDetailsContentLabel}
              className={styles.TribeFeed__postDetailsBody}
              role={TRIBE_FEED_ATTRIBUTES.regionRole}
            >
              <CardHeader
                className={`${styles.TribeFeed__postHeader} ${styles.TribeFeed__postDetailsHeader}`}
              >
                {renderFeedAuthorAvatar(
                  selectedPost.author,
                  styles.TribeFeed__avatar
                )}
                <div className={styles.TribeFeed__author}>
                  <p className={styles.TribeFeed__authorName}>
                    {selectedPost.author.name}
                  </p>
                  {renderAuthorRoleBadge(selectedPost.author.role)}
                </div>
                <div className={styles.TribeFeed__postMeta}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className={styles.TribeFeed__time}>
                        <PostRelativeTime dateTime={selectedPost.createdAt} />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent
                      className={styles.TribeFeed__postCreatedTooltip}
                      collisionPadding={
                        TRIBE_FEED_ATTRIBUTES.tooltipCollisionPadding
                      }
                      sideOffset={TRIBE_FEED_ATTRIBUTES.tooltipSideOffset}
                    >
                      {formatPostCreatedTooltip(selectedPost.createdAt)}
                    </TooltipContent>
                  </Tooltip>
                  <span
                    aria-hidden={TRIBE_FEED_ATTRIBUTES.postMetaSeparatorHidden}
                    className={styles.TribeFeed__postMetaSeparator}
                  >
                    {TRIBE_FEED_SYMBOLS.postMetaSeparator}
                  </span>
                  <span className={styles.TribeFeed__channelBadge}>
                    {selectedPost.channel.emoji} {selectedPost.channel.name}
                  </span>
                </div>
              </CardHeader>
              <CardContent className={styles.TribeFeed__postContent}>
                {selectedPost.title ? (
                  <h3 className={styles.TribeFeed__postTitle}>
                    {selectedPost.title}
                  </h3>
                ) : null}
                {renderPostContent(selectedPost)}
                {renderPostContentToggle(selectedPost)}
                <div
                  className={`${styles.TribeFeed__postActions} ${styles["TribeFeed__postActions--dialog"]}`}
                >
                  <Button
                    aria-label={`${TRIBE_FEED_COPY.likeButtonAriaLabel} ${selectedPost.likeCount}`}
                    className={getLikeButtonClassName(
                      selectedPost.likedByViewer
                    )}
                    disabled={!feed.viewerPermissions.canReact}
                    onClick={() => {
                      handleToggleLike(selectedPost.id);
                    }}
                    type={TRIBE_FEED_FORM.buttonType}
                    variant={TRIBE_FEED_FORM.outlineVariant}
                  >
                    <HeartIcon />
                    {selectedPost.likeCount}
                  </Button>
                </div>
              </CardContent>
              <div className={styles.TribeFeed__modalCommentsSection}>
                <section
                  aria-label={TRIBE_FEED_COPY.commentsTitle}
                  className={styles.TribeFeed__comments}
                >
                  {selectedPost.comments.length > 0 ? (
                    <ol className={styles.TribeFeed__commentList}>
                      {selectedPost.comments.map((comment) => (
                        <li className={styles.TribeFeed__comment} key={comment.id}>
                          {renderFeedAuthorAvatar(
                            comment.author,
                            styles.TribeFeed__commentAvatar
                          )}
                          <div className={styles.TribeFeed__commentBody}>
                            <p className={styles.TribeFeed__commentMeta}>
                              <span>{comment.author.name}</span>
                              {renderAuthorRoleBadge(comment.author.role)}
                            </p>
                            <p className={styles.TribeFeed__commentContent}>
                              {comment.content}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  ) : null}
                  {feed.viewerPermissions.canComment ? (
                    <form
                      className={styles.TribeFeed__commentForm}
                      onSubmit={(event) => {
                        void handleCreateComment(event, selectedPost.id);
                      }}
                    >
                      <Avatar className={styles.TribeFeed__commentComposerAvatar}>
                        {authenticatedMember.image ? (
                          <AvatarImage
                            alt={authenticatedMember.name}
                            src={authenticatedMember.image}
                          />
                        ) : null}
                        <AvatarFallback>
                          {authenticatedMember.avatarFallback}
                        </AvatarFallback>
                      </Avatar>
                      <div className={styles.TribeFeed__commentInputWrapper}>
                        <input
                          aria-label={TRIBE_FEED_COPY.commentInputLabel}
                          className={styles.TribeFeed__commentInput}
                          disabled={isBusy}
                          onChange={(event) => {
                            const nextCommentDraft = event.currentTarget.value;

                            setCommentDrafts((currentDrafts) => ({
                              ...currentDrafts,
                              [selectedPost.id]: nextCommentDraft,
                            }));
                          }}
                          placeholder={TRIBE_FEED_COPY.commentPlaceholder}
                          value={commentDrafts[selectedPost.id] ?? ""}
                        />
                        <button
                          aria-label={TRIBE_FEED_COPY.commentSendButtonAriaLabel}
                          className={styles.TribeFeed__commentSendButton}
                          disabled={
                            isBusy || !(commentDrafts[selectedPost.id] ?? "").trim()
                          }
                          type={TRIBE_FEED_FORM.submitType}
                        >
                          <SendIcon />
                        </button>
                      </div>
                    </form>
                  ) : null}
                </section>
              </div>
            </article>
          ) : null}
        </DialogContent>
      </Dialog>
      </section>
    </TooltipProvider>
  );
}

export function TribeFeed(props: TribeFeedProps) {
  const resetKey = buildFeedStateResetKey(props.tribeSlug, props.feed);

  return <TribeFeedContent key={resetKey} {...props} />;
}
