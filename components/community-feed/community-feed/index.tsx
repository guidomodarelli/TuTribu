"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  ChevronDownIcon,
  HeartIcon,
  MessageCircleIcon,
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
  CardFooter,
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
  CommunityFeedCommentResult,
  CommunityFeedPostResult,
  CommunityFeedResult,
} from "@/src/modules/posts/application/results/community-feed-result";
import styles from "./styles.module.scss";

const COMMUNITY_FEED_ROUTE = {
  apiCommunities: "/api/communities/",
  commentsSegment: "/comments",
  likeSegment: "/like",
  postsBaseSegment: "/posts",
  postsSegment: "/posts/",
} as const;

const COMMUNITY_FEED_ENDPOINT = {
  comment: (communitySlug: string, postId: string) =>
    COMMUNITY_FEED_ROUTE.apiCommunities +
    communitySlug +
    COMMUNITY_FEED_ROUTE.postsSegment +
    postId +
    COMMUNITY_FEED_ROUTE.commentsSegment,
  like: (communitySlug: string, postId: string) =>
    COMMUNITY_FEED_ROUTE.apiCommunities +
    communitySlug +
    COMMUNITY_FEED_ROUTE.postsSegment +
    postId +
    COMMUNITY_FEED_ROUTE.likeSegment,
  post: (communitySlug: string) =>
    COMMUNITY_FEED_ROUTE.apiCommunities +
    communitySlug +
    COMMUNITY_FEED_ROUTE.postsBaseSegment,
} as const;

const COMMUNITY_FEED_COPY = {
  commentButton: "Comentar",
  commentInputLabel: "Escribir un comentario",
  commentPlaceholder: "Escribi un comentario",
  commentsTitle: "Comentarios",
  emptyDescription:
    "Todavia no hay publicaciones. Cuando alguien comparta una novedad, va a aparecer aca.",
  emptyTitle: "El feed esta listo para la primera publicacion",
  likeButton: "Me gusta",
  mutedNotice: "Podes leer el feed, pero tu estado actual no permite participar.",
  postButton: "Publicar",
  postCancelButton: "Cancelar",
  postCategoryFilterAll: "Todas",
  postCategoryLabel: "Categoría de la publicación",
  postCategorySelect: "Seleccionar categoría",
  postComposerCollapsed: "Escribí algo",
  postComposerContext: "publicando en la comunidad",
  postComposerDescription:
    "Completá el título y el contenido para compartir una publicación en la comunidad.",
  postComposerDialogTitle: "Crear publicación",
  postComposerMissingCategory: "Seleccionar categoría",
  postComposerMissingContent: "Publicar el contenido",
  postComposerMissingTitle: "Completar título",
  postComposerRequirementsTitle: "Falta completar:",
  postCreatedTooltipPrefix: "Publicacion creada:",
  postComposerLabel: "Contenido de la publicación",
  postComposerTitleLabel: "Título de la publicación",
  postComposerTitlePlaceholder: "Título",
  postPlaceholder: "Compartí una novedad, pregunta o recurso para la comunidad",
  roleLabel: {
    admin: "Admin",
    member: "Miembro",
    owner: "Propietario",
  },
  sectionLabel: "Feed de publicaciones",
  submitCommentError: "No pudimos publicar el comentario.",
  submitCommentSuccess: "Comentario publicado.",
  submitPostError: "No pudimos crear la publicacion.",
  submitPostSuccess: "Publicacion creada.",
  toggleLikeError: "No pudimos actualizar la reaccion.",
} as const;

const COMMUNITY_FEED_FORM = {
  buttonType: "button",
  contentTypeHeader: "Content-Type",
  defaultVariant: "default",
  jsonContentType: "application/json",
  method: "POST",
  outlineVariant: "outline",
  submitType: "submit",
} as const;

const COMMUNITY_FEED_ATTRIBUTES = {
  categoryFilterEmojiHidden: true,
  composerAvatarSize: "lg",
  dropdownAlign: "center",
  postMetaSeparatorHidden: true,
  tooltipCollisionPadding: 16,
  tooltipSideOffset: 8,
  missingRequirementBulletHidden: true,
  postComposerErrorId: "community-post-composer-error",
  postComposerRequirementsLabel: "Requisitos pendientes",
} as const;

