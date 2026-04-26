"use client";

import { FormEvent, useState, useTransition } from "react";
import { HeartIcon, MessageCircleIcon, SendIcon } from "lucide-react";
import { useRouter } from "next/navigation";
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
import type { AuthenticatedMemberResult } from "@/src/modules/auth/application/results/authenticated-member-result";
import type { CommunityFeedResult } from "@/src/modules/posts/application/results/community-feed-result";
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
  postComposerCollapsed: "Escribí algo",
  postComposerContext: "publicando en la comunidad",
  postComposerDescription:
    "Completá el título y el contenido para compartir una publicación en la comunidad.",
  postComposerDialogTitle: "Crear publicación",
  postComposerError: "Completá el título y el contenido antes de publicar.",
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
  composerAvatarSize: "lg",
  postComposerErrorId: "community-post-composer-error",
} as const;

const COMMUNITY_FEED_FORMAT = {
  dateStyle: "medium",
  likeCountSeparator: " · ",
  locale: "es-AR",
  nonBreakingSpacePattern: /[\u00a0\u202f]/g,
  roleBadgeModifierPrefix: "CommunityFeed__roleBadge--",
  standardSpace: " ",
  timeStyle: "short",
} as const;

type CommunityFeedProps = {
  authenticatedMember: AuthenticatedMemberResult;
  communitySlug: string;
  feed: CommunityFeedResult;
};

type ApiErrorResponse = {
  message?: string;
};

async function readApiErrorMessage(response: Response): Promise<string | null> {
  const body = (await response.json().catch(() => null)) as ApiErrorResponse | null;

  return typeof body?.message === "string" ? body.message : null;
}

async function submitJsonRequest(url: string, body?: Record<string, string>) {
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
}

function formatPostDateTime(dateTime: string): string {
  return new Intl.DateTimeFormat(COMMUNITY_FEED_FORMAT.locale, {
    dateStyle: COMMUNITY_FEED_FORMAT.dateStyle,
    timeStyle: COMMUNITY_FEED_FORMAT.timeStyle,
  })
    .format(new Date(dateTime))
    .replace(
      COMMUNITY_FEED_FORMAT.nonBreakingSpacePattern,
      COMMUNITY_FEED_FORMAT.standardSpace
    );
}

export function CommunityFeed({
  authenticatedMember,
  communitySlug,
  feed,
}: CommunityFeedProps) {
  const router = useRouter();
  const [isPostComposerOpen, setIsPostComposerOpen] = useState(false);
  const [postTitle, setPostTitle] = useState("");
  const [postContent, setPostContent] = useState("");
  const [postComposerError, setPostComposerError] = useState<string | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [isRefreshing, startRefresh] = useTransition();
  const isBusy = Boolean(pendingActionId) || isRefreshing;
  const isPostSubmitDisabled = isBusy || !postTitle.trim() || !postContent.trim();

  const refreshFeed = () => {
    startRefresh(() => {
      router.refresh();
    });
  };

  const handleCreatePost = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = postTitle.trim();
    const content = postContent.trim();

    if (!title || !content) {
      setPostComposerError(COMMUNITY_FEED_COPY.postComposerError);
      toast.warning(COMMUNITY_FEED_COPY.postComposerError);
      return;
    }

    setPendingActionId(COMMUNITY_FEED_COPY.postButton);

    try {
      await submitJsonRequest(COMMUNITY_FEED_ENDPOINT.post(communitySlug), {
        content,
        title,
      });
      setPostTitle("");
      setPostContent("");
      setPostComposerError(null);
      setIsPostComposerOpen(false);
      toast.success(COMMUNITY_FEED_COPY.submitPostSuccess);
      refreshFeed();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : COMMUNITY_FEED_COPY.submitPostError
      );
    } finally {
      setPendingActionId(null);
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

    setPendingActionId(postId);

    try {
      await submitJsonRequest(COMMUNITY_FEED_ENDPOINT.comment(communitySlug, postId), {
        content,
      });
      setCommentDrafts((currentDrafts) => ({
        ...currentDrafts,
        [postId]: "",
      }));
      toast.success(COMMUNITY_FEED_COPY.submitCommentSuccess);
      refreshFeed();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : COMMUNITY_FEED_COPY.submitCommentError
      );
    } finally {
      setPendingActionId(null);
    }
  };

  const handleToggleLike = async (postId: string) => {
    setPendingActionId(postId);

    try {
      await submitJsonRequest(COMMUNITY_FEED_ENDPOINT.like(communitySlug, postId));
      refreshFeed();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : COMMUNITY_FEED_COPY.toggleLikeError
      );
    } finally {
      setPendingActionId(null);
    }
  };

  return (
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
        <Dialog open={isPostComposerOpen} onOpenChange={setIsPostComposerOpen}>
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
                  postComposerError
                    ? COMMUNITY_FEED_ATTRIBUTES.postComposerErrorId
                    : undefined
                }
                aria-label={COMMUNITY_FEED_COPY.postComposerTitleLabel}
                className={styles.CommunityFeed__titleInput}
                disabled={isBusy}
                onChange={(event) => {
                  setPostTitle(event.currentTarget.value);
                  setPostComposerError(null);
                }}
                placeholder={COMMUNITY_FEED_COPY.postComposerTitlePlaceholder}
                value={postTitle}
              />
              <textarea
                aria-describedby={
                  postComposerError
                    ? COMMUNITY_FEED_ATTRIBUTES.postComposerErrorId
                    : undefined
                }
                aria-label={COMMUNITY_FEED_COPY.postComposerLabel}
                className={styles.CommunityFeed__textarea}
                disabled={isBusy}
                onChange={(event) => {
                  setPostContent(event.currentTarget.value);
                  setPostComposerError(null);
                }}
                placeholder={COMMUNITY_FEED_COPY.postPlaceholder}
                value={postContent}
              />
              {postComposerError ? (
                <p
                  className={styles.CommunityFeed__composerError}
                  id={COMMUNITY_FEED_ATTRIBUTES.postComposerErrorId}
                >
                  {postComposerError}
                </p>
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
                  disabled={isPostSubmitDisabled}
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

      {feed.posts.length === 0 ? (
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
          {feed.posts.map((post) => (
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
                  <time
                    className={styles.CommunityFeed__time}
                    dateTime={post.createdAt}
                  >
                    {formatPostDateTime(post.createdAt)}
                  </time>
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
  );
}
