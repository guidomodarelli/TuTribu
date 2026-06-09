"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  createElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type {
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
  FileIcon,
  HeartIcon,
  ImageIcon,
  ListPlusIcon,
  MessageCircleIcon,
  MoreHorizontalIcon,
  PaperclipIcon,
  PencilIcon,
  PinIcon,
  PlayIcon,
  RotateCcwIcon,
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
import { RichLinkEditor } from "@/components/rich-text/rich-link-editor";
import { useRichLinkEditor } from "@/components/rich-text/rich-link-editor/use-rich-link-editor";
import { RichTextContent } from "@/components/rich-text/rich-text-content";
import type { RichLink } from "@/lib/rich-text/link-markdown-types";
import { formatFileSize } from "@/lib/format-file-size";
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
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { BouncingDotsLoader } from "@/components/loaders/bouncing-dots-loader";
import { MessageLikesHoverCard } from "@/components/tribe-round/message-likes-hover-card";
import {
  ATTACHMENT_FILE,
  ATTACHMENT_FILE_INPUT_ACCEPT,
  isAllowedAttachmentMimeType,
} from "@/src/constants/attachment-files";
import { BUENOS_AIRES_TIME_ZONE } from "@/src/constants/date-time";
import type { AuthenticatedMemberResult } from "@/src/modules/auth/application/results/authenticated-member-result";
import {
  MESSAGE_FILES,
  MESSAGE_POLL_OPTION_TEXT,
  MESSAGE_POLL_OPTIONS,
  MESSAGE_MEDIA,
  MESSAGE_MEDIA_KIND,
} from "@/src/modules/messages/constants/message-round";
import type {
  MessageFileResult,
  MessageMediaResult,
  TribeRoundReplyResult,
  TribeRoundMessageResult,
  TribeRoundResult,
} from "@/src/modules/messages/application/results/tribe-round-result";
import type { MessageMediaDraftCommand } from "@/src/modules/messages/application/commands/tribe-message-command";
import {
  InvalidVideoUrlError,
  parseExternalVideoUrl,
} from "@/src/modules/shared/domain/value-objects/external-video-url";
import { VIDEO_PROVIDER } from "@/src/modules/shared/domain/value-objects/video-provider";
import {
  PLAYER_IFRAME_ALLOW,
  buildPlayerEmbedSource,
} from "@/src/modules/shared/application/video/build-player-embed-source";
import { buildVideoThumbnailSource } from "@/src/modules/shared/application/video/build-video-thumbnail-source";
import { resolveImageCarouselSlideIndicesOnReInit } from "./image-carousel-slide-indices";
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
  fileDownloadSegment: "/download",
  fileUploadsSegment: "/files/uploads",
  filesSegment: "/files/",
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
  messageFileUploads: (tribeSlug: string) =>
    TRIBE_ROUND_ROUTE.apiTribes +
    tribeSlug +
    TRIBE_ROUND_ROUTE.messagesBaseSegment +
    TRIBE_ROUND_ROUTE.fileUploadsSegment,
  messageFileItem: (tribeSlug: string, assetId: string) =>
    TRIBE_ROUND_ROUTE.apiTribes +
    tribeSlug +
    TRIBE_ROUND_ROUTE.messagesBaseSegment +
    TRIBE_ROUND_ROUTE.filesSegment +
    assetId,
  messageFileDownload: (tribeSlug: string, fileId: string) =>
    TRIBE_ROUND_ENDPOINT.messageFileItem(tribeSlug, fileId) +
    TRIBE_ROUND_ROUTE.fileDownloadSegment,
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
  imageCarouselDialogDescription:
    "Galería de medios ampliados del mensaje.",
  imageCarouselDialogTitle: "Medios del mensaje",
  imageCarouselNextButton: "Siguiente medio",
  imageCarouselOpenButtonPrefix: "Abrir imagen",
  imageCarouselVideoOpenButtonPrefix: "Abrir video",
  imageCarouselPreviousButton: "Medio anterior",
  imageCarouselProgressPrefix: "Medio",
  imageCarouselProgressSeparator: "de",
  mediaLimitError: `Podés adjuntar hasta ${String(
    MESSAGE_MEDIA.maxCount
  )} archivos entre imágenes y videos.`,
  imageRemoveButton: "Quitar imagen",
  imageUploadError: "No pudimos subir la imagen.",
  imageUploadPendingError: "Esperá a que termine de subir la imagen.",
  imageUploadingLabel: "Subiendo imagen",
  fileAddButton: "Adjuntar archivo",
  fileDownloadAriaLabelPrefix: "Descargar archivo",
  fileLimitError: `Podés adjuntar hasta ${String(
    MESSAGE_FILES.maxCount
  )} archivos.`,
  fileListLabel: "Archivos adjuntos",
  fileRemoveButton: "Quitar archivo",
  fileRetryButton: "Reintentar subida",
  fileTooLargeError: `El archivo supera los ${formatFileSize(
    ATTACHMENT_FILE.maxFileSizeBytes
  )}.`,
  fileTypeNotAllowedError: "Ese tipo de archivo no está permitido.",
  fileUploadError: "No pudimos subir el archivo.",
  fileUploadPendingError: "Esperá a que termine de subir el archivo.",
  fileUploadingLabel: "Subiendo archivo",
  videoAddButton: "Agregar video",
  videoAttachedFallbackLabel: "Video adjunto",
  videoThumbnailUnavailableLabel: "Miniatura no disponible",
  videoPlayHintLabel: "Tocá para ver el video",
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
  pollOptionRequired: "Completar esta opción",
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
  putMethod: "PUT",
  outlineVariant: "outline",
  submitType: "submit",
  urlInputType: "url",
} as const;

const TRIBE_ROUND_MEDIA = {
  eagerLoading: "eager",
  imageElementTag: "img",
  lazyLoading: "lazy",
} as const;

const TRIBE_ROUND_ATTRIBUTES = {
  channelFilterEmojiHidden: true,
  composerAvatarSize: "lg",
  contentExpandedDataAttribute: "data-expanded",
  dropdownAlign: "center",
  messageActionsDropdownAlign: "end",
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

const TRIBE_ROUND_CAROUSEL = {
  imageDecoding: "async",
  imageFetchPriority: "high",
  transitionDuration: 14,
} as const;

/**
 * Arrow keys that drive the media carousel. The dialog intercepts them at the
 * capture phase so navigation works regardless of which element inside the
 * dialog holds focus (close button, dialog body, or a carousel control).
 */
const TRIBE_ROUND_CAROUSEL_KEY = {
  next: "ArrowRight",
  previous: "ArrowLeft",
} as const;

/**
 * Embla carousel event names the media dialog subscribes to. `select` fires at
 * the start of a scroll (responsive progress), `settle` once it finishes (safe
 * point to mount/unmount the active video iframe), and `reInit` on re-layout.
 */
const TRIBE_ROUND_CAROUSEL_EVENT = {
  reInit: "reInit",
  select: "select",
  settle: "settle",
} as const;

const COMPOSER_BODY_SCROLL = {
  bottomBehavior: "smooth",
  pollBlockAlignment: "end",
  focusBlockAlignment: "nearest",
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
  messageVideoIdPrefix: "optimistic-message-video-",
  fileLocalIdPrefix: "composer-file-",
  mediaVideoLocalIdPrefix: "composer-video-",
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
  composerBlockKey: "poll-composer",
  draftKeyPrefix: "poll-option-",
  firstOptionIndex: 0,
  initialOptionCount: 2,
  minimumOptionCount: 2,
  multipleInputType: "checkbox",
  percentageBase: 100,
  percentageStyleProperty: "--poll-result",
  percentageSuffix: "%",
  singleInputType: "radio",
} as const;

/**
 * Stable keys under which the title, content and channel fields register their
 * DOM nodes in the composer block registry, so a failed validation can scroll
 * the offending field into view.
 */
const MESSAGE_COMPOSER_FIELD_ANCHOR_KEY = {
  channel: "composer-field-channel",
  content: "composer-field-content",
  title: "composer-field-title",
} as const;

/**
 * Poll requirement copies grouped together so the poll composer can render its
 * inline error and the scroll logic can detect a poll-scoped failure.
 */
const MESSAGE_COMPOSER_POLL_ERROR_COPIES = [
  TRIBE_ROUND_COPY.messageComposerPollOptionsRequired,
  TRIBE_ROUND_COPY.messageComposerPollOptionsLimit,
  TRIBE_ROUND_COPY.messageComposerPollOptionTooLong,
  TRIBE_ROUND_COPY.messageComposerDuplicatePollOptions,
] as const;

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
  blobUrlPrefix: "blob:",
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
  files?: TribeRoundMessageResult["files"];
  media?: TribeRoundMessageResult["media"];
  message?: string;
  messageId?: string;
  poll?: TribeRoundMessageResult["poll"];
  title?: string;
};

type MessageImageUploadResponse = {
  assetId?: string;
  imageId?: string;
  message?: string;
  uploadUrl?: string;
};

