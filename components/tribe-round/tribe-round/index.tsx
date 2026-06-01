"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  createElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type {
  ClipboardEvent,
  ChangeEvent,
  CSSProperties,
  FormEvent,
  KeyboardEvent,
  MouseEvent,
} from "react";
import {
  CalendarClockIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  HeartIcon,
  ImageIcon,
  ListPlusIcon,
  MessageCircleIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PinIcon,
  TrashIcon,
  SendIcon,
  VideoIcon,
  VoteIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Link } from "@/components/navigation/link";
import { Button } from "@/components/ui/button";
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import { BouncingDotsLoader } from "@/components/loaders/bouncing-dots-loader";
import { BUENOS_AIRES_TIME_ZONE } from "@/src/constants/date-time";
import type { AuthenticatedMemberResult } from "@/src/modules/auth/application/results/authenticated-member-result";
import {
  MESSAGE_POLL_OPTION_TEXT,
  MESSAGE_POLL_OPTIONS,
  MESSAGE_POLL_QUESTION,
  MESSAGE_IMAGES,
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
  platformTribeSegment: "/",
  querySeparator: "?",
  repliesSegment: "/replies",
  likeSegment: "/like",
  pinSegment: "/pin",
  createdAtSegment: "/created-at",
  pollSegment: "/poll",
  pollVotesSegment: "/votes",
  imageUploadsSegment: "/images/uploads",
  imagesSegment: "/images/",
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
  messageImageUploads: (tribeSlug: string) =>
    TRIBE_ROUND_ROUTE.apiTribes +
    tribeSlug +
    TRIBE_ROUND_ROUTE.messagesBaseSegment +
    TRIBE_ROUND_ROUTE.imageUploadsSegment,
  messageImageItem: (tribeSlug: string, assetId: string) =>
    TRIBE_ROUND_ROUTE.apiTribes +
    tribeSlug +
    TRIBE_ROUND_ROUTE.messagesBaseSegment +
    TRIBE_ROUND_ROUTE.imagesSegment +
    assetId,
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
  messageContentShowMore: "Ver más",
  messageDeleteButton: "Eliminar mensaje",
  messageDeleteConfirmCancel: "Cancelar",
  messageDeleteConfirmDescription:
    "Esta acción elimina el mensaje del feed y no se puede deshacer.",
  messageDeleteConfirmSubmit: "Eliminar",
  messageDeleteConfirmTitle: "Eliminar mensaje",
  messageDeleteError: "No pudimos eliminar el mensaje.",
  messageDeleteSuccess: "Mensaje eliminado.",
  messageEditButton: "Editar mensaje",
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
  messageEditDescription:
    "Editá el título y el contenido del mensaje. Los cambios se publican al guardar.",
  messageEditError: "No pudimos actualizar el mensaje.",
  messageEditSubmit: "Guardar",
  messageEditSuccess: "Mensaje actualizado.",
  messageEditTitle: "Editar mensaje",
  messageMoreActionsAriaLabel: "Acciones del mensaje",
  emptyDescription:
    "Todavía no hay mensajes. Las novedades, preguntas y recursos van a aparecer acá.",
  emptyTitle: "Compartí el primer mensaje de la ronda",
  likeButton: "Me gusta",
  likeButtonAriaLabel: "Me gusta",
  commentButtonAriaLabel: "Comentarios",
  commentAuthorsPreviewLabel: "Comentaron",
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
  messageLinkEditAction: "Editar",
  messageLinkEditCancel: "Cancelar",
  messageLinkEditSave: "Guardar",
  messageLinkPopoverUrlLabel: "Link",
  messageLinkPopoverTextLabel: "Texto del link",
  messageLinkRemoveAction: "Remover",
  messageComposerTitleLabel: "Título del mensaje",
  messageComposerTitlePlaceholder: "Título del mensaje",
  messagePlaceholder: "Contá una novedad, hacé una pregunta o compartí un recurso",
  imageAddButton: "Agregar imagen",
  imageAltInputLabel: "Descripción de la imagen",
  imageAltInputPlaceholder: "Descripción breve",
  imageLimitError: "Podés adjuntar hasta 4 imágenes.",
  imageRemoveButton: "Quitar imagen",
  imageUploadError: "No pudimos subir la imagen.",
  imageUploadPendingError: "Esperá a que termine de subir la imagen.",
  imageUploadingLabel: "Subiendo imagen",
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
  destructiveVariant: "destructive",
  fileInputType: "file",
  ghostVariant: "ghost",
  imageAccept: "image/*",
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
  commentAuthorsPreviewCount: 3,
  detailsCollapsedSliceCharacters: 150,
  toggleDebounceMs: 300,
} as const;

const COLLAPSED_CONTENT_PATTERN = {
  trailingWhitespaceBoundary: /\s\S*$/,
  whitespaceRun: /\s+/g,
} as const;

const COLLAPSED_CONTENT_TEXT = {
  ellipsis: "…",
  whitespaceReplacement: " ",
} as const;

const TRIBE_ROUND_OPTIMISTIC = {
  messageIdPrefix: "optimistic-message-",
  messageImageIdPrefix: "optimistic-message-image-",
  pollIdPrefix: "optimistic-poll-",
  pollOptionIdPrefix: "optimistic-poll-option-",
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
  avatarRoleModifierPrefix: "TribeRound__avatar--",
  dateStyle: "medium",
  day: "numeric",
  locale: "es-AR",
  month: "short",
  nonBreakingSpacePattern: /[\u00a0\u202f]/g,
  replyAvatarRoleModifierPrefix: "TribeRound__replyAvatar--",
  standardSpace: " ",
  timeStyle: "short",
  year: "numeric",
} as const;

const MESSAGE_MARKDOWN_ALLOWED_PROTOCOL = {
  http: "http:",
  https: "https:",
} as const;

const MESSAGE_LINK_PROTOCOL_PREFIX = {
  default: "https://",
} as const;

const MESSAGE_MARKDOWN_LINK_FORMAT = {
  closeLabel: "]",
  closeUrl: ")",
  openLabel: "[",
  openUrl: "](",
  suppressedUrl: "#",
} as const;

const MESSAGE_MARKDOWN_ESCAPE_PATTERN = {
  backslash: /\\/g,
  closeLabel: /\]/g,
  lineBreak: /\n/g,
  openLabel: /\[/g,
} as const;

const MESSAGE_MARKDOWN_ESCAPE_VALUE = {
  backslash: "\\",
  escapedBackslash: "\\\\",
  escapedCloseLabel: "\\]",
  escapedLineBreak: "\\n",
  escapedOpenLabel: "\\[",
  lineBreakToken: "n",
} as const;

const MESSAGE_CONTENT_SEGMENT_TYPE = {
  link: "link",
  text: "text",
} as const;

const COMPOSER_LINK_KIND = {
  explicit: "explicit",
  suppressed: "suppressed",
} as const;

const COMPOSER_PREVIEW_LINK_SOURCE = {
  automatic: "automatic",
  explicit: "explicit",
} as const;

const COMPOSER_LINK_POPOVER_MODE = {
  actions: "actions",
  edit: "edit",
} as const;

const MESSAGE_LINK_PATTERN = {
  bareDomain: /^(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}[^\s<>)]*$/,
  bareUrl: /(?:https?:\/\/[^\s<>)]*(?:\([^\s<>()]*\)[^\s<>)]*)*|www\.(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}[^\s<>)]*(?:\([^\s<>()]*\)[^\s<>)]*)*)/g,
  markdown: /\[((?:\\[\s\S]|[^\]\\])+)\]\(((?:[^()\s]+|\([^()\s]*\))+)\)/g,
  protocolPrefix: /^https?:\/\//i,
  trailingPunctuation: /[.,!?;:]+$/,
  whitespace: /^\s+$/,
} as const;

const MESSAGE_MARKDOWN_LINK_MATCH_GROUP = {
  text: 1,
  url: 2,
} as const;

const TEXT_DIFF_FALLBACK_INDEX = {
  notFound: -1,
} as const;

const COMPOSER_PREVIEW_LINK_KEY_SEPARATOR = {
  value: ":",
} as const;

const CLIPBOARD_DATA_TYPE = {
  plainText: "text/plain",
} as const;

const COMPOSER_EDITOR_INPUT_TYPE = {
  deleteContentBackward: "deleteContentBackward",
  deleteContentForward: "deleteContentForward",
  insertLineBreak: "insertLineBreak",
  insertParagraph: "insertParagraph",
  insertText: "insertText",
} as const;

const COMPOSER_EDITOR_KEY = {
  backspace: "Backspace",
  delete: "Delete",
  enter: "Enter",
} as const;

const COMPOSER_EDITOR_WORD_DIRECTION = {
  backward: "backward",
  forward: "forward",
} as const;

const COMPOSER_EDITOR_KEY_LENGTH = {
  character: 1,
} as const;