const COMMUNITY_FEED_SYMBOLS = {
  missingRequirementBullet: "-",
  postMetaSeparator: "·",
} as const;

const COMMUNITY_FEED_FORMAT = {
  dateStyle: "medium",
  day: "numeric",
  likeCountSeparator: " · ",
  locale: "es-AR",
  month: "short",
  nonBreakingSpacePattern: /[\u00a0\u202f]/g,
  roleBadgeModifierPrefix: "CommunityFeed__roleBadge--",
  standardSpace: " ",
  timeStyle: "short",
  year: "numeric",
} as const;

type CommunityFeedProps = {
  authenticatedMember: AuthenticatedMemberResult;
  communitySlug: string;
  feed: CommunityFeedResult;
};

type ApiErrorResponse = {
  message?: string;
};

type CreatePostResponse = {
  message?: string;
  post?: CommunityFeedPostResult;
};

type CreateCommentResponse = {
  comment?: CommunityFeedCommentResult;
  message?: string;
};

type ToggleLikeResponse = {
  likedByViewer?: boolean;
  likeCount?: number;
  message?: string;
};

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
      [COMMUNITY_FEED_FORM.contentTypeHeader]:
        COMMUNITY_FEED_FORM.jsonContentType,
    },
    method: COMMUNITY_FEED_FORM.method,
  });

  if (!response.ok) {
    throw new Error((await readApiErrorMessage(response)) ?? response.statusText);
  }

  return (await response.json().catch(() => ({}))) as ResponseBody;
}

function normalizeFormattedDateTime(formattedDateTime: string): string {
  return formattedDateTime
    .replace(
      COMMUNITY_FEED_FORMAT.nonBreakingSpacePattern,
      COMMUNITY_FEED_FORMAT.standardSpace
    );
}

function formatPostFullDateTime(dateTime: string): string {
  return normalizeFormattedDateTime(
    new Intl.DateTimeFormat(COMMUNITY_FEED_FORMAT.locale, {
      dateStyle: COMMUNITY_FEED_FORMAT.dateStyle,
      timeStyle: COMMUNITY_FEED_FORMAT.timeStyle,
    }).format(new Date(dateTime))
  );
}

function formatPostSummaryDate(dateTime: string): string {
  const postDate = new Date(dateTime);
  const currentDate = new Date();
  const dateOptions: Intl.DateTimeFormatOptions =
    postDate.getFullYear() === currentDate.getFullYear()
      ? {
          day: COMMUNITY_FEED_FORMAT.day,
          month: COMMUNITY_FEED_FORMAT.month,
        }
      : {
          month: COMMUNITY_FEED_FORMAT.month,
          year: COMMUNITY_FEED_FORMAT.year,
        };

  return normalizeFormattedDateTime(
    new Intl.DateTimeFormat(COMMUNITY_FEED_FORMAT.locale, dateOptions).format(
      postDate
    )
  );
}

function formatPostCreatedTooltip(dateTime: string): string {
  return [
    COMMUNITY_FEED_COPY.postCreatedTooltipPrefix,
    formatPostFullDateTime(dateTime),
  ].join(COMMUNITY_FEED_FORMAT.standardSpace);
}

function getMissingPostRequirements(input: {
  categoryId: string;
  content: string;
  title: string;
}): string[] {
  const missingRequirements: string[] = [];

  if (!input.title.trim()) {
    missingRequirements.push(COMMUNITY_FEED_COPY.postComposerMissingTitle);
  }

  if (!input.content.trim()) {
    missingRequirements.push(COMMUNITY_FEED_COPY.postComposerMissingContent);
  }

  if (!input.categoryId) {
    missingRequirements.push(COMMUNITY_FEED_COPY.postComposerMissingCategory);
  }

  return missingRequirements;
}

