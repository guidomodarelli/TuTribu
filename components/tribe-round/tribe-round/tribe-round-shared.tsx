/**
 * @file Copy, constants, types, and pure helpers shared by the tribe round modules.
 */
import { createElement, type CSSProperties, useEffect } from "react";
import { PinIcon } from "lucide-react";
import {
  Avatar,
  AvatarGroup,
  formatFileSize,
  type RichLink,
  Tooltip,
} from "@golfo/ui";
import { Link } from "@/components/navigation/link";
import { ROUTES } from "@/src/constants/routes";
import type { TribeRoundLocation } from "@/lib/messages/tribe-round-location";
import { ATTACHMENT_FILE } from "@/src/constants/attachment-files";
import { BUENOS_AIRES_TIME_ZONE } from "@/src/constants/date-time";
import type { AuthenticatedMemberResult } from "@/src/modules/auth/application/results/authenticated-member-result";
import {
  MESSAGE_FILES,
  MESSAGE_MEDIA,
  MESSAGE_MEDIA_KIND,
  MESSAGE_POLL_OPTION_TEXT,
  MESSAGE_POLL_OPTIONS,
} from "@/src/modules/messages/constants/message-round";
import type {
  MessageFileResult,
  MessageMediaResult,
  TribeRoundMessageResult,
  TribeRoundReplyResult,
  TribeRoundResult,
} from "@/src/modules/messages/application/results/tribe-round-result";
import type { MessageMediaDraftCommand } from "@/src/modules/messages/application/commands/tribe-message-command";
import { InvalidVideoUrlError, parseExternalVideoUrl } from "@/src/modules/shared/domain/value-objects/external-video-url";
import { VIDEO_PROVIDER } from "@/src/modules/shared/domain/value-objects/video-provider";
import styles from "./styles.module.scss";