const COMPOSER_EDITOR_TEXT = {
  lineBreak: "\n",
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

type UpdateMessageContentResponse = {
  content?: string;
  images?: TribeRoundMessageResult["images"];
  message?: string;
  messageId?: string;
  poll?: TribeRoundMessageResult["poll"];
  title?: string;
  video?: TribeRoundMessageResult["video"];
};

type MessageImageUploadResponse = {
  assetId?: string;
  imageId?: string;
  message?: string;
  uploadUrl?: string;
};

const COMPOSER_IMAGE_UPLOAD_STATUS = {
  error: "error",
  uploaded: "uploaded",
  uploading: "uploading",
} as const;

type ComposerImageUploadStatus =
  (typeof COMPOSER_IMAGE_UPLOAD_STATUS)[keyof typeof COMPOSER_IMAGE_UPLOAD_STATUS];

type ComposerImageDraft = {
  altText: string;
  assetId?: string;
  localId: string;
  previewUrl: string;
  status: ComposerImageUploadStatus;
  isPersisted: boolean;
};

type ResetMessageComposerOptions = {
  shouldCleanupTransientImages?: boolean;
  shouldRevokeImagePreviewUrls?: boolean;
};

type MessageContentSegment =
  | {
      text: string;
      type: typeof MESSAGE_CONTENT_SEGMENT_TYPE.text;
    }
  | {
      text: string;
      type: typeof MESSAGE_CONTENT_SEGMENT_TYPE.link;
      url: string;
    };

type ComposerMessageLink =
  | {
      end: number;
      id: string;
      isSynced: boolean;
      kind: typeof COMPOSER_LINK_KIND.explicit;
      start: number;
      url: string;
    }
  | {
      end: number;
      id: string;
      kind: typeof COMPOSER_LINK_KIND.suppressed;
      start: number;
    };

type CreateMessageDraftSnapshot = {
  content: string;
  imageDrafts: ComposerImageDraft[];
  isPollComposerEnabled: boolean;
  isVideoComposerEnabled: boolean;
  messageContent: string;
  messageContentLinks: ComposerMessageLink[];
  pollAllowsMultipleVotes: boolean;
  pollOptions: string[];
  pollQuestion: string;
  selectedChannelId: string;
  title: string;
  videoUrlInput: string;
};

type PendingCreateMessageIntent = {
  baselineMessages: TribeRoundVisibleMessageResult[];
  baselinePagination: TribeRoundResult["pagination"];
  draft: CreateMessageDraftSnapshot;
  optimisticMessageId: string;
};

type TribeRoundVisibleMessageResult = TribeRoundMessageResult & {
  isPending?: boolean;
};

type ComposerPreviewSegment =
  | {
      text: string;
      type: typeof MESSAGE_CONTENT_SEGMENT_TYPE.text;
    }
  | {
      end: number;
      id?: string;
      key: string;
      source:
        | typeof COMPOSER_PREVIEW_LINK_SOURCE.automatic
        | typeof COMPOSER_PREVIEW_LINK_SOURCE.explicit;
      start: number;
      text: string;
      type: typeof MESSAGE_CONTENT_SEGMENT_TYPE.link;
      url: string;
    };

type ActiveComposerPreviewLink = Extract<
  ComposerPreviewSegment,
  { type: typeof MESSAGE_CONTENT_SEGMENT_TYPE.link }
>;

type ComposerTextSelectionRange = {
  end: number;
  start: number;
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
  baseClassName: string,
  roleModifierClassName?: string
) {
  const composedClassName = [baseClassName, roleModifierClassName]
    .filter(Boolean)
    .join(TRIBE_ROUND_FORMAT.standardSpace);

  return (
    <Avatar className={composedClassName}>
      {author.image ? <AvatarImage alt={author.name} src={author.image} /> : null}
      <AvatarFallback>{author.avatarFallback}</AvatarFallback>
    </Avatar>
  );
}

function getAvatarRoleModifierClassName(
  role: TribeRoundReplyResult["author"]["role"]
): string | undefined {
  if (!TRIBE_ROUND_PRIVILEGED_AUTHOR_ROLES.has(role)) {
    return undefined;
  }

  return styles[TRIBE_ROUND_FORMAT.avatarRoleModifierPrefix + role];
}

function getReplyAvatarRoleModifierClassName(
  role: TribeRoundReplyResult["author"]["role"]
): string | undefined {
  if (!TRIBE_ROUND_PRIVILEGED_AUTHOR_ROLES.has(role)) {
    return undefined;
  }

  return styles[TRIBE_ROUND_FORMAT.replyAvatarRoleModifierPrefix + role];
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

function normalizeMessageMarkdownUrl(
  rawUrl: string | null | undefined
): string | null {
  const trimmedUrl = rawUrl?.trim();

  if (!trimmedUrl) {
    return null;
  }

  const candidateUrl = MESSAGE_LINK_PATTERN.protocolPrefix.test(trimmedUrl)
    ? trimmedUrl
    : MESSAGE_LINK_PATTERN.bareDomain.test(trimmedUrl)
      ? MESSAGE_LINK_PROTOCOL_PREFIX.default + trimmedUrl
      : null;

  if (!candidateUrl) {
    return null;
  }

  try {
    const url = new URL(candidateUrl);

    if (
      url.protocol !== MESSAGE_MARKDOWN_ALLOWED_PROTOCOL.http &&
      url.protocol !== MESSAGE_MARKDOWN_ALLOWED_PROTOCOL.https
    ) {
      return null;
    }

    return candidateUrl;
  } catch {
    return null;
  }
}

function removeMessageLinkProtocolPrefix(value: string): string {
  return value.trim().replace(MESSAGE_LINK_PATTERN.protocolPrefix, "");
}

function isMessageLinkSynchronized(text: string, url: string): boolean {
  return (
    removeMessageLinkProtocolPrefix(text) === removeMessageLinkProtocolPrefix(url)
  );
}

function getMessageLinkProtocolPrefix(url: string): string {
  const protocolPrefix = url.match(MESSAGE_LINK_PATTERN.protocolPrefix)?.[0];

  return protocolPrefix ?? MESSAGE_LINK_PROTOCOL_PREFIX.default;
}

function getSynchronizedMessageLinkUrl(
  text: string,
  currentUrl: string
): string | null {
  const trimmedText = text.trim();

  if (!trimmedText) {
    return null;
  }

  return normalizeMessageMarkdownUrl(
    MESSAGE_LINK_PATTERN.protocolPrefix.test(trimmedText)
      ? trimmedText
      : getMessageLinkProtocolPrefix(currentUrl) + trimmedText
  );
}

function isWhitespaceOnly(value: string): boolean {
  return MESSAGE_LINK_PATTERN.whitespace.test(value);
}

function revokeMessageImagePreviewUrl(previewUrl: string): void {
  if (
    previewUrl.startsWith("blob:") &&
    typeof URL.revokeObjectURL === "function"
  ) {
    URL.revokeObjectURL(previewUrl);
  }
}

function revokeMessageImageDraftPreviewUrls(
  imageDrafts: ComposerImageDraft[]
): void {
  imageDrafts.forEach((imageDraft) => {
    revokeMessageImagePreviewUrl(imageDraft.previewUrl);
  });
}

function getWordDeletionRange(input: {
  direction:
    | typeof COMPOSER_EDITOR_WORD_DIRECTION.backward
    | typeof COMPOSER_EDITOR_WORD_DIRECTION.forward;
  selectionRange: ComposerTextSelectionRange;
  text: string;
}): ComposerTextSelectionRange {
  if (input.selectionRange.start !== input.selectionRange.end) {
    return input.selectionRange;
  }

  if (input.direction === COMPOSER_EDITOR_WORD_DIRECTION.forward) {
    let end = input.selectionRange.end;

    while (end < input.text.length && isWhitespaceOnly(input.text[end])) {
      end += 1;
    }

    while (end < input.text.length && !isWhitespaceOnly(input.text[end])) {
      end += 1;
    }

    return {
      end,
      start: input.selectionRange.start,
    };
  }

  let start = input.selectionRange.start;

  while (start > 0 && isWhitespaceOnly(input.text[start - 1])) {
    start -= 1;
  }

  while (start > 0 && !isWhitespaceOnly(input.text[start - 1])) {
    start -= 1;
  }

  return {
    end: input.selectionRange.end,
    start,
  };
}

function buildMarkdownLinkFromSelection(text: string, url: string): string {
  return (
    MESSAGE_MARKDOWN_LINK_FORMAT.openLabel +
    escapeMessageMarkdownLinkText(text) +
    MESSAGE_MARKDOWN_LINK_FORMAT.openUrl +
    url +
    MESSAGE_MARKDOWN_LINK_FORMAT.closeUrl
  );
}

function escapeMessageMarkdownLinkText(text: string): string {
  return text
    .replace(
      MESSAGE_MARKDOWN_ESCAPE_PATTERN.backslash,
      MESSAGE_MARKDOWN_ESCAPE_VALUE.escapedBackslash
    )
    .replace(
      MESSAGE_MARKDOWN_ESCAPE_PATTERN.lineBreak,
      MESSAGE_MARKDOWN_ESCAPE_VALUE.escapedLineBreak
    )
    .replace(
      MESSAGE_MARKDOWN_ESCAPE_PATTERN.openLabel,
      MESSAGE_MARKDOWN_ESCAPE_VALUE.escapedOpenLabel
    )
    .replace(
      MESSAGE_MARKDOWN_ESCAPE_PATTERN.closeLabel,
      MESSAGE_MARKDOWN_ESCAPE_VALUE.escapedCloseLabel
    );
}

function unescapeMessageMarkdownLinkText(text: string): string {
  let unescapedText = "";

  for (let index = 0; index < text.length; index += 1) {
    const currentCharacter = text[index];
    const nextCharacter = text[index + 1];

    if (
      currentCharacter === MESSAGE_MARKDOWN_ESCAPE_VALUE.backslash &&
      nextCharacter
    ) {
      unescapedText +=
        nextCharacter === MESSAGE_MARKDOWN_ESCAPE_VALUE.lineBreakToken
          ? COMPOSER_EDITOR_TEXT.lineBreak
          : nextCharacter;
      index += 1;
    } else {
      unescapedText += currentCharacter;
    }
  }

  return unescapedText;
}

function buildComposerPreviewLinkKey(segment: {
  id?: string;
  source:
    | typeof COMPOSER_PREVIEW_LINK_SOURCE.automatic
    | typeof COMPOSER_PREVIEW_LINK_SOURCE.explicit;
  start: number;
  url: string;
}): string {
  return [
    segment.source,
    segment.id ?? String(segment.start),
    segment.url,
  ].join(COMPOSER_PREVIEW_LINK_KEY_SEPARATOR.value);
}

function createTextMessageContentSegment(text: string): MessageContentSegment {
  return {
    text,
    type: MESSAGE_CONTENT_SEGMENT_TYPE.text,
  };
}

function createTextComposerPreviewSegment(text: string): ComposerPreviewSegment {
  return {
    text,
    type: MESSAGE_CONTENT_SEGMENT_TYPE.text,
  };
}

function createLinkComposerPreviewSegment(input: {
  end: number;
  id?: string;
  source:
    | typeof COMPOSER_PREVIEW_LINK_SOURCE.automatic
    | typeof COMPOSER_PREVIEW_LINK_SOURCE.explicit;
  start: number;
  text: string;
  url: string;
}): ComposerPreviewSegment {
  return {
    ...input,
    key: buildComposerPreviewLinkKey(input),
    type: MESSAGE_CONTENT_SEGMENT_TYPE.link,
  };
}

function createLinkMessageContentSegment(
  text: string,
  url: string
): MessageContentSegment {
  return {
    text,
    type: MESSAGE_CONTENT_SEGMENT_TYPE.link,
    url,
  };
}

function splitBareUrlMatch(matchedUrl: string): {
  trailingText: string;
  urlText: string;
} {
  const urlText = matchedUrl.replace(
    MESSAGE_LINK_PATTERN.trailingPunctuation,
    ""
  );

  return {
    trailingText: matchedUrl.slice(urlText.length),
    urlText,
  };
}

function rangesOverlap(
  firstRange: { end: number; start: number },
  secondRange: { end: number; start: number }
): boolean {
  return firstRange.start < secondRange.end && secondRange.start < firstRange.end;
}

function isBareUrlMatchInsideEmail(input: {
  content: string;
  matchedIndex: number;
  matchedUrl: string;
}): boolean {
  if (MESSAGE_LINK_PATTERN.protocolPrefix.test(input.matchedUrl)) {
    return false;
  }

  return (
    input.matchedUrl.includes("@") ||
    (input.matchedIndex > 0 && input.content[input.matchedIndex - 1] === "@")
  );
}

function parseBareUrlMessageContentSegments(content: string): MessageContentSegment[] {
  const segments: MessageContentSegment[] = [];
  let currentIndex = 0;

  for (const match of content.matchAll(MESSAGE_LINK_PATTERN.bareUrl)) {
    const matchedUrl = match[0];
    const { trailingText, urlText } = splitBareUrlMatch(matchedUrl);
    const matchedIndex = match.index ?? 0;
    const isEmailDomain = isBareUrlMatchInsideEmail({
      content,
      matchedIndex,
      matchedUrl,
    });
    const safeUrl = normalizeMessageMarkdownUrl(urlText);

    if (matchedIndex > currentIndex) {
      segments.push(
        createTextMessageContentSegment(content.slice(currentIndex, matchedIndex))
      );
    }

    segments.push(
      safeUrl && !isEmailDomain
        ? createLinkMessageContentSegment(urlText, safeUrl)
        : createTextMessageContentSegment(urlText)
    );
    if (trailingText) {
      segments.push(createTextMessageContentSegment(trailingText));
    }
    currentIndex = matchedIndex + matchedUrl.length;
  }

  if (currentIndex < content.length) {
    segments.push(createTextMessageContentSegment(content.slice(currentIndex)));
  }

  return segments;
}

function parseBareUrlComposerPreviewSegments(
  content: string,
  offset: number,
  suppressedLinks: ComposerMessageLink[]
): ComposerPreviewSegment[] {
  const segments: ComposerPreviewSegment[] = [];
  let currentIndex = 0;

  for (const match of content.matchAll(MESSAGE_LINK_PATTERN.bareUrl)) {
    const matchedUrl = match[0];
    const { trailingText, urlText } = splitBareUrlMatch(matchedUrl);
    const matchedIndex = match.index ?? 0;
    const absoluteStart = offset + matchedIndex;
    const absoluteEnd = absoluteStart + urlText.length;
    const isEmailDomain = isBareUrlMatchInsideEmail({
      content,
      matchedIndex,
      matchedUrl,
    });
    const safeUrl = normalizeMessageMarkdownUrl(urlText);
    const isSuppressed = suppressedLinks.some((suppressedLink) =>
      rangesOverlap(suppressedLink, {
        end: absoluteEnd,
        start: absoluteStart,
      })
    );

    if (matchedIndex > currentIndex) {
      segments.push(
        createTextComposerPreviewSegment(content.slice(currentIndex, matchedIndex))
      );
    }

    segments.push(
      safeUrl && !isEmailDomain && !isSuppressed
        ? createLinkComposerPreviewSegment({
            end: absoluteEnd,
            source: COMPOSER_PREVIEW_LINK_SOURCE.automatic,
            start: absoluteStart,
            text: urlText,
            url: safeUrl,
          })
        : createTextComposerPreviewSegment(urlText)
    );
    if (trailingText) {
      segments.push(createTextComposerPreviewSegment(trailingText));
    }
    currentIndex = matchedIndex + matchedUrl.length;
  }

  if (currentIndex < content.length) {
    segments.push(createTextComposerPreviewSegment(content.slice(currentIndex)));
  }

  return segments;
}

function parseComposerPreviewSegments(
  content: string,
  links: ComposerMessageLink[]
): ComposerPreviewSegment[] {
  const segments: ComposerPreviewSegment[] = [];
  const visibleLinks = links
    .filter((link) => link.end > link.start)
    .sort((firstLink, secondLink) => firstLink.start - secondLink.start);
  const suppressedLinks = visibleLinks.filter(
    (link) => link.kind === COMPOSER_LINK_KIND.suppressed
  );
  let currentIndex = 0;

  visibleLinks.forEach((link) => {
    if (link.start < currentIndex) {
      return;
    }

    if (link.start > currentIndex) {
      segments.push(
        ...parseBareUrlComposerPreviewSegments(
          content.slice(currentIndex, link.start),
          currentIndex,
          suppressedLinks
        )
      );
    }

    const text = content.slice(link.start, link.end);

    segments.push(
      link.kind === COMPOSER_LINK_KIND.explicit
        ? createLinkComposerPreviewSegment({
            end: link.end,
            id: link.id,
            source: COMPOSER_PREVIEW_LINK_SOURCE.explicit,
            start: link.start,
            text,
            url: link.url,
          })
        : createTextComposerPreviewSegment(text)
    );
    currentIndex = link.end;
  });

  if (currentIndex < content.length) {
    segments.push(
      ...parseBareUrlComposerPreviewSegments(
        content.slice(currentIndex),
        currentIndex,
        suppressedLinks
      )
    );
  }

  return segments;
}

function parseMessageContentSegments(content: string): MessageContentSegment[] {
  const segments: MessageContentSegment[] = [];
  let currentIndex = 0;

  for (const match of content.matchAll(MESSAGE_LINK_PATTERN.markdown)) {
    const matchedMarkdown = match[0];
    const linkText = unescapeMessageMarkdownLinkText(
      match[MESSAGE_MARKDOWN_LINK_MATCH_GROUP.text] ?? ""
    );
    const linkUrl = match[MESSAGE_MARKDOWN_LINK_MATCH_GROUP.url] ?? "";
    const matchedIndex = match.index ?? 0;
    const safeUrl = normalizeMessageMarkdownUrl(linkUrl);

    if (matchedIndex > currentIndex) {
      segments.push(
        ...parseBareUrlMessageContentSegments(
          content.slice(currentIndex, matchedIndex)
        )
      );
    }

    segments.push(
      safeUrl
        ? createLinkMessageContentSegment(linkText, safeUrl)
        : createTextMessageContentSegment(linkText)
    );
    currentIndex = matchedIndex + matchedMarkdown.length;
  }

  if (currentIndex < content.length) {
    segments.push(...parseBareUrlMessageContentSegments(content.slice(currentIndex)));
  }

  return segments;
}

function deserializeMessageContentForComposer(content: string): {
  content: string;
  links: ComposerMessageLink[];
} {
  const links: ComposerMessageLink[] = [];
  let displayContent = "";
  let currentIndex = 0;

  for (const match of content.matchAll(MESSAGE_LINK_PATTERN.markdown)) {
    const matchedMarkdown = match[0];
    const linkText = unescapeMessageMarkdownLinkText(
      match[MESSAGE_MARKDOWN_LINK_MATCH_GROUP.text] ?? ""
    );
    const linkUrl = match[MESSAGE_MARKDOWN_LINK_MATCH_GROUP.url] ?? "";
    const matchedIndex = match.index ?? 0;
    const safeUrl = normalizeMessageMarkdownUrl(linkUrl);

    displayContent += content.slice(currentIndex, matchedIndex);

    const linkStart = displayContent.length;
    displayContent += linkText;

    if (safeUrl) {
      links.push({
        end: displayContent.length,
        id: crypto.randomUUID(),
        isSynced: isMessageLinkSynchronized(linkText, safeUrl),
        kind: COMPOSER_LINK_KIND.explicit,
        start: linkStart,
        url: safeUrl,
      });
    } else if (
      linkUrl === MESSAGE_MARKDOWN_LINK_FORMAT.suppressedUrl &&
      normalizeMessageMarkdownUrl(linkText)
    ) {
      links.push({
        end: displayContent.length,
        id: crypto.randomUUID(),
        kind: COMPOSER_LINK_KIND.suppressed,
        start: linkStart,
      });
    }

    currentIndex = matchedIndex + matchedMarkdown.length;
  }

  displayContent += content.slice(currentIndex);

  return {
    content: displayContent,
    links,
  };
}

function serializeComposerMessageContent(
  content: string,
  links: ComposerMessageLink[]
): string {
  const persistedLinks = links
    .filter((link) => link.end > link.start)
    .sort((firstLink, secondLink) => firstLink.start - secondLink.start);
  let serializedContent = "";
  let currentIndex = 0;

  persistedLinks.forEach((link) => {
    if (link.start < currentIndex) {
      return;
    }

    serializedContent += content.slice(currentIndex, link.start);
    serializedContent += buildMarkdownLinkFromSelection(
      content.slice(link.start, link.end),
      link.kind === COMPOSER_LINK_KIND.explicit
        ? link.url
        : MESSAGE_MARKDOWN_LINK_FORMAT.suppressedUrl
    );
    currentIndex = link.end;
  });

  return serializedContent + content.slice(currentIndex);
}

function getTextDiff(input: { nextText: string; previousText: string }): {
  delta: number;
  endInNextText: number;
  endInPreviousText: number;
  start: number;
} {
  const minLength = Math.min(input.previousText.length, input.nextText.length);
  let start = 0;

  while (
    start < minLength &&
    input.previousText[start] === input.nextText[start]
  ) {
    start += 1;
  }

  if (
    start === minLength &&
    input.previousText.length === input.nextText.length
  ) {
    return {
      delta: 0,
      endInNextText: start,
      endInPreviousText: start,
      start: TEXT_DIFF_FALLBACK_INDEX.notFound,
    };
  }

  let previousEnd = input.previousText.length;
  let nextEnd = input.nextText.length;

  while (
    previousEnd > start &&
    nextEnd > start &&
    input.previousText[previousEnd - 1] === input.nextText[nextEnd - 1]
  ) {
    previousEnd -= 1;
    nextEnd -= 1;
  }

  return {
    delta: nextEnd - previousEnd,
    endInNextText: nextEnd,
    endInPreviousText: previousEnd,
    start,
  };
}

function getLinksAfterTextChange(input: {
  links: ComposerMessageLink[];
  nextText: string;
  previousText: string;
}): ComposerMessageLink[] {
  const diff = getTextDiff({
    nextText: input.nextText,
    previousText: input.previousText,
  });

  if (diff.start === TEXT_DIFF_FALLBACK_INDEX.notFound) {
    return input.links;
  }

  const insertedText = input.nextText.slice(diff.start, diff.endInNextText);
  const deletedText = input.previousText.slice(diff.start, diff.endInPreviousText);

  return input.links
    .map((link) => {
      if (diff.endInPreviousText <= link.start) {
        return {
          ...link,
          end: link.end + diff.delta,
          start: link.start + diff.delta,
        };
      }

      if (diff.start > link.end) {
        return link;
      }

      if (diff.start === link.end && isWhitespaceOnly(insertedText)) {
        return link;
      }

      if (diff.start === link.end && isWhitespaceOnly(deletedText)) {
        return link;
      }

      return {
        ...link,
        end: Math.max(link.start, link.end + diff.delta),
      };
    })
    .filter((link) => link.end > link.start)
    .map((link) => {
      if (link.kind !== COMPOSER_LINK_KIND.explicit) {
        return link;
      }

      const linkText = input.nextText.slice(link.start, link.end);
      const isSynced =
        link.isSynced || isMessageLinkSynchronized(linkText, link.url);
      const syncedUrl = isSynced
        ? getSynchronizedMessageLinkUrl(linkText, link.url)
        : null;

      return {
        ...link,
        isSynced: Boolean(syncedUrl),
        url: syncedUrl ?? link.url,
      };
    });
}

function getEditorBoundaryOffset(
  editor: HTMLDivElement,
  container: Node,
  offset: number
): number | null {
  const boundaryRange = document.createRange();

  boundaryRange.selectNodeContents(editor);

  try {
    boundaryRange.setEnd(container, offset);
  } catch {
    return null;
  }

  return boundaryRange.toString().length;
}

function getEditorSelectionRange(
  editor: HTMLDivElement
): ComposerTextSelectionRange | null {
  const selection = window.getSelection();

  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  const anchorNode = selection.anchorNode;
  const focusNode = selection.focusNode;

  if (!anchorNode || !focusNode) {
    return null;
  }

  if (!editor.contains(anchorNode) || !editor.contains(focusNode)) {
    return null;
  }

  const anchorOffset = getEditorBoundaryOffset(
    editor,
    anchorNode,
    selection.anchorOffset
  );
  const focusOffset = getEditorBoundaryOffset(
    editor,
    focusNode,
    selection.focusOffset
  );

  if (anchorOffset === null || focusOffset === null) {
    return null;
  }

  return {
    end: Math.max(anchorOffset, focusOffset),
    start: Math.min(anchorOffset, focusOffset),
  };
}

function getEditorTextBoundary(
  editor: HTMLDivElement,
  targetOffset: number
): { node: Node; offset: number } {
  const textNodeWalker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let remainingOffset = targetOffset;
  let currentNode = textNodeWalker.nextNode();

  while (currentNode) {
    const currentTextLength = currentNode.textContent?.length ?? 0;

    if (remainingOffset <= currentTextLength) {
      return {
        node: currentNode,
        offset: remainingOffset,
      };
    }

    remainingOffset -= currentTextLength;
    currentNode = textNodeWalker.nextNode();
  }

  return {
    node: editor,
    offset: editor.childNodes.length,
  };
}

function setEditorSelectionRange(
  editor: HTMLDivElement,
  selectionRange: ComposerTextSelectionRange
) {
  const selection = window.getSelection();

  if (!selection) {
    return;
  }

  const editorRange = document.createRange();
  const startBoundary = getEditorTextBoundary(editor, selectionRange.start);
  const endBoundary = getEditorTextBoundary(editor, selectionRange.end);

  editorRange.setStart(startBoundary.node, startBoundary.offset);
  editorRange.setEnd(endBoundary.node, endBoundary.offset);
  selection.removeAllRanges();
  selection.addRange(editorRange);
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

const EDITABLE_VIDEO_URL_TEMPLATE = {
  loom: "https://www.loom.com/share/",
  vimeo: "https://vimeo.com/",
  vimeoHashQuery: "?h=",
  vimeoHashSeparator: ":",
  wistia: "https://fast.wistia.com/medias/",
  youtube: "https://www.youtube.com/watch?v=",
} as const;

function buildEditableVideoUrl(video: {
  externalId: string;
  provider: string;
}): string {
  if (video.provider === VIDEO_PROVIDER.youtube) {
    return EDITABLE_VIDEO_URL_TEMPLATE.youtube + video.externalId;
  }

  if (video.provider === VIDEO_PROVIDER.vimeo) {
    const [vimeoId, vimeoHash] = video.externalId.split(
      EDITABLE_VIDEO_URL_TEMPLATE.vimeoHashSeparator
    );

    return vimeoHash
      ? EDITABLE_VIDEO_URL_TEMPLATE.vimeo +
          vimeoId +
          EDITABLE_VIDEO_URL_TEMPLATE.vimeoHashQuery +
          vimeoHash
      : EDITABLE_VIDEO_URL_TEMPLATE.vimeo + video.externalId;
  }

  if (video.provider === VIDEO_PROVIDER.wistia) {
    return EDITABLE_VIDEO_URL_TEMPLATE.wistia + video.externalId;
  }

  return EDITABLE_VIDEO_URL_TEMPLATE.loom + video.externalId;
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

/**
 * Flattens whitespace and line breaks in collapsed message content so the CSS
 * line-clamp places the trailing ellipsis at the end of the last visible text
 * line, inline, instead of on a blank line produced by paragraph breaks.
 */
function flattenMessageContentForCollapsedPreview(content: string): string {
  return content
    .replace(
      COLLAPSED_CONTENT_PATTERN.whitespaceRun,
      COLLAPSED_CONTENT_TEXT.whitespaceReplacement
    )
    .trim();
}

/**
 * Truncates message content at a whitespace boundary near the character limit
 * so the inline "Ver más" toggle can sit right after the last visible word
 * without breaking mid-token. Works on raw or flattened content; preserves
 * line breaks inside the kept slice.
 */
function truncateMessageContentForCollapsedPreview(
  content: string,
  characterLimit: number
): string {
  if (content.length <= characterLimit) {
    return content;
  }

  const slicedContent = content.slice(0, characterLimit);
  const trailingWhitespaceMatch =
    slicedContent.match(COLLAPSED_CONTENT_PATTERN.trailingWhitespaceBoundary);
  const wordBoundedContent = trailingWhitespaceMatch
    ? slicedContent.slice(0, trailingWhitespaceMatch.index)
    : slicedContent;

  return wordBoundedContent.trimEnd();
}

function getLikeButtonClassName(likedByViewer: boolean): string {
  return [
    styles.TribeRound__likeButton,
    ...(likedByViewer
      ? [styles["TribeRound__likeButton--active"]]
      : []),
  ].join(TRIBE_ROUND_FORMAT.standardSpace);
}

function getCommentCount(message: TribeRoundMessageResult): number {
  return message.replyCount;
}

function getCommentAuthorsPreviewLabel(
  authors: TribeRoundMessageResult["author"][]
): string {
  return `${TRIBE_ROUND_COPY.commentAuthorsPreviewLabel} ${authors
    .map((author) => author.name)
    .join(", ")}`;
}

function getRecentReplyAuthorsPreview(
  replies: TribeRoundReplyResult[]
): TribeRoundMessageResult["author"][] {
  const authors: TribeRoundMessageResult["author"][] = [];
  const authorIds = new Set<string>();

  for (const reply of [...replies].reverse()) {
    if (authorIds.has(reply.author.id)) {
      continue;
    }

    authorIds.add(reply.author.id);
    authors.push(reply.author);

    if (authors.length === TRIBE_ROUND_LIMITS.commentAuthorsPreviewCount) {
      break;
    }
  }

  return authors;
}

function mergeCommentAuthorsPreview(
  preferredAuthors: TribeRoundMessageResult["author"][],
  fallbackAuthors: TribeRoundMessageResult["author"][]
): TribeRoundMessageResult["author"][] {
  const authors: TribeRoundMessageResult["author"][] = [];
  const authorIds = new Set<string>();

  for (const author of [...preferredAuthors, ...fallbackAuthors]) {
    if (authorIds.has(author.id)) {
      continue;
    }

    authorIds.add(author.id);
    authors.push(author);

    if (authors.length === TRIBE_ROUND_LIMITS.commentAuthorsPreviewCount) {
      break;
    }
  }

  return authors;
}

function getCommentAuthorsPreview(
  message: TribeRoundMessageResult
): TribeRoundMessageResult["author"][] {
  if (message.replyCount <= 0) {
    return [];
  }

  if (message.replies.length > 0) {
    const localAuthorsPreview = getRecentReplyAuthorsPreview(message.replies);

    if (message.hasLoadedReplies) {
      return localAuthorsPreview;
    }

    return mergeCommentAuthorsPreview(
      localAuthorsPreview,
      message.replyAuthorsPreview ?? []
    );
  }

  return message.replyAuthorsPreview ?? [];
}

function renderCommentAuthorsPreview(message: TribeRoundMessageResult) {
  const authors = getCommentAuthorsPreview(message);

  if (authors.length === 0) {
    return null;
  }

  return (
    <AvatarGroup
      aria-label={getCommentAuthorsPreviewLabel(authors)}
      className={styles.TribeRound__commentAuthors}
      role="group"
    >
      {authors.map((author) => (
        <Avatar className={styles.TribeRound__commentAuthorAvatar} key={author.id} size="sm">
          {author.image ? (
            <AvatarImage alt={author.name} src={author.image} />
          ) : null}
          <AvatarFallback>{author.avatarFallback}</AvatarFallback>
        </Avatar>
      ))}
    </AvatarGroup>
  );
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

function renderAuthorRoleAccessibleLabel(
  role: TribeRoundReplyResult["author"]["role"]
) {
  if (!TRIBE_ROUND_PRIVILEGED_AUTHOR_ROLES.has(role)) {
    return null;
  }

  return (
    <span className={styles.TribeRound__visuallyHidden}>
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
      {renderAuthorRoleAccessibleLabel(author.role)}
    </div>
  );
}

function renderMessageCreatedTime(
  createdAt: string,
  channel?: TribeRoundMessageResult["channel"]
) {
  return (
    <div className={styles.TribeRound__messageMetaLine}>
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
      {channel ? (
        <>
          <span
            aria-hidden={TRIBE_ROUND_ATTRIBUTES.messageMetaSeparatorHidden}
            className={styles.TribeRound__messageMetaSeparator}
          >
            {TRIBE_ROUND_SYMBOLS.messageMetaSeparator}
          </span>
          <span className={styles.TribeRound__channelInline}>
            {channel.emoji} {channel.name}
          </span>
        </>
      ) : null}
    </div>
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
      replyCount: hasNextReply ? message.replyCount : message.replyCount + 1,
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
  const hasReplyToRemove = message.replies.some((reply) => reply.id === replyId);

  return {
    ...message,
    replyCount: hasReplyToRemove
      ? Math.max(0, message.replyCount - 1)
      : message.replyCount,
    replies: message.replies.filter((reply) => reply.id !== replyId),
  };
}

function sortMessagesByPinnedState<MessageResult extends TribeRoundMessageResult>(
  messages: MessageResult[]
): MessageResult[] {
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
  createdMessage: TribeRoundVisibleMessageResult;
  currentMessages: TribeRoundVisibleMessageResult[];
  pagination: TribeRoundResult["pagination"];
}): TribeRoundVisibleMessageResult[] {
  if (pagination.currentPage !== 1) {
    return currentMessages;
  }

  const sortedMessages = sortMessagesByPinnedState([createdMessage, ...currentMessages]);

  return sortedMessages.slice(0, pagination.pageSize);
}

function getMessagesAfterOptimisticCreationFailure({
  baselineMessages,
  currentMessages,
  optimisticMessageId,
}: {
  baselineMessages: TribeRoundVisibleMessageResult[];
  currentMessages: TribeRoundVisibleMessageResult[];
  optimisticMessageId: string;
}): TribeRoundVisibleMessageResult[] {
  const messagesWithoutOptimistic = currentMessages.filter(
    (message) => message.id !== optimisticMessageId
  );
  const visibleMessageIds = new Set(
    messagesWithoutOptimistic.map((message) => message.id)
  );
  const displacedMessages = baselineMessages.filter(
    (message) => !visibleMessageIds.has(message.id)
  );

  return sortMessagesByPinnedState([
    ...messagesWithoutOptimistic,
    ...displacedMessages,
  ]);
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

function isPendingMessage(message: TribeRoundVisibleMessageResult): boolean {
  return (
    message.isPending === true ||
    message.id.startsWith(TRIBE_ROUND_OPTIMISTIC.messageIdPrefix)
  );
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
  const messageContentEditorRef = useRef<HTMLDivElement | null>(null);
  const pendingComposerSelectionRef =
    useRef<ComposerTextSelectionRange | null>(null);
  const shouldIgnoreNextMessageContentInputRef = useRef(false);
  const [messages, setMessages] =
    useState<TribeRoundVisibleMessageResult[]>(round.messages);
  const [visiblePagination, setVisiblePagination] = useState(round.pagination);
  const [isMessageComposerOpen, setIsMessageComposerOpen] = useState(false);
  const [messageTitle, setMessageTitle] = useState("");
  const [messageContent, setMessageContent] = useState("");
  const [messageContentLinks, setMessageContentLinks] = useState<
    ComposerMessageLink[]
  >([]);
  const [activeComposerLink, setActiveComposerLink] =
    useState<ActiveComposerPreviewLink | null>(null);
  const [composerLinkTextInput, setComposerLinkTextInput] = useState("");
  const [composerLinkUrlInput, setComposerLinkUrlInput] = useState("");
  const [composerLinkPopoverMode, setComposerLinkPopoverMode] = useState<
    (typeof COMPOSER_LINK_POPOVER_MODE)[keyof typeof COMPOSER_LINK_POPOVER_MODE]
  >(COMPOSER_LINK_POPOVER_MODE.actions);
  const [isPollComposerEnabled, setIsPollComposerEnabled] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(
    Array.from({ length: TRIBE_ROUND_POLL.initialOptionCount }, () => "")
  );
  const [pollAllowsMultipleVotes, setPollAllowsMultipleVotes] = useState(false);
  const [isVideoComposerEnabled, setIsVideoComposerEnabled] = useState(false);
  const [videoUrlInput, setVideoUrlInput] = useState("");
  const [messageImageDrafts, setMessageImageDrafts] = useState<
    ComposerImageDraft[]
  >([]);
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
  const [messagePendingDeletion, setMessagePendingDeletion] =
    useState<TribeRoundMessageResult | null>(null);
  const [editingCreatedAtMessageId, setEditingCreatedAtMessageId] = useState<
    string | null
  >(null);
  const [editingCreatedAtValue, setEditingCreatedAtValue] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const isEditingMessage = editingMessageId !== null;
  const discardedMessageImageLocalIdsRef = useRef<Set<string>>(new Set());
  const cleanedMessageImageAssetIdsRef = useRef<Set<string>>(new Set());
  const currentMessageImageDraftsRef = useRef<ComposerImageDraft[]>([]);
  const inFlightMessageImageCleanupAssetIdsRef = useRef<Set<string>>(new Set());
  const persistingMessageImageAssetIdsRef = useRef<Set<string>>(new Set());
  const queuedMessageImageCleanupAssetIdsRef = useRef<Set<string>>(new Set());
  const messageImageCounterRef = useRef(0);
  const optimisticMessageCounterRef = useRef(0);
  const optimisticReplyCounterRef = useRef(0);
  const pendingCreateMessageIntentRef =
    useRef<PendingCreateMessageIntent | null>(null);
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
      (selectedMessage.replyCount > 0 && selectedMessage.hasLoadedReplies === false
        ? TRIBE_ROUND_REPLY_LOAD_STATUS.loading
        : TRIBE_ROUND_REPLY_LOAD_STATUS.loaded)
    : TRIBE_ROUND_REPLY_LOAD_STATUS.loaded;
  const composerEditorSegments = parseComposerPreviewSegments(
    messageContent,
    messageContentLinks
  );
  const hasComposerEditorContent = messageContent.trim().length > 0;
  const deleteMessageImageAsset = useCallback(
    (
      assetId: string,
      actionTribeSlug: string = currentTribeSlugRef.current
    ) => {
      if (cleanedMessageImageAssetIdsRef.current.has(assetId)) {
        return;
      }

      if (inFlightMessageImageCleanupAssetIdsRef.current.has(assetId)) {
        queuedMessageImageCleanupAssetIdsRef.current.add(assetId);
        return;
      }

      inFlightMessageImageCleanupAssetIdsRef.current.add(assetId);
      void (async () => {
        let shouldRetryQueuedCleanup = false;

        do {
          shouldRetryQueuedCleanup = false;

          try {
            await submitJsonRequest(
              TRIBE_ROUND_ENDPOINT.messageImageItem(actionTribeSlug, assetId),
              undefined,
              undefined,
              TRIBE_ROUND_FORM.deleteMethod
            );
            cleanedMessageImageAssetIdsRef.current.add(assetId);
            queuedMessageImageCleanupAssetIdsRef.current.delete(assetId);
          } catch {
            shouldRetryQueuedCleanup =
              queuedMessageImageCleanupAssetIdsRef.current.delete(assetId);
          }
        } while (shouldRetryQueuedCleanup);

        inFlightMessageImageCleanupAssetIdsRef.current.delete(assetId);
      })();
    },
    []
  );

  useEffect(() => {
    currentTribeSlugRef.current = tribeSlug;
  }, [tribeSlug]);

  useEffect(() => {
    currentMessageImageDraftsRef.current = messageImageDrafts;
  }, [messageImageDrafts]);

  useLayoutEffect(() => {
    const editor = messageContentEditorRef.current;
    const selectionRange = pendingComposerSelectionRef.current;

    if (!editor || !selectionRange || !editor.contains(document.activeElement)) {
      return;
    }

    setEditorSelectionRange(editor, selectionRange);
    pendingComposerSelectionRef.current = null;
  }, [messageContent, messageContentLinks]);

  useEffect(() => {
    const discardedMessageImageLocalIds =
      discardedMessageImageLocalIdsRef.current;
    const persistingMessageImageAssetIds =
      persistingMessageImageAssetIdsRef.current;

    return () => {
      const actionTribeSlug = currentTribeSlugRef.current;
      const revokedMessageImagePreviewUrls = new Set<string>();

      currentMessageImageDraftsRef.current
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

      pendingCreateMessageIntentRef.current?.draft.imageDrafts.forEach(
        (imageDraft) => {
          if (!revokedMessageImagePreviewUrls.has(imageDraft.previewUrl)) {
            revokeMessageImagePreviewUrl(imageDraft.previewUrl);
          }
        }
      );
      pendingCreateMessageIntentRef.current = null;

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
  }, [deleteMessageImageAsset]);

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

  const cleanupTransientMessageImageDrafts = (
    imageDrafts: ComposerImageDraft[]
  ) => {
    const persistingMessageImageAssetIds =
      persistingMessageImageAssetIdsRef.current;

    imageDrafts
      .filter(
        (imageDraft) =>
          !imageDraft.isPersisted &&
          (!imageDraft.assetId ||
            !persistingMessageImageAssetIds.has(imageDraft.assetId))
      )
      .forEach((imageDraft) => {
        discardedMessageImageLocalIdsRef.current.add(imageDraft.localId);

        if (imageDraft.assetId) {
          deleteMessageImageAsset(imageDraft.assetId);
        }
      });
  };

  const resetMessageComposer = ({
    shouldCleanupTransientImages = false,
    shouldRevokeImagePreviewUrls = true,
  }: ResetMessageComposerOptions = {}) => {
    if (shouldCleanupTransientImages) {
      cleanupTransientMessageImageDrafts(messageImageDrafts);
    }

    if (shouldRevokeImagePreviewUrls) {
      revokeMessageImageDraftPreviewUrls(messageImageDrafts);
    }
    currentMessageImageDraftsRef.current = [];
    setMessageTitle("");
    setMessageContent("");
    setMessageContentLinks([]);
    setActiveComposerLink(null);
    setComposerLinkTextInput("");
    setComposerLinkUrlInput("");
    setComposerLinkPopoverMode(COMPOSER_LINK_POPOVER_MODE.actions);
    setIsPollComposerEnabled(false);
    setPollQuestion("");
    setPollOptions(
      Array.from({ length: TRIBE_ROUND_POLL.initialOptionCount }, () => "")
    );
    setPollAllowsMultipleVotes(false);
    setIsVideoComposerEnabled(false);
    setVideoUrlInput("");
    setMessageImageDrafts([]);
    setSelectedChannelId("");
    setMessageComposerErrors([]);
    setEditingMessageId(null);
  };

  const detectedVideo = isVideoComposerEnabled
    ? safeParseVideoUrl(videoUrlInput)
    : null;
  const trimmedVideoUrl = videoUrlInput.trim();
  const showVideoParseError =
    isVideoComposerEnabled && trimmedVideoUrl.length > 0 && !detectedVideo;

  const replaceMessageContentText = (
    replacementText: string,
    selectionRange: ComposerTextSelectionRange
  ) => {
    const nextSelectionOffset = selectionRange.start + replacementText.length;
    const nextContent =
      messageContent.slice(0, selectionRange.start) +
      replacementText +
      messageContent.slice(selectionRange.end);

    pendingComposerSelectionRef.current = {
      end: nextSelectionOffset,
      start: nextSelectionOffset,
    };
    handleMessageContentChange(nextContent);
  };

  const handleMessageContentPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const pastedText = event.clipboardData.getData(CLIPBOARD_DATA_TYPE.plainText);
    const pastedUrl = normalizeMessageMarkdownUrl(pastedText);
    const selectionRange = getEditorSelectionRange(event.currentTarget) ?? {
      end: messageContent.length,
      start: messageContent.length,
    };
    const hasSelectedText = selectionRange.start !== selectionRange.end;

    event.preventDefault();

    if (!pastedUrl || !hasSelectedText) {
      replaceMessageContentText(pastedText, selectionRange);

      return;
    }

    pendingComposerSelectionRef.current = selectionRange;
    setMessageContentLinks((currentLinks) => [
      ...currentLinks.filter(
        (link) =>
          !rangesOverlap(link, {
            end: selectionRange.end,
            start: selectionRange.start,
          })
      ),
      {
        end: selectionRange.end,
        id: crypto.randomUUID(),
        isSynced: isMessageLinkSynchronized(
          messageContent.slice(selectionRange.start, selectionRange.end),
          pastedUrl
        ),
        kind: COMPOSER_LINK_KIND.explicit,
        start: selectionRange.start,
        url: pastedUrl,
      },
    ]);
    setMessageComposerErrors([]);
  };

  const handleMessageContentKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.metaKey) {
      return;
    }

    if (
      event.ctrlKey &&
      event.key !== COMPOSER_EDITOR_KEY.backspace &&
      event.key !== COMPOSER_EDITOR_KEY.delete
    ) {
      return;
    }

    const selectionRange = getEditorSelectionRange(event.currentTarget) ?? {
      end: messageContent.length,
      start: messageContent.length,
    };
    let replacementText: string | null = null;
    let replacementRange = selectionRange;

    if (event.key.length === COMPOSER_EDITOR_KEY_LENGTH.character) {
      replacementText = event.key;
    }

    if (event.key === COMPOSER_EDITOR_KEY.enter) {
      replacementText = COMPOSER_EDITOR_TEXT.lineBreak;
    }

    if (event.key === COMPOSER_EDITOR_KEY.backspace) {
      replacementText = TRIBE_ROUND_RESET_KEY.empty;
      replacementRange = event.ctrlKey
        ? getWordDeletionRange({
            direction: COMPOSER_EDITOR_WORD_DIRECTION.backward,
            selectionRange,
            text: messageContent,
          })
        : selectionRange.start === selectionRange.end
          ? {
              end: selectionRange.end,
              start: Math.max(selectionRange.start - 1, 0),
            }
          : selectionRange;
    }

    if (event.key === COMPOSER_EDITOR_KEY.delete) {
      replacementText = TRIBE_ROUND_RESET_KEY.empty;
      replacementRange = event.ctrlKey
        ? getWordDeletionRange({
            direction: COMPOSER_EDITOR_WORD_DIRECTION.forward,
            selectionRange,
            text: messageContent,
          })
        : selectionRange.start === selectionRange.end
          ? {
              end: Math.min(selectionRange.end + 1, messageContent.length),
              start: selectionRange.start,
            }
          : selectionRange;
    }

    if (replacementText === null) {
      return;
    }

    event.preventDefault();
    shouldIgnoreNextMessageContentInputRef.current = true;
    replaceMessageContentText(replacementText, replacementRange);
  };

  const handleMessageContentBeforeInput = (event: FormEvent<HTMLDivElement>) => {
    const nativeEvent = event.nativeEvent as InputEvent;
    const selectionRange = getEditorSelectionRange(event.currentTarget) ?? {
      end: messageContent.length,
      start: messageContent.length,
    };
    let replacementText: string | null = null;
    let replacementRange = selectionRange;

    if (nativeEvent.inputType === COMPOSER_EDITOR_INPUT_TYPE.insertText) {
      replacementText = nativeEvent.data ?? TRIBE_ROUND_RESET_KEY.empty;
    }

    if (
      nativeEvent.inputType === COMPOSER_EDITOR_INPUT_TYPE.insertParagraph ||
      nativeEvent.inputType === COMPOSER_EDITOR_INPUT_TYPE.insertLineBreak
    ) {
      replacementText = COMPOSER_EDITOR_TEXT.lineBreak;
    }

    if (
      nativeEvent.inputType === COMPOSER_EDITOR_INPUT_TYPE.deleteContentBackward
    ) {
      replacementText = TRIBE_ROUND_RESET_KEY.empty;
      replacementRange =
        selectionRange.start === selectionRange.end
          ? {
              end: selectionRange.end,
              start: Math.max(selectionRange.start - 1, 0),
            }
          : selectionRange;
    }

    if (
      nativeEvent.inputType === COMPOSER_EDITOR_INPUT_TYPE.deleteContentForward
    ) {
      replacementText = TRIBE_ROUND_RESET_KEY.empty;
      replacementRange =
        selectionRange.start === selectionRange.end
          ? {
              end: Math.min(selectionRange.end + 1, messageContent.length),
              start: selectionRange.start,
            }
          : selectionRange;
    }

    if (replacementText === null) {
      return;
    }

    event.preventDefault();
    shouldIgnoreNextMessageContentInputRef.current = true;
    replaceMessageContentText(replacementText, replacementRange);
  };

  const handleMessageContentInput = (event: FormEvent<HTMLDivElement>) => {
    if (shouldIgnoreNextMessageContentInputRef.current) {
      shouldIgnoreNextMessageContentInputRef.current = false;

      return;
    }

    const selectionRange = getEditorSelectionRange(event.currentTarget);

    if (selectionRange) {
      pendingComposerSelectionRef.current = selectionRange;
    }

    handleMessageContentChange(event.currentTarget.textContent ?? "");
  };

  const handleMessageContentChange = (nextContent: string) => {
    setMessageContentLinks((currentLinks) =>
      getLinksAfterTextChange({
        links: currentLinks,
        nextText: nextContent,
        previousText: messageContent,
      })
    );
    setMessageContent(nextContent);
    setMessageComposerErrors([]);
  };

  const openComposerLinkPopover = (segment: ActiveComposerPreviewLink) => {
    setActiveComposerLink(segment);
    setComposerLinkTextInput(segment.text);
    setComposerLinkUrlInput(segment.url);
    setComposerLinkPopoverMode(COMPOSER_LINK_POPOVER_MODE.actions);
  };

  const closeComposerLinkPopover = () => {
    setActiveComposerLink(null);
    setComposerLinkTextInput("");
    setComposerLinkUrlInput("");
    setComposerLinkPopoverMode(COMPOSER_LINK_POPOVER_MODE.actions);
  };

  const removeComposerLink = (segment: ActiveComposerPreviewLink) => {
    const shouldSuppressVisibleUrl = Boolean(
      normalizeMessageMarkdownUrl(segment.text)
    );
    const suppressedLink: ComposerMessageLink = {
      end: segment.end,
      id: crypto.randomUUID(),
      kind: COMPOSER_LINK_KIND.suppressed,
      start: segment.start,
    };

    setMessageContentLinks((currentLinks) => {
      const linksWithoutRemovedExplicitLink =
        segment.source === COMPOSER_PREVIEW_LINK_SOURCE.explicit && segment.id
          ? currentLinks.filter((link) => link.id !== segment.id)
          : currentLinks;

      return shouldSuppressVisibleUrl ||
        segment.source === COMPOSER_PREVIEW_LINK_SOURCE.automatic
        ? [...linksWithoutRemovedExplicitLink, suppressedLink]
        : linksWithoutRemovedExplicitLink;
    });

    closeComposerLinkPopover();
  };

  const saveComposerLinkEdit = (segment: ActiveComposerPreviewLink) => {
    const nextUrl = normalizeMessageMarkdownUrl(composerLinkUrlInput);
    const nextText = composerLinkTextInput;

    if (!nextUrl || !nextText.trim()) {
      return;
    }

    const nextContent =
      messageContent.slice(0, segment.start) +
      nextText +
      messageContent.slice(segment.end);
    const nextEnd = segment.start + nextText.length;
    const nextLinkRange = {
      end: nextEnd,
      start: segment.start,
    };

    pendingComposerSelectionRef.current = {
      end: nextEnd,
      start: nextEnd,
    };
    setMessageContent(nextContent);
    setMessageContentLinks((currentLinks) => {
      const adjustedLinks = getLinksAfterTextChange({
        links: currentLinks,
        nextText: nextContent,
        previousText: messageContent,
      });

      return [
        ...adjustedLinks.filter((link) => {
          if (segment.id && link.id === segment.id) {
            return false;
          }

          return !rangesOverlap(link, nextLinkRange);
        }),
        {
          end: nextEnd,
          id: segment.id ?? crypto.randomUUID(),
          isSynced: isMessageLinkSynchronized(nextText, nextUrl),
          kind: COMPOSER_LINK_KIND.explicit,
          start: segment.start,
          url: nextUrl,
        },
      ];
    });
    closeComposerLinkPopover();
  };

  const handleMessageComposerOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      resetMessageComposer({ shouldCleanupTransientImages: true });
    }

    setIsMessageComposerOpen(isOpen);
  };

  const buildMessageImagePayload = () =>
    messageImageDrafts
      .filter(
        (image) =>
          image.status === COMPOSER_IMAGE_UPLOAD_STATUS.uploaded &&
          Boolean(image.assetId)
      )
      .map((image) => ({
        altText: image.altText,
        assetId: image.assetId ?? "",
      }));

  const getPersistingTransientMessageImageAssetIds = () =>
    messageImageDrafts
      .filter(
        (image) =>
          !image.isPersisted &&
          image.status === COMPOSER_IMAGE_UPLOAD_STATUS.uploaded &&
          Boolean(image.assetId)
      )
      .map((image) => image.assetId ?? "");

  const getMessageImageDraftValidationError = () => {
    if (
      messageImageDrafts.some(
        (image) => image.status === COMPOSER_IMAGE_UPLOAD_STATUS.uploading
      )
    ) {
      return TRIBE_ROUND_COPY.imageUploadPendingError;
    }

    if (
      messageImageDrafts.some(
        (image) => image.status === COMPOSER_IMAGE_UPLOAD_STATUS.error
      )
    ) {
      return TRIBE_ROUND_COPY.imageUploadError;
    }

    return null;
  };

  const markMessageImagesAsPersisting = (assetIds: string[]) => {
    assetIds.forEach((assetId) => {
      persistingMessageImageAssetIdsRef.current.add(assetId);
    });
  };

  const clearPersistingMessageImages = (assetIds: string[]) => {
    assetIds.forEach((assetId) => {
      persistingMessageImageAssetIdsRef.current.delete(assetId);
    });
  };

  const cleanupPersistingMessageImages = (
    assetIds: string[],
    actionTribeSlug: string
  ) => {
    assetIds.forEach((assetId) => {
      persistingMessageImageAssetIdsRef.current.delete(assetId);
      deleteMessageImageAsset(assetId, actionTribeSlug);
    });
  };

  const removeTransientMessageImageDraftsFromComposer = () => {
    const persistedImageDrafts = currentMessageImageDraftsRef.current.filter(
      (imageDraft) => imageDraft.isPersisted
    );
    const transientImageDrafts = currentMessageImageDraftsRef.current.filter(
      (imageDraft) => !imageDraft.isPersisted
    );

    revokeMessageImageDraftPreviewUrls(transientImageDrafts);
    currentMessageImageDraftsRef.current = persistedImageDrafts;
    setMessageImageDrafts(persistedImageDrafts);
  };

  const uploadMessageImage = async (file: File, localId: string) => {
    let createdAssetId: string | null = null;

    try {
      const upload = await submitJsonRequest<MessageImageUploadResponse>(
        TRIBE_ROUND_ENDPOINT.messageImageUploads(tribeSlug),
        {}
      );

      if (!upload.assetId || !upload.uploadUrl) {
        throw new Error(TRIBE_ROUND_COPY.imageUploadError);
      }

      createdAssetId = upload.assetId;

      if (discardedMessageImageLocalIdsRef.current.delete(localId)) {
        if (!cleanedMessageImageAssetIdsRef.current.has(upload.assetId)) {
          deleteMessageImageAsset(upload.assetId);
        }

        return;
      }

      setMessageImageDrafts((currentImages) =>
        currentImages.map((image) =>
          image.localId === localId
            ? {
                ...image,
                assetId: upload.assetId,
              }
            : image
        )
      );

      const formData = new FormData();
      formData.append("file", file);

      const uploadResponse = await fetch(upload.uploadUrl, {
        body: formData,
        method: TRIBE_ROUND_FORM.method,
      });

      if (!uploadResponse.ok) {
        throw new Error(TRIBE_ROUND_COPY.imageUploadError);
      }

      if (discardedMessageImageLocalIdsRef.current.delete(localId)) {
        if (!cleanedMessageImageAssetIdsRef.current.has(upload.assetId)) {
          deleteMessageImageAsset(upload.assetId);
        }

        return;
      }

      setMessageImageDrafts((currentImages) =>
        currentImages.map((image) =>
          image.localId === localId
            ? {
                ...image,
                status: COMPOSER_IMAGE_UPLOAD_STATUS.uploaded,
              }
            : image
        )
      );
    } catch {
      if (discardedMessageImageLocalIdsRef.current.delete(localId)) {
        if (
          createdAssetId &&
          !cleanedMessageImageAssetIdsRef.current.has(createdAssetId)
        ) {
          deleteMessageImageAsset(createdAssetId);
        }

        return;
      }

      setMessageImageDrafts((currentImages) =>
        currentImages.map((image) =>
          image.localId === localId
            ? {
                ...image,
                ...(createdAssetId ? { assetId: createdAssetId } : {}),
                status: COMPOSER_IMAGE_UPLOAD_STATUS.error,
              }
            : image
        )
      );
      toast.error(TRIBE_ROUND_COPY.imageUploadError);
    }
  };

  const handleMessageImageSelection = (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const selectedFiles = Array.from(event.currentTarget.files ?? []);

    event.currentTarget.value = "";

    if (selectedFiles.length === 0) {
      return;
    }

    if (messageImageDrafts.length + selectedFiles.length > MESSAGE_IMAGES.maxCount) {
      setMessageComposerErrors([TRIBE_ROUND_COPY.imageLimitError]);
      return;
    }

    selectedFiles.forEach((file) => {
      messageImageCounterRef.current += 1;
      const localId = `${file.name}-${String(file.lastModified)}-${String(
        messageImageCounterRef.current
      )}`;
      const previewUrl =
        typeof URL.createObjectURL === "function"
          ? URL.createObjectURL(file)
          : "";

      setMessageImageDrafts((currentImages) => [
        ...currentImages,
        {
          altText: "",
          localId,
          previewUrl,
          status: COMPOSER_IMAGE_UPLOAD_STATUS.uploading,
          isPersisted: false,
        },
      ]);
      void uploadMessageImage(file, localId);
    });
    setMessageComposerErrors([]);
  };

  const removeMessageImageDraft = (imageDraft: ComposerImageDraft) => {
    revokeMessageImagePreviewUrl(imageDraft.previewUrl);
    setMessageImageDrafts((currentImages) =>
      currentImages.filter((image) => image.localId !== imageDraft.localId)
    );

    if (!imageDraft.isPersisted) {
      discardedMessageImageLocalIdsRef.current.add(imageDraft.localId);

      if (imageDraft.assetId) {
        deleteMessageImageAsset(imageDraft.assetId);
      }
    }
  };

  const submitEditMessage = async ({
    content,
    messageId,
    title,
  }: {
    content: string;
    messageId: string;
    title: string;
  }) => {
    const editingMessage = messages.find((message) => message.id === messageId);
    const existingMessageImages = editingMessage?.images ?? [];
    const imagePayload = buildMessageImagePayload();
    const shouldUpdateImages =
      messageImageDrafts.length > 0 || existingMessageImages.length > 0;
    const canEditPoll = Boolean(
      editingMessage?.poll && editingMessage.poll.totalVoteCount === 0
    );
    const isVideoEdited = isVideoComposerEnabled || Boolean(editingMessage?.video);
    const videoPayload: { url: string } | null | undefined = isVideoEdited
      ? isVideoComposerEnabled
        ? { url: videoUrlInput.trim() }
        : null
      : undefined;
    const pollPayload = canEditPoll && isPollComposerEnabled
      ? {
          allowMultipleVotes: pollAllowsMultipleVotes,
          options: pollOptions.map((option) => option.trim()).filter(Boolean),
          question: pollQuestion.trim(),
        }
      : undefined;
    const missingRequirements = getMissingMessageRequirements({
      channelId: editingMessage?.channel.id ?? selectedChannelId,
      content,
      poll: pollPayload
        ? {
            enabled: true,
            options: pollOptions,
            question: pollQuestion,
          }
        : undefined,
      title,
      video: isVideoComposerEnabled
        ? { enabled: true, url: videoUrlInput }
        : undefined,
    });

    if (missingRequirements.length > 0) {
      setMessageComposerErrors(missingRequirements);
      return;
    }

    const imageDraftValidationError = getMessageImageDraftValidationError();
    if (imageDraftValidationError) {
      setMessageComposerErrors([imageDraftValidationError]);
      return;
    }

    const actionTribeSlug = tribeSlug;
    const actionToken = currentActionTokenRef.current + 1;
    const persistingImageAssetIds = shouldUpdateImages
      ? getPersistingTransientMessageImageAssetIds()
      : [];

    currentActionTokenRef.current = actionToken;
    markMessageImagesAsPersisting(persistingImageAssetIds);
    setPendingActionId(messageId);

    try {
      const response = await submitJsonRequest<UpdateMessageContentResponse>(
        TRIBE_ROUND_ENDPOINT.messageItem(actionTribeSlug, messageId),
        {
          content,
          ...(shouldUpdateImages ? { images: imagePayload } : {}),
          ...(pollPayload ? { poll: pollPayload } : {}),
          title,
          ...(videoPayload !== undefined ? { video: videoPayload } : {}),
        },
        undefined,
        TRIBE_ROUND_FORM.patchMethod
      );

      if (!isCurrentAction(actionToken, actionTribeSlug)) {
        return;
      }

      const appliedTitle =
        typeof response.title === "string" ? response.title : title;
      const appliedContent =
        typeof response.content === "string" ? response.content : content;

      setMessages((currentMessages) =>
        currentMessages.map((message) =>
          message.id === messageId
            ? {
                ...message,
                content: appliedContent,
                ...(response.images !== undefined ? { images: response.images } : {}),
                ...(response.poll !== undefined ? { poll: response.poll } : {}),
                title: appliedTitle,
                ...(response.video !== undefined ? { video: response.video } : {}),
              }
            : message
        )
      );
      resetMessageComposer();
      clearPersistingMessageImages(persistingImageAssetIds);
      setIsMessageComposerOpen(false);
      toast.success(response.message ?? TRIBE_ROUND_COPY.messageEditSuccess);
    } catch (error) {
      if (!isCurrentAction(actionToken, actionTribeSlug)) {
        cleanupPersistingMessageImages(persistingImageAssetIds, actionTribeSlug);
        return;
      }

      cleanupPersistingMessageImages(persistingImageAssetIds, actionTribeSlug);
      removeTransientMessageImageDraftsFromComposer();
      toast.error(
        error instanceof Error
          ? error.message
          : TRIBE_ROUND_COPY.messageEditError
      );
    } finally {
      if (isCurrentAction(actionToken, actionTribeSlug)) {
        setPendingActionId(null);
      }
    }
  };

  const createMessageDraftSnapshot = ({
    content,
    title,
  }: {
    content: string;
    title: string;
  }): CreateMessageDraftSnapshot => ({
    content,
    imageDrafts: messageImageDrafts.map((imageDraft) => ({ ...imageDraft })),
    isPollComposerEnabled,
    isVideoComposerEnabled,
    messageContent,
    messageContentLinks: messageContentLinks.map((link) => ({ ...link })),
    pollAllowsMultipleVotes,
    pollOptions: [...pollOptions],
    pollQuestion,
    selectedChannelId,
    title,
    videoUrlInput,
  });

  const restoreCreateMessageDraft = (draft: CreateMessageDraftSnapshot) => {
    setMessageTitle(draft.title);
    setMessageContent(draft.messageContent);
    setMessageContentLinks(draft.messageContentLinks.map((link) => ({ ...link })));
    setActiveComposerLink(null);
    setComposerLinkTextInput("");
    setComposerLinkUrlInput("");
    setComposerLinkPopoverMode(COMPOSER_LINK_POPOVER_MODE.actions);
    setIsPollComposerEnabled(draft.isPollComposerEnabled);
    setPollQuestion(draft.pollQuestion);
    setPollOptions([...draft.pollOptions]);
    setPollAllowsMultipleVotes(draft.pollAllowsMultipleVotes);
    setIsVideoComposerEnabled(draft.isVideoComposerEnabled);
    setVideoUrlInput(draft.videoUrlInput);
    setMessageImageDrafts(draft.imageDrafts.map((imageDraft) => ({ ...imageDraft })));
    currentMessageImageDraftsRef.current = draft.imageDrafts.map((imageDraft) => ({
      ...imageDraft,
    }));
    setSelectedChannelId(draft.selectedChannelId);
    setMessageComposerErrors([]);
    setEditingMessageId(null);
  };

  const buildOptimisticPoll = (
    optimisticMessageId: string
  ): TribeRoundMessageResult["poll"] => {
    if (!isPollComposerEnabled) {
      return null;
    }

    const options = pollOptions.map((option) => option.trim()).filter(Boolean);

    return {
      allowMultipleVotes: pollAllowsMultipleVotes,
      id: TRIBE_ROUND_OPTIMISTIC.pollIdPrefix + optimisticMessageId,
      options: options.map((option, optionIndex) => ({
        id:
          TRIBE_ROUND_OPTIMISTIC.pollOptionIdPrefix +
          optimisticMessageId +
          TRIBE_ROUND_RESET_KEY.fieldSeparator +
          String(optionIndex),
        percentage: 0,
        selectedByViewer: false,
        text: option,
        voteCount: 0,
      })),
      question: pollQuestion.trim(),
      totalVoteCount: 0,
      viewerHasVoted: false,
    };
  };

  const buildOptimisticMessage = ({
    content,
    optimisticMessageId,
    title,
  }: {
    content: string;
    optimisticMessageId: string;
    title: string;
  }): TribeRoundVisibleMessageResult | null => {
    if (!selectedChannel) {
      return null;
    }

    const viewerTribeAuthor = findViewerTribeAuthor(
      messages,
      authenticatedMember.id
    );
    const optimisticImages = messageImageDrafts
      .filter(
        (imageDraft) =>
          imageDraft.status === COMPOSER_IMAGE_UPLOAD_STATUS.uploaded
      )
      .map((imageDraft, imageIndex) => ({
        altText: imageDraft.altText,
        id:
          imageDraft.assetId ??
          TRIBE_ROUND_OPTIMISTIC.messageImageIdPrefix +
            optimisticMessageId +
            TRIBE_ROUND_RESET_KEY.fieldSeparator +
            String(imageIndex),
        url: imageDraft.previewUrl,
      }));

    return {
      author: {
        avatarFallback:
          viewerTribeAuthor?.avatarFallback ?? authenticatedMember.avatarFallback,
        id: authenticatedMember.id,
        image: viewerTribeAuthor?.image ?? authenticatedMember.image,
        name: viewerTribeAuthor?.name ?? authenticatedMember.name,
        role:
          viewerTribeAuthor?.role ??
          (authenticatedMember.role as TribeRoundMessageResult["author"]["role"]),
      },
      channel: selectedChannel,
      content,
      createdAt: new Date().toISOString(),
      id: optimisticMessageId,
      ...(optimisticImages.length > 0 ? { images: optimisticImages } : {}),
      likedByViewer: false,
      likeCount: 0,
      replyCount: 0,
      isPending: true,
      permissions: {
        canDelete: false,
        canEdit: false,
      },
      poll: buildOptimisticPoll(optimisticMessageId),
      replies: [],
      title,
      ...(isVideoComposerEnabled && detectedVideo ? { video: detectedVideo } : {}),
    };
  };

  const replaceOptimisticMessage = ({
    createdMessage,
    optimisticMessageId,
  }: {
    createdMessage: TribeRoundMessageResult;
    optimisticMessageId: string;
  }) => {
    setMessages((currentMessages) => {
      const messagesWithoutOptimistic = currentMessages.filter(
        (message) =>
          message.id !== optimisticMessageId && message.id !== createdMessage.id
      );

      if (!round.activeChannelId || createdMessage.channel.id === round.activeChannelId) {
        return getMessagesAfterVisibleMessageCreation({
          createdMessage,
          currentMessages: messagesWithoutOptimistic,
          pagination: visiblePagination,
        });
      }

      return messagesWithoutOptimistic;
    });
  };

  const handleCreateMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = messageTitle.trim();
    const displayContent = messageContent.trim();
    const content = serializeComposerMessageContent(
      messageContent,
      messageContentLinks
    ).trim();
    const imagePayload = buildMessageImagePayload();

    if (editingMessageId) {
      await submitEditMessage({
        content,
        messageId: editingMessageId,
        title,
      });
      return;
    }

    const missingRequirements = getMissingMessageRequirements({
      channelId: selectedChannelId,
      content: displayContent,
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

    const imageDraftValidationError = getMessageImageDraftValidationError();
    if (imageDraftValidationError) {
      setMessageComposerErrors([imageDraftValidationError]);
      return;
    }

    const actionTribeSlug = tribeSlug;
    const actionToken = currentActionTokenRef.current + 1;
    const persistingImageAssetIds = getPersistingTransientMessageImageAssetIds();
    optimisticMessageCounterRef.current += 1;
    const optimisticMessageId =
      TRIBE_ROUND_OPTIMISTIC.messageIdPrefix +
      String(optimisticMessageCounterRef.current);
    const draftSnapshot = createMessageDraftSnapshot({ content, title });
    const optimisticMessage = buildOptimisticMessage({
      content,
      optimisticMessageId,
      title,
    });
    const baselineMessages = messages;
    const baselinePagination = visiblePagination;
    const createMessageIntent: PendingCreateMessageIntent = {
      baselineMessages,
      baselinePagination,
      draft: draftSnapshot,
      optimisticMessageId,
    };
    const shouldShowOptimisticMessageInCurrentView = Boolean(
      optimisticMessage &&
        (!round.activeChannelId ||
          optimisticMessage.channel.id === round.activeChannelId) &&
        visiblePagination.currentPage === 1
    );

    currentActionTokenRef.current = actionToken;
    pendingCreateMessageIntentRef.current = createMessageIntent;
    markMessageImagesAsPersisting(persistingImageAssetIds);
    if (optimisticMessage && shouldShowOptimisticMessageInCurrentView) {
      setVisiblePagination((currentPagination) =>
        getPaginationAfterVisibleMessageCreation({
          currentMessageCount: messages.length,
          pagination: currentPagination,
        })
      );
      setMessages((currentMessages) =>
        getMessagesAfterVisibleMessageCreation({
          createdMessage: optimisticMessage,
          currentMessages,
          pagination: visiblePagination,
        })
      );
      resetMessageComposer({ shouldRevokeImagePreviewUrls: false });
      setIsMessageComposerOpen(false);
    }
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
          ...(imagePayload.length > 0 ? { images: imagePayload } : {}),
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

      replaceOptimisticMessage({
        createdMessage,
        optimisticMessageId,
      });
      revokeMessageImageDraftPreviewUrls(draftSnapshot.imageDrafts);
      clearPersistingMessageImages(persistingImageAssetIds);
      pendingCreateMessageIntentRef.current = null;
      if (!shouldShowOptimisticMessageInCurrentView) {
        resetMessageComposer({ shouldRevokeImagePreviewUrls: false });
        setIsMessageComposerOpen(false);
      }
      toast.success(TRIBE_ROUND_COPY.submitMessageSuccess);
    } catch (error) {
      if (!isCurrentAction(actionToken, actionTribeSlug)) {
        cleanupPersistingMessageImages(persistingImageAssetIds, actionTribeSlug);
        return;
      }

      setMessages((currentMessages) =>
        getMessagesAfterOptimisticCreationFailure({
          baselineMessages: createMessageIntent.baselineMessages,
          currentMessages,
          optimisticMessageId: createMessageIntent.optimisticMessageId,
        })
      );
      setVisiblePagination(createMessageIntent.baselinePagination);
      cleanupPersistingMessageImages(persistingImageAssetIds, actionTribeSlug);
      pendingCreateMessageIntentRef.current = null;
      revokeMessageImageDraftPreviewUrls(createMessageIntent.draft.imageDrafts);
      restoreCreateMessageDraft({
        ...createMessageIntent.draft,
        imageDrafts: [],
      });
      setIsMessageComposerOpen(true);
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
              replyCount: message.replyCount + 1,
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

  const openEditMessageDialog = (message: TribeRoundMessageResult) => {
    const composerContent = deserializeMessageContentForComposer(message.content);

    resetMessageComposer({ shouldCleanupTransientImages: true });
    setEditingMessageId(message.id);
    setMessageTitle(message.title ?? "");
    setMessageContent(composerContent.content);
    setMessageContentLinks(composerContent.links);
    setSelectedChannelId(message.channel.id);
    setMessageImageDrafts(
      (message.images ?? []).map((image) => ({
        altText: image.altText,
        assetId: image.id,
        localId: image.id,
        previewUrl: image.url,
        status: COMPOSER_IMAGE_UPLOAD_STATUS.uploaded,
        isPersisted: true,
      }))
    );

    if (message.video) {
      setIsVideoComposerEnabled(true);
      setVideoUrlInput(buildEditableVideoUrl(message.video));
    }

    if (message.poll && message.poll.totalVoteCount === 0) {
      setIsPollComposerEnabled(true);
      setPollQuestion(message.poll.question);
      setPollOptions(message.poll.options.map((option) => option.text));
      setPollAllowsMultipleVotes(message.poll.allowMultipleVotes);
    }

    setIsMessageComposerOpen(true);
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
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : TRIBE_ROUND_COPY.messageDeleteError
      );
      return false;
    } finally {
      setPendingActionId(null);
    }
  };

  const handleDeleteConfirmationOpenChange = (isOpen: boolean) => {
    if (!isOpen && !isBusy) {
      setMessagePendingDeletion(null);
    }
  };

  const handleConfirmMessageDeletion = async () => {
    if (!messagePendingDeletion) {
      return;
    }

    const wasDeleted = await handleDeleteMessage(messagePendingDeletion);

    if (wasDeleted) {
      setMessagePendingDeletion(null);
    }
  };

  const openMessageDetails = (messageId: string) => {
    const message = messages.find((currentMessage) => currentMessage.id === messageId);

    if (!message || isPendingMessage(message)) {
      return;
    }

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

  const renderMessageContent = (
    message: TribeRoundMessageResult,
    contentClassName = "",
    isContentAlwaysCollapsed = false,
    previewClassName: TribeRoundContentPreviewClass =
      TRIBE_ROUND_CONTENT_PREVIEW_CLASS.details,
    shouldStopLinkPropagation = false
  ) => {
    const isExpanded =
      !isContentAlwaysCollapsed && Boolean(expandedMessageIds[message.id]);
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
    const displayedContent = isRoundCollapsedPreview
      ? flattenMessageContentForCollapsedPreview(message.content)
      : isDetailsCollapsedPreview
        ? truncateMessageContentForCollapsedPreview(
            message.content,
            TRIBE_ROUND_LIMITS.detailsCollapsedSliceCharacters
          )
        : message.content;
    const wasDetailsContentTruncated =
      isDetailsCollapsedPreview &&
      displayedContent.length < message.content.length;
    const contentSegments = parseMessageContentSegments(displayedContent);

    return (
      <div
        className={contentClassNames}
        {...contentDataAttributes}
      >
        {contentSegments.map((segment, segmentIndex) =>
          segment.type === MESSAGE_CONTENT_SEGMENT_TYPE.link ? (
            <a
              className={styles.TribeRound__contentLink}
              href={segment.url}
              key={segment.type + String(segmentIndex)}
              onClick={(event) => {
                if (shouldStopLinkPropagation) {
                  stopMessageDetailsOpening(event);
                }
              }}
              rel="noreferrer"
              target="_blank"
            >
              {segment.text}
            </a>
          ) : (
            segment.text
          )
        )}
        {wasDetailsContentTruncated ? (
          <>
            {COLLAPSED_CONTENT_TEXT.ellipsis}
            <button
              aria-expanded={isExpanded}
              className={styles.TribeRound__contentToggle}
              onClick={() => {
                toggleMessageContentExpansion(message.id);
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

  const renderMessagePoll = (
    message: TribeRoundVisibleMessageResult,
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
    const canVote = round.viewerPermissions.canReact && !isPendingMessage(message);

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

  const renderMessageImages = (message: TribeRoundMessageResult) => {
    const messageImages = message.images ?? [];

    if (messageImages.length === 0) {
      return null;
    }

    return (
      <div className={styles.TribeRound__imageGallery}>
        {messageImages.map((image) => {
          const isTemporaryImage = image.url.startsWith("blob:");

          return (
            <div className={styles.TribeRound__imageFrame} key={image.id}>
              <Image
                alt={image.altText || message.title || TRIBE_ROUND_COPY.messageDetailsDialogTitle}
                className={styles.TribeRound__image}
                height={0}
                sizes="(max-width: 768px) 88vw, 420px"
                src={image.url}
                unoptimized={isTemporaryImage}
                width={0}
              />
            </div>
          );
        })}
      </div>
    );
  };

  const renderComposerImageDrafts = () => {
    if (messageImageDrafts.length === 0) {
      return null;
    }

    return (
      <div className={styles.TribeRound__imageDraftList}>
        {messageImageDrafts.map((imageDraft) => (
          <div className={styles.TribeRound__imageDraft} key={imageDraft.localId}>
            <div className={styles.TribeRound__imageDraftPreview}>
              {imageDraft.previewUrl ? (
                <Image
                  alt={imageDraft.altText || TRIBE_ROUND_COPY.imageAltInputLabel}
                  className={styles.TribeRound__imageDraftImage}
                  fill
                  sizes="96px"
                  src={imageDraft.previewUrl}
                  unoptimized
                />
              ) : (
                <ImageIcon />
              )}
              {imageDraft.status === COMPOSER_IMAGE_UPLOAD_STATUS.uploading ? (
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
              disabled={isBusy}
              onChange={(event) => {
                const altText = event.currentTarget.value;

                setMessageImageDrafts((currentImages) =>
                  currentImages.map((image) =>
                    image.localId === imageDraft.localId
                      ? { ...image, altText }
                      : image
                  )
                );
              }}
              placeholder={TRIBE_ROUND_COPY.imageAltInputPlaceholder}
              value={imageDraft.altText}
            />
            <span className={styles.TribeRound__imageDraftStatus}>
              {imageDraft.status === COMPOSER_IMAGE_UPLOAD_STATUS.uploading
                ? TRIBE_ROUND_COPY.imageUploadingLabel
                : imageDraft.status === COMPOSER_IMAGE_UPLOAD_STATUS.error
                  ? TRIBE_ROUND_COPY.imageUploadError
                  : ""}
            </span>
            <Button
              aria-label={TRIBE_ROUND_COPY.imageRemoveButton}
              className={styles.TribeRound__imageRemoveButton}
              disabled={isBusy}
              onClick={() => {
                removeMessageImageDraft(imageDraft);
              }}
              size={TRIBE_ROUND_FORM.iconSize}
              type={TRIBE_ROUND_FORM.buttonType}
              variant={TRIBE_ROUND_FORM.ghostVariant}
            >
              <XIcon />
            </Button>
          </div>
        ))}
      </div>
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
    message: TribeRoundVisibleMessageResult,
    shouldStopDetailsOpening = false
  ) => {
    const isPinned = Boolean(message.isPinned);
    const isPending = isPendingMessage(message);

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
        disabled={isPending}
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
    message: TribeRoundVisibleMessageResult,
    shouldStopDetailsOpening = false
  ) => {
    if (isPendingMessage(message)) {
      return null;
    }

    const canDelete = Boolean(message.permissions?.canDelete);
    const canEdit = Boolean(message.permissions?.canEdit);
    const canEditCreatedAt = Boolean(
      round.viewerPermissions.canEditMessageCreatedAt
    );

    if (!canDelete && !canEdit && !canEditCreatedAt) {
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
          {canEdit ? (
            <DropdownMenuItem
              className={styles.TribeRound__messageMenuItem}
              disabled={isBusy}
              onClick={(event) => {
                if (shouldStopDetailsOpening) {
                  stopMessageDetailsOpening(event);
                }
              }}
              onSelect={() => {
                openEditMessageDialog(message);
              }}
            >
              <PencilIcon />
              {TRIBE_ROUND_COPY.messageEditButton}
            </DropdownMenuItem>
          ) : null}
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
              className={`${styles.TribeRound__messageMenuItem} ${styles["TribeRound__messageMenuItem--destructive"]}`}
              disabled={isBusy}
              onClick={(event) => {
                if (shouldStopDetailsOpening) {
                  stopMessageDetailsOpening(event);
                }
              }}
              onSelect={() => {
                setMessagePendingDeletion(message);
              }}
              variant={TRIBE_ROUND_FORM.destructiveVariant}
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
        <Dialog
          open={Boolean(messagePendingDeletion)}
          onOpenChange={handleDeleteConfirmationOpenChange}
        >
          <DialogContent
            className={styles.TribeRound__deleteMessageDialog}
            showCloseButton={!isBusy}
          >
            <DialogHeader>
              <DialogTitle>{TRIBE_ROUND_COPY.messageDeleteConfirmTitle}</DialogTitle>
              <DialogDescription>
                {TRIBE_ROUND_COPY.messageDeleteConfirmDescription}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                disabled={isBusy}
                onClick={() => setMessagePendingDeletion(null)}
                type={TRIBE_ROUND_FORM.buttonType}
                variant={TRIBE_ROUND_FORM.outlineVariant}
              >
                {TRIBE_ROUND_COPY.messageDeleteConfirmCancel}
              </Button>
              <Button
                className={styles.TribeRound__deleteMessageConfirmButton}
                disabled={isBusy}
                onClick={handleConfirmMessageDeletion}
                type={TRIBE_ROUND_FORM.buttonType}
                variant={TRIBE_ROUND_FORM.destructiveVariant}
              >
                <TrashIcon />
                {TRIBE_ROUND_COPY.messageDeleteConfirmSubmit}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
                {isEditingMessage
                  ? TRIBE_ROUND_COPY.messageEditTitle
                  : TRIBE_ROUND_COPY.messageComposerDialogTitle}
              </DialogTitle>
              <DialogDescription
                className={styles.TribeRound__composerDialogDescription}
              >
                {isEditingMessage
                  ? TRIBE_ROUND_COPY.messageEditDescription
                  : TRIBE_ROUND_COPY.messageComposerDescription}
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
                <div
                  aria-describedby={
                    hasMessageComposerErrors
                      ? TRIBE_ROUND_ATTRIBUTES.messageComposerErrorId
                      : undefined
                  }
                  aria-label={TRIBE_ROUND_COPY.messageComposerLabel}
                  aria-disabled={isBusy}
                  aria-multiline
                  className={styles.TribeRound__messageEditor}
                  contentEditable={!isBusy}
                  data-placeholder={TRIBE_ROUND_COPY.messagePlaceholder}
                  onBeforeInput={handleMessageContentBeforeInput}
                  onInput={handleMessageContentInput}
                  onKeyDown={handleMessageContentKeyDown}
                  onPaste={handleMessageContentPaste}
                  ref={messageContentEditorRef}
                  role="textbox"
                  suppressContentEditableWarning
                >
                  {hasComposerEditorContent
                    ? composerEditorSegments.map((segment) =>
                        segment.type === MESSAGE_CONTENT_SEGMENT_TYPE.link ? (
                          <Popover
                            key={segment.key}
                            open={activeComposerLink?.key === segment.key}
                            onOpenChange={(isOpen) => {
                              if (isOpen) {
                                openComposerLinkPopover(segment);
                              } else if (activeComposerLink?.key === segment.key) {
                                closeComposerLinkPopover();
                              }
                            }}
                          >
                            <PopoverTrigger asChild>
                              <a
                                className={styles.TribeRound__messageEditorLink}
                                href={segment.url}
                                onClick={(event) => {
                                  event.preventDefault();
                                  openComposerLinkPopover(segment);
                                }}
                                rel="noreferrer"
                                target="_blank"
                              >
                                {segment.text}
                              </a>
                            </PopoverTrigger>
                            <PopoverContent
                              className={styles.TribeRound__composerLinkPopover}
                              onBeforeInput={(event) => {
                                event.stopPropagation();
                              }}
                              onInput={(event) => {
                                event.stopPropagation();
                              }}
                              onKeyDown={(event) => {
                                event.stopPropagation();
                              }}
                              onPaste={(event) => {
                                event.stopPropagation();
                              }}
                            >
                              {composerLinkPopoverMode ===
                              COMPOSER_LINK_POPOVER_MODE.actions ? (
                                <div
                                  className={
                                    styles.TribeRound__composerLinkActions
                                  }
                                >
                                  <Button
                                    onClick={() => {
                                      setComposerLinkPopoverMode(
                                        COMPOSER_LINK_POPOVER_MODE.edit
                                      );
                                    }}
                                    type={TRIBE_ROUND_FORM.buttonType}
                                    variant={TRIBE_ROUND_FORM.ghostVariant}
                                  >
                                    {TRIBE_ROUND_COPY.messageLinkEditAction}
                                  </Button>
                                  <Button
                                    onClick={() => {
                                      removeComposerLink(segment);
                                    }}
                                    type={TRIBE_ROUND_FORM.buttonType}
                                    variant={TRIBE_ROUND_FORM.ghostVariant}
                                  >
                                    {TRIBE_ROUND_COPY.messageLinkRemoveAction}
                                  </Button>
                                </div>
                              ) : (
                                <>
                                  <label
                                    className={
                                      styles.TribeRound__composerLinkLabel
                                    }
                                  >
                                    <span>
                                      {
                                        TRIBE_ROUND_COPY.messageLinkPopoverTextLabel
                                      }
                                    </span>
                                    <input
                                      className={
                                        styles.TribeRound__composerLinkInput
                                      }
                                      onChange={(event) => {
                                        setComposerLinkTextInput(
                                          event.currentTarget.value
                                        );
                                      }}
                                      value={composerLinkTextInput}
                                    />
                                  </label>
                                  <label
                                    className={
                                      styles.TribeRound__composerLinkLabel
                                    }
                                  >
                                    <span>
                                      {TRIBE_ROUND_COPY.messageLinkPopoverUrlLabel}
                                    </span>
                                    <input
                                      className={
                                        styles.TribeRound__composerLinkInput
                                      }
                                      onChange={(event) => {
                                        setComposerLinkUrlInput(
                                          event.currentTarget.value
                                        );
                                      }}
                                      type={TRIBE_ROUND_FORM.urlInputType}
                                      value={composerLinkUrlInput}
                                    />
                                  </label>
                                  <div
                                    className={
                                      styles.TribeRound__composerLinkActions
                                    }
                                  >
                                    <Button
                                      onClick={() => {
                                        if (activeComposerLink) {
                                          saveComposerLinkEdit(activeComposerLink);
                                        }
                                      }}
                                      type={TRIBE_ROUND_FORM.buttonType}
                                    >
                                      {TRIBE_ROUND_COPY.messageLinkEditSave}
                                    </Button>
                                    <Button
                                      onClick={closeComposerLinkPopover}
                                      type={TRIBE_ROUND_FORM.buttonType}
                                      variant={TRIBE_ROUND_FORM.outlineVariant}
                                    >
                                      {TRIBE_ROUND_COPY.messageLinkEditCancel}
                                    </Button>
                                  </div>
                                </>
                              )}
                            </PopoverContent>
                          </Popover>
                        ) : (
                          segment.text
                        )
                      )
                    : null}
                </div>
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
                    {!isEditingMessage ? (
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
                    ) : null}
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
                {renderComposerImageDrafts()}
                <div className={styles.TribeRound__composerActions}>
                  <label
                    aria-label={TRIBE_ROUND_COPY.imageAddButton}
                    className={styles.TribeRound__imageAddButton}
                  >
                    <ImageIcon />
                    <input
                      accept={TRIBE_ROUND_FORM.imageAccept}
                      className={styles.TribeRound__fileInput}
                      disabled={
                        isBusy ||
                        messageImageDrafts.length >= MESSAGE_IMAGES.maxCount
                      }
                      multiple
                      onChange={handleMessageImageSelection}
                      type={TRIBE_ROUND_FORM.fileInputType}
                    />
                  </label>
                  {!isEditingMessage && !isPollComposerEnabled ? (
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
                  {!isEditingMessage ? (
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
                  ) : null}
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
                  {isEditingMessage ? null : <SendIcon />}
                  {isEditingMessage
                    ? TRIBE_ROUND_COPY.messageEditSubmit
                    : TRIBE_ROUND_COPY.messageButton}
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
                    {renderMessagePinControl(message, true)}
                    {renderMessageActionsMenu(message, true)}
                  </div>
                  <button
                    aria-label={`${TRIBE_ROUND_COPY.openMessageDetailsAriaLabelPrefix}: ${message.title || message.content}`}
                    className={styles.TribeRound__messageDetailsTrigger}
                    disabled={isPendingMessage(message)}
                    type={TRIBE_ROUND_FORM.buttonType}
                  >
                    <CardHeader className={styles.TribeRound__messageHeader}>
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
                    </CardHeader>
                  </button>
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
                      TRIBE_ROUND_CONTENT_PREVIEW_CLASS.round,
                      true
                    )}
                    {renderMessageImages(message)}
                    {renderMessageVideoBadge(message)}
                  </CardContent>
                  {renderMessagePoll(message, true)}

                  <div className={styles.TribeRound__messageActions}>
                    <Button
                      aria-label={`${TRIBE_ROUND_COPY.likeButtonAriaLabel} ${message.likeCount}`}
                      className={getLikeButtonClassName(message.likedByViewer)}
                      disabled={
                        !round.viewerPermissions.canReact || isPendingMessage(message)
                      }
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
                    <Button
                      aria-label={`${TRIBE_ROUND_COPY.commentButtonAriaLabel} ${getCommentCount(message)}`}
                      className={styles.TribeRound__commentButton}
                      disabled={isPendingMessage(message)}
                      onClick={(event) => {
                        stopMessageDetailsOpening(event);
                        openMessageDetails(message.id);
                      }}
                      type={TRIBE_ROUND_FORM.buttonType}
                      variant={TRIBE_ROUND_FORM.outlineVariant}
                    >
                      <MessageCircleIcon />
                      {getCommentCount(message)}
                    </Button>
                    {renderCommentAuthorsPreview(message)}
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
        <DialogContent
          className={`${styles.TribeRound__composerDialog} ${styles["TribeRound__composerDialog--messageDetails"]}`}
        >
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
                  styles.TribeRound__avatar,
                  getAvatarRoleModifierClassName(selectedMessage.author.role)
                )}
                <div className={styles.TribeRound__author}>
                  {renderAuthorIdentity(selectedMessage.author)}
                  {renderMessageCreatedTime(
                    selectedMessage.createdAt,
                    selectedMessage.channel
                  )}
                </div>
                <div className={styles.TribeRound__messageMeta}>
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
                {renderMessageImages(selectedMessage)}
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
                    disabled={
                      !round.viewerPermissions.canReact ||
                      isPendingMessage(selectedMessage)
                    }
                    onClick={() => {
                      handleToggleLike(selectedMessage.id);
                    }}
                    type={TRIBE_ROUND_FORM.buttonType}
                    variant={TRIBE_ROUND_FORM.outlineVariant}
                  >
                    <HeartIcon />
                    {selectedMessage.likeCount}
                  </Button>
                  <Button
                    aria-label={`${TRIBE_ROUND_COPY.commentButtonAriaLabel} ${getCommentCount(selectedMessage)}`}
                    className={styles.TribeRound__commentButton}
                    disabled={isPendingMessage(selectedMessage)}
                    type={TRIBE_ROUND_FORM.buttonType}
                    variant={TRIBE_ROUND_FORM.outlineVariant}
                  >
                    <MessageCircleIcon />
                    {getCommentCount(selectedMessage)}
                  </Button>
                  {renderCommentAuthorsPreview(selectedMessage)}
                </div>
              </CardContent>
              <div className={styles.TribeRound__modalReplysSection}>
                <section
                  aria-label={TRIBE_ROUND_COPY.repliesTitle}
                  className={styles.TribeRound__replies}
                >
                  {selectedMessageReplyLoadStatus ===
                  TRIBE_ROUND_REPLY_LOAD_STATUS.loading ? (
                    <div className={styles.TribeRound__replyLoading}>
                      <BouncingDotsLoader
                        label={TRIBE_ROUND_COPY.repliesLoading}
                        size="sm"
                      />
                    </div>
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
                            styles.TribeRound__replyAvatar,
                            getReplyAvatarRoleModifierClassName(reply.author.role)
                          )}
                          <div className={styles.TribeRound__replyBody}>
                            <p className={styles.TribeRound__replyMeta}>
                              <span>{reply.author.name}</span>
                              {renderAuthorRoleAccessibleLabel(reply.author.role)}
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