export function CommunityFeed({
  authenticatedMember,
  communitySlug,
  feed,
}: CommunityFeedProps) {
  const currentCommunitySlugRef = useRef(communitySlug);
  const currentActionTokenRef = useRef(0);
  const [posts, setPosts] = useState<CommunityFeedPostResult[]>(feed.posts);
  const [isPostComposerOpen, setIsPostComposerOpen] = useState(false);
  const [postTitle, setPostTitle] = useState("");
  const [postContent, setPostContent] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(
    feed.activeCategoryId
  );
  const [postComposerErrors, setPostComposerErrors] = useState<string[]>([]);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const isBusy = Boolean(pendingActionId);
  const selectedCategory =
    feed.categories.find((category) => category.id === selectedCategoryId) ?? null;
  const filteredPosts = activeCategoryId
    ? posts.filter((post) => post.category.id === activeCategoryId)
    : posts;
  const hasPostComposerErrors = postComposerErrors.length > 0;

  currentCommunitySlugRef.current = communitySlug;

  useEffect(() => {
    currentActionTokenRef.current += 1;
    setPosts(feed.posts);
    setActiveCategoryId(feed.activeCategoryId);
    setSelectedCategoryId("");
    setCommentDrafts({});
    setPendingActionId(null);
  }, [communitySlug, feed.activeCategoryId, feed.posts]);

  const isCurrentAction = (actionToken: number, actionCommunitySlug: string) =>
    currentActionTokenRef.current === actionToken &&
    currentCommunitySlugRef.current === actionCommunitySlug;

  const resetPostComposer = () => {
    setPostTitle("");
    setPostContent("");
    setSelectedCategoryId("");
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
      categoryId: selectedCategoryId,
      content,
      title,
    });

    if (missingRequirements.length > 0) {
      setPostComposerErrors(missingRequirements);
      return;
    }

    const actionCommunitySlug = communitySlug;
    const actionToken = currentActionTokenRef.current + 1;

    currentActionTokenRef.current = actionToken;
    setPendingActionId(COMMUNITY_FEED_COPY.postButton);

    try {
      const response = await submitJsonRequest<CreatePostResponse>(
        COMMUNITY_FEED_ENDPOINT.post(actionCommunitySlug),
        {
          categoryId: selectedCategoryId,
          content,
          title,
        }
      );

      if (!isCurrentAction(actionToken, actionCommunitySlug)) {
        return;
      }

      if (!response.post) {
        throw new Error(COMMUNITY_FEED_COPY.submitPostError);
      }

      setPosts((currentPosts) => [response.post as CommunityFeedPostResult, ...currentPosts]);
      resetPostComposer();
      setIsPostComposerOpen(false);
      toast.success(COMMUNITY_FEED_COPY.submitPostSuccess);
    } catch (error) {
      if (!isCurrentAction(actionToken, actionCommunitySlug)) {
        return;
      }

      toast.error(
        error instanceof Error ? error.message : COMMUNITY_FEED_COPY.submitPostError
      );
    } finally {
      if (isCurrentAction(actionToken, actionCommunitySlug)) {
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
      toast.warning(COMMUNITY_FEED_COPY.commentPlaceholder);
      return;
    }

    const actionCommunitySlug = communitySlug;
    const actionToken = currentActionTokenRef.current + 1;

    currentActionTokenRef.current = actionToken;
    setPendingActionId(postId);

    try {
      const response = await submitJsonRequest<CreateCommentResponse>(
        COMMUNITY_FEED_ENDPOINT.comment(actionCommunitySlug, postId),
        {
          content,
        }
      );

      if (!isCurrentAction(actionToken, actionCommunitySlug)) {
        return;
      }

      if (!response.comment) {
        throw new Error(COMMUNITY_FEED_COPY.submitCommentError);
      }

      setPosts((currentPosts) =>
        currentPosts.map((post) =>
          post.id === postId
            ? {
                ...post,
                comments: [...post.comments, response.comment as CommunityFeedCommentResult],
              }
            : post
        )
      );
      setCommentDrafts((currentDrafts) => ({
        ...currentDrafts,
        [postId]: "",
      }));
      toast.success(COMMUNITY_FEED_COPY.submitCommentSuccess);
    } catch (error) {
      if (!isCurrentAction(actionToken, actionCommunitySlug)) {
        return;
      }

      toast.error(
        error instanceof Error
          ? error.message
          : COMMUNITY_FEED_COPY.submitCommentError
      );
    } finally {
      if (isCurrentAction(actionToken, actionCommunitySlug)) {
        setPendingActionId(null);
      }
    }
  };

  const handleToggleLike = async (postId: string) => {
    const actionCommunitySlug = communitySlug;
    const actionToken = currentActionTokenRef.current + 1;

    currentActionTokenRef.current = actionToken;
    setPendingActionId(postId);
    const currentPost = posts.find((post) => post.id === postId);

    if (!currentPost) {
      setPendingActionId(null);
      return;
    }

    const optimisticLikedByViewer = !currentPost.likedByViewer;
    const optimisticLikeCount = Math.max(
      0,
      currentPost.likeCount + (optimisticLikedByViewer ? 1 : -1)
    );

    setPosts((currentPosts) =>
      currentPosts.map((post) =>
        post.id === postId
          ? {
              ...post,
              likedByViewer: optimisticLikedByViewer,
              likeCount: optimisticLikeCount,
            }
          : post
      )
    );

    try {
      const response = await submitJsonRequest<ToggleLikeResponse>(
        COMMUNITY_FEED_ENDPOINT.like(actionCommunitySlug, postId)
      );

      if (!isCurrentAction(actionToken, actionCommunitySlug)) {
        return;
      }

      if (
        typeof response.likedByViewer !== "boolean" ||
        typeof response.likeCount !== "number"
      ) {
        throw new Error(COMMUNITY_FEED_COPY.toggleLikeError);
      }

      setPosts((currentPosts) =>
        currentPosts.map((post) =>
          post.id === postId
            ? {
                ...post,
                likedByViewer: response.likedByViewer as boolean,
                likeCount: response.likeCount as number,
              }
            : post
        )
      );
    } catch (error) {
      if (!isCurrentAction(actionToken, actionCommunitySlug)) {
        return;
      }

      setPosts((currentPosts) =>
        currentPosts.map((post) =>
          post.id === postId
            ? {
                ...post,
                likedByViewer: currentPost.likedByViewer,
                likeCount: currentPost.likeCount,
              }
            : post
        )
      );
      toast.error(
        error instanceof Error ? error.message : COMMUNITY_FEED_COPY.toggleLikeError
      );
    } finally {
      if (isCurrentAction(actionToken, actionCommunitySlug)) {
        setPendingActionId(null);
      }
    }
  };

  return (
    <TooltipProvider>
      <section
        className={styles.CommunityFeed}
        aria-label={COMMUNITY_FEED_COPY.sectionLabel}
      >
      {!feed.viewerPermissions.canCreatePost ? (
        <p className={styles.CommunityFeed__notice}>
          {COMMUNITY_FEED_COPY.mutedNotice}
        </p>
      ) : null}

      {feed.viewerPermissions.canCreatePost ? (
        <Dialog
          open={isPostComposerOpen}
          onOpenChange={handlePostComposerOpenChange}
        >
          <DialogTrigger asChild>
            <button
              aria-label={COMMUNITY_FEED_COPY.postComposerCollapsed}
              className={styles.CommunityFeed__composerTrigger}
              type={COMMUNITY_FEED_FORM.buttonType}
            >
              <Avatar
                className={styles.CommunityFeed__composerAvatar}
                size={COMMUNITY_FEED_ATTRIBUTES.composerAvatarSize}
              >
                {authenticatedMember.image ? (
                  <AvatarImage
                    alt={authenticatedMember.name}
                    src={authenticatedMember.image}
                  />
                ) : null}
                <AvatarFallback>{authenticatedMember.avatarFallback}</AvatarFallback>
              </Avatar>
              <span className={styles.CommunityFeed__composerTriggerText}>
                {COMMUNITY_FEED_COPY.postComposerCollapsed}
              </span>
            </button>
          </DialogTrigger>
          <DialogContent
            className={styles.CommunityFeed__composerDialog}
            showCloseButton={false}
          >
            <DialogHeader className={styles.CommunityFeed__composerDialogHeader}>
              <DialogTitle className={styles.CommunityFeed__composerDialogTitle}>
                {COMMUNITY_FEED_COPY.postComposerDialogTitle}
              </DialogTitle>
              <DialogDescription
                className={styles.CommunityFeed__composerDialogDescription}
              >
                {COMMUNITY_FEED_COPY.postComposerDescription}
              </DialogDescription>
              <div className={styles.CommunityFeed__composerIdentity}>
                <Avatar className={styles.CommunityFeed__composerDialogAvatar}>
                  {authenticatedMember.image ? (
                    <AvatarImage
                      alt={authenticatedMember.name}
                      src={authenticatedMember.image}
                    />
                  ) : null}
                  <AvatarFallback>{authenticatedMember.avatarFallback}</AvatarFallback>
                </Avatar>
                <p className={styles.CommunityFeed__composerIdentityText}>
                  <strong>{authenticatedMember.name}</strong>{" "}
                  {COMMUNITY_FEED_COPY.postComposerContext}
                </p>
              </div>
            </DialogHeader>
            <form
              className={styles.CommunityFeed__composer}
              onSubmit={handleCreatePost}
            >
              <input
                aria-describedby={
                  hasPostComposerErrors
                    ? COMMUNITY_FEED_ATTRIBUTES.postComposerErrorId
                    : undefined
                }
                aria-label={COMMUNITY_FEED_COPY.postComposerTitleLabel}
                className={styles.CommunityFeed__titleInput}
                disabled={isBusy}
                onChange={(event) => {
                  setPostTitle(event.currentTarget.value);
                  setPostComposerErrors([]);
                }}
                placeholder={COMMUNITY_FEED_COPY.postComposerTitlePlaceholder}
                value={postTitle}
              />
              <textarea
                aria-describedby={
                  hasPostComposerErrors
                    ? COMMUNITY_FEED_ATTRIBUTES.postComposerErrorId
                    : undefined
                }
                aria-label={COMMUNITY_FEED_COPY.postComposerLabel}
                className={styles.CommunityFeed__textarea}
                disabled={isBusy}
                onChange={(event) => {
                  setPostContent(event.currentTarget.value);
                  setPostComposerErrors([]);
                }}
                placeholder={COMMUNITY_FEED_COPY.postPlaceholder}
                value={postContent}
              />
              <div className={styles.CommunityFeed__categoryPicker}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      aria-label={COMMUNITY_FEED_COPY.postCategoryLabel}
                      className={styles.CommunityFeed__categoryTrigger}
                      disabled={isBusy}
                      type={COMMUNITY_FEED_FORM.buttonType}
                    >
                      <span>
                        {selectedCategory
                          ? `${selectedCategory.emoji} ${selectedCategory.name}`
                          : COMMUNITY_FEED_COPY.postCategorySelect}
                      </span>
                      <ChevronDownIcon />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align={COMMUNITY_FEED_ATTRIBUTES.dropdownAlign}>
                    {feed.categories.map((category) => (
                      <DropdownMenuItem
                        key={category.id}
                        onSelect={() => {
                          setSelectedCategoryId(category.id);
                          setPostComposerErrors([]);
                        }}
                      >
                        {category.emoji} {category.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {hasPostComposerErrors ? (
                <div
                  className={styles.CommunityFeed__composerError}
                  id={COMMUNITY_FEED_ATTRIBUTES.postComposerErrorId}
                >
                  <p className={styles.CommunityFeed__composerErrorTitle}>
                    {COMMUNITY_FEED_COPY.postComposerRequirementsTitle}
                  </p>
                  <ul
                    aria-label={
                      COMMUNITY_FEED_ATTRIBUTES.postComposerRequirementsLabel
                    }
                    className={styles.CommunityFeed__composerErrorList}
                  >
                    {postComposerErrors.map((postComposerError) => (
                      <li
                        className={styles.CommunityFeed__composerErrorItem}
                        key={postComposerError}
                      >
                        <span
                          aria-hidden={
                            COMMUNITY_FEED_ATTRIBUTES.missingRequirementBulletHidden
                          }
                          className={styles.CommunityFeed__composerErrorBullet}
                        >
                          {COMMUNITY_FEED_SYMBOLS.missingRequirementBullet}
                        </span>
                        {postComposerError}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <DialogFooter className={styles.CommunityFeed__composerFooter}>
                <DialogClose asChild>
                  <Button
                    disabled={isBusy}
                    type={COMMUNITY_FEED_FORM.buttonType}
                    variant={COMMUNITY_FEED_FORM.outlineVariant}
                  >
                    {COMMUNITY_FEED_COPY.postCancelButton}
                  </Button>
                </DialogClose>
                <Button
                  disabled={isBusy}
                  type={COMMUNITY_FEED_FORM.submitType}
                >
                  <SendIcon />
                  {COMMUNITY_FEED_COPY.postButton}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}

      {feed.categories.length > 0 ? (
        <nav
          aria-label={COMMUNITY_FEED_COPY.postCategoryLabel}
          className={styles.CommunityFeed__categoryFilters}
        >
          <button
            className={`${styles.CommunityFeed__categoryFilter} ${
              !activeCategoryId ? styles["CommunityFeed__categoryFilter--active"] : ""
            }`}
            onClick={() => {
              setActiveCategoryId(null);
            }}
            type={COMMUNITY_FEED_FORM.buttonType}
          >
            <span className={styles.CommunityFeed__categoryFilterText}>
              {COMMUNITY_FEED_COPY.postCategoryFilterAll}
            </span>
          </button>
          {feed.categories.map((category) => (
            <button
              className={`${styles.CommunityFeed__categoryFilter} ${
                activeCategoryId === category.id
                  ? styles["CommunityFeed__categoryFilter--active"]
                  : ""
              }`}
              key={category.id}
              onClick={() => {
                setActiveCategoryId(category.id);
              }}
              type={COMMUNITY_FEED_FORM.buttonType}
            >
              <span
                aria-hidden={COMMUNITY_FEED_ATTRIBUTES.categoryFilterEmojiHidden}
                className={styles.CommunityFeed__categoryFilterEmoji}
              >
                {category.emoji}
              </span>
              <span className={styles.CommunityFeed__categoryFilterText}>
                {category.name}
              </span>
            </button>
          ))}
        </nav>
      ) : null}

      {filteredPosts.length === 0 ? (
        <div className={styles.CommunityFeed__empty}>
          <h3 className={styles.CommunityFeed__emptyTitle}>
            {COMMUNITY_FEED_COPY.emptyTitle}
          </h3>
          <p className={styles.CommunityFeed__emptyDescription}>
            {COMMUNITY_FEED_COPY.emptyDescription}
          </p>
        </div>
      ) : (
        <ol className={styles.CommunityFeed__postList}>
          {filteredPosts.map((post) => (
            <li className={styles.CommunityFeed__post} key={post.id}>
              <Card className={styles.CommunityFeed__postCard}>
                <article className={styles.CommunityFeed__postArticle}>
                <CardHeader className={styles.CommunityFeed__postHeader}>
                  <div className={styles.CommunityFeed__avatar}>
                    {post.author.avatarFallback}
                  </div>
                  <div className={styles.CommunityFeed__author}>
                    <p className={styles.CommunityFeed__authorName}>
                      {post.author.name}
                    </p>
                    <span
                      className={`${styles.CommunityFeed__roleBadge} ${
                        styles[
                          COMMUNITY_FEED_FORMAT.roleBadgeModifierPrefix +
                            post.author.role
                        ]
                      }`}
                    >
                      {COMMUNITY_FEED_COPY.roleLabel[post.author.role]}
                    </span>
                  </div>
                  <div className={styles.CommunityFeed__postMeta}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <time
                          className={styles.CommunityFeed__time}
                          dateTime={post.createdAt}
                          tabIndex={0}
                        >
                          {formatPostSummaryDate(post.createdAt)}
                        </time>
                      </TooltipTrigger>
                      <TooltipContent
                        className={styles.CommunityFeed__postCreatedTooltip}
                        collisionPadding={
                          COMMUNITY_FEED_ATTRIBUTES.tooltipCollisionPadding
                        }
                        sideOffset={COMMUNITY_FEED_ATTRIBUTES.tooltipSideOffset}
                      >
                        {formatPostCreatedTooltip(post.createdAt)}
                      </TooltipContent>
                    </Tooltip>
                    <span
                      aria-hidden={COMMUNITY_FEED_ATTRIBUTES.postMetaSeparatorHidden}
                      className={styles.CommunityFeed__postMetaSeparator}
                    >
                      {COMMUNITY_FEED_SYMBOLS.postMetaSeparator}
                    </span>
                    <span className={styles.CommunityFeed__categoryBadge}>
                      {post.category.emoji} {post.category.name}
                    </span>
                  </div>
                </CardHeader>

                <CardContent className={styles.CommunityFeed__postContent}>
                  {post.title ? (
                    <h3 className={styles.CommunityFeed__postTitle}>
                      {post.title}
                    </h3>
                  ) : null}
                  <p className={styles.CommunityFeed__content}>{post.content}</p>

                  <div className={styles.CommunityFeed__postActions}>
                    <Button
                      disabled={!feed.viewerPermissions.canReact || isBusy}
                      onClick={() => {
                        void handleToggleLike(post.id);
                      }}
                      type={COMMUNITY_FEED_FORM.buttonType}
                      variant={
                        post.likedByViewer
                          ? COMMUNITY_FEED_FORM.defaultVariant
                          : COMMUNITY_FEED_FORM.outlineVariant
                      }
                    >
                      <HeartIcon />
                      {COMMUNITY_FEED_COPY.likeButton}
                      {COMMUNITY_FEED_FORMAT.likeCountSeparator}
                      {post.likeCount}
                    </Button>
                  </div>
                </CardContent>

                <CardFooter className={styles.CommunityFeed__postFooter}>
                <section
                  className={styles.CommunityFeed__comments}
                  aria-label={COMMUNITY_FEED_COPY.commentsTitle}
                >
                  {post.comments.length > 0 ? (
                    <ol className={styles.CommunityFeed__commentList}>
                      {post.comments.map((comment) => (
                        <li
                          className={styles.CommunityFeed__comment}
                          key={comment.id}
                        >
                          <div className={styles.CommunityFeed__commentAvatar}>
                            {comment.author.avatarFallback}
                          </div>
                          <div className={styles.CommunityFeed__commentBody}>
                            <p className={styles.CommunityFeed__commentMeta}>
                              <span>{comment.author.name}</span>
                              <span
                                className={`${styles.CommunityFeed__roleBadge} ${
                                  styles[
                                    COMMUNITY_FEED_FORMAT.roleBadgeModifierPrefix +
                                      comment.author.role
                                  ]
                                }`}
                              >
                                {
                                  COMMUNITY_FEED_COPY.roleLabel[
                                    comment.author.role
                                  ]
                                }
                              </span>
                            </p>
                            <p className={styles.CommunityFeed__commentContent}>
                              {comment.content}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  ) : null}

                  {feed.viewerPermissions.canComment ? (
                    <form
                      className={styles.CommunityFeed__commentForm}
                      onSubmit={(event) => {
                        void handleCreateComment(event, post.id);
                      }}
                    >
                      <input
                        aria-label={COMMUNITY_FEED_COPY.commentInputLabel}
                        className={styles.CommunityFeed__commentInput}
                        disabled={isBusy}
                        onChange={(event) => {
                          const nextCommentDraft = event.currentTarget.value;

                          setCommentDrafts((currentDrafts) => ({
                            ...currentDrafts,
                            [post.id]: nextCommentDraft,
                          }));
                        }}
                        placeholder={COMMUNITY_FEED_COPY.commentPlaceholder}
                        value={commentDrafts[post.id] ?? ""}
                      />
                      <Button
                        disabled={isBusy || !(commentDrafts[post.id] ?? "").trim()}
                        type={COMMUNITY_FEED_FORM.submitType}
                        variant={COMMUNITY_FEED_FORM.outlineVariant}
                      >
                        <MessageCircleIcon />
                        {COMMUNITY_FEED_COPY.commentButton}
                      </Button>
                    </form>
                  ) : null}
                </section>
                </CardFooter>
              </article>
              </Card>
            </li>
          ))}
        </ol>
      )}
      </section>
    </TooltipProvider>
  );
}
