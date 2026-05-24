"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createElement,
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  CSSProperties,
  FormEvent,
  MouseEvent,
} from "react";
import {
  CalendarClockIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  HeartIcon,
  ListPlusIcon,
  MoreHorizontalIcon,
  PinIcon,
  TrashIcon,
  SendIcon,
  VideoIcon,
  VoteIcon,
  XIcon,
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
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { BUENOS_AIRES_TIME_ZONE } from "@/src/constants/date-time";
import type { AuthenticatedMemberResult } from "@/src/modules/auth/application/results/authenticated-member-result";
import {
  MESSAGE_POLL_OPTION_TEXT,
  MESSAGE_POLL_OPTIONS,
  MESSAGE_POLL_QUESTION,
} from "@/src/modules/messages/constants/message-round";
import type {
  TribeRoundReplyResult,
  TribeRoundMessageResult,
  TribeRoundResult,
} from "@/src/modules/messages/application/results/tribe-round-result";
import {
  InvalidVideoUrlError,
  parseExternalVideoUrl,
} from "@/src/modules/shared/domain/value-objects/external-video-url";
import { VIDEO_PROVIDER } from "@/src/modules/shared/domain/value-objects/video-provider";
import {
  PLAYER_IFRAME_ALLOW,
  buildPlayerEmbedSource,
} from "@/src/modules/shared/application/video/build-player-embed-source";
import styles from "./styles.module.scss";

const TRIBE_ROUND_ROUTE = {
  apiTribes: "/api/tribes/",
  channelQueryParam: "channel",
  pageQueryParam: "page",
  platformTribeSegment: "/tribu/",
  querySeparator: "?",
  repliesSegment: "/replies",
  likeSegment: "/like",
  pinSegment: "/pin",
  createdAtSegment: "/created-at",
  pollSegment: "/poll",
  pollVotesSegment: "/votes",
  messagesBaseSegment: "/messages",
  messagesSegment: "/messages/",
} as const;

const TRIBE_ROUND_ENDPOINT = {
  reply: (tribeSlug: string, messageId: string) =>
    TRIBE_ROUND_ROUTE.apiTribes +
    tribeSlug +
    TRIBE_ROUND_ROUTE.messagesSegment +
    messageId +
    TRIBE_ROUND_ROUTE.repliesSegment,
  like: (tribeSlug: string, messageId: string) =>
    TRIBE_ROUND_ROUTE.apiTribes +
    tribeSlug +
    TRIBE_ROUND_ROUTE.messagesSegment +
    messageId +
    TRIBE_ROUND_ROUTE.likeSegment,
  pin: (tribeSlug: string, messageId: string) =>
    TRIBE_ROUND_ROUTE.apiTribes +
    tribeSlug +
    TRIBE_ROUND_ROUTE.messagesSegment +
    messageId +
    TRIBE_ROUND_ROUTE.pinSegment,
  createdAt: (tribeSlug: string, messageId: string) =>
    TRIBE_ROUND_ROUTE.apiTribes +
    tribeSlug +
    TRIBE_ROUND_ROUTE.messagesSegment +
    messageId +
    TRIBE_ROUND_ROUTE.createdAtSegment,
  message: (tribeSlug: string) =>
    TRIBE_ROUND_ROUTE.apiTribes +
    tribeSlug +
    TRIBE_ROUND_ROUTE.messagesBaseSegment,
  poll: (tribeSlug: string, messageId: string) =>
    TRIBE_ROUND_ROUTE.apiTribes +
    tribeSlug +
    TRIBE_ROUND_ROUTE.messagesSegment +
    messageId +
    TRIBE_ROUND_ROUTE.pollSegment,
  pollVotes: (tribeSlug: string, messageId: string) =>
    TRIBE_ROUND_ENDPOINT.poll(tribeSlug, messageId) +
    TRIBE_ROUND_ROUTE.pollVotesSegment,
  messageItem: (tribeSlug: string, messageId: string) =>
    TRIBE_ROUND_ROUTE.apiTribes +
    tribeSlug +
    TRIBE_ROUND_ROUTE.messagesSegment +
    messageId,
} as const;

const TRIBE_ROUND_COPY = {
  openMessageDetailsAriaLabelPrefix: "Abrir mensaje",
  replyInputLabel: "Escribir una respuesta",
  replySendButtonAriaLabel: "Enviar respuesta",
  replyPlaceholder: "Escribi una respuesta",
  repliesTitle: "Respuestas",
  repliesLoading: "Cargando respuestas...",
  repliesLoadError: "No pudimos cargar las respuestas.",
  repliesRetry: "Reintentar",
  messageDetailsDialogDescription: "Detalle del mensaje y sus respuestas.",
  messageDetailsDialogTitle: "Mensaje",
  messageDetailsContentLabel: "Contenido del mensaje",
  messageContentShowLess: "Ver menos",
  messageContentShowMore: "Ver más",
  messageDeleteButton: "Eliminar mensaje",
  messageDeleteError: "No pudimos eliminar el mensaje.",
  messageDeleteSuccess: "Mensaje eliminado.",
  messageEditCreatedAtButton: "Editar fecha de creación",
  messageEditCreatedAtCancel: "Cancelar",
  messageEditCreatedAtDescription:
    "Modifica la fecha y hora de creación del mensaje. Afecta el orden cronológico del feed.",
  messageEditCreatedAtError: "No pudimos actualizar la fecha del mensaje.",
  messageEditCreatedAtInputLabel: "Fecha y hora",
  messageEditCreatedAtInvalid: "Ingresa una fecha y hora válida.",
  messageEditCreatedAtSubmit: "Guardar",
  messageEditCreatedAtSuccess: "Fecha del mensaje actualizada.",
  messageEditCreatedAtTitle: "Editar fecha del mensaje",
  messageMoreActionsAriaLabel: "Acciones del mensaje",
  emptyDescription:
    "Todavía no hay mensajes. Las novedades, preguntas y recursos van a aparecer acá.",
  emptyTitle: "Compartí el primer mensaje de la ronda",
  likeButton: "Me gusta",
  likeButtonAriaLabel: "Me gusta",
  mutedNotice: "Podes leer la ronda, pero tu estado actual no permite participar.",
  pinButtonAriaLabel: "Pinear mensaje",
  pinnedBadge: "Pineado",
  pinLimitReachedMessage: "Solo podes pinear hasta 3 mensajes en el fogón.",
  togglePinError: "No pudimos actualizar el pin.",
  unpinButtonAriaLabel: "Despinear mensaje",
  messageButton: "Compartir",
  messageCancelButton: "Cancelar",
  tribeChannelFilterAll: "Todos",
  tribeChannelLabel: "Canal del mensaje",
  tribeChannelSelect: "Elegir canal",
  messageComposerCollapsed: "Compartí algo en la ronda",
  messageComposerContext: "compartiendo en el fogón",
  messageComposerDescription:
    "Completá el título y el contenido para compartir un mensaje en la tribu.",
  messageComposerDialogTitle: "Crear mensaje",
  messageComposerDuplicatePollOptions: "Usar opciones distintas",
  messageComposerMissingChannel: "Seleccionar canal",
  messageComposerMissingContent: "Publicar el contenido",
  messageComposerPollOptionsLimit: "Usar menos opciones",
  messageComposerPollOptionsRequired: "Agregar al menos 2 opciones",
  messageComposerPollOptionTooLong: "Acortar las opciones",
  messageComposerPollQuestionRequired: "Completar la pregunta",
  messageComposerPollQuestionTooLong: "Acortar la pregunta",
  messageComposerMissingTitle: "Completar título",
  messageComposerRequirementsTitle: "Falta completar:",
  messageCreatedTooltipPrefix: "Mensaje creado:",
  messageComposerLabel: "Contenido del mensaje",
  messageComposerTitleLabel: "Título del mensaje",
  messageComposerTitlePlaceholder: "Título del mensaje",
  messagePlaceholder: "Contá una novedad, hacé una pregunta o compartí un recurso",
  videoAddButton: "Agregar video",
  videoAttachedBadge: "Video adjunto",
  videoComposerHeading: "Link del video",
  videoEmbedTitlePrefix: "Video adjunto al mensaje",
  videoInvalidUrl:
    "No pudimos reconocer este link. Probá con YouTube, Vimeo, Wistia o Loom.",
  videoMissing: "Pegar un link de video válido",
  videoProviderDetectedPrefix: "Proveedor detectado:",
  videoRemoveButton: "Quitar video",
  videoUrlPlaceholder: "https://youtube.com/watch?v=...",
  videoProviderLabel: {
    [VIDEO_PROVIDER.loom]: "Loom",
    [VIDEO_PROVIDER.vimeo]: "Vimeo",
    [VIDEO_PROVIDER.wistia]: "Wistia",
    [VIDEO_PROVIDER.youtube]: "YouTube",
  },
  pollAddButton: "Agregar encuesta",
  pollAddOptionButton: "Agregar opción",
  pollAllowMultipleVotesLabel: "Voto múltiple",
  pollOptionPlaceholder: "Opción",
  pollQuestionLabel: "Pregunta de la encuesta",
  pollQuestionPlaceholder: "¿Qué querés preguntar?",
  pollRemoveButton: "Quitar encuesta",
  pollRemoveOptionButton: "Quitar opción",
  pollSubmitButton: "Votar",
  pollSubmitError: "No pudimos registrar tu voto.",
  pollSubmitSuccess: "Voto registrado.",
  pollSummaryLabel: "Votación",
  pollToggleMultipleVotesLabel: "Voto múltiple",
  pollVotePluralLabel: "votos",
  pollVoteSingularLabel: "voto",
  roleLabel: {
    guardian: "Guardián",
    leader: "Líder",
    tribemate: "Integrante",
  },
  sectionLabel: "Round de mensajes",
  submitReplyError: "No pudimos publicar la respuesta.",
  submitReplySuccess: "Respuesta publicada.",
  submitMessageError: "No pudimos crear el mensaje.",
  submitMessageSuccess: "Mensaje creado.",
  toggleLikeError: "No pudimos actualizar la reaccion.",
} as const;

const TRIBE_ROUND_PATH = {
  tribe: (tribeSlug: string) => TRIBE_ROUND_ROUTE.platformTribeSegment + tribeSlug,
} as const;

const TRIBE_ROUND_FORM = {
  buttonType: "button",
  contentTypeHeader: "Content-Type",
  dateTimeLocalStep: 1,
  dateTimeLocalInputType: "datetime-local",
  defaultVariant: "default",
  ghostVariant: "ghost",
  iconSize: "icon",
  jsonContentType: "application/json",
  deleteMethod: "DELETE",
  method: "POST",
  patchMethod: "PATCH",
  outlineVariant: "outline",
  submitType: "submit",
  urlInputType: "url",
} as const;

const TRIBE_ROUND_ATTRIBUTES = {
  channelFilterEmojiHidden: true,
  composerAvatarSize: "lg",
  contentExpandedDataAttribute: "data-expanded",
  dropdownAlign: "center",
  inlineEndIcon: "inline-end",
  inlineStartIcon: "inline-start",
  messageMetaSeparatorHidden: true,
  relativeTimeFormat: "relative",
  relativeTimeNoTitleAttribute: "no-title",
  relativeTimeTag: "relative-time",
  tooltipCollisionPadding: 16,
  tooltipSideOffset: -4,
  missingRequirementBulletHidden: true,
  messageComposerErrorId: "tribe-message-composer-error",
  messageComposerRequirementsLabel: "Requisitos pendientes",
  messageDetailsTitleHidden: true,
  regionRole: "region",
  trueString: "true",
} as const;

const TRIBE_ROUND_LIMITS = {
  collapsedContentCharacters: 320,
  toggleDebounceMs: 300,
} as const;

const TRIBE_ROUND_OPTIMISTIC = {
  replyIdPrefix: "optimistic-reply-",
} as const;

const DATE_TIME_LOCAL_INPUT = {
  dateSeparator: "-",
  dateTimeSeparator: "T",
  monthOffset: 1,
  padCharacter: "0",
  padLength: 2,
  timeSeparator: ":",
} as const;

const TRIBE_ROUND_POLL = {
  draftKeyPrefix: "poll-option-",
  initialOptionCount: 3,
  minimumOptionCount: 2,
  multipleInputType: "checkbox",
  percentageBase: 100,
  percentageStyleProperty: "--poll-result",
  percentageSuffix: "%",
  singleInputType: "radio",
} as const;

const TRIBE_ROUND_AUTHOR_ROLE = {
  guardian: "guardian",
  leader: "leader",
} as const;

const TRIBE_ROUND_PRIVILEGED_AUTHOR_ROLES = new Set<
  TribeRoundReplyResult["author"]["role"]
>([TRIBE_ROUND_AUTHOR_ROLE.guardian, TRIBE_ROUND_AUTHOR_ROLE.leader]);

const TRIBE_ROUND_CONTENT_PREVIEW_CLASS = {
  details: "TribeRound__content--detailsPreview",
  round: "TribeRound__content--roundPreview",
} as const;

type TribeRoundContentPreviewClass =
  (typeof TRIBE_ROUND_CONTENT_PREVIEW_CLASS)[keyof typeof TRIBE_ROUND_CONTENT_PREVIEW_CLASS];

const TRIBE_ROUND_SYMBOLS = {
  missingRequirementBullet: "-",
  messageMetaSeparator: "·",
} as const;

const TRIBE_ROUND_REPLY_LOAD_STATUS = {
  error: "error",
  loaded: "loaded",
  loading: "loading",
} as const;

const TRIBE_ROUND_PAGINATION_LABEL = {
  next: "Siguiente",
  previous: "Anterior",
} as const;

const TRIBE_ROUND_FORMAT = {
  dateStyle: "medium",
  day: "numeric",
  locale: "es-AR",
  month: "short",
  nonBreakingSpacePattern: /[\u00a0\u202f]/g,
  roleBadgeModifierPrefix: "TribeRound__roleBadge--",
  standardSpace: " ",
  timeStyle: "short",
  year: "numeric",
} as const;
const MESSAGE_FULL_DATE_TIME_FORMATTER = new Intl.DateTimeFormat(
  TRIBE_ROUND_FORMAT.locale,
  {
    dateStyle: TRIBE_ROUND_FORMAT.dateStyle,
    timeStyle: TRIBE_ROUND_FORMAT.timeStyle,
    timeZone: BUENOS_AIRES_TIME_ZONE,
  }
);
const CURRENT_YEAR_MESSAGE_DATE_FORMATTER = new Intl.DateTimeFormat(
  TRIBE_ROUND_FORMAT.locale,
  {
    day: TRIBE_ROUND_FORMAT.day,
    month: TRIBE_ROUND_FORMAT.month,
    timeZone: BUENOS_AIRES_TIME_ZONE,
  }
);
const PAST_YEAR_MESSAGE_DATE_FORMATTER = new Intl.DateTimeFormat(
  TRIBE_ROUND_FORMAT.locale,
  {
    month: TRIBE_ROUND_FORMAT.month,
    timeZone: BUENOS_AIRES_TIME_ZONE,
    year: TRIBE_ROUND_FORMAT.year,
  }
);
const MESSAGE_YEAR_FORMATTER = new Intl.DateTimeFormat(
  TRIBE_ROUND_FORMAT.locale,
  {
    timeZone: BUENOS_AIRES_TIME_ZONE,
    year: TRIBE_ROUND_FORMAT.year,
  }
);

type TribeRoundProps = {
  authenticatedMember: AuthenticatedMemberResult;
  tribeSlug: string;
  round: TribeRoundResult;
};

type ApiErrorResponse = {
  message?: string;
};

type CreateMessageResponse = {
  message?: string;
  tribeMessage?: TribeRoundMessageResult;
};

type MessagePollResponse = {
  message?: string;
  poll?: TribeRoundMessageResult["poll"] | null;
};

type CreateReplyResponse = {
  reply?: TribeRoundReplyResult;
  message?: string;
};

type ListRepliesResponse = {
  replies?: TribeRoundReplyResult[];
  message?: string;
};

type ToggleLikeResponse = {
  likedByViewer?: boolean;
  likeCount?: number;
  message?: string;
};

type TogglePinResponse = {
  isPinned?: boolean;
  message?: string;
  pinnedAt?: string | null;
};

type UpdateCreatedAtResponse = {
  createdAt?: string;
  message?: string;
};

type PendingLikeIntent = {
  baselineLikedByViewer: boolean;
  baselineLikeCount: number;
  intendedLikedByViewer: boolean;
  isRequestInFlight: boolean;
  shouldFlushAfterRequest: boolean;
};

type PendingPinIntent = {
  baselineIsPinned: boolean;
  baselinePinnedAt: string | null;
  intendedIsPinned: boolean;
  isRequestInFlight: boolean;
  shouldFlushAfterRequest: boolean;
};

type PendingPollVoteIntent = {
  baselinePoll: NonNullable<TribeRoundMessageResult["poll"]>;
  intendedOptionIds: string[];
  isRequestInFlight: boolean;
  shouldFlushAfterRequest: boolean;
};

type LikeDebounceTimers = Record<string, ReturnType<typeof setTimeout>>;

type PinDebounceTimers = Record<string, ReturnType<typeof setTimeout>>;

type PollVoteDebounceTimers = Record<string, ReturnType<typeof setTimeout>>;

type PendingLikeIntents = Record<string, PendingLikeIntent | undefined>;

type PendingPinIntents = Record<string, PendingPinIntent | undefined>;

type PendingPollVoteIntents = Record<string, PendingPollVoteIntent | undefined>;

type ReplyLoadStatus =
  (typeof TRIBE_ROUND_REPLY_LOAD_STATUS)[keyof typeof TRIBE_ROUND_REPLY_LOAD_STATUS];

const TRIBE_ROUND_RESET_KEY = {
  empty: "",
  false: "0",
  fieldSeparator: ":",
  keySeparator: "::",
  messageSeparator: "|",
  true: "1",
} as const;

function buildRoundStateResetKey(
  tribeSlug: string,
  round: TribeRoundResult
): string {
  const messageFingerprint = round.messages
    .map((message) =>
      [
        message.id,
        message.createdAt,
        String(message.replies.length),
        String(message.likeCount),
        message.isPinned
          ? TRIBE_ROUND_RESET_KEY.true
          : TRIBE_ROUND_RESET_KEY.false,
        message.pinnedAt ?? TRIBE_ROUND_RESET_KEY.empty,
        message.likedByViewer
          ? TRIBE_ROUND_RESET_KEY.true
          : TRIBE_ROUND_RESET_KEY.false,
      ].join(TRIBE_ROUND_RESET_KEY.fieldSeparator)
    )
    .join(TRIBE_ROUND_RESET_KEY.messageSeparator);

  return [
    tribeSlug,
    round.activeChannelId ?? TRIBE_ROUND_RESET_KEY.empty,
    String(round.pagination.currentPage),
    messageFingerprint,
  ].join(TRIBE_ROUND_RESET_KEY.keySeparator);
}

function renderRoundAuthorAvatar(
  author: TribeRoundMessageResult["author"],
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
  body?: Record<string, unknown>,
  signal?: AbortSignal,
  method: string = TRIBE_ROUND_FORM.method
): Promise<ResponseBody> {
  const response = await fetch(url, {
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      [TRIBE_ROUND_FORM.contentTypeHeader]:
        TRIBE_ROUND_FORM.jsonContentType,
    },
    method,
    signal,
  });

  if (!response.ok) {
    throw new Error((await readApiErrorMessage(response)) ?? response.statusText);
  }

  return (await response.json().catch(() => ({}))) as ResponseBody;
}