const TRIBE_ROUND_ROUTE = {
  apiTribes: "/api/tribes/",
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

export const TRIBE_ROUND_ENDPOINT = {
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

/** Size of the inline loaders shown while messages or replies load. */
export const TRIBE_ROUND_LOADER_SIZE_PX = 24;

export const TRIBE_ROUND_COPY = {
  openMessageDetailsAriaLabelPrefix: "Abrir mensaje",
  replyInputLabel: "Escribir una respuesta",
  replySendButtonAriaLabel: "Enviar respuesta",
  replyPlaceholder: "Escribi una respuesta",
  repliesTitle: "Respuestas",
  repliesLoading: "Cargando respuestas...",
  repliesLoadError: "No pudimos cargar las respuestas.",
  repliesRetry: "Reintentar",
  roundPageLoading: "Cargando mensajes...",
  roundPageRetry: "Reintentar",
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
  academyParticipationLink: "Suscribirme",
  academyParticipationNotice:
    "Podés leer el fogón y los canales. Para publicar, responder y reaccionar, necesitás la suscripción mensual a la academia.",
  mutedNotice: "Podes leer la ronda, pero tu estado actual no permite participar.",
  pinButtonAriaLabel: "Pinear mensaje",
  pinnedBadge: "Pineado",
  pinLimitReachedMessage: "Solo podes pinear hasta 3 mensajes en el fogón.",
  pinSuccess: "Mensaje pineado.",
  togglePinError: "No pudimos actualizar el pin.",
  unpinSuccess: "Mensaje despineado.",
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
  submitMessageReplayed: "El mensaje ya estaba publicado.",
  toggleLikeError: "No pudimos actualizar la reaccion.",
} as const;

export const TRIBE_ROUND_FORM = {
  buttonType: "button",
  contentTypeHeader: "Content-Type",
  dateTimeLocalStep: 1,
  dateTimeLocalInputType: "datetime-local",
  defaultVariant: "default",
  dangerVariant: "danger",
  fileInputType: "file",
  ghostVariant: "ghost",
  imageAccept: "image/*",
  iconSize: "sm",
  jsonContentType: "application/json",
  deleteMethod: "DELETE",
  method: "POST",
  patchMethod: "PATCH",
  putMethod: "PUT",
  secondaryVariant: "secondary",
  submitType: "submit",
  urlInputType: "url",
} as const;

export const TRIBE_ROUND_MEDIA = {
  eagerLoading: "eager",
  imageElementTag: "img",
  lazyLoading: "lazy",
} as const;

export const TRIBE_ROUND_ATTRIBUTES = {
  channelFilterEmojiHidden: true,
  // Author and reply composer avatars render at 40px (36px for the reply
  // composer), so the photo is requested at the 40px `lg` size.
  authorAvatarSize: "lg",
  commentAuthorsAvatarSize: "sm",
  composerAvatarSize: "lg",
  // The dialog actions live in `DialogContent`'s footer, outside the forms,
  // and reach them through the `form` attribute.
  composerFormId: "tribe-round-composer-form",
  editCreatedAtFormId: "tribe-round-edit-created-at-form",
  contentExpandedDataAttribute: "data-expanded",
  dropdownAlign: "center",
  messageActionsDropdownAlign: "end",
  messageDetailsCloseButtonPlacement: "viewport",
  messageMetaSeparatorHidden: true,
  relativeTimeFormat: "relative",
  relativeTimeNoTitleAttribute: "no-title",
  relativeTimeTag: "relative-time",
  tooltipCollisionPadding: 16,
  tooltipSideOffset: -4,
  missingRequirementBulletHidden: true,
  messageComposerErrorId: "tribe-message-composer-error",
  messageComposerRequirementsLabel: "Requisitos pendientes",
  regionRole: "region",
} as const;

export const TRIBE_ROUND_LIMITS = {
  collapsedContentCharacters: 320,
  commentAuthorsPreviewCount: 3,
  detailsCollapsedSliceCharacters: 150,
  toggleDebounceMs: 300,
} as const;

export const TRIBE_ROUND_CAROUSEL = {
  imageDecoding: "async",
  imageFetchPriority: "high",
  // Each medium fills the viewer, without neighbours peeking in.
  slideSize: "100%",
  transitionDuration: 14,
} as const;

/**
 * Names a slide of the media viewer and its indicator, as in "Medio 2 de 5".
 * @param slideIndex - Zero-based slide position.
 * @param slideCount - Number of media in the viewer.
 * @returns The accessible name.
 */
export function formatImageCarouselSlideLabel(slideIndex: number, slideCount: number): string {
  return [
    TRIBE_ROUND_COPY.imageCarouselProgressPrefix,
    slideIndex + 1,
    TRIBE_ROUND_COPY.imageCarouselProgressSeparator,
    slideCount,
  ].join(TRIBE_ROUND_FORMAT.standardSpace);
}

/**
 * Arrow keys that drive the media carousel. The dialog intercepts them at the
 * capture phase so navigation works regardless of which element inside the
 * dialog holds focus (close button, dialog body, or a carousel control).
 */
export const TRIBE_ROUND_CAROUSEL_KEY = {
  next: "ArrowRight",
  previous: "ArrowLeft",
} as const;

/** Scroll back to the round top after a page loads in place. */
export const TRIBE_ROUND_NAVIGATION_SCROLL = {
  block: "start",
  instantBehavior: "auto",
  reducedMotionQuery: "(prefers-reduced-motion: reduce)",
  smoothBehavior: "smooth",
} as const;

export const COMPOSER_BODY_SCROLL = {
  bottomBehavior: "smooth",
  pollBlockAlignment: "end",
  focusBlockAlignment: "nearest",
} as const;

const COLLAPSED_CONTENT_PATTERN = {
  trailingWhitespaceBoundary: /\s\S*$/,
  whitespaceRun: /\s+/g,
} as const;

export const COLLAPSED_CONTENT_TEXT = {
  ellipsis: "…",
  whitespaceReplacement: " ",
} as const;

export const TRIBE_ROUND_OPTIMISTIC = {
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

export const TRIBE_ROUND_POLL = {
  composerBlockKey: "poll-composer",
  draftKeyPrefix: "poll-option-",
  firstOptionIndex: 0,
  initialOptionCount: 2,
  minimumOptionCount: 2,
  multipleInputType: "checkbox",
  percentageBase: 100,
  /** Custom property holding the result share as a 0-1 `scaleX` factor. */
  resultScaleStyleProperty: "--poll-result-scale",
  singleInputType: "radio",
} as const;

/**
 * Stable keys under which the title, content and channel fields register their
 * DOM nodes in the composer block registry, so a failed validation can scroll
 * the offending field into view.
 */
export const MESSAGE_COMPOSER_FIELD_ANCHOR_KEY = {
  channel: "composer-field-channel",
  content: "composer-field-content",
  title: "composer-field-title",
} as const;

/**
 * Poll requirement copies grouped together so the poll composer can render its
 * inline error and the scroll logic can detect a poll-scoped failure.
 */
export const MESSAGE_COMPOSER_POLL_ERROR_COPIES = [
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

export const TRIBE_ROUND_CONTENT_PREVIEW_CLASS = {
  details: "TribeRound__content--detailsPreview",
  round: "TribeRound__content--roundPreview",
} as const;

export type TribeRoundContentPreviewClass =
  (typeof TRIBE_ROUND_CONTENT_PREVIEW_CLASS)[keyof typeof TRIBE_ROUND_CONTENT_PREVIEW_CLASS];

export const TRIBE_ROUND_SYMBOLS = {
  blobUrlPrefix: "blob:",
  missingRequirementBullet: "-",
  messageMetaSeparator: "·",
} as const;

export const TRIBE_ROUND_REPLY_LOAD_STATUS = {
  error: "error",
  loaded: "loaded",
  loading: "loading",
} as const;

export const TRIBE_ROUND_FORMAT = {
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

export type TribeRoundProps = {
  authenticatedMember: AuthenticatedMemberResult;
  tribeSlug: string;
  round: TribeRoundResult;
};

export type ApiErrorResponse = {
  message?: string;
};

export type CreateMessageResponse = {
  message?: string;
  /** The server already stored this publication under the same idempotency key. */
  replayed?: boolean;
  tribeMessage?: TribeRoundMessageResult;
};

/** Idempotency key of the last submitted draft, reused only when that same draft is sent again. */
export type PendingCreateMessageKey = {
  fingerprint: string;
  key: string;
};

export type MessagePollResponse = {
  message?: string;
  poll?: NonNullable<TribeRoundMessageResult["poll"]> | null;
};

export type CreateReplyResponse = {
  reply?: TribeRoundReplyResult;
  message?: string;
};

export type ListRepliesResponse = {
  replies?: TribeRoundReplyResult[];
  message?: string;
};

export type ToggleLikeResponse = {
  likedByViewer?: boolean;
  likeCount?: number;
  message?: string;
};

export type TogglePinResponse = {
  isPinned?: boolean;
  message?: string;
  pinnedAt?: string | null;
};

export type UpdateCreatedAtResponse = {
  createdAt?: string;
  message?: string;
};

export type UpdateMessageContentResponse = {
  content?: string;
  files?: NonNullable<TribeRoundMessageResult["files"]>;
  media?: NonNullable<TribeRoundMessageResult["media"]>;
  message?: string;
  messageId?: string;
  poll?: NonNullable<TribeRoundMessageResult["poll"]> | null;
  title?: string;
};

export type MessageImageUploadResponse = {
  assetId?: string;
  imageId?: string;
  message?: string;
  uploadUrl?: string;
};

export type MessageFileUploadResponse = {
  assetId?: string;
  message?: string;
  uploadHeaders?: Record<string, string>;
  uploadUrl?: string;
};

export const COMPOSER_IMAGE_UPLOAD_STATUS = {
  error: "error",
  uploaded: "uploaded",
  uploading: "uploading",
} as const;

type ComposerImageUploadStatus =
  (typeof COMPOSER_IMAGE_UPLOAD_STATUS)[keyof typeof COMPOSER_IMAGE_UPLOAD_STATUS];

export type ComposerImageDraft = {
  altText: string;
  assetId?: string;
  localId: string;
  previewUrl: string;
  status: ComposerImageUploadStatus;
  isPersisted: boolean;
};

export const COMPOSER_FILE_UPLOAD_STATUS = {
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
export type ComposerFileDraft = {
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
export type ComposerImageMediaDraft = {
  kind: typeof MESSAGE_MEDIA_KIND.image;
} & ComposerImageDraft;

/**
 * A single external video attachment inside the unified, ordered media draft
 * list. The author pastes a URL that is validated live with
 * {@link safeParseVideoUrl}; the URL is sent verbatim on submit.
 */
export type ComposerVideoMediaDraft = {
  kind: typeof MESSAGE_MEDIA_KIND.video;
  localId: string;
  url: string;
};

/**
 * One slot in the composer's ordered media list. Images and external videos
 * share a single array so the array index expresses the author-chosen global
 * order (`sortOrder`).
 */
export type ComposerMediaDraft = ComposerImageMediaDraft | ComposerVideoMediaDraft;

export type ResetMessageComposerOptions = {
  shouldCleanupTransientUploads?: boolean;
  shouldRevokeImagePreviewUrls?: boolean;
};

export type CreateMessageDraftSnapshot = {
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

export type PendingCreateMessageIntent = {
  baselineMessages: TribeRoundVisibleMessageResult[];
  baselinePagination: TribeRoundResult["pagination"];
  draft: CreateMessageDraftSnapshot;
  optimisticMessageId: string;
};

export type TribeRoundVisibleMessageResult = TribeRoundMessageResult & {
  isPending?: boolean;
};

export type TribeRoundMessageMediaResult = NonNullable<
  TribeRoundMessageResult["media"]
>[number];

export type TribeRoundMessageImageResult = Extract<
  TribeRoundMessageMediaResult,
  { kind: typeof MESSAGE_MEDIA_KIND.image }
>;

export type TribeRoundMessageVideoResult = Extract<
  TribeRoundMessageMediaResult,
  { kind: typeof MESSAGE_MEDIA_KIND.video }
>;

export type ActiveMessageMediaCarousel = {
  mediaIndex: number;
  messageId: string;
};

export type PendingLikeIntent = {
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

export type PendingPollVoteIntent = {
  baselinePoll: NonNullable<TribeRoundMessageResult["poll"]>;
  intendedOptionIds: string[];
  isRequestInFlight: boolean;
  shouldFlushAfterRequest: boolean;
};

export type LikeDebounceTimers = Record<string, ReturnType<typeof setTimeout>>;

export type PinDebounceTimers = Record<string, ReturnType<typeof setTimeout>>;

export type PollVoteDebounceTimers = Record<string, ReturnType<typeof setTimeout>>;

export type PendingLikeIntents = Record<string, PendingLikeIntent | undefined>;

export type PendingPinIntents = Record<string, PendingPinIntent | undefined>;

export type PendingPollVoteIntents = Record<string, PendingPollVoteIntent | undefined>;

export type ReplyLoadStatus =
  (typeof TRIBE_ROUND_REPLY_LOAD_STATUS)[keyof typeof TRIBE_ROUND_REPLY_LOAD_STATUS];

export const TRIBE_ROUND_RESET_KEY = {
  empty: "",
  false: "0",
  fieldSeparator: ":",
  keySeparator: "::",
  messageSeparator: "|",
  true: "1",
} as const;

export function buildRoundStateResetKey(
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

export function renderRoundAuthorAvatar(
  author: TribeRoundMessageResult["author"],
  baseClassName: string,
  roleModifierClassName?: string
) {
  const composedClassName = [baseClassName, roleModifierClassName]
    .filter(Boolean)
    .join(TRIBE_ROUND_FORMAT.standardSpace);

  return (
    <Avatar
      className={composedClassName}
      fallback={author.avatarFallback}
      name={author.name}
      size={TRIBE_ROUND_ATTRIBUTES.authorAvatarSize}
      src={author.image}
    />
  );
}

export function getAvatarRoleModifierClassName(
  role: TribeRoundReplyResult["author"]["role"]
): string | undefined {
  if (!TRIBE_ROUND_PRIVILEGED_AUTHOR_ROLES.has(role)) {
    return undefined;
  }

  return styles[TRIBE_ROUND_FORMAT.avatarRoleModifierPrefix + role];
}

export function getReplyAvatarRoleModifierClassName(
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

/**
 * Reads the JSON body of a tribe round API answer.
 * @param response - API answer.
 * @returns The parsed body (an empty object when it is not JSON).
 * @throws {Error} With the API message, or the status text, when the request failed.
 */
async function readJsonResponse<ResponseBody>(response: Response): Promise<ResponseBody> {
  if (!response.ok) {
    throw new Error((await readApiErrorMessage(response)) ?? response.statusText);
  }

  return (await response.json().catch(() => ({}))) as ResponseBody;
}

export async function submitJsonRequest<ResponseBody>(
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

  return readJsonResponse<ResponseBody>(response);
}

export async function readJsonRequest<ResponseBody>(
  url: string,
  signal?: AbortSignal
): Promise<ResponseBody> {
  const response = await fetch(url, { signal });

  return readJsonResponse<ResponseBody>(response);
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

export function formatPollVoteCount(voteCount: number): string {
  return [
    String(voteCount),
    voteCount === 1
      ? TRIBE_ROUND_COPY.pollVoteSingularLabel
      : TRIBE_ROUND_COPY.pollVotePluralLabel,
  ].join(TRIBE_ROUND_FORMAT.standardSpace);
}

/**
 * Adds the option to a multiple-choice selection, or removes it when it is
 * already selected.
 *
 * @param currentOptionIds - Options selected so far.
 * @param optionId - Option the viewer toggled.
 * @returns The new selection.
 */
export function togglePollOptionId(currentOptionIds: string[], optionId: string): string[] {
  return currentOptionIds.includes(optionId)
    ? currentOptionIds.filter((currentOptionId) => currentOptionId !== optionId)
    : [...currentOptionIds, optionId];
}

export function getPersistedPollSelection(
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

export function useRelativeTimeElementDefinition() {
  useEffect(() => {
    if (!globalThis.customElements?.get(TRIBE_ROUND_ATTRIBUTES.relativeTimeTag)) {
      void import("@github/relative-time-element");
    }
  }, []);
}

export function revokeMessageImagePreviewUrl(previewUrl: string): void {
  if (
    previewUrl.startsWith(TRIBE_ROUND_SYMBOLS.blobUrlPrefix) &&
    typeof URL.revokeObjectURL === "function"
  ) {
    URL.revokeObjectURL(previewUrl);
  }
}

export function revokeMessageImageDraftPreviewUrls(
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
export function getImageDraftsFromMediaDrafts(
  mediaDrafts: ComposerMediaDraft[]
): ComposerImageDraft[] {
  return mediaDrafts.filter(isComposerImageMediaDraft).map(({ kind, ...imageDraft }) => {
    return imageDraft;
  });
}

export function getMissingMessageRequirements(input: {
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

export function buildEditableVideoUrl(video: {
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

export function safeParseVideoUrl(rawInput: string) {
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

export function isLongMessageContent(content: string): boolean {
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
    COLLAPSED_CONTENT_PATTERN.trailingWhitespaceBoundary.exec(slicedContent);
  const wordBoundedContent = trailingWhitespaceMatch
    ? slicedContent.slice(0, trailingWhitespaceMatch.index)
    : slicedContent;

  return wordBoundedContent.trimEnd();
}

/**
 * Picks the message text shown for the current preview mode: flattened in the
 * collapsed round preview, truncated in the collapsed details preview, whole
 * otherwise.
 *
 * @param input - Message content and the active collapsed preview.
 * @returns The text to render.
 */
export function getDisplayedMessageContent({
  content,
  isDetailsCollapsedPreview,
  isRoundCollapsedPreview,
}: {
  content: string;
  isDetailsCollapsedPreview: boolean;
  isRoundCollapsedPreview: boolean;
}): string {
  if (isRoundCollapsedPreview) {
    return flattenMessageContentForCollapsedPreview(content);
  }
  if (isDetailsCollapsedPreview) {
    return truncateMessageContentForCollapsedPreview(
      content,
      TRIBE_ROUND_LIMITS.detailsCollapsedSliceCharacters
    );
  }
  return content;
}

/**
 * Status copy of a composer upload: uploading, failed, or nothing once ready.
 *
 * @param input - Whether the upload is running or failed and the copy of each state.
 * @returns The status copy.
 */
export function getUploadStatusLabel({
  errorLabel,
  hasFailed,
  isUploading,
  uploadingLabel,
}: {
  errorLabel: string;
  hasFailed: boolean;
  isUploading: boolean;
  uploadingLabel: string;
}): string {
  if (isUploading) {
    return uploadingLabel;
  }
  return hasFailed ? errorLabel : "";
}

export function getLikeButtonClassName(likedByViewer: boolean): string {
  return [
    styles.TribeRound__likeButton,
    ...(likedByViewer
      ? [styles["TribeRound__likeButton--active"]]
      : []),
  ].join(TRIBE_ROUND_FORMAT.standardSpace);
}

export function getCommentCount(message: TribeRoundMessageResult): number {
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

export function renderCommentAuthorsPreview(message: TribeRoundMessageResult) {
  const authors = getCommentAuthorsPreview(message);

  if (authors.length === 0) {
    return null;
  }

  return (
    <AvatarGroup
      className={styles.TribeRound__commentAuthors}
      label={getCommentAuthorsPreviewLabel(authors)}
      max={authors.length}
      members={authors.map((author) => ({
        key: author.id,
        name: author.name,
        src: author.image,
      }))}
      size={TRIBE_ROUND_ATTRIBUTES.commentAuthorsAvatarSize}
    />
  );
}

export function getPinButtonClassName(isPinned: boolean): string {
  return [
    styles.TribeRound__pinButton,
    ...(isPinned
      ? [styles["TribeRound__pinButton--active"]]
      : []),
  ].join(TRIBE_ROUND_FORMAT.standardSpace);
}

/**
 * Location (channel filter and page) of a round as the server rendered it.
 *
 * @param round - Round page.
 * @returns The channel slug of the active filter (or `null`) and the page.
 */
export function getTribeRoundLocation(round: TribeRoundResult): TribeRoundLocation {
  return {
    channelSlug:
      round.channels.find((channel) => channel.id === round.activeChannelId)?.slug ?? null,
    page: round.pagination.currentPage,
  };
}

export function renderAuthorRoleAccessibleLabel(
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

export function renderAuthorIdentity(author: TribeRoundReplyResult["author"]) {
  return (
    <div className={styles.TribeRound__authorIdentity}>
      <p className={styles.TribeRound__authorName}>
        {author.name}
      </p>
      {renderAuthorRoleAccessibleLabel(author.role)}
    </div>
  );
}

export function renderMessageCreatedTime(
  createdAt: string,
  channel?: TribeRoundMessageResult["channel"]
) {
  return (
    <div className={styles.TribeRound__messageMetaLine}>
      <Tooltip
        collisionPadding={TRIBE_ROUND_ATTRIBUTES.tooltipCollisionPadding}
        content={formatMessageCreatedTooltip(createdAt)}
        contentClassName={styles.TribeRound__messageCreatedTooltip}
        sideOffset={TRIBE_ROUND_ATTRIBUTES.tooltipSideOffset}
      >
        <span className={styles.TribeRound__time}>
          <MessageRelativeTime dateTime={createdAt} />
        </span>
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

export function renderPinnedBadge(message: TribeRoundMessageResult) {
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

export function findViewerTribeAuthor(
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

export function replaceMessageReply(
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

/**
 * Marks a message's replies as loaded, merging the fetched page with replies
 * created locally while it was in flight.
 */
export function applyLoadedReplies(
  messages: TribeRoundVisibleMessageResult[],
  messageId: string,
  fetchedReplies: TribeRoundReplyResult[]
): TribeRoundVisibleMessageResult[] {
  return messages.map((message) =>
    message.id === messageId
      ? {
          ...message,
          hasLoadedReplies: true,
          replies: mergeRepliesPreservingLocalReplies({
            fetchedReplies,
            localReplies: message.replies,
          }),
        }
      : message
  );
}

export function removeMessageReply(
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

export function sortMessagesByPinnedState<MessageResult extends TribeRoundMessageResult>(
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

export function getMessagesAfterVisibleMessageCreation({
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
export function getCreatedMessageWithStableImages({
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

export function shouldKeepOptimisticImagePreviewUrls({
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

export function getMessagesAfterOptimisticCreationFailure({
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

export function getPaginationAfterVisibleMessageCreation({
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

export function isPendingMessage(message: TribeRoundVisibleMessageResult): boolean {
  return (
    message.isPending === true ||
    message.id.startsWith(TRIBE_ROUND_OPTIMISTIC.messageIdPrefix)
  );
}

/**
 * Reports whether a reply is still the optimistic copy shown while its
 * creation request is in flight.
 *
 * @param reply - Reply rendered in the message details dialog.
 * @returns `true` until the server-confirmed reply replaces it.
 */
export function isPendingReply(reply: TribeRoundReplyResult): boolean {
  return reply.id.startsWith(TRIBE_ROUND_OPTIMISTIC.replyIdPrefix);
}

function padTwoDigits(value: number): string {
  return value.toString().padStart(DATE_TIME_LOCAL_INPUT.padLength, DATE_TIME_LOCAL_INPUT.padCharacter);
}

export function toDateTimeLocalInputValue(isoDateTime: string): string {
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
    String(year) +
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

export function parseDateTimeLocalInputValue(rawValue: string): Date | null {
  const trimmed = rawValue.trim();

  if (!trimmed) {
    return null;
  }

  const parsed = new Date(trimmed);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function getOptimisticPinnedAt(
  intendedIsPinned: boolean,
  baselineIsPinned: boolean,
  baselinePinnedAt: string | null
): string | null {
  if (!intendedIsPinned) {
    return null;
  }

  return baselineIsPinned ? baselinePinnedAt : new Date().toISOString();
}

/** Composer errors anchored to the first image draft still uploading or failed. */
export const COMPOSER_IMAGE_UPLOAD_ERROR_COPIES = [
  TRIBE_ROUND_COPY.imageUploadPendingError,
  TRIBE_ROUND_COPY.imageUploadError,
];

/** Composer errors anchored to the first file draft still uploading or failed. */
export const COMPOSER_FILE_UPLOAD_ERROR_COPIES = [
  TRIBE_ROUND_COPY.fileUploadPendingError,
  TRIBE_ROUND_COPY.fileUploadError,
];

/**
 * Reports whether any of the copies is among the composer errors.
 *
 * @param errors - Current composer errors.
 * @param copies - Error copies to look for.
 * @returns `true` when at least one copy is present.
 */
export function includesAnyError(errors: string[], copies: readonly string[]): boolean {
  return copies.some((copy) => errors.includes(copy));
}

/**
 * Reads a registered composer block, if there is a key to look up.
 *
 * @param blockTargets - Registered composer blocks by key.
 * @param key - Block key, when a draft was found.
 * @returns The block element, or `undefined`.
 */
export function getBlockTargetByKey(
  blockTargets: Map<string, HTMLElement | null>,
  key: string | undefined
): HTMLElement | null | undefined {
  return key === undefined ? undefined : blockTargets.get(key);
}

/**
 * Finds the first video draft whose URL is not a supported video.
 *
 * @param mediaDrafts - Composer media drafts.
 * @returns The invalid video draft, if any.
 */
export function findInvalidVideoDraft(
  mediaDrafts: ComposerMediaDraft[]
): ComposerMediaDraft | undefined {
  return mediaDrafts.find(
    (mediaDraft) =>
      mediaDraft.kind === MESSAGE_MEDIA_KIND.video &&
      !safeParseVideoUrl(mediaDraft.url)
  );
}

/**
 * Finds the first upload draft still uploading or failed.
 *
 * @param drafts - Image or file drafts.
 * @param statuses - Uploading and failed statuses of those drafts.
 * @returns The unfinished draft, if any.
 */
export function findUnfinishedUploadDraft<Draft extends { status: string }>(
  drafts: Draft[],
  statuses: { error: Draft["status"]; uploading: Draft["status"] }
): Draft | undefined {
  return drafts.find(
    (draft) =>
      draft.status === statuses.uploading || draft.status === statuses.error
  );
}

/**
 * Reports whether the edited attachments differ from the saved ones. Sending
 * `files` replaces the whole attachment set, so the field is only included
 * when the author actually changed it; omitting it leaves the server-side
 * attachments untouched.
 *
 * @param editingMessage - Message being edited.
 * @param filesPayload - Attachments currently in the composer.
 * @returns `true` when the attachments changed.
 */
export function hasMessageFileChanges(
  editingMessage: TribeRoundMessageResult | undefined,
  filesPayload: { assetId: string }[]
): boolean {
  const baselineFileAssetIds = [...(editingMessage?.files ?? [])]
    .sort((firstFile, secondFile) => firstFile.sortOrder - secondFile.sortOrder)
    .map((messageFile) => messageFile.id);

  return (
    filesPayload.length !== baselineFileAssetIds.length ||
    filesPayload.some(
      (filePayload, fileIndex) =>
        filePayload.assetId !== baselineFileAssetIds[fileIndex]
    )
  );
}

/**
 * Applies a saved edit to a message, preferring the values the server applied.
 *
 * @param message - Message before the edit.
 * @param response - Edit response.
 * @param submitted - Title and content the author submitted.
 * @returns The edited message.
 */
export function applyMessageContentUpdate<MessageResult extends TribeRoundMessageResult>(
  message: MessageResult,
  response: UpdateMessageContentResponse,
  submitted: { content: string; title: string }
) {
  return {
    ...message,
    content:
      typeof response.content === "string" ? response.content : submitted.content,
    ...(response.files !== undefined ? { files: response.files } : {}),
    ...(response.media !== undefined ? { media: response.media } : {}),
    ...(response.poll !== undefined ? { poll: response.poll } : {}),
    title: typeof response.title === "string" ? response.title : submitted.title,
  };
}

/**
 * Builds the media of an optimistic message from the composer drafts: uploaded
 * images and videos with a supported URL, in draft order.
 *
 * @param mediaDrafts - Composer media drafts.
 * @param optimisticMessageId - Temporary id of the message.
 * @returns The optimistic media.
 */
export function buildOptimisticMessageMedia(
  mediaDrafts: ComposerMediaDraft[],
  optimisticMessageId: string
): MessageMediaResult[] {
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

  return optimisticMedia;
}

/**
 * Builds the downloadable files of an optimistic message.
 *
 * @param fileDrafts - Composer file drafts.
 * @returns The uploaded files in draft order.
 */
export function buildOptimisticMessageFiles(fileDrafts: ComposerFileDraft[]): MessageFileResult[] {
  // Ready file drafts already own their final asset id, so the optimistic
  // download list matches what the server attaches on creation.
  return fileDrafts
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
}

/**
 * Builds the reply shown while it is being sent, authored by the viewer with
 * the tribe identity already visible in the round when there is one.
 *
 * @param input - Viewer, reply text, loaded messages and temporary id.
 * @returns The optimistic reply.
 */
export function buildOptimisticReply({
  authenticatedMember,
  content,
  messages,
  optimisticReplyId,
}: {
  authenticatedMember: AuthenticatedMemberResult;
  content: string;
  messages: TribeRoundMessageResult[];
  optimisticReplyId: string;
}): TribeRoundReplyResult {
  const viewerTribeAuthor = findViewerTribeAuthor(
    messages,
    authenticatedMember.id
  );

  return {
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
}

/**
 * Appends a reply being sent to its message.
 *
 * @param message - Message being replied to.
 * @param optimisticReply - Reply being sent.
 * @returns The message with the reply and its updated count.
 */
export function appendOptimisticReply<MessageResult extends TribeRoundMessageResult>(
  message: MessageResult,
  optimisticReply: TribeRoundReplyResult
): MessageResult {
  return {
    ...message,
    hasLoadedReplies: message.hasLoadedReplies === false ? false : true,
    replyCount: message.replyCount + 1,
    replies: [...message.replies, optimisticReply],
  };
}

/**
 * Moves a failed replies load back to loading, since sending a reply loads
 * them again.
 *
 * @param currentStatuses - Replies load status by message.
 * @param messageId - Message being replied to.
 * @returns The statuses, unchanged unless that load had failed.
 */
export function retryFailedReplyLoad(
  currentStatuses: Record<string, ReplyLoadStatus | undefined>,
  messageId: string
): Record<string, ReplyLoadStatus | undefined> {
  const currentStatus = currentStatuses[messageId];

  if (currentStatus !== TRIBE_ROUND_REPLY_LOAD_STATUS.error) {
    return currentStatuses;
  }

  return {
    ...currentStatuses,
    [messageId]: TRIBE_ROUND_REPLY_LOAD_STATUS.loading,
  };
}

/**
 * Builds the poll sent with a publication, without blank options.
 *
 * @param allowMultipleVotes - Whether voters can pick several options.
 * @param options - Options typed in the composer.
 * @returns The poll payload.
 */
export function buildPollPayload(allowMultipleVotes: boolean, options: string[]) {
  return {
    allowMultipleVotes,
    options: options.map((option) => option.trim()).filter(Boolean),
  };
}

/**
 * Builds the body of a new publication, sending the poll, files and media
 * only when the composer has them.
 *
 * @param input - Channel, text, poll and attachments of the publication.
 * @returns The create message payload, without its client request id.
 */
export function buildCreateMessagePayload({
  channelId,
  content,
  filesPayload,
  mediaPayload,
  poll,
  title,
}: {
  channelId: string;
  content: string;
  filesPayload: { assetId: string }[];
  mediaPayload: MessageMediaDraftCommand[];
  poll: { allowMultipleVotes: boolean; options: string[] } | null;
  title: string;
}) {
  return {
    channelId,
    content,
    ...(poll
      ? { poll: buildPollPayload(poll.allowMultipleVotes, poll.options) }
      : {}),
    ...(filesPayload.length > 0 ? { files: filesPayload } : {}),
    ...(mediaPayload.length > 0 ? { media: mediaPayload } : {}),
    title,
  };
}

type MessagePollOptionProps = {
  allowMultipleVotes: boolean;
  canVote: boolean;
  isSelected: boolean;
  onSelect: () => void;
  option: NonNullable<TribeRoundMessageResult["poll"]>["options"][number];
  pollId: string;
  shouldShowResults: boolean;
};

/**
 * Renders one poll option with its input and, once the viewer voted, its result.
 *
 * @param props - Option, its selection and vote state and the select handler.
 * @returns The poll option label.
 */
export function MessagePollOption({
  allowMultipleVotes,
  canVote,
  isSelected,
  onSelect,
  option,
  pollId,
  shouldShowResults,
}: MessagePollOptionProps) {
  return (
    <label className={styles.TribeRound__pollOption}>
      <input
        checked={isSelected}
        disabled={!canVote}
        name={TRIBE_ROUND_ROUTE.pollSegment + pollId}
        onChange={onSelect}
        type={
          allowMultipleVotes
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
            [TRIBE_ROUND_POLL.resultScaleStyleProperty]: String(
              option.percentage / TRIBE_ROUND_POLL.percentageBase
            ),
          } as CSSProperties}
        />
      ) : null}
    </label>
  );
}

/**
 * Explains why the viewer cannot publish: the academy is required, or the
 * viewer is muted.
 *
 * @param props - Whether the academy is required and the tribe slug.
 * @returns The participation notice.
 */
export function RoundParticipationNotice({
  requiresAcademyToParticipate,
  tribeSlug,
}: {
  requiresAcademyToParticipate?: boolean;
  tribeSlug: string;
}) {
  if (requiresAcademyToParticipate) {
    return (
      <p className={styles.TribeRound__notice}>
        {TRIBE_ROUND_COPY.academyParticipationNotice}{" "}
        <Link
          className={styles.TribeRound__noticeLink}
          href={ROUTES.tribes.academy(tribeSlug)}
        >
          {TRIBE_ROUND_COPY.academyParticipationLink}
        </Link>
      </p>
    );
  }

  return (
    <p className={styles.TribeRound__notice}>
      {TRIBE_ROUND_COPY.mutedNotice}
    </p>
  );
}