type MessageFileUploadResponse = {
  assetId?: string;
  message?: string;
  uploadHeaders?: Record<string, string>;
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

const COMPOSER_FILE_UPLOAD_STATUS = {
  error: "error",
  uploaded: "uploaded",
  uploading: "uploading",
} as const;

type ComposerFileUploadStatus =
  (typeof COMPOSER_FILE_UPLOAD_STATUS)[keyof typeof COMPOSER_FILE_UPLOAD_STATUS];

/**
 * A single file attachment draft of the composer's downloads list. The array
 * index expresses the author-chosen download slot, mirroring the `sortOrder`
 * the server assigns on submit.
 */
type ComposerFileDraft = {
  /** Draft asset id reserved by the upload endpoint once it responds. */
  assetId?: string;
  fileName: string;
  fileSizeBytes: number;
  /** Whether the file is already attached to the message being edited. */
  isPersisted: boolean;
  localId: string;
  mimeType: string;
  /**
   * Original browser file, kept so a failed upload can be retried. Absent for
   * drafts hydrated from an existing message's attachments.
   */
  sourceFile?: File;
  status: ComposerFileUploadStatus;
};

/**
 * A single image attachment inside the unified, ordered media draft list. It
 * carries every Cloudflare upload field of {@link ComposerImageDraft} plus the
 * discriminating `kind` shared by all media drafts.
 */
type ComposerImageMediaDraft = {
  kind: typeof MESSAGE_MEDIA_KIND.image;
} & ComposerImageDraft;

/**
 * A single external video attachment inside the unified, ordered media draft
 * list. The author pastes a URL that is validated live with
 * {@link safeParseVideoUrl}; the URL is sent verbatim on submit.
 */
type ComposerVideoMediaDraft = {
  kind: typeof MESSAGE_MEDIA_KIND.video;
  localId: string;
  url: string;
};

/**
 * One slot in the composer's ordered media list. Images and external videos
 * share a single array so the array index expresses the author-chosen global
 * order (`sortOrder`).
 */
type ComposerMediaDraft = ComposerImageMediaDraft | ComposerVideoMediaDraft;

type ResetMessageComposerOptions = {
  shouldCleanupTransientUploads?: boolean;
  shouldRevokeImagePreviewUrls?: boolean;
};

type CreateMessageDraftSnapshot = {
  content: string;
  mediaDrafts: ComposerMediaDraft[];
  isPollComposerEnabled: boolean;
  messageContent: string;
  messageContentLinks: RichLink[];
  pollAllowsMultipleVotes: boolean;
  pollOptions: string[];
  selectedChannelId: string;
  title: string;
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

type TribeRoundMessageMediaResult = NonNullable<
  TribeRoundMessageResult["media"]
>[number];

type TribeRoundMessageImageResult = Extract<
  TribeRoundMessageMediaResult,
  { kind: typeof MESSAGE_MEDIA_KIND.image }
>;

type TribeRoundMessageVideoResult = Extract<
  TribeRoundMessageMediaResult,
  { kind: typeof MESSAGE_MEDIA_KIND.video }
>;

type ActiveMessageMediaCarousel = {
  mediaIndex: number;
  messageId: string;
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

function revokeMessageImagePreviewUrl(previewUrl: string): void {
  if (
    previewUrl.startsWith(TRIBE_ROUND_SYMBOLS.blobUrlPrefix) &&
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

/**
 * Type guard selecting the image slots of the unified media draft list.
 */
function isComposerImageMediaDraft(
  mediaDraft: ComposerMediaDraft
): mediaDraft is ComposerImageMediaDraft {
  return mediaDraft.kind === MESSAGE_MEDIA_KIND.image;
}

/**
 * Extracts the image drafts from an ordered media draft list, preserving their
 * relative order. The Cloudflare upload and cleanup machinery operates on image
 * drafts only, so it consumes this projection of the unified list.
 */
function getImageDraftsFromMediaDrafts(
  mediaDrafts: ComposerMediaDraft[]
): ComposerImageDraft[] {
  return mediaDrafts.filter(isComposerImageMediaDraft).map(({ kind, ...imageDraft }) => {
    void kind;
    return imageDraft;
  });
}

function getMissingMessageRequirements(input: {
  channelId: string;
  content: string;
  mediaDrafts?: ComposerMediaDraft[];
  poll?: {
    enabled: boolean;
    options: string[];
  };
  title: string;
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

  const hasInvalidVideoDraft = (input.mediaDrafts ?? []).some(
    (mediaDraft) =>
      mediaDraft.kind === MESSAGE_MEDIA_KIND.video &&
      !safeParseVideoUrl(mediaDraft.url)
  );

  if (hasInvalidVideoDraft) {
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
}): string[] {
  const trimmedOptions = poll.options
    .map((option) => option.trim())
    .filter(Boolean);
  const uniqueOptionTexts = new Set(
    trimmedOptions.map((option) => option.toLocaleLowerCase())
  );
  const pollRequirements: string[] = [];

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

function getMessageImageMedia(
  message: TribeRoundMessageResult | null
): TribeRoundMessageImageResult[] {
  return (message?.media ?? []).filter(
    (mediaItem): mediaItem is TribeRoundMessageImageResult =>
      mediaItem.kind === MESSAGE_MEDIA_KIND.image
  );
}

/**
 * Rewrites the created message so its image slots keep the optimistic preview
 * URLs (local blobs or already-known remote URLs) while the persisted message
 * still carries the server-assigned ordering and remaining media untouched.
 */
function getCreatedMessageWithStableImages({
  createdMessage,
  optimisticMessage,
}: {
  createdMessage: TribeRoundMessageResult;
  optimisticMessage: TribeRoundVisibleMessageResult | null;
}): TribeRoundMessageResult {
  const optimisticImages = getMessageImageMedia(optimisticMessage);

  if (optimisticImages.length === 0) {
    return createdMessage;
  }

  const createdMedia = createdMessage.media ?? [];

  if (createdMedia.length === 0) {
    return {
      ...createdMessage,
      media: optimisticMessage?.media ?? [],
    };
  }

  const optimisticImageUrlsById = new Map(
    optimisticImages.map((image) => [image.id, image.url])
  );
  const stableMedia: MessageMediaResult[] = createdMedia.map((mediaItem) =>
    mediaItem.kind === MESSAGE_MEDIA_KIND.image
      ? {
          ...mediaItem,
          url: optimisticImageUrlsById.get(mediaItem.id) ?? mediaItem.url,
        }
      : mediaItem
  );

  return {
    ...createdMessage,
    media: stableMedia,
  };
}

function shouldKeepOptimisticImagePreviewUrls({
  createdMessage,
  optimisticMessage,
}: {
  createdMessage: TribeRoundMessageResult;
  optimisticMessage: TribeRoundVisibleMessageResult | null;
}): boolean {
  const optimisticImages = getMessageImageMedia(optimisticMessage);

  if (optimisticImages.length === 0) {
    return false;
  }

  const createdImageIds = new Set(
    getMessageImageMedia(createdMessage).map((image) => image.id)
  );

  return optimisticImages.some(
    (image) =>
      image.url.startsWith(TRIBE_ROUND_SYMBOLS.blobUrlPrefix) ||
      createdImageIds.has(image.id)
  );
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
  const [messages, setMessages] =
    useState<TribeRoundVisibleMessageResult[]>(round.messages);
  const [visiblePagination, setVisiblePagination] = useState(round.pagination);
  const [isMessageComposerOpen, setIsMessageComposerOpen] = useState(false);
  const [messageTitle, setMessageTitle] = useState("");
  const [isPollComposerEnabled, setIsPollComposerEnabled] = useState(false);
  const [pollOptions, setPollOptions] = useState<string[]>(
    Array.from({ length: TRIBE_ROUND_POLL.initialOptionCount }, () => "")
  );
  const [pollAllowsMultipleVotes, setPollAllowsMultipleVotes] = useState(false);
  const [mediaDrafts, setMediaDrafts] = useState<ComposerMediaDraft[]>([]);
  const [fileDrafts, setFileDrafts] = useState<ComposerFileDraft[]>([]);
  const [selectedPollOptionIds, setSelectedPollOptionIds] = useState<
    Record<string, string[] | undefined>
  >({});
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [messageComposerErrors, setMessageComposerErrors] = useState<string[]>([]);
  const messageEditor = useRichLinkEditor({
    onContentChange: () => setMessageComposerErrors([]),
  });
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyLoadStatuses, setReplyLoadStatuses] = useState<
    Record<string, ReplyLoadStatus | undefined>
  >({});
  const [expandedMessageIds, setExpandedMessageIds] = useState<Record<string, boolean>>(
    {}
  );
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [activeImageCarousel, setActiveImageCarousel] =
    useState<ActiveMessageMediaCarousel | null>(null);
  const [activeImageCarouselSlideIndex, setActiveImageCarouselSlideIndex] =
    useState(0);
  // The slide that drives video iframe mounting. It only follows the carousel
  // once a scroll animation has fully settled, so the heavy mount/unmount of a
  // cross-origin player never runs mid-transition (which stalled Embla's rAF
  // animation and made the arrow controls appear stuck).
  const [settledImageCarouselSlideIndex, setSettledImageCarouselSlideIndex] =
    useState(0);
  const [imageCarouselApi, setImageCarouselApi] = useState<CarouselApi | null>(
    null
  );
  // Tracks whether Embla is mid-scroll. `select` opens this window (the target
  // snap changed); `settle` closes it, and so does a `reInit`, which aborts any
  // in-flight scroll. While the window is open, the post-decode image-preload
  // `reInit` is deferred so it never recreates the engine mid-animation and cuts
  // arrow navigation short.
  const isImageCarouselScrollInProgressRef = useRef(false);
  // Holds a post-decode image-preload `reInit` that arrived mid-scroll. Embla's
  // `reInit` recreates the engine and aborts the running scroll, so it is parked
  // here and flushed once the scroll settles, keeping arrow navigation smooth.
  const pendingImageCarouselReInitRef = useRef(false);
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
  const discardedMessageFileLocalIdsRef = useRef<Set<string>>(new Set());
  const cleanedMessageFileAssetIdsRef = useRef<Set<string>>(new Set());
  const inFlightMessageFileCleanupAssetIdsRef = useRef<Set<string>>(new Set());
  const persistingMessageFileAssetIdsRef = useRef<Set<string>>(new Set());
  const queuedMessageFileCleanupAssetIdsRef = useRef<Set<string>>(new Set());
  const messageFileCounterRef = useRef(0);
  const optimisticMessageCounterRef = useRef(0);
  const optimisticReplyCounterRef = useRef(0);
  const pendingCreateMessageIntentRef =
    useRef<PendingCreateMessageIntent | null>(null);
  const mediaDraftCounterRef = useRef(0);
  const isBusy = Boolean(pendingActionId);

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

  /**
   * Image projection of the unified media draft list. The Cloudflare upload and
   * cleanup machinery reads and writes this view; updates are merged back into
   * `mediaDrafts` so the author-chosen global order is preserved.
   */
  const messageImageDrafts = getImageDraftsFromMediaDrafts(mediaDrafts);

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
      setMediaDrafts((currentMediaDrafts) => {
        const currentImageDrafts =
          getImageDraftsFromMediaDrafts(currentMediaDrafts);
        const nextImageDrafts =
          typeof updater === "function"
            ? updater(currentImageDrafts)
            : updater;
        const nextImageDraftsByLocalId = new Map(
          nextImageDrafts.map((imageDraft) => [imageDraft.localId, imageDraft])
        );
        const survivingMediaDrafts = currentMediaDrafts.filter(
          (mediaDraft) =>
            mediaDraft.kind === MESSAGE_MEDIA_KIND.video ||
            nextImageDraftsByLocalId.has(mediaDraft.localId)
        );
        const appendedImageDrafts = nextImageDrafts.filter(
          (imageDraft) =>
            !currentMediaDrafts.some(
              (mediaDraft) =>
                mediaDraft.kind === MESSAGE_MEDIA_KIND.image &&
                mediaDraft.localId === imageDraft.localId
            )
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
            kind: MESSAGE_MEDIA_KIND.image as typeof MESSAGE_MEDIA_KIND.image,
            ...imageDraft,
          })),
        ];
      });
    },
    []
  );
  const selectedChannel =
    round.channels.find((channel) => channel.id === selectedChannelId) ?? null;
  const hasMessageComposerErrors = messageComposerErrors.length > 0;
  const isMessageTitleInvalid = messageComposerErrors.includes(
    TRIBE_ROUND_COPY.messageComposerMissingTitle
  );
  const isMessageContentInvalid = messageComposerErrors.includes(
    TRIBE_ROUND_COPY.messageComposerMissingContent
  );
  const isMessageChannelInvalid = messageComposerErrors.includes(
    TRIBE_ROUND_COPY.messageComposerMissingChannel
  );
  const selectedMessage =
    messages.find((message) => message.id === selectedMessageId) ?? null;
  const activeImageCarouselMessage = activeImageCarousel
    ? messages.find((message) => message.id === activeImageCarousel.messageId) ??
      null
    : null;
  const activeImageCarouselMedia = activeImageCarouselMessage?.media ?? [];
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

  /**
   * Best-effort deletion of a draft file asset, mirroring
   * {@link deleteMessageImageAsset}: it deduplicates concurrent calls per
   * asset and retries once when a deletion was queued while another was in
   * flight.
   */
  const deleteMessageFileAsset = useCallback(
    (
      assetId: string,
      actionTribeSlug: string = currentTribeSlugRef.current
    ) => {
      if (cleanedMessageFileAssetIdsRef.current.has(assetId)) {
        return;
      }

      if (inFlightMessageFileCleanupAssetIdsRef.current.has(assetId)) {
        queuedMessageFileCleanupAssetIdsRef.current.add(assetId);
        return;
      }

      inFlightMessageFileCleanupAssetIdsRef.current.add(assetId);
      void (async () => {
        let shouldRetryQueuedCleanup = false;

        do {
          shouldRetryQueuedCleanup = false;

          try {
            await submitJsonRequest(
              TRIBE_ROUND_ENDPOINT.messageFileItem(actionTribeSlug, assetId),
              undefined,
              undefined,
              TRIBE_ROUND_FORM.deleteMethod
            );
            cleanedMessageFileAssetIdsRef.current.add(assetId);
            queuedMessageFileCleanupAssetIdsRef.current.delete(assetId);
          } catch {
            shouldRetryQueuedCleanup =
              queuedMessageFileCleanupAssetIdsRef.current.delete(assetId);
          }
        } while (shouldRetryQueuedCleanup);

        inFlightMessageFileCleanupAssetIdsRef.current.delete(assetId);
      })();
    },
    []
  );

  useEffect(() => {
    currentTribeSlugRef.current = tribeSlug;
  }, [tribeSlug]);

  useEffect(() => {
    currentMessageImageDraftsRef.current =
      getImageDraftsFromMediaDrafts(mediaDrafts);
  }, [mediaDrafts]);

  useEffect(() => {
    if (!activeImageCarousel || !imageCarouselApi) {
      return;
    }

    let isCancelled = false;

    const settleFrameId = window.requestAnimationFrame(() => {
      if (isCancelled) {
        return;
      }

      imageCarouselApi.reInit();
    });

    return () => {
      isCancelled = true;
      window.cancelAnimationFrame(settleFrameId);
    };
  }, [
    activeImageCarousel,
    activeImageCarouselMedia.length,
    imageCarouselApi,
  ]);

  useEffect(() => {
    if (!activeImageCarousel || !imageCarouselApi) {
      return;
    }

    // `select` fires as soon as the target snap changes (scroll start) and keeps
    // the progress indicator responsive. `settle` fires once the scroll
    // animation has finished; gating video iframe mounting on it avoids tearing
    // down a cross-origin player while Embla is still animating. A `reInit`
    // (image preload decode or relayout during navigation) recreates the engine
    // at rest on the selected snap and emits no follow-up `settle`, so it ends
    // any in-flight scroll and finalizes the iframe-driving settled index.
    const beginImageCarouselScroll = () => {
      isImageCarouselScrollInProgressRef.current = true;
      setActiveImageCarouselSlideIndex(imageCarouselApi.selectedScrollSnap());
    };

    // Runs a post-decode image-preload `reInit` that was deferred because it
    // arrived mid-scroll, now that the carousel is at rest. The follow-up
    // `reInit` event finalizes the indices again (a no-op at the settled snap).
    const flushPendingImageCarouselReInit = () => {
      if (!pendingImageCarouselReInitRef.current) {
        return;
      }

      pendingImageCarouselReInitRef.current = false;
      imageCarouselApi.reInit();
    };

    const settleImageCarouselSlideIndices = () => {
      isImageCarouselScrollInProgressRef.current = false;
      const settledSnapIndex = imageCarouselApi.selectedScrollSnap();
      setActiveImageCarouselSlideIndex(settledSnapIndex);
      setSettledImageCarouselSlideIndex(settledSnapIndex);
      flushPendingImageCarouselReInit();
    };

    const finalizeImageCarouselSlideIndicesOnReInit = () => {
      const { activeSlideIndex, settledSlideIndex, isScrollInProgress } =
        resolveImageCarouselSlideIndicesOnReInit(
          imageCarouselApi.selectedScrollSnap()
        );
      isImageCarouselScrollInProgressRef.current = isScrollInProgress;
      setActiveImageCarouselSlideIndex(activeSlideIndex);
      setSettledImageCarouselSlideIndex(settledSlideIndex);
    };

    // Known non-animated initialization: sync both indices from a settled state.
    settleImageCarouselSlideIndices();
    imageCarouselApi.on(
      TRIBE_ROUND_CAROUSEL_EVENT.reInit,
      finalizeImageCarouselSlideIndicesOnReInit
    );
    imageCarouselApi.on(
      TRIBE_ROUND_CAROUSEL_EVENT.select,
      beginImageCarouselScroll
    );
    imageCarouselApi.on(
      TRIBE_ROUND_CAROUSEL_EVENT.settle,
      settleImageCarouselSlideIndices
    );

    return () => {
      isImageCarouselScrollInProgressRef.current = false;
      pendingImageCarouselReInitRef.current = false;
      imageCarouselApi.off(
        TRIBE_ROUND_CAROUSEL_EVENT.reInit,
        finalizeImageCarouselSlideIndicesOnReInit
      );
      imageCarouselApi.off(
        TRIBE_ROUND_CAROUSEL_EVENT.select,
        beginImageCarouselScroll
      );
      imageCarouselApi.off(
        TRIBE_ROUND_CAROUSEL_EVENT.settle,
        settleImageCarouselSlideIndices
      );
    };
  }, [activeImageCarousel, imageCarouselApi]);

  const activeImageCarouselMessageMedia = activeImageCarouselMessage?.media;

  useEffect(() => {
    const imageMedia = (activeImageCarouselMessageMedia ?? []).filter(
      (mediaItem) => mediaItem.kind === MESSAGE_MEDIA_KIND.image
    );

    if (imageMedia.length === 0) {
      return;
    }

    let isCancelled = false;
    const preloadedImages = imageMedia.map((image) => {
      const preloadedImage = new window.Image();
      preloadedImage.decoding = TRIBE_ROUND_CAROUSEL.imageDecoding;
      preloadedImage.fetchPriority = TRIBE_ROUND_CAROUSEL.imageFetchPriority;
      preloadedImage.src = image.url;

      return preloadedImage;
    });

    void Promise.allSettled(
      preloadedImages.map((preloadedImage) =>
        preloadedImage.decode ? preloadedImage.decode() : Promise.resolve()
      )
    ).then(() => {
      if (isCancelled) {
        return;
      }

      // A `reInit` recreates the Embla engine and aborts any running scroll, so
      // firing it mid-navigation would cut a scroll short. Park it until the
      // scroll settles; the settle handler flushes the pending reInit at rest.
      if (isImageCarouselScrollInProgressRef.current) {
        pendingImageCarouselReInitRef.current = true;
        return;
      }

      imageCarouselApi?.reInit();
    });

    return () => {
      isCancelled = true;
    };
  }, [activeImageCarouselMessageMedia, imageCarouselApi]);

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

      getImageDraftsFromMediaDrafts(
        pendingCreateMessageIntentRef.current?.draft.mediaDrafts ?? []
      ).forEach((imageDraft) => {
        if (!revokedMessageImagePreviewUrls.has(imageDraft.previewUrl)) {
          revokeMessageImagePreviewUrl(imageDraft.previewUrl);
        }
      });
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

  /**
   * Discards every transient file draft that is not being persisted by an
   * in-flight message submission: drafts still uploading are marked discarded
   * so their upload callback cleans the reserved asset, and drafts with a
   * reserved asset get a best-effort server-side deletion.
   */
  const cleanupTransientMessageFileDrafts = (
    transientCandidateFileDrafts: ComposerFileDraft[]
  ) => {
    const persistingMessageFileAssetIds =
      persistingMessageFileAssetIdsRef.current;

    transientCandidateFileDrafts
      .filter(
        (fileDraft) =>
          !fileDraft.isPersisted &&
          (!fileDraft.assetId ||
            !persistingMessageFileAssetIds.has(fileDraft.assetId))
      )
      .forEach((fileDraft) => {
        discardedMessageFileLocalIdsRef.current.add(fileDraft.localId);

        if (fileDraft.assetId) {
          deleteMessageFileAsset(fileDraft.assetId);
        }
      });
  };

  const resetMessageComposer = ({
    shouldCleanupTransientUploads = false,
    shouldRevokeImagePreviewUrls = true,
  }: ResetMessageComposerOptions = {}) => {
    if (shouldCleanupTransientUploads) {
      cleanupTransientMessageImageDrafts(messageImageDrafts);
      cleanupTransientMessageFileDrafts(fileDrafts);
    }

    if (shouldRevokeImagePreviewUrls) {
      revokeMessageImageDraftPreviewUrls(messageImageDrafts);
    }
    currentMessageImageDraftsRef.current = [];
    setMessageTitle("");
    messageEditor.reset();
    setIsPollComposerEnabled(false);
    setPollOptions(
      Array.from({ length: TRIBE_ROUND_POLL.initialOptionCount }, () => "")
    );
    setPollAllowsMultipleVotes(false);
    setMediaDrafts([]);
    setFileDrafts([]);
    setSelectedChannelId("");
    setMessageComposerErrors([]);
    setEditingMessageId(null);
  };

  const handleMessageComposerOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      resetMessageComposer({ shouldCleanupTransientUploads: true });
    }

    setIsMessageComposerOpen(isOpen);
  };

  const buildMessageMediaPayload = (): MessageMediaDraftCommand[] =>
    mediaDrafts.flatMap<MessageMediaDraftCommand>((mediaDraft) => {
      if (mediaDraft.kind === MESSAGE_MEDIA_KIND.image) {
        if (
          mediaDraft.status !== COMPOSER_IMAGE_UPLOAD_STATUS.uploaded ||
          !mediaDraft.assetId
        ) {
          return [];
        }

        return [
          {
            altText: mediaDraft.altText,
            assetId: mediaDraft.assetId,
            kind: MESSAGE_MEDIA_KIND.image,
          },
        ];
      }

      const trimmedUrl = mediaDraft.url.trim();

      if (trimmedUrl.length === 0) {
        return [];
      }

      return [{ kind: MESSAGE_MEDIA_KIND.video, url: trimmedUrl }];
    });

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

  /**
   * Projects the ready file drafts to the `files` payload of the create and
   * edit endpoints. The array index expresses the author-chosen download slot.
   */
  const buildMessageFilesPayload = (): { assetId: string }[] =>
    fileDrafts.flatMap((fileDraft) =>
      fileDraft.status === COMPOSER_FILE_UPLOAD_STATUS.uploaded &&
      fileDraft.assetId
        ? [{ assetId: fileDraft.assetId }]
        : []
    );

  const getPersistingTransientMessageFileAssetIds = () =>
    fileDrafts
      .filter(
        (fileDraft) =>
          !fileDraft.isPersisted &&
          fileDraft.status === COMPOSER_FILE_UPLOAD_STATUS.uploaded &&
          Boolean(fileDraft.assetId)
      )
      .map((fileDraft) => fileDraft.assetId ?? "");

  const getMessageFileDraftValidationError = () => {
    if (
      fileDrafts.some(
        (fileDraft) =>
          fileDraft.status === COMPOSER_FILE_UPLOAD_STATUS.uploading
      )
    ) {
      return TRIBE_ROUND_COPY.fileUploadPendingError;
    }

    if (
      fileDrafts.some(
        (fileDraft) => fileDraft.status === COMPOSER_FILE_UPLOAD_STATUS.error
      )
    ) {
      return TRIBE_ROUND_COPY.fileUploadError;
    }

    return null;
  };

  /**
   * Resolves the DOM node of the first field, in top-to-bottom visual order,
   * that the given validation errors point to, so the composer can bring it into
   * view. Media errors resolve to the specific offending draft; field-level
   * errors resolve to the registered title, content, poll or channel node.
   */
  const getFirstComposerErrorAnchor = (
    errors: string[]
  ): HTMLElement | null | undefined => {
    const blockTargets = composerBlockTargetsRef.current;

    if (errors.includes(TRIBE_ROUND_COPY.messageComposerMissingTitle)) {
      return blockTargets.get(MESSAGE_COMPOSER_FIELD_ANCHOR_KEY.title);
    }

    if (errors.includes(TRIBE_ROUND_COPY.messageComposerMissingContent)) {
      return blockTargets.get(MESSAGE_COMPOSER_FIELD_ANCHOR_KEY.content);
    }

    if (MESSAGE_COMPOSER_POLL_ERROR_COPIES.some((copy) => errors.includes(copy))) {
      return blockTargets.get(TRIBE_ROUND_POLL.composerBlockKey);
    }

    if (errors.includes(TRIBE_ROUND_COPY.videoMissing)) {
      const invalidVideoDraft = mediaDrafts.find(
        (mediaDraft) =>
          mediaDraft.kind === MESSAGE_MEDIA_KIND.video &&
          !safeParseVideoUrl(mediaDraft.url)
      );

      return invalidVideoDraft
        ? blockTargets.get(invalidVideoDraft.localId)
        : undefined;
    }

    if (
      errors.includes(TRIBE_ROUND_COPY.imageUploadPendingError) ||
      errors.includes(TRIBE_ROUND_COPY.imageUploadError)
    ) {
      const problemImageDraft = messageImageDrafts.find(
        (imageDraft) =>
          imageDraft.status === COMPOSER_IMAGE_UPLOAD_STATUS.uploading ||
          imageDraft.status === COMPOSER_IMAGE_UPLOAD_STATUS.error
      );

      return problemImageDraft
        ? blockTargets.get(problemImageDraft.localId)
        : undefined;
    }

    if (
      errors.includes(TRIBE_ROUND_COPY.fileUploadPendingError) ||
      errors.includes(TRIBE_ROUND_COPY.fileUploadError)
    ) {
      const problemFileDraft = fileDrafts.find(
        (fileDraft) =>
          fileDraft.status === COMPOSER_FILE_UPLOAD_STATUS.uploading ||
          fileDraft.status === COMPOSER_FILE_UPLOAD_STATUS.error
      );

      return problemFileDraft
        ? blockTargets.get(problemFileDraft.localId)
        : undefined;
    }

    if (errors.includes(TRIBE_ROUND_COPY.mediaLimitError)) {
      const lastMediaDraft = mediaDrafts.at(-1);

      return lastMediaDraft ? blockTargets.get(lastMediaDraft.localId) : undefined;
    }

    if (errors.includes(TRIBE_ROUND_COPY.messageComposerMissingChannel)) {
      return blockTargets.get(MESSAGE_COMPOSER_FIELD_ANCHOR_KEY.channel);
    }

    return undefined;
  };

  /**
   * Scrolls the first field that failed validation into view on the next frame,
   * after the inline errors have rendered, so the user notices the problem even
   * when it sits outside the visible area of the modal.
   */
  const scrollToFirstComposerError = (errors: string[]) => {
    window.requestAnimationFrame(() => {
      getFirstComposerErrorAnchor(errors)?.scrollIntoView({
        behavior: COMPOSER_BODY_SCROLL.bottomBehavior,
        block: COMPOSER_BODY_SCROLL.focusBlockAlignment,
      });
    });
  };

  /**
   * Publishes a failed validation: lists the errors in the summary and inline,
   * and scrolls the first offending field into view so the user notices it.
   */
  const reportComposerErrors = (errors: string[]) => {
    setMessageComposerErrors(errors);
    scrollToFirstComposerError(errors);
  };

  /**
   * Renders the inline error message for a single composer field next to it,
   * shown only while that field's requirement is part of the active errors. The
   * general "Falta completar" summary keeps listing every error in parallel.
   */
  const renderComposerFieldError = (errorCopy: string) =>
    messageComposerErrors.includes(errorCopy) ? (
      <p className={styles.TribeRound__fieldError}>{errorCopy}</p>
    ) : null;

  /**
   * Whether an empty option shows its own "complete this option" error inline.
   * Only the first {@link TRIBE_ROUND_POLL.minimumOptionCount} options are
   * mandatory, and the error surfaces once the required-option validation fails,
   * so the user sees exactly which mandatory options are still empty.
   */
  const shouldShowPollOptionRequiredError = (
    optionIndex: number,
    optionValue: string
  ) =>
    messageComposerErrors.includes(
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
  const renderComposerPollErrors = () =>
    MESSAGE_COMPOSER_POLL_ERROR_COPIES.filter(
      (errorCopy) =>
        errorCopy !== TRIBE_ROUND_COPY.messageComposerPollOptionsRequired &&
        messageComposerErrors.includes(errorCopy)
    ).map((errorCopy) => (
      <p className={styles.TribeRound__fieldError} key={errorCopy}>
        {errorCopy}
      </p>
    ));

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

  const markMessageFilesAsPersisting = (assetIds: string[]) => {
    assetIds.forEach((assetId) => {
      persistingMessageFileAssetIdsRef.current.add(assetId);
    });
  };

  const clearPersistingMessageFiles = (assetIds: string[]) => {
    assetIds.forEach((assetId) => {
      persistingMessageFileAssetIdsRef.current.delete(assetId);
    });
  };

  const cleanupPersistingMessageFiles = (
    assetIds: string[],
    actionTribeSlug: string
  ) => {
    assetIds.forEach((assetId) => {
      persistingMessageFileAssetIdsRef.current.delete(assetId);
      deleteMessageFileAsset(assetId, actionTribeSlug);
    });
  };

  const removeTransientMessageFileDraftsFromComposer = () => {
    setFileDrafts((currentFileDrafts) =>
      currentFileDrafts.filter((fileDraft) => fileDraft.isPersisted)
    );
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

    if (mediaDrafts.length + selectedFiles.length > MESSAGE_MEDIA.maxCount) {
      reportComposerErrors([TRIBE_ROUND_COPY.mediaLimitError]);
      return;
    }

    let firstAddedImageLocalId: string | null = null;

    selectedFiles.forEach((file) => {
      messageImageCounterRef.current += 1;
      const localId = `${file.name}-${String(file.lastModified)}-${String(
        messageImageCounterRef.current
      )}`;

      if (firstAddedImageLocalId === null) {
        firstAddedImageLocalId = localId;
      }
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

    if (firstAddedImageLocalId !== null) {
      revealComposerBlock(firstAddedImageLocalId, firstAddedImageLocalId);
    }
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

  /**
   * Reserves a draft asset for {@link file} and uploads the raw bytes to the
   * signed URL, mirroring {@link uploadMessageImage}: the draft is marked
   * `uploaded` on success, `error` on failure (keeping the reserved asset id
   * for cleanup), and a draft discarded mid-flight deletes its asset instead
   * of updating state.
   */
  const uploadMessageFile = async (file: File, localId: string) => {
    let createdAssetId: string | null = null;

    try {
      const upload = await submitJsonRequest<MessageFileUploadResponse>(
        TRIBE_ROUND_ENDPOINT.messageFileUploads(tribeSlug),
        {
          fileName: file.name,
          fileSizeBytes: file.size,
          mimeType: file.type,
        }
      );

      if (!upload.assetId || !upload.uploadUrl) {
        throw new Error(TRIBE_ROUND_COPY.fileUploadError);
      }

      createdAssetId = upload.assetId;

      if (discardedMessageFileLocalIdsRef.current.delete(localId)) {
        if (!cleanedMessageFileAssetIdsRef.current.has(upload.assetId)) {
          deleteMessageFileAsset(upload.assetId);
        }

        return;
      }

      setFileDrafts((currentFileDrafts) =>
        currentFileDrafts.map((fileDraft) =>
          fileDraft.localId === localId
            ? {
                ...fileDraft,
                assetId: upload.assetId,
              }
            : fileDraft
        )
      );

      const uploadResponse = await fetch(upload.uploadUrl, {
        body: file,
        headers: {
          [TRIBE_ROUND_FORM.contentTypeHeader]: file.type,
          ...(upload.uploadHeaders ?? {}),
        },
        method: TRIBE_ROUND_FORM.putMethod,
      });

      if (!uploadResponse.ok) {
        throw new Error(TRIBE_ROUND_COPY.fileUploadError);
      }

      if (discardedMessageFileLocalIdsRef.current.delete(localId)) {
        if (!cleanedMessageFileAssetIdsRef.current.has(upload.assetId)) {
          deleteMessageFileAsset(upload.assetId);
        }

        return;
      }

      setFileDrafts((currentFileDrafts) =>
        currentFileDrafts.map((fileDraft) =>
          fileDraft.localId === localId
            ? {
                ...fileDraft,
                status: COMPOSER_FILE_UPLOAD_STATUS.uploaded,
              }
            : fileDraft
        )
      );
    } catch (error) {
      if (discardedMessageFileLocalIdsRef.current.delete(localId)) {
        if (
          createdAssetId &&
          !cleanedMessageFileAssetIdsRef.current.has(createdAssetId)
        ) {
          deleteMessageFileAsset(createdAssetId);
        }

        return;
      }

      setFileDrafts((currentFileDrafts) =>
        currentFileDrafts.map((fileDraft) =>
          fileDraft.localId === localId
            ? {
                ...fileDraft,
                ...(createdAssetId ? { assetId: createdAssetId } : {}),
                status: COMPOSER_FILE_UPLOAD_STATUS.error,
              }
            : fileDraft
        )
      );
      toast.error(
        error instanceof Error
          ? error.message
          : TRIBE_ROUND_COPY.fileUploadError
      );
    }
  };

  /**
   * Validates the picked files against the shared attachment contract before
   * any network call: disallowed types and oversized files are rejected with a
   * toast, and the whole selection is rejected when it would exceed the
   * per-message attachment limit.
   */
  const handleMessageFileSelection = (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const selectedFiles = Array.from(event.currentTarget.files ?? []);

    event.currentTarget.value = "";

    if (selectedFiles.length === 0) {
      return;
    }

    const acceptedFiles: File[] = [];

    selectedFiles.forEach((file) => {
      if (!isAllowedAttachmentMimeType(file.type)) {
        toast.error(TRIBE_ROUND_COPY.fileTypeNotAllowedError);
        return;
      }

      if (file.size > ATTACHMENT_FILE.maxFileSizeBytes) {
        toast.error(TRIBE_ROUND_COPY.fileTooLargeError);
        return;
      }

      acceptedFiles.push(file);
    });

    if (acceptedFiles.length === 0) {
      return;
    }

    if (fileDrafts.length + acceptedFiles.length > MESSAGE_FILES.maxCount) {
      toast.error(TRIBE_ROUND_COPY.fileLimitError);
      return;
    }

    let firstAddedFileLocalId: string | null = null;

    acceptedFiles.forEach((file) => {
      messageFileCounterRef.current += 1;
      const localId =
        TRIBE_ROUND_OPTIMISTIC.fileLocalIdPrefix +
        String(messageFileCounterRef.current);

      if (firstAddedFileLocalId === null) {
        firstAddedFileLocalId = localId;
      }

      setFileDrafts((currentFileDrafts) => [
        ...currentFileDrafts,
        {
          fileName: file.name,
          fileSizeBytes: file.size,
          isPersisted: false,
          localId,
          mimeType: file.type,
          sourceFile: file,
          status: COMPOSER_FILE_UPLOAD_STATUS.uploading,
        },
      ]);
      void uploadMessageFile(file, localId);
    });
    setMessageComposerErrors([]);

    if (firstAddedFileLocalId !== null) {
      revealComposerBlock(firstAddedFileLocalId, firstAddedFileLocalId);
    }
  };

  const removeMessageFileDraft = (fileDraft: ComposerFileDraft) => {
    setFileDrafts((currentFileDrafts) =>
      currentFileDrafts.filter(
        (currentFileDraft) => currentFileDraft.localId !== fileDraft.localId
      )
    );

    if (!fileDraft.isPersisted) {
      discardedMessageFileLocalIdsRef.current.add(fileDraft.localId);

      if (fileDraft.assetId) {
        deleteMessageFileAsset(fileDraft.assetId);
      }
    }
  };

  /**
   * Retries a failed file upload from its kept source file. The stale asset
   * reserved by the failed attempt (if any) is deleted best-effort and the
   * draft restarts the reserve-and-upload flow with a fresh asset.
   */
  const retryMessageFileDraftUpload = (fileDraft: ComposerFileDraft) => {
    const sourceFile = fileDraft.sourceFile;

    if (!sourceFile) {
      return;
    }

    if (fileDraft.assetId) {
      deleteMessageFileAsset(fileDraft.assetId);
    }

    setFileDrafts((currentFileDrafts) =>
      currentFileDrafts.map((currentFileDraft) =>
        currentFileDraft.localId === fileDraft.localId
          ? {
              ...currentFileDraft,
              assetId: undefined,
              status: COMPOSER_FILE_UPLOAD_STATUS.uploading,
            }
          : currentFileDraft
      )
    );
    setMessageComposerErrors([]);
    void uploadMessageFile(sourceFile, fileDraft.localId);
  };

  const addVideoMediaDraft = () => {
    if (mediaDrafts.length >= MESSAGE_MEDIA.maxCount) {
      reportComposerErrors([TRIBE_ROUND_COPY.mediaLimitError]);
      return;
    }

    mediaDraftCounterRef.current += 1;
    const localId =
      TRIBE_ROUND_OPTIMISTIC.mediaVideoLocalIdPrefix +
      String(mediaDraftCounterRef.current);

    setMediaDrafts((currentMediaDrafts) => [
      ...currentMediaDrafts,
      { kind: MESSAGE_MEDIA_KIND.video, localId, url: "" },
    ]);
    setMessageComposerErrors([]);
    revealComposerBlock(localId, localId);
  };

  const updateVideoMediaDraftUrl = (localId: string, url: string) => {
    setMediaDrafts((currentMediaDrafts) =>
      currentMediaDrafts.map((mediaDraft) =>
        mediaDraft.kind === MESSAGE_MEDIA_KIND.video &&
        mediaDraft.localId === localId
          ? { ...mediaDraft, url }
          : mediaDraft
      )
    );
    setMessageComposerErrors([]);
  };

  const removeVideoMediaDraft = (localId: string) => {
    setMediaDrafts((currentMediaDrafts) =>
      currentMediaDrafts.filter(
        (mediaDraft) =>
          !(
            mediaDraft.kind === MESSAGE_MEDIA_KIND.video &&
            mediaDraft.localId === localId
          )
      )
    );
    setMessageComposerErrors([]);
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
    const mediaPayload = buildMessageMediaPayload();
    const filesPayload = buildMessageFilesPayload();
    // Sending `files` replaces the whole attachment set, so the field is only
    // included when the author actually changed it; omitting it leaves the
    // server-side attachments untouched.
    const baselineFileAssetIds = [...(editingMessage?.files ?? [])]
      .sort((firstFile, secondFile) => firstFile.sortOrder - secondFile.sortOrder)
      .map((messageFile) => messageFile.id);
    const hasFileDraftChanges =
      filesPayload.length !== baselineFileAssetIds.length ||
      filesPayload.some(
        (filePayload, fileIndex) =>
          filePayload.assetId !== baselineFileAssetIds[fileIndex]
      );
    const canEditPoll = Boolean(
      editingMessage?.poll && editingMessage.poll.totalVoteCount === 0
    );
    const pollPayload = canEditPoll && isPollComposerEnabled
      ? {
          allowMultipleVotes: pollAllowsMultipleVotes,
          options: pollOptions.map((option) => option.trim()).filter(Boolean),
        }
      : undefined;
    const missingRequirements = getMissingMessageRequirements({
      channelId: editingMessage?.channel.id ?? selectedChannelId,
      content,
      mediaDrafts,
      poll: pollPayload
        ? {
            enabled: true,
            options: pollOptions,
          }
        : undefined,
      title,
    });

    if (missingRequirements.length > 0) {
      reportComposerErrors(missingRequirements);
      return;
    }

    const imageDraftValidationError = getMessageImageDraftValidationError();
    if (imageDraftValidationError) {
      reportComposerErrors([imageDraftValidationError]);
      return;
    }

    const fileDraftValidationError = getMessageFileDraftValidationError();
    if (fileDraftValidationError) {
      reportComposerErrors([fileDraftValidationError]);
      return;
    }

    const actionTribeSlug = tribeSlug;
    const actionToken = currentActionTokenRef.current + 1;
    const persistingImageAssetIds = getPersistingTransientMessageImageAssetIds();
    const persistingFileAssetIds = getPersistingTransientMessageFileAssetIds();

    currentActionTokenRef.current = actionToken;
    markMessageImagesAsPersisting(persistingImageAssetIds);
    markMessageFilesAsPersisting(persistingFileAssetIds);
    setPendingActionId(messageId);

    try {
      const response = await submitJsonRequest<UpdateMessageContentResponse>(
        TRIBE_ROUND_ENDPOINT.messageItem(actionTribeSlug, messageId),
        {
          content,
          ...(hasFileDraftChanges ? { files: filesPayload } : {}),
          media: mediaPayload,
          ...(pollPayload ? { poll: pollPayload } : {}),
          title,
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
                ...(response.files !== undefined ? { files: response.files } : {}),
                ...(response.media !== undefined ? { media: response.media } : {}),
                ...(response.poll !== undefined ? { poll: response.poll } : {}),
                title: appliedTitle,
              }
            : message
        )
      );
      resetMessageComposer();
      clearPersistingMessageImages(persistingImageAssetIds);
      clearPersistingMessageFiles(persistingFileAssetIds);
      setIsMessageComposerOpen(false);
      toast.success(response.message ?? TRIBE_ROUND_COPY.messageEditSuccess);
    } catch (error) {
      if (!isCurrentAction(actionToken, actionTribeSlug)) {
        cleanupPersistingMessageImages(persistingImageAssetIds, actionTribeSlug);
        cleanupPersistingMessageFiles(persistingFileAssetIds, actionTribeSlug);
        return;
      }

      cleanupPersistingMessageImages(persistingImageAssetIds, actionTribeSlug);
      cleanupPersistingMessageFiles(persistingFileAssetIds, actionTribeSlug);
      removeTransientMessageImageDraftsFromComposer();
      removeTransientMessageFileDraftsFromComposer();
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
  }): CreateMessageDraftSnapshot => {
    const editorState = messageEditor.getDisplayState();

    return {
      content,
      mediaDrafts: mediaDrafts.map((mediaDraft) => ({ ...mediaDraft })),
      isPollComposerEnabled,
      messageContent: editorState.content,
      messageContentLinks: editorState.links,
      pollAllowsMultipleVotes,
      pollOptions: [...pollOptions],
      selectedChannelId,
      title,
    };
  };

  const restoreCreateMessageDraft = (draft: CreateMessageDraftSnapshot) => {
    setMessageTitle(draft.title);
    messageEditor.loadFromDisplay({
      content: draft.messageContent,
      links: draft.messageContentLinks,
    });
    setIsPollComposerEnabled(draft.isPollComposerEnabled);
    setPollOptions([...draft.pollOptions]);
    setPollAllowsMultipleVotes(draft.pollAllowsMultipleVotes);
    const restoredMediaDrafts = draft.mediaDrafts.map((mediaDraft) => ({
      ...mediaDraft,
    }));
    setMediaDrafts(restoredMediaDrafts);
    currentMessageImageDraftsRef.current =
      getImageDraftsFromMediaDrafts(restoredMediaDrafts);
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
    const optimisticMedia: MessageMediaResult[] = [];

    mediaDrafts.forEach((mediaDraft, mediaIndex) => {
      const sortOrder = optimisticMedia.length;

      if (mediaDraft.kind === MESSAGE_MEDIA_KIND.image) {
        if (mediaDraft.status !== COMPOSER_IMAGE_UPLOAD_STATUS.uploaded) {
          return;
        }

        optimisticMedia.push({
          altText: mediaDraft.altText,
          id:
            mediaDraft.assetId ??
            TRIBE_ROUND_OPTIMISTIC.messageImageIdPrefix +
              optimisticMessageId +
              TRIBE_ROUND_RESET_KEY.fieldSeparator +
              String(mediaIndex),
          kind: MESSAGE_MEDIA_KIND.image,
          sortOrder,
          url: mediaDraft.previewUrl,
        });
        return;
      }

      const detectedVideo = safeParseVideoUrl(mediaDraft.url);

      if (!detectedVideo) {
        return;
      }

      optimisticMedia.push({
        externalId: detectedVideo.externalId,
        id:
          TRIBE_ROUND_OPTIMISTIC.messageVideoIdPrefix +
          optimisticMessageId +
          TRIBE_ROUND_RESET_KEY.fieldSeparator +
          String(mediaIndex),
        kind: MESSAGE_MEDIA_KIND.video,
        provider: detectedVideo.provider,
        sortOrder,
      });
    });

    // Ready file drafts already own their final asset id, so the optimistic
    // download list matches what the server attaches on creation.
    const optimisticFiles: MessageFileResult[] = fileDrafts
      .flatMap((fileDraft) =>
        fileDraft.status === COMPOSER_FILE_UPLOAD_STATUS.uploaded &&
        fileDraft.assetId
          ? [{ ...fileDraft, assetId: fileDraft.assetId }]
          : []
      )
      .map((readyFileDraft, fileIndex) => ({
        fileName: readyFileDraft.fileName,
        fileSizeBytes: readyFileDraft.fileSizeBytes,
        id: readyFileDraft.assetId,
        mimeType: readyFileDraft.mimeType,
        sortOrder: fileIndex,
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
      ...(optimisticFiles.length > 0 ? { files: optimisticFiles } : {}),
      ...(optimisticMedia.length > 0 ? { media: optimisticMedia } : {}),
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
    };
  };

  const replaceOptimisticMessage = ({
    createdMessage,
    optimisticMessage,
    optimisticMessageId,
  }: {
    createdMessage: TribeRoundMessageResult;
    optimisticMessage: TribeRoundVisibleMessageResult | null;
    optimisticMessageId: string;
  }) => {
    const visibleCreatedMessage = getCreatedMessageWithStableImages({
      createdMessage,
      optimisticMessage,
    });

    setMessages((currentMessages) => {
      const messagesWithoutOptimistic = currentMessages.filter(
        (message) =>
          message.id !== optimisticMessageId &&
          message.id !== visibleCreatedMessage.id
      );

      if (
        !round.activeChannelId ||
        visibleCreatedMessage.channel.id === round.activeChannelId
      ) {
        return getMessagesAfterVisibleMessageCreation({
          createdMessage: visibleCreatedMessage,
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
    const displayContent = messageEditor.content.trim();
    const content = messageEditor.serialize().trim();
    const mediaPayload = buildMessageMediaPayload();
    const filesPayload = buildMessageFilesPayload();

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
      mediaDrafts,
      poll: {
        enabled: isPollComposerEnabled,
        options: pollOptions,
      },
      title,
    });

    if (missingRequirements.length > 0) {
      reportComposerErrors(missingRequirements);
      return;
    }

    const imageDraftValidationError = getMessageImageDraftValidationError();
    if (imageDraftValidationError) {
      reportComposerErrors([imageDraftValidationError]);
      return;
    }

    const fileDraftValidationError = getMessageFileDraftValidationError();
    if (fileDraftValidationError) {
      reportComposerErrors([fileDraftValidationError]);
      return;
    }

    const actionTribeSlug = tribeSlug;
    const actionToken = currentActionTokenRef.current + 1;
    const persistingImageAssetIds = getPersistingTransientMessageImageAssetIds();
    const persistingFileAssetIds = getPersistingTransientMessageFileAssetIds();
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
    markMessageFilesAsPersisting(persistingFileAssetIds);
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
                },
              }
            : {}),
          ...(filesPayload.length > 0 ? { files: filesPayload } : {}),
          ...(mediaPayload.length > 0 ? { media: mediaPayload } : {}),
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
        optimisticMessage,
        optimisticMessageId,
      });
      if (
        !shouldKeepOptimisticImagePreviewUrls({
          createdMessage,
          optimisticMessage,
        })
      ) {
        revokeMessageImageDraftPreviewUrls(
          getImageDraftsFromMediaDrafts(draftSnapshot.mediaDrafts)
        );
      }
      clearPersistingMessageImages(persistingImageAssetIds);
      clearPersistingMessageFiles(persistingFileAssetIds);
      pendingCreateMessageIntentRef.current = null;
      if (!shouldShowOptimisticMessageInCurrentView) {
        resetMessageComposer({ shouldRevokeImagePreviewUrls: false });
        setIsMessageComposerOpen(false);
      }
      toast.success(TRIBE_ROUND_COPY.submitMessageSuccess);
    } catch (error) {
      if (!isCurrentAction(actionToken, actionTribeSlug)) {
        cleanupPersistingMessageImages(persistingImageAssetIds, actionTribeSlug);
        cleanupPersistingMessageFiles(persistingFileAssetIds, actionTribeSlug);
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
      cleanupPersistingMessageFiles(persistingFileAssetIds, actionTribeSlug);
      pendingCreateMessageIntentRef.current = null;
      revokeMessageImageDraftPreviewUrls(
        getImageDraftsFromMediaDrafts(createMessageIntent.draft.mediaDrafts)
      );
      restoreCreateMessageDraft({
        ...createMessageIntent.draft,
        mediaDrafts: createMessageIntent.draft.mediaDrafts.filter(
          (mediaDraft) => mediaDraft.kind === MESSAGE_MEDIA_KIND.video
        ),
      });
      // Like the image drafts above, transient file drafts cannot be restored:
      // their draft assets were just cleaned up server-side.
      removeTransientMessageFileDraftsFromComposer();
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
    resetMessageComposer({ shouldCleanupTransientUploads: true });
    setEditingMessageId(message.id);
    setMessageTitle(message.title ?? "");
    messageEditor.reset(message.content);
    setSelectedChannelId(message.channel.id);
    const hydratedMediaDrafts: ComposerMediaDraft[] = (message.media ?? []).map(
      (mediaItem) => {
        if (mediaItem.kind === MESSAGE_MEDIA_KIND.image) {
          return {
            altText: mediaItem.altText,
            assetId: mediaItem.id,
            isPersisted: true,
            kind: MESSAGE_MEDIA_KIND.image,
            localId: mediaItem.id,
            previewUrl: mediaItem.url,
            status: COMPOSER_IMAGE_UPLOAD_STATUS.uploaded,
          };
        }

        mediaDraftCounterRef.current += 1;

        return {
          kind: MESSAGE_MEDIA_KIND.video,
          localId:
            TRIBE_ROUND_OPTIMISTIC.mediaVideoLocalIdPrefix +
            String(mediaDraftCounterRef.current),
          url: buildEditableVideoUrl(mediaItem),
        };
      }
    );
    setMediaDrafts(hydratedMediaDrafts);
    currentMessageImageDraftsRef.current =
      getImageDraftsFromMediaDrafts(hydratedMediaDrafts);
    const hydratedFileDrafts: ComposerFileDraft[] = [...(message.files ?? [])]
      .sort(
        (firstFile, secondFile) => firstFile.sortOrder - secondFile.sortOrder
      )
      .map((messageFile) => ({
        assetId: messageFile.id,
        fileName: messageFile.fileName,
        fileSizeBytes: messageFile.fileSizeBytes,
        isPersisted: true,
        localId: messageFile.id,
        mimeType: messageFile.mimeType,
        status: COMPOSER_FILE_UPLOAD_STATUS.uploaded,
      }));
    setFileDrafts(hydratedFileDrafts);

    if (message.poll && message.poll.totalVoteCount === 0) {
      setIsPollComposerEnabled(true);
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

  const isLikeButtonDisabled = (message: TribeRoundMessageResult): boolean =>
    !round.viewerPermissions.canReact || isPendingMessage(message);

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
        aria-label={pollAccessibleLabel}
        className={styles.TribeRound__poll}
        onClick={(event) => {
          if (shouldStopDetailsOpening) {
            stopMessageDetailsOpening(event);
          }
        }}
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

  const openMessageMediaCarousel = ({
    event,
    mediaIndex,
    messageId,
  }: {
    event: MouseEvent<HTMLButtonElement>;
    mediaIndex: number;
    messageId: string;
  }) => {
    stopMessageDetailsOpening(event);
    setActiveImageCarouselSlideIndex(mediaIndex);
    setSettledImageCarouselSlideIndex(mediaIndex);
    setActiveImageCarousel({ mediaIndex, messageId });
  };

  const handleImageCarouselOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setActiveImageCarousel(null);
      setActiveImageCarouselSlideIndex(0);
      setSettledImageCarouselSlideIndex(0);
      setImageCarouselApi(null);
    }
  };

  /**
   * Drives the media carousel with the arrow keys from the dialog level. The
   * handler runs in the capture phase and stops propagation so the carousel's
   * own key handler does not fire twice, and so arrows work even when focus
   * sits on the close button or anywhere else inside the dialog. It cannot
   * recover keystrokes routed to a focused cross-origin video iframe, but the
   * carousel only ever mounts the active slide's iframe, so navigating away
   * unmounts it and returns key control to the document.
   */
  const handleImageCarouselKeyDown = (
    event: KeyboardEvent<HTMLDivElement>
  ) => {
    if (activeImageCarouselMedia.length <= 1) {
      return;
    }

    if (event.key === TRIBE_ROUND_CAROUSEL_KEY.previous) {
      event.preventDefault();
      event.stopPropagation();
      imageCarouselApi?.scrollPrev();
    } else if (event.key === TRIBE_ROUND_CAROUSEL_KEY.next) {
      event.preventDefault();
      event.stopPropagation();
      imageCarouselApi?.scrollNext();
    }
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

  const renderMessageMedia = (
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
        {messageMedia.map((mediaItem, mediaIndex) => {
          if (mediaItem.kind === MESSAGE_MEDIA_KIND.video) {
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
                  openMessageMediaCarousel({
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
          }

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
                  openMessageMediaCarousel({
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
        })}
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

  const renderComposerImageMediaDraft = (
    mediaDraft: ComposerImageMediaDraft
  ) => (
    <div
      className={styles.TribeRound__imageDraft}
      key={mediaDraft.localId}
      ref={registerComposerBlockTarget(mediaDraft.localId)}
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
        ref={registerComposerFocusTarget(mediaDraft.localId)}
        disabled={isBusy}
        onChange={(event) => {
          const altText = event.currentTarget.value;

          setMessageImageDrafts((currentImages) =>
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
        {mediaDraft.status === COMPOSER_IMAGE_UPLOAD_STATUS.uploading
          ? TRIBE_ROUND_COPY.imageUploadingLabel
          : mediaDraft.status === COMPOSER_IMAGE_UPLOAD_STATUS.error
            ? TRIBE_ROUND_COPY.imageUploadError
            : ""}
      </span>
      <Button
        aria-label={TRIBE_ROUND_COPY.imageRemoveButton}
        className={styles.TribeRound__imageRemoveButton}
        disabled={isBusy}
        onClick={() => {
          removeMessageImageDraft({
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

  const renderComposerVideoMediaDraft = (
    mediaDraft: ComposerVideoMediaDraft
  ) => {
    const detectedVideo = safeParseVideoUrl(mediaDraft.url);
    const trimmedVideoUrl = mediaDraft.url.trim();
    const showVideoParseError = trimmedVideoUrl.length > 0 && !detectedVideo;
    const showVideoMissingError =
      trimmedVideoUrl.length === 0 &&
      messageComposerErrors.includes(TRIBE_ROUND_COPY.videoMissing);
    const videoErrorMessage = showVideoParseError
      ? TRIBE_ROUND_COPY.videoInvalidUrl
      : showVideoMissingError
        ? TRIBE_ROUND_COPY.videoMissing
        : null;

    return (
      <div
        className={styles.TribeRound__videoComposer}
        key={mediaDraft.localId}
        ref={registerComposerBlockTarget(mediaDraft.localId)}
      >
        <div className={styles.TribeRound__videoComposerHeader}>
          <label className={styles.TribeRound__videoComposerLabel}>
            <span>{TRIBE_ROUND_COPY.videoComposerHeading}</span>
            <input
              aria-describedby={
                hasMessageComposerErrors
                  ? TRIBE_ROUND_ATTRIBUTES.messageComposerErrorId
                  : undefined
              }
              aria-invalid={showVideoParseError || showVideoMissingError}
              className={styles.TribeRound__videoInput}
              ref={registerComposerFocusTarget(mediaDraft.localId)}
              disabled={isBusy}
              onChange={(event) => {
                updateVideoMediaDraftUrl(
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
            disabled={isBusy}
            onClick={() => {
              removeVideoMediaDraft(mediaDraft.localId);
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

  const renderComposerMediaDrafts = () => {
    if (mediaDrafts.length === 0) {
      return null;
    }

    return (
      <div className={styles.TribeRound__imageDraftList}>
        {mediaDrafts.map((mediaDraft) =>
          mediaDraft.kind === MESSAGE_MEDIA_KIND.image
            ? renderComposerImageMediaDraft(mediaDraft)
            : renderComposerVideoMediaDraft(mediaDraft)
        )}
      </div>
    );
  };

  const renderComposerFileDraft = (fileDraft: ComposerFileDraft) => {
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
        ref={registerComposerBlockTarget(fileDraft.localId)}
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
          {isUploadingFileDraft
            ? TRIBE_ROUND_COPY.fileUploadingLabel
            : hasFileDraftUploadFailed
              ? TRIBE_ROUND_COPY.fileUploadError
              : ""}
        </span>
        <span className={styles.TribeRound__fileDraftActions}>
          {canRetryFileDraftUpload ? (
            <Button
              aria-label={TRIBE_ROUND_COPY.fileRetryButton}
              className={styles.TribeRound__fileDraftRetryButton}
              disabled={isBusy}
              onClick={() => {
                retryMessageFileDraftUpload(fileDraft);
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
            disabled={isBusy}
            onClick={() => {
              removeMessageFileDraft(fileDraft);
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

  const renderComposerFileDrafts = () => {
    if (fileDrafts.length === 0) {
      return null;
    }

    return (
      <div className={styles.TribeRound__fileDraftList}>
        {fileDrafts.map((fileDraft) => renderComposerFileDraft(fileDraft))}
      </div>
    );
  };

  /**
   * Renders the message's downloadable attachments as a list of plain links
   * to the authorized download route, shown under the message content and
   * separate from the image/video gallery.
   */
  const renderMessageFiles = (
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
                tribeSlug,
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

  const renderMessageImageCarouselDialog = () => {
    const messageMedia = activeImageCarouselMedia;
    const activeImageCarouselSlideNumber = Math.min(
      activeImageCarouselSlideIndex + 1,
      messageMedia.length
    );
    return (
      <Dialog
        open={messageMedia.length > 0}
        onOpenChange={handleImageCarouselOpenChange}
      >
        <DialogContent
          className={styles.TribeRound__imageCarouselDialog}
          onKeyDownCapture={handleImageCarouselKeyDown}
          showCloseButton
        >
          <DialogHeader className={styles.TribeRound__imageCarouselHeader}>
            <DialogTitle className={styles.TribeRound__srOnly}>
              {TRIBE_ROUND_COPY.imageCarouselDialogTitle}
            </DialogTitle>
            <DialogDescription className={styles.TribeRound__srOnly}>
              {TRIBE_ROUND_COPY.imageCarouselDialogDescription}
            </DialogDescription>
          </DialogHeader>
          <Carousel
            className={styles.TribeRound__imageCarousel}
            opts={{
              duration: TRIBE_ROUND_CAROUSEL.transitionDuration,
              loop: messageMedia.length > 1,
              startIndex: activeImageCarousel?.mediaIndex ?? 0,
              // Embla auto-scrolls to whichever slide holds focus. A focused
              // video iframe would keep snapping the carousel back to its
              // slide, cancelling arrow navigation. Media slides are navigated
              // explicitly, so focus must not drive scroll position.
              watchFocus: false,
            }}
            setApi={setImageCarouselApi}
          >
            <CarouselContent className={styles.TribeRound__imageCarouselContent}>
              {messageMedia.map((mediaItem, mediaIndex) => {
                if (mediaItem.kind === MESSAGE_MEDIA_KIND.video) {
                  const isActiveSlide =
                    mediaIndex === settledImageCarouselSlideIndex;

                  return (
                    <CarouselItem
                      className={styles.TribeRound__imageCarouselItem}
                      key={mediaItem.id}
                    >
                      <div className={styles.TribeRound__videoEmbed}>
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
                              activeImageCarouselMessage?.title
                                ? `: ${activeImageCarouselMessage.title}`
                                : ""
                            }`}
                          />
                        ) : (
                          renderCarouselVideoPoster(mediaItem)
                        )}
                      </div>
                    </CarouselItem>
                  );
                }

                const imageAlt =
                  mediaItem.altText ||
                  activeImageCarouselMessage?.title ||
                  TRIBE_ROUND_COPY.messageDetailsDialogTitle;

                return (
                  <CarouselItem
                    className={styles.TribeRound__imageCarouselItem}
                    key={mediaItem.id}
                  >
                    <div className={styles.TribeRound__imageCarouselFrame}>
                      {createElement(TRIBE_ROUND_MEDIA.imageElementTag, {
                        alt: imageAlt,
                        className: styles.TribeRound__imageCarouselImage,
                        decoding: TRIBE_ROUND_CAROUSEL.imageDecoding,
                        fetchPriority: TRIBE_ROUND_CAROUSEL.imageFetchPriority,
                        loading: TRIBE_ROUND_MEDIA.eagerLoading,
                        src: mediaItem.url,
                      })}
                    </div>
                  </CarouselItem>
                );
              })}
            </CarouselContent>
            {messageMedia.length > 1 ? (
              <>
                <CarouselPrevious
                  aria-label={TRIBE_ROUND_COPY.imageCarouselPreviousButton}
                  className={styles.TribeRound__imageCarouselPrevious}
                />
                <CarouselNext
                  aria-label={TRIBE_ROUND_COPY.imageCarouselNextButton}
                  className={styles.TribeRound__imageCarouselNext}
                />
              </>
            ) : null}
          </Carousel>
          <p
            aria-live="polite"
            className={styles.TribeRound__imageCarouselProgress}
          >
            <span className={styles.TribeRound__srOnly}>
              {TRIBE_ROUND_COPY.imageCarouselProgressPrefix}{" "}
              {activeImageCarouselSlideNumber}{" "}
              {TRIBE_ROUND_COPY.imageCarouselProgressSeparator}{" "}
              {messageMedia.length}
            </span>
            {messageMedia.map((mediaItem, mediaIndex) => (
              <span
                aria-hidden="true"
                className={
                  mediaIndex === activeImageCarouselSlideIndex
                    ? `${styles.TribeRound__imageCarouselProgressDot} ${styles["TribeRound__imageCarouselProgressDot--active"]}`
                    : styles.TribeRound__imageCarouselProgressDot
                }
                key={mediaItem.id}
              />
            ))}
          </p>
        </DialogContent>
      </Dialog>
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
          align={TRIBE_ROUND_ATTRIBUTES.messageActionsDropdownAlign}
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
                <div
                  ref={registerComposerBlockTarget(
                    MESSAGE_COMPOSER_FIELD_ANCHOR_KEY.title
                  )}
                >
                  <input
                    aria-describedby={
                      hasMessageComposerErrors
                        ? TRIBE_ROUND_ATTRIBUTES.messageComposerErrorId
                        : undefined
                    }
                    aria-label={TRIBE_ROUND_COPY.messageComposerTitleLabel}
                    aria-invalid={isMessageTitleInvalid}
                    className={
                      isMessageTitleInvalid
                        ? `${styles.TribeRound__titleInput} ${styles["TribeRound__titleInput--invalid"]}`
                        : styles.TribeRound__titleInput
                    }
                    disabled={isBusy}
                    onChange={(event) => {
                      setMessageTitle(event.currentTarget.value);
                      setMessageComposerErrors([]);
                    }}
                    placeholder={TRIBE_ROUND_COPY.messageComposerTitlePlaceholder}
                    value={messageTitle}
                  />
                  {renderComposerFieldError(
                    TRIBE_ROUND_COPY.messageComposerMissingTitle
                  )}
                </div>
                <div
                  ref={registerComposerBlockTarget(
                    MESSAGE_COMPOSER_FIELD_ANCHOR_KEY.content
                  )}
                >
                  <RichLinkEditor
                    ariaDescribedBy={
                      hasMessageComposerErrors
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
                    editor={messageEditor}
                    isDisabled={isBusy}
                    isInvalid={isMessageContentInvalid}
                    placeholder={TRIBE_ROUND_COPY.messagePlaceholder}
                  />
                  {renderComposerFieldError(
                    TRIBE_ROUND_COPY.messageComposerMissingContent
                  )}
                </div>
                {isPollComposerEnabled ? (
                  <section
                    className={styles.TribeRound__pollComposer}
                    ref={registerComposerBlockTarget(
                      TRIBE_ROUND_POLL.composerBlockKey
                    )}
                  >
                  <div className={styles.TribeRound__pollComposerHeader}>
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
                            ref={registerComposerFocusTarget(
                              TRIBE_ROUND_POLL.draftKeyPrefix +
                                String(optionIndex)
                            )}
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
                        {shouldShowPollOptionRequiredError(
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
                        scrollPollComposerIntoView();
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
                  {renderComposerPollErrors()}
                  </section>
                ) : null}
                {renderComposerMediaDrafts()}
                {renderComposerFileDrafts()}
                {renderComposerFieldError(
                  TRIBE_ROUND_COPY.imageUploadPendingError
                )}
                {renderComposerFieldError(TRIBE_ROUND_COPY.imageUploadError)}
                {renderComposerFieldError(
                  TRIBE_ROUND_COPY.fileUploadPendingError
                )}
                {renderComposerFieldError(TRIBE_ROUND_COPY.fileUploadError)}
                {renderComposerFieldError(TRIBE_ROUND_COPY.mediaLimitError)}
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
                      isBusy || mediaDrafts.length >= MESSAGE_MEDIA.maxCount
                    }
                    multiple
                    onChange={handleMessageImageSelection}
                    type={TRIBE_ROUND_FORM.fileInputType}
                  />
                </label>
                <label
                  aria-label={TRIBE_ROUND_COPY.fileAddButton}
                  className={styles.TribeRound__fileAddButton}
                >
                  <PaperclipIcon />
                  <input
                    accept={ATTACHMENT_FILE_INPUT_ACCEPT}
                    className={styles.TribeRound__fileInput}
                    disabled={
                      isBusy || fileDrafts.length >= MESSAGE_FILES.maxCount
                    }
                    multiple
                    onChange={handleMessageFileSelection}
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
                      revealComposerBlock(
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
                ) : null}
                <Button
                  aria-label={TRIBE_ROUND_COPY.videoAddButton}
                  className={styles.TribeRound__videoAddButton}
                  disabled={
                    isBusy || mediaDrafts.length >= MESSAGE_MEDIA.maxCount
                  }
                  onClick={addVideoMediaDraft}
                  size={TRIBE_ROUND_FORM.iconSize}
                  type={TRIBE_ROUND_FORM.buttonType}
                  variant={TRIBE_ROUND_FORM.ghostVariant}
                >
                  <VideoIcon />
                </Button>
                {!isEditingMessage ? (
                <div className={styles.TribeRound__channelPicker}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      aria-describedby={
                        hasMessageComposerErrors
                          ? TRIBE_ROUND_ATTRIBUTES.messageComposerErrorId
                          : undefined
                      }
                      aria-invalid={isMessageChannelInvalid}
                      aria-label={TRIBE_ROUND_COPY.tribeChannelLabel}
                      className={
                        isMessageChannelInvalid
                          ? `${styles.TribeRound__channelTrigger} ${styles["TribeRound__channelTrigger--invalid"]}`
                          : styles.TribeRound__channelTrigger
                      }
                      disabled={isBusy}
                      ref={registerComposerBlockTarget(
                        MESSAGE_COMPOSER_FIELD_ANCHOR_KEY.channel
                      )}
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
                {renderComposerFieldError(
                  TRIBE_ROUND_COPY.messageComposerMissingChannel
                )}
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
          {messages.map((message, messageIndex) => (
            <li className={styles.TribeRound__message} key={message.id}>
              <Card
                className={styles.TribeRound__messageCard}
                onClick={() => {
                  openMessageDetails(message.id);
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
                    {renderMessagePinControl(message, true)}
                    {renderMessageActionsMenu(message, true)}
                  </div>
                  <div className={styles.TribeRound__messageBody}>
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
                      {renderMessageFiles(message, true)}
                    </CardContent>
                    {renderMessagePoll(message, true)}

                    <div className={styles.TribeRound__messageActions}>
                      <MessageLikesHoverCard
                        isTriggerDisabled={isLikeButtonDisabled(message)}
                        likeCount={message.likeCount}
                        messageId={message.id}
                        onTriggerClick={stopMessageDetailsOpening}
                        tribeSlug={tribeSlug}
                      >
                        <Button
                          aria-label={`${TRIBE_ROUND_COPY.likeButtonAriaLabel} ${message.likeCount}`}
                          className={getLikeButtonClassName(message.likedByViewer)}
                          disabled={isLikeButtonDisabled(message)}
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
                      </MessageLikesHoverCard>
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
                  </div>
                  {renderMessageFeedMedia(message, {
                    shouldLoadEagerly: messageIndex === 0,
                  })}
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
      {renderMessageImageCarouselDialog()}
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
                {renderMessageMedia(selectedMessage, { canOpenCarousel: true })}
                {renderMessageFiles(selectedMessage)}
                {renderMessagePoll(selectedMessage)}
                <div
                  className={`${styles.TribeRound__messageActions} ${styles["TribeRound__messageActions--dialog"]}`}
                >
                  <MessageLikesHoverCard
                    isTriggerDisabled={isLikeButtonDisabled(selectedMessage)}
                    likeCount={selectedMessage.likeCount}
                    messageId={selectedMessage.id}
                    tribeSlug={tribeSlug}
                  >
                    <Button
                      aria-label={`${TRIBE_ROUND_COPY.likeButtonAriaLabel} ${selectedMessage.likeCount}`}
                      className={getLikeButtonClassName(
                        selectedMessage.likedByViewer
                      )}
                      disabled={isLikeButtonDisabled(selectedMessage)}
                      onClick={() => {
                        handleToggleLike(selectedMessage.id);
                      }}
                      type={TRIBE_ROUND_FORM.buttonType}
                      variant={TRIBE_ROUND_FORM.outlineVariant}
                    >
                      <HeartIcon />
                      {selectedMessage.likeCount}
                    </Button>
                  </MessageLikesHoverCard>
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