async function readJsonRequest<ResponseBody>(
  url: string,
  signal?: AbortSignal
): Promise<ResponseBody> {
  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw new Error((await readApiErrorMessage(response)) ?? response.statusText);
  }

  return (await response.json().catch(() => ({}))) as ResponseBody;
}

function normalizeFormattedDateTime(formattedDateTime: string): string {
  return formattedDateTime
    .replace(
      TRIBE_ROUND_FORMAT.nonBreakingSpacePattern,
      TRIBE_ROUND_FORMAT.standardSpace
    );
}

function formatMessageFullDateTime(dateTime: string): string {
  return normalizeFormattedDateTime(
    MESSAGE_FULL_DATE_TIME_FORMATTER.format(new Date(dateTime))
  );
}

function formatMessageSummaryDate(dateTime: string): string {
  const messageDate = new Date(dateTime);
  const currentDate = new Date();
  const formatter =
    MESSAGE_YEAR_FORMATTER.format(messageDate) ===
    MESSAGE_YEAR_FORMATTER.format(currentDate)
      ? CURRENT_YEAR_MESSAGE_DATE_FORMATTER
      : PAST_YEAR_MESSAGE_DATE_FORMATTER;

  return normalizeFormattedDateTime(
    formatter.format(messageDate)
  );
}

function formatMessageCreatedTooltip(dateTime: string): string {
  return [
    TRIBE_ROUND_COPY.messageCreatedTooltipPrefix,
    formatMessageFullDateTime(dateTime),
  ].join(TRIBE_ROUND_FORMAT.standardSpace);
}

function formatPollVoteCount(voteCount: number): string {
  return [
    String(voteCount),
    voteCount === 1
      ? TRIBE_ROUND_COPY.pollVoteSingularLabel
      : TRIBE_ROUND_COPY.pollVotePluralLabel,
  ].join(TRIBE_ROUND_FORMAT.standardSpace);
}

function formatPollSummaryVoteCount(voteCount: number): string {
  return [
    String(voteCount),
    voteCount === 1
      ? TRIBE_ROUND_COPY.pollVoteSingularLabel
      : TRIBE_ROUND_COPY.pollVotePluralLabel,
  ].join(TRIBE_ROUND_FORMAT.standardSpace);
}

function getPersistedPollSelection(
  poll: TribeRoundMessageResult["poll"]
): string[] {
  return poll
    ? poll.options
        .filter((option) => option.selectedByViewer)
        .map((option) => option.id)
    : [];
}

function MessageRelativeTime({ dateTime }: { dateTime: string }) {
  return createElement(
    TRIBE_ROUND_ATTRIBUTES.relativeTimeTag,
    {
      datetime: dateTime,
      format: TRIBE_ROUND_ATTRIBUTES.relativeTimeFormat,
      [TRIBE_ROUND_ATTRIBUTES.relativeTimeNoTitleAttribute]: "",
    },
    formatMessageSummaryDate(dateTime)
  );
}

function useRelativeTimeElementDefinition() {
  useEffect(() => {
    if (!globalThis.customElements?.get(TRIBE_ROUND_ATTRIBUTES.relativeTimeTag)) {
      void import("@github/relative-time-element");
    }
  }, []);
}

function getMissingMessageRequirements(input: {
  channelId: string;
  content: string;
  poll?: {
    enabled: boolean;
    options: string[];
    question: string;
  };
  title: string;
  video?: {
    enabled: boolean;
    url: string;
  };
}): string[] {
  const missingRequirements: string[] = [];

  if (!input.title.trim()) {
    missingRequirements.push(TRIBE_ROUND_COPY.messageComposerMissingTitle);
  }

  if (!input.content.trim()) {
    missingRequirements.push(TRIBE_ROUND_COPY.messageComposerMissingContent);
  }

  if (!input.channelId) {
    missingRequirements.push(TRIBE_ROUND_COPY.messageComposerMissingChannel);
  }

  if (input.poll?.enabled) {
    missingRequirements.push(...getPollDraftRequirements(input.poll));
  }

  if (input.video?.enabled && !safeParseVideoUrl(input.video.url)) {
    missingRequirements.push(TRIBE_ROUND_COPY.videoMissing);
  }

  return missingRequirements;
}

function safeParseVideoUrl(rawInput: string) {
  const trimmed = rawInput.trim();
  if (trimmed.length === 0) {
    return null;
  }

  try {
    return parseExternalVideoUrl(trimmed);
  } catch (error) {
    if (error instanceof InvalidVideoUrlError) {
      return null;
    }
    throw error;
  }
}

function getPollDraftRequirements(poll: {
  options: string[];
  question: string;
}): string[] {
  const trimmedQuestion = poll.question.trim();
  const trimmedOptions = poll.options
    .map((option) => option.trim())
    .filter(Boolean);
  const uniqueOptionTexts = new Set(
    trimmedOptions.map((option) => option.toLocaleLowerCase())
  );
  const pollRequirements: string[] = [];

  if (!trimmedQuestion) {
    pollRequirements.push(TRIBE_ROUND_COPY.messageComposerPollQuestionRequired);
  } else if (trimmedQuestion.length > MESSAGE_POLL_QUESTION.maxLength) {
    pollRequirements.push(TRIBE_ROUND_COPY.messageComposerPollQuestionTooLong);
  }

  if (trimmedOptions.length < MESSAGE_POLL_OPTIONS.minCount) {
    pollRequirements.push(TRIBE_ROUND_COPY.messageComposerPollOptionsRequired);
  } else if (trimmedOptions.length > MESSAGE_POLL_OPTIONS.maxCount) {
    pollRequirements.push(TRIBE_ROUND_COPY.messageComposerPollOptionsLimit);
  }

  if (trimmedOptions.some((option) => option.length > MESSAGE_POLL_OPTION_TEXT.maxLength)) {
    pollRequirements.push(TRIBE_ROUND_COPY.messageComposerPollOptionTooLong);
  }

  if (
    trimmedOptions.length >= MESSAGE_POLL_OPTIONS.minCount &&
    uniqueOptionTexts.size !== trimmedOptions.length
  ) {
    pollRequirements.push(TRIBE_ROUND_COPY.messageComposerDuplicatePollOptions);
  }

  return pollRequirements;
}

function isLongMessageContent(content: string): boolean {
  return content.length > TRIBE_ROUND_LIMITS.collapsedContentCharacters;
}

function getLikeButtonClassName(likedByViewer: boolean): string {
  return [
    styles.TribeRound__likeButton,
    ...(likedByViewer
      ? [styles["TribeRound__likeButton--active"]]
      : []),
  ].join(TRIBE_ROUND_FORMAT.standardSpace);
}

function getPinButtonClassName(isPinned: boolean): string {
  return [
    styles.TribeRound__pinButton,
    ...(isPinned
      ? [styles["TribeRound__pinButton--active"]]
      : []),
  ].join(TRIBE_ROUND_FORMAT.standardSpace);
}

function buildTribeRoundPageHref({
  channelSlug,
  page,
  tribeSlug,
}: {
  channelSlug: string | null;
  page: number;
  tribeSlug: string;
}): string {
  const searchParams = new URLSearchParams();

  if (channelSlug) {
    searchParams.set(TRIBE_ROUND_ROUTE.channelQueryParam, channelSlug);
  }

  if (page > 1) {
    searchParams.set(TRIBE_ROUND_ROUTE.pageQueryParam, String(page));
  }

  const queryString = searchParams.toString();

  return queryString
    ? `${TRIBE_ROUND_PATH.tribe(tribeSlug)}${TRIBE_ROUND_ROUTE.querySeparator}${queryString}`
    : TRIBE_ROUND_PATH.tribe(tribeSlug);
}

function renderAuthorRoleBadge(role: TribeRoundReplyResult["author"]["role"]) {
  if (!TRIBE_ROUND_PRIVILEGED_AUTHOR_ROLES.has(role)) {
    return null;
  }

  return (
    <span
      className={`${styles.TribeRound__roleBadge} ${
        styles[TRIBE_ROUND_FORMAT.roleBadgeModifierPrefix + role]
      }`}
    >
      {TRIBE_ROUND_COPY.roleLabel[role]}
    </span>
  );
}

function renderAuthorIdentity(author: TribeRoundReplyResult["author"]) {
  return (
    <div className={styles.TribeRound__authorIdentity}>
      <p className={styles.TribeRound__authorName}>
        {author.name}
      </p>
      {renderAuthorRoleBadge(author.role)}
    </div>
  );
}

function renderMessageCreatedTime(createdAt: string) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={styles.TribeRound__time}>
          <MessageRelativeTime dateTime={createdAt} />
        </span>
      </TooltipTrigger>
      <TooltipContent
        className={styles.TribeRound__messageCreatedTooltip}
        collisionPadding={TRIBE_ROUND_ATTRIBUTES.tooltipCollisionPadding}
        sideOffset={TRIBE_ROUND_ATTRIBUTES.tooltipSideOffset}
      >
        {formatMessageCreatedTooltip(createdAt)}
      </TooltipContent>
    </Tooltip>
  );
}

function renderPinnedBadge(message: TribeRoundMessageResult) {
  if (!message.isPinned) {
    return null;
  }

  return (
    <span className={styles.TribeRound__pinnedBadge}>
      <PinIcon />
      {TRIBE_ROUND_COPY.pinnedBadge}
    </span>
  );
}

function findViewerTribeAuthor(
  messages: TribeRoundMessageResult[],
  viewerId: string
): TribeRoundReplyResult["author"] | null {
  for (const message of messages) {
    if (message.author.id === viewerId) {
      return message.author;
    }

    const replyAuthor = message.replies.find(
      (reply) => reply.author.id === viewerId
    )?.author;

    if (replyAuthor) {
      return replyAuthor;
    }
  }

  return null;
}

function replaceMessageReply(
  message: TribeRoundMessageResult,
  replyId: string,
  nextReply: TribeRoundReplyResult
): TribeRoundMessageResult {
  const hasReplyToReplace = message.replies.some((reply) => reply.id === replyId);

  if (!hasReplyToReplace) {
    const hasNextReply = message.replies.some((reply) => reply.id === nextReply.id);

    return {
      ...message,
      replies: hasNextReply ? message.replies : [...message.replies, nextReply],
    };
  }

  return {
    ...message,
    replies: message.replies.map((reply) =>
      reply.id === replyId ? nextReply : reply
    ),
  };
}

function mergeRepliesPreservingLocalReplies({
  fetchedReplies,
  localReplies,
}: {
  fetchedReplies: TribeRoundReplyResult[];
  localReplies: TribeRoundReplyResult[];
}): TribeRoundReplyResult[] {
  const fetchedReplyIds = new Set(fetchedReplies.map((reply) => reply.id));
  const localRepliesMissingFromFetch = localReplies.filter(
    (reply) => !fetchedReplyIds.has(reply.id)
  );

  return [...fetchedReplies, ...localRepliesMissingFromFetch];
}

function removeMessageReply(
  message: TribeRoundMessageResult,
  replyId: string
): TribeRoundMessageResult {
  return {
    ...message,
    replies: message.replies.filter((reply) => reply.id !== replyId),
  };
}

function sortMessagesByPinnedState(
  messages: TribeRoundMessageResult[]
): TribeRoundMessageResult[] {
  return [...messages].sort((firstMessage, secondMessage) => {
    const firstPinnedTime = firstMessage.pinnedAt
      ? new Date(firstMessage.pinnedAt).getTime()
      : 0;
    const secondPinnedTime = secondMessage.pinnedAt
      ? new Date(secondMessage.pinnedAt).getTime()
      : 0;

    if (firstPinnedTime !== secondPinnedTime) {
      return secondPinnedTime - firstPinnedTime;
    }

    return (
      new Date(secondMessage.createdAt).getTime() -
      new Date(firstMessage.createdAt).getTime()
    );
  });
}

function getMessagesAfterVisibleMessageCreation({
  createdMessage,
  currentMessages,
  pagination,
}: {
  createdMessage: TribeRoundMessageResult;
  currentMessages: TribeRoundMessageResult[];
  pagination: TribeRoundResult["pagination"];
}): TribeRoundMessageResult[] {
  if (pagination.currentPage !== 1) {
    return currentMessages;
  }

  const sortedMessages = sortMessagesByPinnedState([createdMessage, ...currentMessages]);

  return sortedMessages.slice(0, pagination.pageSize);
}

function getPaginationAfterVisibleMessageCreation({
  currentMessageCount,
  pagination,
}: {
  currentMessageCount: number;
  pagination: TribeRoundResult["pagination"];
}): TribeRoundResult["pagination"] {
  if (pagination.currentPage !== 1) {
    return pagination;
  }

  if (currentMessageCount < pagination.pageSize) {
    return pagination;
  }

  return {
    ...pagination,
    hasNextPage: true,
  };
}

function padTwoDigits(value: number): string {
  return value.toString().padStart(DATE_TIME_LOCAL_INPUT.padLength, DATE_TIME_LOCAL_INPUT.padCharacter);
}

function toDateTimeLocalInputValue(isoDateTime: string): string {
  const messageDate = new Date(isoDateTime);

  if (Number.isNaN(messageDate.getTime())) {
    return TRIBE_ROUND_RESET_KEY.empty;
  }

  const year = messageDate.getFullYear();
  const month = padTwoDigits(messageDate.getMonth() + DATE_TIME_LOCAL_INPUT.monthOffset);
  const day = padTwoDigits(messageDate.getDate());
  const hours = padTwoDigits(messageDate.getHours());
  const minutes = padTwoDigits(messageDate.getMinutes());
  const seconds = padTwoDigits(messageDate.getSeconds());

  return (
    year +
    DATE_TIME_LOCAL_INPUT.dateSeparator +
    month +
    DATE_TIME_LOCAL_INPUT.dateSeparator +
    day +
    DATE_TIME_LOCAL_INPUT.dateTimeSeparator +
    hours +
    DATE_TIME_LOCAL_INPUT.timeSeparator +
    minutes +
    DATE_TIME_LOCAL_INPUT.timeSeparator +
    seconds
  );
}

function parseDateTimeLocalInputValue(rawValue: string): Date | null {
  const trimmed = rawValue.trim();

  if (!trimmed) {
    return null;
  }

  const parsed = new Date(trimmed);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getOptimisticPinnedAt(
  intendedIsPinned: boolean,
  baselineIsPinned: boolean,
  baselinePinnedAt: string | null
): string | null {
  if (!intendedIsPinned) {
    return null;
  }

  return baselineIsPinned ? baselinePinnedAt : new Date().toISOString();
}

function TribeRoundContent({
  authenticatedMember,
  tribeSlug,
  round,
}: TribeRoundProps) {
  const router = useRouter();
  useRelativeTimeElementDefinition();

  const currentTribeSlugRef = useRef(tribeSlug);
  const currentActionTokenRef = useRef(0);
  const likeDebounceTimersRef = useRef<LikeDebounceTimers>({});
  const pendingLikeIntentsRef = useRef<PendingLikeIntents>({});
  const pinDebounceTimersRef = useRef<PinDebounceTimers>({});
  const pendingPinIntentsRef = useRef<PendingPinIntents>({});
  const pollVoteDebounceTimersRef = useRef<PollVoteDebounceTimers>({});
  const pendingPollVoteIntentsRef = useRef<PendingPollVoteIntents>({});
  const [messages, setMessages] = useState<TribeRoundMessageResult[]>(round.messages);
  const [visiblePagination, setVisiblePagination] = useState(round.pagination);
  const [isMessageComposerOpen, setIsMessageComposerOpen] = useState(false);
  const [messageTitle, setMessageTitle] = useState("");
  const [messageContent, setMessageContent] = useState("");
  const [isPollComposerEnabled, setIsPollComposerEnabled] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(
    Array.from({ length: TRIBE_ROUND_POLL.initialOptionCount }, () => "")
  );
  const [pollAllowsMultipleVotes, setPollAllowsMultipleVotes] = useState(false);
  const [isVideoComposerEnabled, setIsVideoComposerEnabled] = useState(false);
  const [videoUrlInput, setVideoUrlInput] = useState("");
  const [selectedPollOptionIds, setSelectedPollOptionIds] = useState<
    Record<string, string[] | undefined>
  >({});
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [messageComposerErrors, setMessageComposerErrors] = useState<string[]>([]);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyLoadStatuses, setReplyLoadStatuses] = useState<
    Record<string, ReplyLoadStatus | undefined>
  >({});
  const [expandedMessageIds, setExpandedMessageIds] = useState<Record<string, boolean>>(
    {}
  );
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [isMessageDetailsOpen, setIsMessageDetailsOpen] = useState(false);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [editingCreatedAtMessageId, setEditingCreatedAtMessageId] = useState<
    string | null
  >(null);
  const [editingCreatedAtValue, setEditingCreatedAtValue] = useState("");
  const optimisticReplyCounterRef = useRef(0);
  const isBusy = Boolean(pendingActionId);
  const selectedChannel =
    round.channels.find((channel) => channel.id === selectedChannelId) ?? null;
  const hasMessageComposerErrors = messageComposerErrors.length > 0;
  const selectedMessage =
    messages.find((message) => message.id === selectedMessageId) ?? null;
  const selectedMessageHasLoadedReplies = selectedMessage?.hasLoadedReplies;
  const selectedMessageRepliesId = selectedMessage?.id;
  const activeChannel =
    round.channels.find((channel) => channel.id === round.activeChannelId) ?? null;
  const selectedMessageReplyLoadStatus = selectedMessage
    ? replyLoadStatuses[selectedMessage.id] ??
      (selectedMessage.hasLoadedReplies === false
        ? TRIBE_ROUND_REPLY_LOAD_STATUS.loading
        : TRIBE_ROUND_REPLY_LOAD_STATUS.loaded)
    : TRIBE_ROUND_REPLY_LOAD_STATUS.loaded;

  useEffect(() => {
    currentTribeSlugRef.current = tribeSlug;
  }, [tribeSlug]);

  useEffect(() => {
    return () => {
      currentActionTokenRef.current += 1;
      currentTribeSlugRef.current = TRIBE_ROUND_RESET_KEY.empty;
      Object.values(likeDebounceTimersRef.current).forEach((timer) => {
        clearTimeout(timer);
      });
      Object.values(pinDebounceTimersRef.current).forEach((timer) => {
        clearTimeout(timer);
      });
      Object.values(pollVoteDebounceTimersRef.current).forEach((timer) => {
        clearTimeout(timer);
      });
      likeDebounceTimersRef.current = {};
      pendingLikeIntentsRef.current = {};
      pinDebounceTimersRef.current = {};
      pendingPinIntentsRef.current = {};
      pollVoteDebounceTimersRef.current = {};
      pendingPollVoteIntentsRef.current = {};
    };
  }, []);

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
          currentMessages.map((message) =>
            message.id === messageId
              ? {
                  ...message,
                  hasLoadedReplies: true,
                  replies: mergeRepliesPreservingLocalReplies({
                    fetchedReplies: replies,
                    localReplies: message.replies,
                  }),
                }
              : message
          )
        );
        setReplyLoadStatuses((currentStatuses) => ({
          ...currentStatuses,
          [messageId]: TRIBE_ROUND_REPLY_LOAD_STATUS.loaded,
        }));
      })
      .catch((error) => {
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
    isMessageDetailsOpen,
    selectedMessageHasLoadedReplies,
    selectedMessageRepliesId,
    selectedMessageReplyLoadStatus,
    tribeSlug,
  ]);

  const isCurrentAction = (actionToken: number, actionTribeSlug: string) =>
    currentActionTokenRef.current === actionToken &&
    currentTribeSlugRef.current === actionTribeSlug;

  const resetMessageComposer = () => {
    setMessageTitle("");
    setMessageContent("");
    setIsPollComposerEnabled(false);
    setPollQuestion("");
    setPollOptions(
      Array.from({ length: TRIBE_ROUND_POLL.initialOptionCount }, () => "")
    );
    setPollAllowsMultipleVotes(false);
    setIsVideoComposerEnabled(false);
    setVideoUrlInput("");
    setSelectedChannelId("");
    setMessageComposerErrors([]);
  };

  const detectedVideo = isVideoComposerEnabled
    ? safeParseVideoUrl(videoUrlInput)
    : null;
  const trimmedVideoUrl = videoUrlInput.trim();
  const showVideoParseError =
    isVideoComposerEnabled && trimmedVideoUrl.length > 0 && !detectedVideo;

  const handleMessageComposerOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      resetMessageComposer();
    }

    setIsMessageComposerOpen(isOpen);
  };

  const handleCreateMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = messageTitle.trim();
    const content = messageContent.trim();
    const missingRequirements = getMissingMessageRequirements({
      channelId: selectedChannelId,
      content,
      poll: {
        enabled: isPollComposerEnabled,
        options: pollOptions,
        question: pollQuestion,
      },
      title,
      video: {
        enabled: isVideoComposerEnabled,
        url: videoUrlInput,
      },
    });

    if (missingRequirements.length > 0) {
      setMessageComposerErrors(missingRequirements);
      return;
    }

    const actionTribeSlug = tribeSlug;
    const actionToken = currentActionTokenRef.current + 1;

    currentActionTokenRef.current = actionToken;
    setPendingActionId(TRIBE_ROUND_COPY.messageButton);

    try {
      const response = await submitJsonRequest<CreateMessageResponse>(
        TRIBE_ROUND_ENDPOINT.message(actionTribeSlug),
        {
          channelId: selectedChannelId,
          content,
          ...(isPollComposerEnabled
            ? {
                poll: {
                  allowMultipleVotes: pollAllowsMultipleVotes,
                  options: pollOptions
                    .map((option) => option.trim())
                    .filter(Boolean),
                  question: pollQuestion.trim(),
                },
              }
            : {}),
          ...(isVideoComposerEnabled
            ? {
                video: {
                  url: videoUrlInput.trim(),
                },
              }
            : {}),
          title,
        }
      );

      if (!isCurrentAction(actionToken, actionTribeSlug)) {
        return;
      }

      if (!response.tribeMessage) {
        throw new Error(TRIBE_ROUND_COPY.submitMessageError);
      }

      const createdMessage = response.tribeMessage as TribeRoundMessageResult;

      if (
        !round.activeChannelId ||
        createdMessage.channel.id === round.activeChannelId
      ) {
        setVisiblePagination((currentPagination) =>
          getPaginationAfterVisibleMessageCreation({
            currentMessageCount: messages.length,
            pagination: currentPagination,
          })
        );
        setMessages((currentMessages) =>
          getMessagesAfterVisibleMessageCreation({
            createdMessage,
            currentMessages,
            pagination: visiblePagination,
          })
        );
      }
      resetMessageComposer();
      setIsMessageComposerOpen(false);
      toast.success(TRIBE_ROUND_COPY.submitMessageSuccess);
    } catch (error) {
      if (!isCurrentAction(actionToken, actionTribeSlug)) {
        return;
      }

      toast.error(
        error instanceof Error ? error.message : TRIBE_ROUND_COPY.submitMessageError
      );
    } finally {
      if (isCurrentAction(actionToken, actionTribeSlug)) {
        setPendingActionId(null);
      }
    }
  };

  const handleCreateReply = async (
    event: FormEvent<HTMLFormElement>,
    messageId: string
  ) => {
    event.preventDefault();
    const content = (replyDrafts[messageId] ?? "").trim();

    if (!content) {
      toast.warning(TRIBE_ROUND_COPY.replyPlaceholder);
      return;
    }

    const actionTribeSlug = tribeSlug;
    const actionToken = currentActionTokenRef.current + 1;
    optimisticReplyCounterRef.current += 1;
    const optimisticReplyId =
      TRIBE_ROUND_OPTIMISTIC.replyIdPrefix +
      String(optimisticReplyCounterRef.current);
    const viewerTribeAuthor = findViewerTribeAuthor(
      messages,
      authenticatedMember.id
    );
    const optimisticReply: TribeRoundReplyResult = {
      author: {
        avatarFallback:
          viewerTribeAuthor?.avatarFallback ?? authenticatedMember.avatarFallback,
        id: authenticatedMember.id,
        image: viewerTribeAuthor?.image ?? authenticatedMember.image,
        name: viewerTribeAuthor?.name ?? authenticatedMember.name,
        role:
          viewerTribeAuthor?.role ??
          (authenticatedMember.role as TribeRoundReplyResult["author"]["role"]),
      },
      content,
      createdAt: new Date().toISOString(),
      id: optimisticReplyId,
    };

    currentActionTokenRef.current = actionToken;
    setPendingActionId(messageId);
    setMessages((currentMessages) =>
      currentMessages.map((message) =>
        message.id === messageId
          ? {
              ...message,
              hasLoadedReplies: message.hasLoadedReplies === false ? false : true,
              replies: [...message.replies, optimisticReply],
            }
          : message
      )
    );
    setReplyLoadStatuses((currentStatuses) => {
      const currentStatus = currentStatuses[messageId];

      if (currentStatus !== TRIBE_ROUND_REPLY_LOAD_STATUS.error) {
        return currentStatuses;
      }

      return {
        ...currentStatuses,
        [messageId]: TRIBE_ROUND_REPLY_LOAD_STATUS.loading,
      };
    });
    setReplyDrafts((currentDrafts) => ({
      ...currentDrafts,
      [messageId]: "",
    }));

    try {
      const response = await submitJsonRequest<CreateReplyResponse>(
        TRIBE_ROUND_ENDPOINT.reply(actionTribeSlug, messageId),
        {
          content,
        }
      );

      if (!isCurrentAction(actionToken, actionTribeSlug)) {
        return;
      }

      if (!response.reply) {
        throw new Error(TRIBE_ROUND_COPY.submitReplyError);
      }

      setMessages((currentMessages) =>
        currentMessages.map((message) =>
          message.id === messageId
            ? replaceMessageReply(
                message,
                optimisticReplyId,
                response.reply as TribeRoundReplyResult
              )
            : message
        )
      );
      toast.success(TRIBE_ROUND_COPY.submitReplySuccess);
    } catch (error) {
      if (!isCurrentAction(actionToken, actionTribeSlug)) {
        return;
      }

      toast.error(
        error instanceof Error
          ? error.message
          : TRIBE_ROUND_COPY.submitReplyError
      );
      setMessages((currentMessages) =>
        currentMessages.map((message) =>
          message.id === messageId
            ? removeMessageReply(message, optimisticReplyId)
            : message
        )
      );
      setReplyDrafts((currentDrafts) => ({
        ...currentDrafts,
        [messageId]: content,
      }));
    } finally {
      if (isCurrentAction(actionToken, actionTribeSlug)) {
        setPendingActionId(null);
      }
    }
  };

  const clearLikeDebounceTimer = (messageId: string) => {
    const timer = likeDebounceTimersRef.current[messageId];

    if (!timer) {
      return;
    }

    clearTimeout(timer);
    delete likeDebounceTimersRef.current[messageId];
  };

  const applyMessageLikeState = (
    messageId: string,
    likedByViewer: boolean,
    likeCount: number
  ) => {
    setMessages((currentMessages) =>
      currentMessages.map((message) =>
        message.id === messageId
          ? {
              ...message,
              likedByViewer,
              likeCount,
            }
          : message
      )
    );
  };

  const flushPendingLikeIntent = async (messageId: string) => {
    clearLikeDebounceTimer(messageId);

    const pendingLikeIntent = pendingLikeIntentsRef.current[messageId];

    if (!pendingLikeIntent) {
      return;
    }

    if (pendingLikeIntent.isRequestInFlight) {
      pendingLikeIntentsRef.current[messageId] = {
        ...pendingLikeIntent,
        shouldFlushAfterRequest: true,
      };
      return;
    }

    if (
      pendingLikeIntent.intendedLikedByViewer ===
      pendingLikeIntent.baselineLikedByViewer
    ) {
      delete pendingLikeIntentsRef.current[messageId];
      return;
    }

    const actionTribeSlug = tribeSlug;

    pendingLikeIntentsRef.current[messageId] = {
      ...pendingLikeIntent,
      isRequestInFlight: true,
      shouldFlushAfterRequest: false,
    };

    try {
      const response = await submitJsonRequest<ToggleLikeResponse>(
        TRIBE_ROUND_ENDPOINT.like(actionTribeSlug, messageId)
      );

      if (currentTribeSlugRef.current !== actionTribeSlug) {
        return;
      }

      if (
        typeof response.likedByViewer !== "boolean" ||
        typeof response.likeCount !== "number"
      ) {
        throw new Error(TRIBE_ROUND_COPY.toggleLikeError);
      }

      const latestPendingLikeIntent = pendingLikeIntentsRef.current[messageId];

      if (!latestPendingLikeIntent) {
        applyMessageLikeState(messageId, response.likedByViewer, response.likeCount);
        return;
      }

      if (latestPendingLikeIntent.intendedLikedByViewer === response.likedByViewer) {
        applyMessageLikeState(messageId, response.likedByViewer, response.likeCount);
        delete pendingLikeIntentsRef.current[messageId];
        return;
      }

      pendingLikeIntentsRef.current[messageId] = {
        baselineLikedByViewer: response.likedByViewer,
        baselineLikeCount: response.likeCount,
        intendedLikedByViewer: latestPendingLikeIntent.intendedLikedByViewer,
        isRequestInFlight: false,
        shouldFlushAfterRequest: latestPendingLikeIntent.shouldFlushAfterRequest,
      };

      applyMessageLikeState(
        messageId,
        latestPendingLikeIntent.intendedLikedByViewer,
        Math.max(
          0,
          response.likeCount +
            (latestPendingLikeIntent.intendedLikedByViewer ? 1 : -1)
        )
      );

      void flushPendingLikeIntent(messageId);
    } catch (error) {
      if (currentTribeSlugRef.current !== actionTribeSlug) {
        return;
      }

      const latestPendingLikeIntent = pendingLikeIntentsRef.current[messageId];

      if (latestPendingLikeIntent) {
        applyMessageLikeState(
          messageId,
          latestPendingLikeIntent.baselineLikedByViewer,
          latestPendingLikeIntent.baselineLikeCount
        );
        delete pendingLikeIntentsRef.current[messageId];
      }

      toast.error(
        error instanceof Error ? error.message : TRIBE_ROUND_COPY.toggleLikeError
      );
    }
  };

  const schedulePendingLikeIntentFlush = (messageId: string) => {
    clearLikeDebounceTimer(messageId);
    likeDebounceTimersRef.current[messageId] = setTimeout(() => {
      void flushPendingLikeIntent(messageId);
    }, TRIBE_ROUND_LIMITS.toggleDebounceMs);
  };

  const handleToggleLike = (messageId: string) => {
    setMessages((currentMessages) =>
      currentMessages.map((message) => {
        if (message.id !== messageId) {
          return message;
        }

        const pendingLikeIntent = pendingLikeIntentsRef.current[messageId];
        const baselineLikedByViewer =
          pendingLikeIntent?.baselineLikedByViewer ?? message.likedByViewer;
        const baselineLikeCount =
          pendingLikeIntent?.baselineLikeCount ?? message.likeCount;
        const intendedLikedByViewer = !message.likedByViewer;
        const optimisticLikeCount = Math.max(
          0,
          message.likeCount + (intendedLikedByViewer ? 1 : -1)
        );

        pendingLikeIntentsRef.current[messageId] = {
          baselineLikedByViewer,
          baselineLikeCount,
          intendedLikedByViewer,
          isRequestInFlight: pendingLikeIntent?.isRequestInFlight ?? false,
          shouldFlushAfterRequest: pendingLikeIntent?.shouldFlushAfterRequest ?? false,
        };

        schedulePendingLikeIntentFlush(messageId);

        return {
          ...message,
          likedByViewer: intendedLikedByViewer,
          likeCount: optimisticLikeCount,
        };
      })
    );
  };

  const clearPinDebounceTimer = (messageId: string) => {
    const timer = pinDebounceTimersRef.current[messageId];

    if (!timer) {
      return;
    }

    clearTimeout(timer);
    delete pinDebounceTimersRef.current[messageId];
  };

  const applyMessagePinState = (
    messageId: string,
    isPinned: boolean,
    pinnedAt: string | null
  ) => {
    setMessages((currentMessages) =>
      sortMessagesByPinnedState(
        currentMessages.map((message) =>
          message.id === messageId
            ? {
                ...message,
                isPinned,
                pinnedAt,
              }
            : message
        )
      )
    );
  };

  const flushPendingPinIntent = async (messageId: string) => {
    clearPinDebounceTimer(messageId);

    const pendingPinIntent = pendingPinIntentsRef.current[messageId];

    if (!pendingPinIntent) {
      return;
    }

    if (pendingPinIntent.isRequestInFlight) {
      pendingPinIntentsRef.current[messageId] = {
        ...pendingPinIntent,
        shouldFlushAfterRequest: true,
      };
      return;
    }

    if (pendingPinIntent.intendedIsPinned === pendingPinIntent.baselineIsPinned) {
      delete pendingPinIntentsRef.current[messageId];
      return;
    }

    const actionTribeSlug = tribeSlug;

    pendingPinIntentsRef.current[messageId] = {
      ...pendingPinIntent,
      isRequestInFlight: true,
      shouldFlushAfterRequest: false,
    };

    try {
      const response = await submitJsonRequest<TogglePinResponse>(
        TRIBE_ROUND_ENDPOINT.pin(actionTribeSlug, messageId)
      );

      if (currentTribeSlugRef.current !== actionTribeSlug) {
        return;
      }

      if (typeof response.isPinned !== "boolean") {
        throw new Error(TRIBE_ROUND_COPY.togglePinError);
      }

      const responsePinnedAt = response.pinnedAt ?? null;
      const latestPendingPinIntent = pendingPinIntentsRef.current[messageId];

      if (!latestPendingPinIntent) {
        applyMessagePinState(messageId, response.isPinned, responsePinnedAt);
        return;
      }

      if (latestPendingPinIntent.intendedIsPinned === response.isPinned) {
        applyMessagePinState(messageId, response.isPinned, responsePinnedAt);
        delete pendingPinIntentsRef.current[messageId];
        toast.success(response.message ?? TRIBE_ROUND_COPY.togglePinError);
        return;
      }

      pendingPinIntentsRef.current[messageId] = {
        baselineIsPinned: response.isPinned,
        baselinePinnedAt: responsePinnedAt,
        intendedIsPinned: latestPendingPinIntent.intendedIsPinned,
        isRequestInFlight: false,
        shouldFlushAfterRequest: latestPendingPinIntent.shouldFlushAfterRequest,
      };

      applyMessagePinState(
        messageId,
        latestPendingPinIntent.intendedIsPinned,
        getOptimisticPinnedAt(
          latestPendingPinIntent.intendedIsPinned,
          response.isPinned,
          responsePinnedAt
        )
      );

      void flushPendingPinIntent(messageId);
    } catch (error) {
      if (currentTribeSlugRef.current !== actionTribeSlug) {
        return;
      }

      const latestPendingPinIntent = pendingPinIntentsRef.current[messageId];

      if (latestPendingPinIntent) {
        applyMessagePinState(
          messageId,
          latestPendingPinIntent.baselineIsPinned,
          latestPendingPinIntent.baselinePinnedAt
        );
        delete pendingPinIntentsRef.current[messageId];
      }

      const errorMessage =
        error instanceof Error ? error.message : TRIBE_ROUND_COPY.togglePinError;

      if (errorMessage === TRIBE_ROUND_COPY.pinLimitReachedMessage) {
        toast.warning(errorMessage);
      } else {
        toast.error(errorMessage);
      }
    }
  };

  const schedulePendingPinIntentFlush = (messageId: string) => {
    clearPinDebounceTimer(messageId);
    pinDebounceTimersRef.current[messageId] = setTimeout(() => {
      void flushPendingPinIntent(messageId);
    }, TRIBE_ROUND_LIMITS.toggleDebounceMs);
  };

  const handleTogglePin = (messageId: string) => {
    setMessages((currentMessages) =>
      sortMessagesByPinnedState(
        currentMessages.map((message) => {
          if (message.id !== messageId) {
            return message;
          }

          const pendingPinIntent = pendingPinIntentsRef.current[messageId];
          const baselineIsPinned =
            pendingPinIntent?.baselineIsPinned ?? Boolean(message.isPinned);
          const baselinePinnedAt =
            pendingPinIntent?.baselinePinnedAt ?? message.pinnedAt ?? null;
          const intendedIsPinned = !message.isPinned;
          const optimisticPinnedAt = getOptimisticPinnedAt(
            intendedIsPinned,
            baselineIsPinned,
            baselinePinnedAt
          );

          pendingPinIntentsRef.current[messageId] = {
            baselineIsPinned,
            baselinePinnedAt,
            intendedIsPinned,
            isRequestInFlight: pendingPinIntent?.isRequestInFlight ?? false,
            shouldFlushAfterRequest:
              pendingPinIntent?.shouldFlushAfterRequest ?? false,
          };

          schedulePendingPinIntentFlush(messageId);

          return {
            ...message,
            isPinned: intendedIsPinned,
            pinnedAt: optimisticPinnedAt,
          };
        })
      )
    );
  };

  const updateMessagePoll = (
    messageId: string,
    poll: TribeRoundMessageResult["poll"] | null
  ) => {
    setMessages((currentMessages) =>
      currentMessages.map((message) =>
        message.id === messageId
          ? {
              ...message,
              poll,
            }
          : message
      )
    );
  };

  const getOptimisticPollVote = (
    poll: NonNullable<TribeRoundMessageResult["poll"]>,
    optionIds: string[]
  ): NonNullable<TribeRoundMessageResult["poll"]> => {
    const baselineOptionIds = getPersistedPollSelection(poll);
    const optimisticOptions = poll.options.map((option) => {
      const wasSelected = baselineOptionIds.includes(option.id);
      const isSelected = optionIds.includes(option.id);
      const optimisticVoteCount = Math.max(
        0,
        option.voteCount + (isSelected ? 1 : 0) - (wasSelected ? 1 : 0)
      );

      return {
        ...option,
        percentage: 0,
        selectedByViewer: isSelected,
        voteCount: optimisticVoteCount,
      };
    });
    const optimisticTotalVoteCount = Math.max(
      0,
      poll.totalVoteCount + optionIds.length - baselineOptionIds.length
    );

    return {
      ...poll,
      options: optimisticOptions.map((option) => ({
        ...option,
        percentage:
          optimisticTotalVoteCount > 0
            ? Math.round(
                (option.voteCount / optimisticTotalVoteCount) *
                  TRIBE_ROUND_POLL.percentageBase
              )
            : 0,
      })),
      totalVoteCount: optimisticTotalVoteCount,
      viewerHasVoted: optionIds.length > 0 || poll.viewerHasVoted,
    };
  };

  const arePollOptionIdsEqual = (
    firstOptionIds: string[],
    secondOptionIds: string[]
  ) => (
    firstOptionIds.length === secondOptionIds.length &&
    firstOptionIds.every((optionId) => secondOptionIds.includes(optionId))
  );

  const clearPollVoteDebounceTimer = (messageId: string) => {
    const timer = pollVoteDebounceTimersRef.current[messageId];

    if (!timer) {
      return;
    }

    clearTimeout(timer);
    delete pollVoteDebounceTimersRef.current[messageId];
  };

  const flushPendingPollVoteIntent = async (messageId: string) => {
    clearPollVoteDebounceTimer(messageId);

    const pendingPollVoteIntent = pendingPollVoteIntentsRef.current[messageId];

    if (!pendingPollVoteIntent) {
      return;
    }

    if (pendingPollVoteIntent.isRequestInFlight) {
      pendingPollVoteIntentsRef.current[messageId] = {
        ...pendingPollVoteIntent,
        shouldFlushAfterRequest: true,
      };
      return;
    }

    const baselineOptionIds = getPersistedPollSelection(
      pendingPollVoteIntent.baselinePoll
    );

    if (
      arePollOptionIdsEqual(
        pendingPollVoteIntent.intendedOptionIds,
        baselineOptionIds
      )
    ) {
      delete pendingPollVoteIntentsRef.current[messageId];
      return;
    }

    if (pendingPollVoteIntent.intendedOptionIds.length === 0) {
      updateMessagePoll(messageId, pendingPollVoteIntent.baselinePoll);
      setSelectedPollOptionIds((currentSelections) => ({
        ...currentSelections,
        [messageId]: baselineOptionIds,
      }));
      delete pendingPollVoteIntentsRef.current[messageId];
      toast.warning(TRIBE_ROUND_COPY.pollSubmitButton);
      return;
    }

    const actionTribeSlug = tribeSlug;

    pendingPollVoteIntentsRef.current[messageId] = {
      ...pendingPollVoteIntent,
      isRequestInFlight: true,
      shouldFlushAfterRequest: false,
    };

    try {
      const response = await submitJsonRequest<MessagePollResponse>(
        TRIBE_ROUND_ENDPOINT.pollVotes(actionTribeSlug, messageId),
        { optionIds: pendingPollVoteIntent.intendedOptionIds }
      );

      if (currentTribeSlugRef.current !== actionTribeSlug) {
        return;
      }

      if (!response.poll) {
        throw new Error(TRIBE_ROUND_COPY.pollSubmitError);
      }

      const latestPendingPollVoteIntent =
        pendingPollVoteIntentsRef.current[messageId];

      if (!latestPendingPollVoteIntent) {
        updateMessagePoll(messageId, response.poll);
        return;
      }

      const responseOptionIds = getPersistedPollSelection(response.poll);

      if (
        arePollOptionIdsEqual(
          latestPendingPollVoteIntent.intendedOptionIds,
          responseOptionIds
        )
      ) {
        updateMessagePoll(messageId, response.poll);
        setSelectedPollOptionIds((currentSelections) => ({
          ...currentSelections,
          [messageId]: responseOptionIds,
        }));
        delete pendingPollVoteIntentsRef.current[messageId];
        return;
      }

      pendingPollVoteIntentsRef.current[messageId] = {
        baselinePoll: response.poll,
        intendedOptionIds: latestPendingPollVoteIntent.intendedOptionIds,
        isRequestInFlight: false,
        shouldFlushAfterRequest:
          latestPendingPollVoteIntent.shouldFlushAfterRequest,
      };

      updateMessagePoll(
        messageId,
        getOptimisticPollVote(
          response.poll,
          latestPendingPollVoteIntent.intendedOptionIds
        )
      );

      void flushPendingPollVoteIntent(messageId);
    } catch (error) {
      if (currentTribeSlugRef.current !== actionTribeSlug) {
        return;
      }

      const latestPendingPollVoteIntent =
        pendingPollVoteIntentsRef.current[messageId];

      if (latestPendingPollVoteIntent) {
        updateMessagePoll(messageId, latestPendingPollVoteIntent.baselinePoll);
        setSelectedPollOptionIds((currentSelections) => ({
          ...currentSelections,
          [messageId]: getPersistedPollSelection(
            latestPendingPollVoteIntent.baselinePoll
          ),
        }));
        delete pendingPollVoteIntentsRef.current[messageId];
      }

      toast.error(
        error instanceof Error ? error.message : TRIBE_ROUND_COPY.pollSubmitError
      );
    }
  };

  const schedulePendingPollVoteIntentFlush = (messageId: string) => {
    clearPollVoteDebounceTimer(messageId);
    pollVoteDebounceTimersRef.current[messageId] = setTimeout(() => {
      void flushPendingPollVoteIntent(messageId);
    }, TRIBE_ROUND_LIMITS.toggleDebounceMs);
  };

  const handlePollOptionSelection = ({
    message,
    optionId,
  }: {
    message: TribeRoundMessageResult;
    optionId: string;
  }) => {
    const poll = message.poll;

    if (!poll || !round.viewerPermissions.canReact) {
      return;
    }

    const pendingPollVoteIntent = pendingPollVoteIntentsRef.current[message.id];
    const baselinePoll = pendingPollVoteIntent?.baselinePoll ?? poll;
    const currentOptionIds =
      selectedPollOptionIds[message.id] ?? getPersistedPollSelection(poll);
    const intendedOptionIds = poll.allowMultipleVotes
      ? currentOptionIds.includes(optionId)
        ? currentOptionIds.filter((currentOptionId) => currentOptionId !== optionId)
        : [...currentOptionIds, optionId]
      : [optionId];

    setSelectedPollOptionIds((currentSelections) => ({
      ...currentSelections,
      [message.id]: intendedOptionIds,
    }));
    pendingPollVoteIntentsRef.current[message.id] = {
      baselinePoll,
      intendedOptionIds,
      isRequestInFlight: pendingPollVoteIntent?.isRequestInFlight ?? false,
      shouldFlushAfterRequest:
        pendingPollVoteIntent?.shouldFlushAfterRequest ?? false,
    };
    updateMessagePoll(message.id, getOptimisticPollVote(poll, intendedOptionIds));
    schedulePendingPollVoteIntentFlush(message.id);
  };


  const openEditCreatedAtDialog = (message: TribeRoundMessageResult) => {
    setEditingCreatedAtMessageId(message.id);
    setEditingCreatedAtValue(toDateTimeLocalInputValue(message.createdAt));
  };

  const closeEditCreatedAtDialog = () => {
    setEditingCreatedAtMessageId(null);
    setEditingCreatedAtValue("");
  };

  const handleEditCreatedAtOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      closeEditCreatedAtDialog();
    }
  };

  const handleSubmitCreatedAt = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!editingCreatedAtMessageId) {
      return;
    }

    const parsedDate = parseDateTimeLocalInputValue(editingCreatedAtValue);

    if (!parsedDate) {
      toast.warning(TRIBE_ROUND_COPY.messageEditCreatedAtInvalid);
      return;
    }

    const messageId = editingCreatedAtMessageId;
    const originalCreatedAt =
      messages.find((message) => message.id === messageId)?.createdAt ?? "";
    const nextCreatedAt =
      originalCreatedAt &&
      editingCreatedAtValue === toDateTimeLocalInputValue(originalCreatedAt)
        ? originalCreatedAt
        : parsedDate.toISOString();

    setPendingActionId(messageId);

    try {
      const response = await submitJsonRequest<UpdateCreatedAtResponse>(
        TRIBE_ROUND_ENDPOINT.createdAt(tribeSlug, messageId),
        { createdAt: nextCreatedAt },
        undefined,
        TRIBE_ROUND_FORM.patchMethod
      );

      const appliedCreatedAt =
        typeof response.createdAt === "string" ? response.createdAt : nextCreatedAt;

      setMessages((currentMessages) =>
        sortMessagesByPinnedState(
          currentMessages.map((message) =>
            message.id === messageId
              ? { ...message, createdAt: appliedCreatedAt }
              : message
          )
        )
      );
      // A timestamp move can cross page boundaries, so refresh the server view after the local update.
      router.refresh();
      toast.success(response.message ?? TRIBE_ROUND_COPY.messageEditCreatedAtSuccess);
      closeEditCreatedAtDialog();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : TRIBE_ROUND_COPY.messageEditCreatedAtError
      );
    } finally {
      setPendingActionId(null);
    }
  };

  const handleDeleteMessage = async (message: TribeRoundMessageResult) => {
    setPendingActionId(message.id);

    try {
      const response = await submitJsonRequest<ApiErrorResponse>(
        TRIBE_ROUND_ENDPOINT.messageItem(tribeSlug, message.id),
        undefined,
        undefined,
        TRIBE_ROUND_FORM.deleteMethod
      );

      setMessages((currentMessages) =>
        currentMessages.filter((currentMessage) => currentMessage.id !== message.id)
      );
      if (selectedMessageId === message.id) {
        setIsMessageDetailsOpen(false);
        setSelectedMessageId(null);
      }
      toast.success(response.message ?? TRIBE_ROUND_COPY.messageDeleteSuccess);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : TRIBE_ROUND_COPY.messageDeleteError
      );
    } finally {
      setPendingActionId(null);
    }
  };

  const openMessageDetails = (messageId: string) => {
    setExpandedMessageIds((currentExpandedMessageIds) => ({
      ...currentExpandedMessageIds,
      [messageId]: false,
    }));
    setSelectedMessageId(messageId);
    setIsMessageDetailsOpen(true);
  };

  const retryLoadingReplies = (messageId: string) => {
    setReplyLoadStatuses((currentStatuses) => ({
      ...currentStatuses,
      [messageId]: TRIBE_ROUND_REPLY_LOAD_STATUS.loading,
    }));
    setMessages((currentMessages) =>
      currentMessages.map((message) =>
        message.id === messageId
          ? {
              ...message,
              hasLoadedReplies: false,
            }
          : message
      )
    );
  };

  const stopMessageDetailsOpening = (event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();
  };

  const toggleMessageContentExpansion = (messageId: string) => {
    setExpandedMessageIds((currentExpandedMessageIds) => ({
      ...currentExpandedMessageIds,
      [messageId]: !currentExpandedMessageIds[messageId],
    }));
  };

  const renderMessageContentToggle = (message: TribeRoundMessageResult) => {
    const isExpanded = Boolean(expandedMessageIds[message.id]);
    const isExpandable = isLongMessageContent(message.content);

    return isExpandable ? (
      <button
        aria-expanded={isExpanded}
        className={styles.TribeRound__contentToggle}
        onClick={() => {
          toggleMessageContentExpansion(message.id);
        }}
        type={TRIBE_ROUND_FORM.buttonType}
      >
        {isExpanded
          ? TRIBE_ROUND_COPY.messageContentShowLess
          : TRIBE_ROUND_COPY.messageContentShowMore}
      </button>
    ) : null;
  };

  const renderMessageContent = (
    message: TribeRoundMessageResult,
    contentClassName = "",
    isContentAlwaysCollapsed = false,
    previewClassName: TribeRoundContentPreviewClass =
      TRIBE_ROUND_CONTENT_PREVIEW_CLASS.details
  ) => {
    const isExpanded =
      !isContentAlwaysCollapsed && Boolean(expandedMessageIds[message.id]);
    const isExpandable = isLongMessageContent(message.content);
    const contentClassNames = [
      styles.TribeRound__content,
      ...(isExpandable && !isExpanded
        ? [
            styles["TribeRound__content--collapsed"],
            styles[previewClassName],
          ]
        : []),
      contentClassName,
    ]
      .filter(Boolean)
      .join(TRIBE_ROUND_FORMAT.standardSpace);

    return (
      <p
        className={contentClassNames}
        {...{
          [TRIBE_ROUND_ATTRIBUTES.contentExpandedDataAttribute]:
            String(isExpanded),
        }}
      >
        {message.content}
      </p>
    );
  };

  const renderMessagePoll = (
    message: TribeRoundMessageResult,
    shouldStopDetailsOpening = false
  ) => {
    const poll = message.poll;

    if (!poll) {
      return null;
    }

    if (shouldStopDetailsOpening) {
      return (
        <section
          aria-label={poll.question}
          className={styles.TribeRound__pollSummary}
        >
          <span className={styles.TribeRound__pollSummaryBadge}>
            {TRIBE_ROUND_COPY.pollSummaryLabel}
          </span>
          <span className={styles.TribeRound__pollSummaryText}>
            {formatPollSummaryVoteCount(poll.totalVoteCount)}
          </span>
        </section>
      );
    }

    const selectedOptionIds =
      selectedPollOptionIds[message.id] ?? getPersistedPollSelection(poll);
    const shouldShowResults = poll.viewerHasVoted;
    const canVote = round.viewerPermissions.canReact;

    return (
      <section
        aria-label={poll.question}
        className={styles.TribeRound__poll}
        onClick={(event) => {
          if (shouldStopDetailsOpening) {
            stopMessageDetailsOpening(event);
          }
        }}
      >
        <div className={styles.TribeRound__pollHeader}>
          <div className={styles.TribeRound__pollHeading}>
            <p className={styles.TribeRound__pollQuestion}>{poll.question}</p>
            <span className={styles.TribeRound__pollMode}>
              {poll.allowMultipleVotes
                ? TRIBE_ROUND_COPY.pollToggleMultipleVotesLabel
                : TRIBE_ROUND_COPY.pollSubmitButton}
            </span>
          </div>
        </div>
        <div className={styles.TribeRound__pollOptions}>
          {poll.options.map((option) => {
            const isSelected = selectedOptionIds.includes(option.id);

            return (
              <label
                className={styles.TribeRound__pollOption}
                key={option.id}
              >
                <input
                  checked={isSelected}
                  disabled={!canVote}
                  name={TRIBE_ROUND_ROUTE.pollSegment + poll.id}
                  onChange={() => {
                    handlePollOptionSelection({
                      message,
                      optionId: option.id,
                    });
                  }}
                  type={
                    poll.allowMultipleVotes
                      ? TRIBE_ROUND_POLL.multipleInputType
                      : TRIBE_ROUND_POLL.singleInputType
                  }
                />
                <span className={styles.TribeRound__pollOptionText}>
                  {option.text}
                </span>
                {shouldShowResults ? (
                  <span className={styles.TribeRound__pollResult}>
                    {option.percentage}% · {option.voteCount}
                  </span>
                ) : null}
                {shouldShowResults ? (
                  <span
                    className={styles.TribeRound__pollBar}
                    style={{
                      [TRIBE_ROUND_POLL.percentageStyleProperty]:
                        String(option.percentage) + TRIBE_ROUND_POLL.percentageSuffix,
                    } as CSSProperties}
                  />
                ) : null}
              </label>
            );
          })}
        </div>
        <p className={styles.TribeRound__pollHint}>
          {formatPollVoteCount(poll.totalVoteCount)}
        </p>
      </section>
    );
  };

  const renderMessageVideoBadge = (message: TribeRoundMessageResult) => {
    if (!message.video) {
      return null;
    }

    return (
      <span className={styles.TribeRound__videoAttachedBadge}>
        <VideoIcon />
        {TRIBE_ROUND_COPY.videoAttachedBadge}
      </span>
    );
  };

  const renderMessageVideoEmbed = (message: TribeRoundMessageResult) => {
    if (!message.video) {
      return null;
    }

    const embedSource = buildPlayerEmbedSource(
      message.video.provider,
      message.video.externalId
    );

    if (!embedSource) {
      return null;
    }

    return (
      <div className={styles.TribeRound__videoEmbed}>
        <iframe
          allow={PLAYER_IFRAME_ALLOW}
          allowFullScreen
          className={styles.TribeRound__videoEmbedIframe}
          src={embedSource}
          title={`${TRIBE_ROUND_COPY.videoEmbedTitlePrefix}${
            message.title ? `: ${message.title}` : ""
          }`}
        />
      </div>
    );
  };

  const renderMessagePinControl = (
    message: TribeRoundMessageResult,
    shouldStopDetailsOpening = false
  ) => {
    const isPinned = Boolean(message.isPinned);

    if (!round.viewerPermissions.canPinMessages) {
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
        onClick={(event) => {
          if (shouldStopDetailsOpening) {
            stopMessageDetailsOpening(event);
          }

          handleTogglePin(message.id);
        }}
        size={TRIBE_ROUND_FORM.iconSize}
        type={TRIBE_ROUND_FORM.buttonType}
        variant={TRIBE_ROUND_FORM.outlineVariant}
      >
        <PinIcon />
      </Button>
    );
  };

  const renderMessageActionsMenu = (
    message: TribeRoundMessageResult,
    shouldStopDetailsOpening = false
  ) => {
    const canDelete = Boolean(message.permissions?.canDelete);
    const canEditCreatedAt = Boolean(
      round.viewerPermissions.canEditMessageCreatedAt
    );

    if (!canDelete && !canEditCreatedAt) {
      return null;
    }

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={TRIBE_ROUND_COPY.messageMoreActionsAriaLabel}
            className={styles.TribeRound__messageMoreButton}
            onClick={(event) => {
              if (shouldStopDetailsOpening) {
                stopMessageDetailsOpening(event);
              }
            }}
            size={TRIBE_ROUND_FORM.iconSize}
            type={TRIBE_ROUND_FORM.buttonType}
            variant={TRIBE_ROUND_FORM.ghostVariant}
          >
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align={TRIBE_ROUND_ATTRIBUTES.dropdownAlign}
          className={styles.TribeRound__messageMenuContent}
        >
          {canEditCreatedAt ? (
            <DropdownMenuItem
              className={styles.TribeRound__messageMenuItem}
              disabled={isBusy}
              onClick={(event) => {
                if (shouldStopDetailsOpening) {
                  stopMessageDetailsOpening(event);
                }
              }}
              onSelect={() => {
                openEditCreatedAtDialog(message);
              }}
            >
              <CalendarClockIcon />
              {TRIBE_ROUND_COPY.messageEditCreatedAtButton}
            </DropdownMenuItem>
          ) : null}
          {canDelete ? (
            <DropdownMenuItem
              className={styles.TribeRound__messageMenuItem}
              disabled={isBusy}
              onClick={(event) => {
                if (shouldStopDetailsOpening) {
                  stopMessageDetailsOpening(event);
                }
              }}
              onSelect={() => {
                void handleDeleteMessage(message);
              }}
            >
              <TrashIcon />
              {TRIBE_ROUND_COPY.messageDeleteButton}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  return (
    <TooltipProvider>
      <section
        className={styles.TribeRound}
        aria-label={TRIBE_ROUND_COPY.sectionLabel}
      >
      {!round.viewerPermissions.canCreateMessage ? (
        <p className={styles.TribeRound__notice}>
          {TRIBE_ROUND_COPY.mutedNotice}
        </p>
      ) : null}

      {round.viewerPermissions.canCreateMessage ? (
        <Dialog
          open={isMessageComposerOpen}
          onOpenChange={handleMessageComposerOpenChange}
        >
          <DialogTrigger asChild>
            <button
              aria-label={TRIBE_ROUND_COPY.messageComposerCollapsed}
              className={styles.TribeRound__composerTrigger}
              type={TRIBE_ROUND_FORM.buttonType}
            >
              <Avatar
                className={styles.TribeRound__composerAvatar}
                size={TRIBE_ROUND_ATTRIBUTES.composerAvatarSize}
              >
                {authenticatedMember.image ? (
                  <AvatarImage
                    alt={authenticatedMember.name}
                    src={authenticatedMember.image}
                  />
                ) : null}
                <AvatarFallback>{authenticatedMember.avatarFallback}</AvatarFallback>
              </Avatar>
              <span className={styles.TribeRound__composerTriggerText}>
                {TRIBE_ROUND_COPY.messageComposerCollapsed}
              </span>
            </button>
          </DialogTrigger>
          <DialogContent
            className={styles.TribeRound__composerDialog}
            showCloseButton={false}
          >
            <DialogHeader className={styles.TribeRound__composerDialogHeader}>
              <DialogTitle className={styles.TribeRound__composerDialogTitle}>
                {TRIBE_ROUND_COPY.messageComposerDialogTitle}
              </DialogTitle>
              <DialogDescription
                className={styles.TribeRound__composerDialogDescription}
              >
                {TRIBE_ROUND_COPY.messageComposerDescription}
              </DialogDescription>
              <div className={styles.TribeRound__composerIdentity}>
                <Avatar className={styles.TribeRound__composerDialogAvatar}>
                  {authenticatedMember.image ? (
                    <AvatarImage
                      alt={authenticatedMember.name}
                      src={authenticatedMember.image}
                    />
                  ) : null}
                  <AvatarFallback>{authenticatedMember.avatarFallback}</AvatarFallback>
                </Avatar>
                <p className={styles.TribeRound__composerIdentityText}>
                  <strong>{authenticatedMember.name}</strong>{" "}
                  {TRIBE_ROUND_COPY.messageComposerContext}
                </p>
              </div>
            </DialogHeader>
            <form
              className={styles.TribeRound__composer}
              onSubmit={handleCreateMessage}
            >
              <div className={styles.TribeRound__composerBody}>
                <input
                  aria-describedby={
                    hasMessageComposerErrors
                      ? TRIBE_ROUND_ATTRIBUTES.messageComposerErrorId
                      : undefined
                  }
                  aria-label={TRIBE_ROUND_COPY.messageComposerTitleLabel}
                  className={styles.TribeRound__titleInput}
                  disabled={isBusy}
                  onChange={(event) => {
                    setMessageTitle(event.currentTarget.value);
                    setMessageComposerErrors([]);
                  }}
                  placeholder={TRIBE_ROUND_COPY.messageComposerTitlePlaceholder}
                  value={messageTitle}
                />
                <textarea
                  aria-describedby={
                    hasMessageComposerErrors
                      ? TRIBE_ROUND_ATTRIBUTES.messageComposerErrorId
                      : undefined
                  }
                  aria-label={TRIBE_ROUND_COPY.messageComposerLabel}
                  className={styles.TribeRound__textarea}
                  disabled={isBusy}
                  onChange={(event) => {
                    setMessageContent(event.currentTarget.value);
                    setMessageComposerErrors([]);
                  }}
                  placeholder={TRIBE_ROUND_COPY.messagePlaceholder}
                  value={messageContent}
                />
                {isPollComposerEnabled ? (
                  <section className={styles.TribeRound__pollComposer}>
                  <div className={styles.TribeRound__pollComposerHeader}>
                    <label className={styles.TribeRound__pollComposerLabel}>
                      <span>{TRIBE_ROUND_COPY.pollQuestionLabel}</span>
                      <input
                        aria-describedby={
                          hasMessageComposerErrors
                            ? TRIBE_ROUND_ATTRIBUTES.messageComposerErrorId
                            : undefined
                        }
                        className={styles.TribeRound__pollInput}
                        disabled={isBusy}
                        onChange={(event) => {
                          setPollQuestion(event.currentTarget.value);
                          setMessageComposerErrors([]);
                        }}
                        placeholder={TRIBE_ROUND_COPY.pollQuestionPlaceholder}
                        value={pollQuestion}
                      />
                    </label>
                    <Button
                      disabled={isBusy}
                      onClick={() => {
                        setIsPollComposerEnabled(false);
                      }}
                      type={TRIBE_ROUND_FORM.buttonType}
                      variant={TRIBE_ROUND_FORM.ghostVariant}
                      aria-label={TRIBE_ROUND_COPY.pollRemoveButton}
                      className={styles.TribeRound__pollComposerCloseButton}
                    >
                      <XIcon />
                    </Button>
                  </div>
                  <div className={styles.TribeRound__pollComposerOptions}>
                    {pollOptions.map((option, optionIndex) => (
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
                            disabled={isBusy}
                            onChange={(event) => {
                              const nextValue = event.currentTarget.value;

                              setPollOptions((currentOptions) =>
                                currentOptions.map((currentOption, currentIndex) =>
                                  currentIndex === optionIndex
                                    ? nextValue
                                    : currentOption
                                )
                              );
                              setMessageComposerErrors([]);
                            }}
                            placeholder={`${TRIBE_ROUND_COPY.pollOptionPlaceholder} ${
                              optionIndex + 1
                            }`}
                            value={option}
                          />
                          {pollOptions.length > TRIBE_ROUND_POLL.minimumOptionCount ? (
                            <Button
                              aria-label={TRIBE_ROUND_COPY.pollRemoveOptionButton}
                              className={styles.TribeRound__pollOptionRemoveButton}
                              disabled={isBusy}
                              onClick={() => {
                                setPollOptions((currentOptions) =>
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
                      </div>
                    ))}
                  </div>
                  <div className={styles.TribeRound__pollComposerControls}>
                    <Button
                      className={styles.TribeRound__pollAddOptionButton}
                      disabled={isBusy}
                      onClick={() => {
                        setPollOptions((currentOptions) => [
                          ...currentOptions,
                          "",
                        ]);
                      }}
                      type={TRIBE_ROUND_FORM.buttonType}
                      variant={TRIBE_ROUND_FORM.ghostVariant}
                    >
                      <ListPlusIcon />
                      {TRIBE_ROUND_COPY.pollAddOptionButton}
                    </Button>
                    <label className={styles.TribeRound__pollMultipleToggle}>
                      <input
                        checked={pollAllowsMultipleVotes}
                        disabled={isBusy}
                        onChange={(event) => {
                          setPollAllowsMultipleVotes(event.currentTarget.checked);
                        }}
                        type={TRIBE_ROUND_POLL.multipleInputType}
                      />
                      <span>{TRIBE_ROUND_COPY.pollAllowMultipleVotesLabel}</span>
                    </label>
                  </div>
                  </section>
                ) : null}
                {isVideoComposerEnabled ? (
                  <section className={styles.TribeRound__videoComposer}>
                    <div className={styles.TribeRound__videoComposerHeader}>
                      <label className={styles.TribeRound__videoComposerLabel}>
                        <span>{TRIBE_ROUND_COPY.videoComposerHeading}</span>
                        <input
                          aria-describedby={
                            hasMessageComposerErrors
                              ? TRIBE_ROUND_ATTRIBUTES.messageComposerErrorId
                              : undefined
                          }
                          aria-invalid={showVideoParseError}
                          className={styles.TribeRound__videoInput}
                          disabled={isBusy}
                          onChange={(event) => {
                            setVideoUrlInput(event.currentTarget.value);
                            setMessageComposerErrors([]);
                          }}
                          placeholder={TRIBE_ROUND_COPY.videoUrlPlaceholder}
                          type={TRIBE_ROUND_FORM.urlInputType}
                          value={videoUrlInput}
                        />
                      </label>
                      <Button
                        aria-label={TRIBE_ROUND_COPY.videoRemoveButton}
                        className={styles.TribeRound__videoComposerCloseButton}
                        disabled={isBusy}
                        onClick={() => {
                          setIsVideoComposerEnabled(false);
                          setVideoUrlInput("");
                          setMessageComposerErrors([]);
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
                    {showVideoParseError ? (
                      <p className={styles.TribeRound__videoComposerError}>
                        {TRIBE_ROUND_COPY.videoInvalidUrl}
                      </p>
                    ) : null}
                  </section>
                ) : null}
                <div className={styles.TribeRound__composerActions}>
                  {!isPollComposerEnabled ? (
                    <Button
                      aria-label={TRIBE_ROUND_COPY.pollAddButton}
                      className={styles.TribeRound__pollAddButton}
                      disabled={isBusy}
                      onClick={() => {
                        setIsPollComposerEnabled(true);
                      }}
                      size={TRIBE_ROUND_FORM.iconSize}
                      type={TRIBE_ROUND_FORM.buttonType}
                      variant={TRIBE_ROUND_FORM.ghostVariant}
                    >
                      <VoteIcon />
                    </Button>
                  ) : null}
                  {!isVideoComposerEnabled ? (
                    <Button
                      aria-label={TRIBE_ROUND_COPY.videoAddButton}
                      className={styles.TribeRound__videoAddButton}
                      disabled={isBusy}
                      onClick={() => {
                        setIsVideoComposerEnabled(true);
                      }}
                      size={TRIBE_ROUND_FORM.iconSize}
                      type={TRIBE_ROUND_FORM.buttonType}
                      variant={TRIBE_ROUND_FORM.ghostVariant}
                    >
                      <VideoIcon />
                    </Button>
                  ) : null}
                  <div className={styles.TribeRound__channelPicker}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        aria-label={TRIBE_ROUND_COPY.tribeChannelLabel}
                        className={styles.TribeRound__channelTrigger}
                        disabled={isBusy}
                        type={TRIBE_ROUND_FORM.buttonType}
                      >
                        <span>
                          {selectedChannel
                            ? `${selectedChannel.emoji} ${selectedChannel.name}`
                            : TRIBE_ROUND_COPY.tribeChannelSelect}
                        </span>
                        <ChevronDownIcon />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align={TRIBE_ROUND_ATTRIBUTES.dropdownAlign}
                      className={styles.TribeRound__channelMenuContent}
                    >
                      {round.channels.map((channel) => (
                        <DropdownMenuItem
                          className={styles.TribeRound__channelMenuItem}
                          key={channel.id}
                          onSelect={() => {
                            setSelectedChannelId(channel.id);
                            setMessageComposerErrors([]);
                          }}
                        >
                          <span
                            aria-hidden={TRIBE_ROUND_ATTRIBUTES.channelFilterEmojiHidden}
                            className={styles.TribeRound__channelMenuEmoji}
                          >
                            {channel.emoji}
                          </span>
                          <span className={styles.TribeRound__channelMenuText}>
                            {channel.name}
                          </span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  </div>
                </div>
                {hasMessageComposerErrors ? (
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
                      {messageComposerErrors.map((messageComposerError) => (
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
                ) : null}
              </div>
              <DialogFooter className={styles.TribeRound__composerFooter}>
                <DialogClose asChild>
                  <Button
                    disabled={isBusy}
                    type={TRIBE_ROUND_FORM.buttonType}
                    variant={TRIBE_ROUND_FORM.outlineVariant}
                  >
                    {TRIBE_ROUND_COPY.messageCancelButton}
                  </Button>
                </DialogClose>
                <Button
                  disabled={isBusy}
                  type={TRIBE_ROUND_FORM.submitType}
                >
                  <SendIcon />
                  {TRIBE_ROUND_COPY.messageButton}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}

      {round.channels.length > 0 ? (
        <nav
          aria-label={TRIBE_ROUND_COPY.tribeChannelLabel}
          className={styles.TribeRound__channelFilters}
        >
          <Link
            className={`${styles.TribeRound__channelFilter} ${
              !round.activeChannelId ? styles["TribeRound__channelFilter--active"] : ""
            }`}
            href={buildTribeRoundPageHref({
              channelSlug: null,
              page: 1,
              tribeSlug,
            })}
          >
            <span className={styles.TribeRound__channelFilterText}>
              {TRIBE_ROUND_COPY.tribeChannelFilterAll}
            </span>
          </Link>
          {round.channels.map((channel) => (
            <Link
              className={`${styles.TribeRound__channelFilter} ${
                round.activeChannelId === channel.id
                  ? styles["TribeRound__channelFilter--active"]
                  : ""
              }`}
              href={buildTribeRoundPageHref({
                channelSlug: channel.slug,
                page: 1,
                tribeSlug,
              })}
              key={channel.id}
            >
              <span
                aria-hidden={TRIBE_ROUND_ATTRIBUTES.channelFilterEmojiHidden}
                className={styles.TribeRound__channelFilterEmoji}
              >
                {channel.emoji}
              </span>
              <span className={styles.TribeRound__channelFilterText}>
                {channel.name}
              </span>
            </Link>
          ))}
        </nav>
      ) : null}

      {messages.length === 0 ? (
        <div className={styles.TribeRound__empty}>
          <h3 className={styles.TribeRound__emptyTitle}>
            {TRIBE_ROUND_COPY.emptyTitle}
          </h3>
          <p className={styles.TribeRound__emptyDescription}>
            {TRIBE_ROUND_COPY.emptyDescription}
          </p>
        </div>
      ) : (
        <ol className={styles.TribeRound__messageList}>
          {messages.map((message) => (
            <li className={styles.TribeRound__message} key={message.id}>
              <Card
                className={styles.TribeRound__messageCard}
                onClick={() => {
                  openMessageDetails(message.id);
                }}
              >
                <article className={styles.TribeRound__messageArticle}>
                  <div className={styles.TribeRound__messageMeta}>
                    <span className={styles.TribeRound__channelBadge}>
                      {message.channel.emoji} {message.channel.name}
                    </span>
                    {renderMessagePinControl(message, true)}
                    {renderMessageActionsMenu(message, true)}
                  </div>
                  <button
                    aria-label={`${TRIBE_ROUND_COPY.openMessageDetailsAriaLabelPrefix}: ${message.title || message.content}`}
                    className={styles.TribeRound__messageDetailsTrigger}
                    type={TRIBE_ROUND_FORM.buttonType}
                  >
                    <CardHeader className={styles.TribeRound__messageHeader}>
                      {renderRoundAuthorAvatar(
                        message.author,
                        styles.TribeRound__avatar
                      )}
                      <div className={styles.TribeRound__author}>
                        {renderAuthorIdentity(message.author)}
                        {renderMessageCreatedTime(message.createdAt)}
                      </div>
                    </CardHeader>

                    <CardContent className={styles.TribeRound__messageContent}>
                      {message.title ? (
                        <h3 className={styles.TribeRound__messageTitle}>
                          {message.title}
                        </h3>
                      ) : null}
                      {renderMessageContent(
                        message,
                        "",
                        true,
                        TRIBE_ROUND_CONTENT_PREVIEW_CLASS.round
                      )}
                      {renderMessageVideoBadge(message)}
                    </CardContent>
                  </button>
                  {renderMessagePoll(message, true)}

                  <div className={styles.TribeRound__messageActions}>
                    <Button
                      aria-label={`${TRIBE_ROUND_COPY.likeButtonAriaLabel} ${message.likeCount}`}
                      className={getLikeButtonClassName(message.likedByViewer)}
                      disabled={!round.viewerPermissions.canReact}
                      onClick={(event) => {
                        stopMessageDetailsOpening(event);
                        handleToggleLike(message.id);
                      }}
                      type={TRIBE_ROUND_FORM.buttonType}
                      variant={TRIBE_ROUND_FORM.outlineVariant}
                    >
                      <HeartIcon />
                      {message.likeCount}
                    </Button>
                  </div>
              </article>
              </Card>
            </li>
          ))}
        </ol>
      )}
      {visiblePagination.hasPreviousPage || visiblePagination.hasNextPage ? (
        <Pagination className={styles.TribeRound__pagination}>
          <PaginationContent>
            <PaginationItem>
              {visiblePagination.hasPreviousPage ? (
                <PaginationPrevious
                  aria-label={TRIBE_ROUND_PAGINATION_LABEL.previous}
                  href={buildTribeRoundPageHref({
                    channelSlug: activeChannel?.slug ?? null,
                    page: Math.max(1, visiblePagination.currentPage - 1),
                    tribeSlug,
                  })}
                  text={TRIBE_ROUND_PAGINATION_LABEL.previous}
                />
              ) : (
                <Button
                  aria-disabled={TRIBE_ROUND_ATTRIBUTES.trueString}
                  aria-label={TRIBE_ROUND_PAGINATION_LABEL.previous}
                  className={styles.TribeRound__paginationControl}
                  disabled
                  type={TRIBE_ROUND_FORM.buttonType}
                  variant={TRIBE_ROUND_FORM.ghostVariant}
                >
                  <ChevronLeftIcon data-icon={TRIBE_ROUND_ATTRIBUTES.inlineStartIcon} />
                  <span>{TRIBE_ROUND_PAGINATION_LABEL.previous}</span>
                </Button>
              )}
            </PaginationItem>
            <PaginationItem>
              {visiblePagination.hasNextPage ? (
                <PaginationNext
                  aria-label={TRIBE_ROUND_PAGINATION_LABEL.next}
                  href={buildTribeRoundPageHref({
                    channelSlug: activeChannel?.slug ?? null,
                    page: visiblePagination.currentPage + 1,
                    tribeSlug,
                  })}
                  text={TRIBE_ROUND_PAGINATION_LABEL.next}
                />
              ) : (
                <Button
                  aria-disabled={TRIBE_ROUND_ATTRIBUTES.trueString}
                  aria-label={TRIBE_ROUND_PAGINATION_LABEL.next}
                  className={styles.TribeRound__paginationControl}
                  disabled
                  type={TRIBE_ROUND_FORM.buttonType}
                  variant={TRIBE_ROUND_FORM.ghostVariant}
                >
                  <span>{TRIBE_ROUND_PAGINATION_LABEL.next}</span>
                  <ChevronRightIcon data-icon={TRIBE_ROUND_ATTRIBUTES.inlineEndIcon} />
                </Button>
              )}
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      ) : null}
      <Dialog open={isMessageDetailsOpen} onOpenChange={setIsMessageDetailsOpen}>
        <DialogContent className={styles.TribeRound__composerDialog}>
          <DialogHeader className={styles.TribeRound__composerDialogHeader}>
            <DialogTitle
              className={
                TRIBE_ROUND_ATTRIBUTES.messageDetailsTitleHidden
                  ? styles.TribeRound__composerDialogTitle
                  : undefined
              }
            >
              {TRIBE_ROUND_COPY.messageDetailsDialogTitle}
            </DialogTitle>
            <DialogDescription
              className={styles.TribeRound__composerDialogDescription}
            >
              {TRIBE_ROUND_COPY.messageDetailsDialogDescription}
            </DialogDescription>
          </DialogHeader>
          {selectedMessage ? (
            <article
              aria-label={TRIBE_ROUND_COPY.messageDetailsContentLabel}
              className={styles.TribeRound__messageDetailsBody}
              role={TRIBE_ROUND_ATTRIBUTES.regionRole}
            >
              <CardHeader
                className={`${styles.TribeRound__messageHeader} ${styles.TribeRound__messageDetailsHeader}`}
              >
                {renderRoundAuthorAvatar(
                  selectedMessage.author,
                  styles.TribeRound__avatar
                )}
                <div className={styles.TribeRound__author}>
                  {renderAuthorIdentity(selectedMessage.author)}
                  {renderMessageCreatedTime(selectedMessage.createdAt)}
                </div>
                <div className={styles.TribeRound__messageMeta}>
                  <span className={styles.TribeRound__channelBadge}>
                    {selectedMessage.channel.emoji} {selectedMessage.channel.name}
                  </span>
                  {renderMessagePinControl(selectedMessage)}
                  {renderMessageActionsMenu(selectedMessage)}
                </div>
              </CardHeader>
              <CardContent className={styles.TribeRound__messageContent}>
                {selectedMessage.title ? (
                  <h3 className={styles.TribeRound__messageTitle}>
                    {selectedMessage.title}
                  </h3>
                ) : null}
                {renderMessageContent(selectedMessage)}
                {renderMessageContentToggle(selectedMessage)}
                {renderMessageVideoEmbed(selectedMessage)}
                {renderMessagePoll(selectedMessage)}
                <div
                  className={`${styles.TribeRound__messageActions} ${styles["TribeRound__messageActions--dialog"]}`}
                >
                  <Button
                    aria-label={`${TRIBE_ROUND_COPY.likeButtonAriaLabel} ${selectedMessage.likeCount}`}
                    className={getLikeButtonClassName(
                      selectedMessage.likedByViewer
                    )}
                    disabled={!round.viewerPermissions.canReact}
                    onClick={() => {
                      handleToggleLike(selectedMessage.id);
                    }}
                    type={TRIBE_ROUND_FORM.buttonType}
                    variant={TRIBE_ROUND_FORM.outlineVariant}
                  >
                    <HeartIcon />
                    {selectedMessage.likeCount}
                  </Button>
                </div>
              </CardContent>
              <div className={styles.TribeRound__modalReplysSection}>
                <section
                  aria-label={TRIBE_ROUND_COPY.repliesTitle}
                  className={styles.TribeRound__replies}
                >
                  {selectedMessageReplyLoadStatus ===
                  TRIBE_ROUND_REPLY_LOAD_STATUS.loading ? (
                    <p className={styles.TribeRound__replyStatus}>
                      {TRIBE_ROUND_COPY.repliesLoading}
                    </p>
                  ) : null}
                  {selectedMessageReplyLoadStatus ===
                  TRIBE_ROUND_REPLY_LOAD_STATUS.error ? (
                    <div className={styles.TribeRound__replyStatus}>
                      <p className={styles.TribeRound__replyStatusText}>
                        {TRIBE_ROUND_COPY.repliesLoadError}
                      </p>
                      <Button
                        onClick={() => {
                          retryLoadingReplies(selectedMessage.id);
                        }}
                        type={TRIBE_ROUND_FORM.buttonType}
                        variant={TRIBE_ROUND_FORM.outlineVariant}
                      >
                        {TRIBE_ROUND_COPY.repliesRetry}
                      </Button>
                    </div>
                  ) : null}
                  {selectedMessage.replies.length > 0 ? (
                    <ol className={styles.TribeRound__replyList}>
                      {selectedMessage.replies.map((reply) => (
                        <li className={styles.TribeRound__reply} key={reply.id}>
                          {renderRoundAuthorAvatar(
                            reply.author,
                            styles.TribeRound__replyAvatar
                          )}
                          <div className={styles.TribeRound__replyBody}>
                            <p className={styles.TribeRound__replyMeta}>
                              <span>{reply.author.name}</span>
                              {renderAuthorRoleBadge(reply.author.role)}
                            </p>
                            <p className={styles.TribeRound__replyContent}>
                              {reply.content}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  ) : null}
                  {round.viewerPermissions.canReply ? (
                    <form
                      className={styles.TribeRound__replyForm}
                      onSubmit={(event) => {
                        void handleCreateReply(event, selectedMessage.id);
                      }}
                    >
                      <Avatar className={styles.TribeRound__replyComposerAvatar}>
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
                      <div className={styles.TribeRound__replyInputWrapper}>
                        <input
                          aria-label={TRIBE_ROUND_COPY.replyInputLabel}
                          className={styles.TribeRound__replyInput}
                          disabled={
                            isBusy ||
                            selectedMessageReplyLoadStatus ===
                              TRIBE_ROUND_REPLY_LOAD_STATUS.loading
                          }
                          onChange={(event) => {
                            const nextReplyDraft = event.currentTarget.value;

                            setReplyDrafts((currentDrafts) => ({
                              ...currentDrafts,
                              [selectedMessage.id]: nextReplyDraft,
                            }));
                          }}
                          placeholder={TRIBE_ROUND_COPY.replyPlaceholder}
                          value={
                            replyDrafts[selectedMessage.id] ??
                            TRIBE_ROUND_RESET_KEY.empty
                          }
                        />
                        <button
                          aria-label={TRIBE_ROUND_COPY.replySendButtonAriaLabel}
                          className={styles.TribeRound__replySendButton}
                          disabled={
                            isBusy ||
                            selectedMessageReplyLoadStatus ===
                              TRIBE_ROUND_REPLY_LOAD_STATUS.loading ||
                            !(
                              replyDrafts[selectedMessage.id] ??
                              TRIBE_ROUND_RESET_KEY.empty
                            ).trim()
                          }
                          type={TRIBE_ROUND_FORM.submitType}
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
      <Dialog
        open={Boolean(editingCreatedAtMessageId)}
        onOpenChange={handleEditCreatedAtOpenChange}
      >
        <DialogContent className={styles.TribeRound__editCreatedAtDialog}>
          <DialogHeader>
            <DialogTitle>
              {TRIBE_ROUND_COPY.messageEditCreatedAtTitle}
            </DialogTitle>
            <DialogDescription>
              {TRIBE_ROUND_COPY.messageEditCreatedAtDescription}
            </DialogDescription>
          </DialogHeader>
          <form
            className={styles.TribeRound__editCreatedAtForm}
            onSubmit={(event) => {
              void handleSubmitCreatedAt(event);
            }}
          >
            <label className={styles.TribeRound__editCreatedAtLabel}>
              <span className={styles.TribeRound__editCreatedAtLabelText}>
                {TRIBE_ROUND_COPY.messageEditCreatedAtInputLabel}
              </span>
              <input
                className={styles.TribeRound__editCreatedAtInput}
                disabled={isBusy}
                onChange={(event) => {
                  setEditingCreatedAtValue(event.target.value);
                }}
                required
                step={TRIBE_ROUND_FORM.dateTimeLocalStep}
                type={TRIBE_ROUND_FORM.dateTimeLocalInputType}
                value={editingCreatedAtValue}
              />
            </label>
            <DialogFooter>
              <DialogClose asChild>
                <Button
                  disabled={isBusy}
                  type={TRIBE_ROUND_FORM.buttonType}
                  variant={TRIBE_ROUND_FORM.outlineVariant}
                >
                  {TRIBE_ROUND_COPY.messageEditCreatedAtCancel}
                </Button>
              </DialogClose>
              <Button
                disabled={isBusy || !editingCreatedAtValue.trim()}
                type={TRIBE_ROUND_FORM.submitType}
              >
                {TRIBE_ROUND_COPY.messageEditCreatedAtSubmit}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      </section>
    </TooltipProvider>
  );
}

export function TribeRound(props: TribeRoundProps) {
  const resetKey = buildRoundStateResetKey(props.tribeSlug, props.round);

  return <TribeRoundContent key={resetKey} {...props} />;
}
