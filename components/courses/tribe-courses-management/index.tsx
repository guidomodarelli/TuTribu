"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type Dispatch, type RefObject, type SetStateAction, type SubmitEvent } from "react";
import { flushSync } from "react-dom";
import { AnimatePresence } from "motion/react";
import { toast, Button, Input, Switch, AnimatedCollapse, AnimatedListItem, formatFileSize, cn, RichLinkEditor, useRichLinkEditor } from "@golfo/ui";

import { Link } from "@/components/navigation/link";
import {
  ATTACHMENT_FILE,
  ATTACHMENT_FILE_INPUT_ACCEPT,
  isAllowedAttachmentMimeType,
} from "@/src/constants/attachment-files";
import { ROUTES } from "@/src/constants/routes";
import {
  COURSE_LESSON_DESCRIPTION,
  LESSON_FILES,
} from "@/src/modules/courses/constants/courses";
import type {
  CourseModuleResult,
  CourseModuleWithLessonsResult,
  LessonResult,
  LessonWithViewerStateResult,
} from "@/src/modules/courses/application/results/course-results";
import {
  VIDEO_PROVIDER,
  type VideoProvider,
} from "@/src/modules/shared/domain/value-objects/video-provider";
import {
  InvalidVideoUrlError,
  parseExternalVideoUrl,
} from "@/src/modules/shared/domain/value-objects/external-video-url";
import {
  appendLesson,
  appendModule,
  findLessonSnapshot,
  findModuleSnapshot,
  insertLessonAt,
  insertModuleAt,
  patchLessonFields,
  patchModuleFields,
  removeLessonById,
  removeModuleById,
  replaceLessonId,
  replaceModuleId,
} from "./optimistic-courses-state";
import styles from "./styles.module.scss";

const COURSES_MANAGEMENT_COPY = {
  activeLabel: "Activo",
  attachFileButton: "Adjuntar archivo",
  backLink: "Ver vista pública",
  cancelButton: "Cancelar",
  createModuleHeading: "Nuevo módulo",
  createButton: "Crear",
  deleteButton: "Eliminar",
  deleteModuleConfirm:
    "Esto eliminará el módulo y todas sus lecciones. ¿Continuar?",
  deleteLessonConfirm: "¿Eliminar esta lección?",
  descriptionLabel: "Descripción",
  descriptionPlaceholder: "Texto opcional debajo del video",
  descriptionTooLongMessage:
    "La descripción supera el máximo de caracteres permitido.",
  editButton: "Editar",
  emptyState: "Todavía no creaste ningún módulo.",
  fileStatusError: "Error",
  fileStatusReady: "Listo",
  fileStatusUploading: "Subiendo…",
  fileUploadErrorMessage: "No pudimos subir el archivo. Intentá de nuevo.",
  fileUploadFailedBlockMessage:
    "Hay archivos con error. Retinalos o volvé a intentarlos antes de guardar.",
  inactiveBadge: "Inactivo",
  invalidVideoUrlMessage:
    "La URL del video no es válida. Revisá el enlace e intentá de nuevo.",
  lessonCreatedMessage: "Lección creada.",
  lessonDeletedMessage: "Lección eliminada.",
  lessonFilesHeading: "Material de la lección",
  lessonUpdatedMessage: "Lección actualizada.",
  moduleCreatedMessage: "Módulo creado.",
  moduleDeletedMessage: "Módulo eliminado.",
  moduleUpdatedMessage: "Módulo actualizado.",
  newLessonButton: "Agregar lección",
  newLessonHeading: "Nueva lección",
  newModuleButton: "Nuevo módulo",
  pageHeading: "Gestionar contenido",
  pendingBadge: "Guardando…",
  removeFileButton: "Quitar",
  backToCoursesLink: "Volver a cursos",
  unlockAfterDaysHelp:
    "Dejalo vacío para que el módulo esté disponible desde el primer día.",
  unlockAfterDaysLabel: "Desbloquear a los (días desde el ingreso)",
  retryFileButton: "Reintentar",
  saveButton: "Guardar",
  tooManyFilesMessage: `Podés adjuntar hasta ${LESSON_FILES.maxCount} archivos por lección.`,
  sortOrderLabel: "Orden",
  titleLabel: "Título",
  titleLessonPlaceholder: "Ej: Qué dinero invertir",
  titleModulePlaceholder: "Ej: Empezar acá",
  titleRequiredMessage: "Escribí un título.",
  unexpectedError: "No pudimos completar la acción. Intentá de nuevo.",
  videoUrlHelp:
    "Pegá la URL completa del video (Vimeo, Wistia, Loom o YouTube).",
  videoUrlLabel: "URL del video",
  videoUrlPlaceholder: "https://vimeo.com/123456789",
} as const;

const EDIT_HEADING_PREFIX = "Editar: ";

const LESSON_DESCRIPTION_EDITOR_COPY = {
  editAction: "Editar",
  editCancel: "Cancelar",
  editSave: "Guardar",
  popoverTextLabel: "Texto del link",
  popoverUrlLabel: "Link",
  removeAction: "Remover",
} as const;

const PROVIDER_LABEL: Record<VideoProvider, string> = {
  [VIDEO_PROVIDER.loom]: "Loom",
  [VIDEO_PROVIDER.vimeo]: "Vimeo",
  [VIDEO_PROVIDER.wistia]: "Wistia",
  [VIDEO_PROVIDER.youtube]: "YouTube",
};

const VIMEO_HASH_SEPARATOR = ":";
const URL_PATH_SEPARATOR = "/";
const VIMEO_CANONICAL_URL_PREFIX = "https://vimeo.com/";
const WISTIA_CANONICAL_URL_PREFIX = "https://fast.wistia.net/embed/iframe/";
const LOOM_CANONICAL_URL_PREFIX = "https://www.loom.com/share/";
const YOUTUBE_WATCH_URL = "https://www.youtube.com/watch";
const YOUTUBE_VIDEO_QUERY_PARAM = "v";

const OPTIMISTIC_ID_PREFIX = "optimistic-";
const OPTIMISTIC_ID_FALLBACK_SEPARATOR = "-";
const TYPEOF_UNDEFINED = "undefined";
const CRYPTO_RANDOM_UUID_PROPERTY = "randomUUID";
const ARIA_ROLE_GROUP = "group";
const ARIA_ROLE_STATUS = "status";

/**
 * Prefixes of the keys that name the control to refocus once a form closes;
 * the entity id is appended.
 */
const FOCUS_RESTORE_KEY_PREFIX = {
  addLesson: "add-lesson:",
  editLesson: "edit-lesson:",
  editModule: "edit-module:",
} as const;

function buildCanonicalVideoUrl(
  provider: VideoProvider,
  externalVideoId: string
): string {
  switch (provider) {
    case VIDEO_PROVIDER.vimeo: {
      const [id, hash] = externalVideoId.split(VIMEO_HASH_SEPARATOR);
      return hash
        ? `${VIMEO_CANONICAL_URL_PREFIX}${id}${URL_PATH_SEPARATOR}${hash}`
        : `${VIMEO_CANONICAL_URL_PREFIX}${id}`;
    }
    case VIDEO_PROVIDER.wistia:
      return `${WISTIA_CANONICAL_URL_PREFIX}${externalVideoId}`;
    case VIDEO_PROVIDER.loom:
      return `${LOOM_CANONICAL_URL_PREFIX}${externalVideoId}`;
    case VIDEO_PROVIDER.youtube: {
      const youtubeUrl = new URL(YOUTUBE_WATCH_URL);
      youtubeUrl.searchParams.set(YOUTUBE_VIDEO_QUERY_PARAM, externalVideoId);
      return youtubeUrl.toString();
    }
    default:
      return "";
  }
}

function detectProviderFromInput(input: string): VideoProvider | null {
  try {
    return parseExternalVideoUrl(input).provider;
  } catch (error) {
    if (error instanceof InvalidVideoUrlError) {
      return null;
    }
    throw error;
  }
}

const HTTP_METHOD = {
  delete: "DELETE",
  patch: "PATCH",
  post: "POST",
  put: "PUT",
} as const;

const HTTP_HEADER_NAME = {
  contentType: "Content-Type",
} as const;

const HTTP_CONTENT_TYPE = {
  applicationJson: "application/json",
} as const;

const COURSES_API = {
  apiTribesPrefix: "/api/tribes/",
  coursesLessonFiles: "/courses/lessons/files/",
  coursesLessonFileUploads: "/courses/lessons/files/uploads",
  coursesLessons: "/courses/lessons/",
  coursesModules: "/courses/modules",
  coursesModulesById: "/courses/modules/",
  lessonsSuffix: "/lessons",
} as const;

const BUTTON_VARIANT = {
  danger: "danger",
  secondary: "secondary",
} as const;

const BUTTON_SIZE = {
  small: "sm",
} as const;

const INPUT_TYPE = {
  file: "file",
  number: "number",
} as const;

const LESSON_FILE_DRAFT_STATUS = {
  error: "error",
  ready: "ready",
  uploading: "uploading",
} as const;

type LessonFileDraftStatus =
  (typeof LESSON_FILE_DRAFT_STATUS)[keyof typeof LESSON_FILE_DRAFT_STATUS];

const LESSON_FILE_STATUS_LABEL: Record<LessonFileDraftStatus, string> = {
  [LESSON_FILE_DRAFT_STATUS.error]: COURSES_MANAGEMENT_COPY.fileStatusError,
  [LESSON_FILE_DRAFT_STATUS.ready]: COURSES_MANAGEMENT_COPY.fileStatusReady,
  [LESSON_FILE_DRAFT_STATUS.uploading]:
    COURSES_MANAGEMENT_COPY.fileStatusUploading,
};

const LESSON_FILE_STATUS_CLASS_NAME: Record<LessonFileDraftStatus, string> = {
  [LESSON_FILE_DRAFT_STATUS.error]: `${styles.TribeCoursesManagement__fileStatus} ${styles["TribeCoursesManagement__fileStatus--error"]}`,
  [LESSON_FILE_DRAFT_STATUS.ready]: `${styles.TribeCoursesManagement__fileStatus} ${styles["TribeCoursesManagement__fileStatus--ready"]}`,
  [LESSON_FILE_DRAFT_STATUS.uploading]:
    styles.TribeCoursesManagement__fileStatus,
};

const LESSON_FILES_HELP_TEXT = `Hasta ${LESSON_FILES.maxCount} archivos de hasta ${formatFileSize(ATTACHMENT_FILE.maxFileSizeBytes)} cada uno.`;

function buildFileTypeNotAllowedMessage(fileName: string): string {
  return `El tipo de archivo de "${fileName}" no está permitido.`;
}

function buildFileTooLargeMessage(fileName: string): string {
  return `"${fileName}" supera el máximo de ${formatFileSize(ATTACHMENT_FILE.maxFileSizeBytes)}.`;
}

const FORM_BUTTON_TYPE = {
  button: "button",
  submit: "submit",
} as const;

const NUMERIC_PARSE_RADIX = 10;

type TribeCoursesManagementProps = {
  courseId: string;
  courseTitle: string;
  initialModules: CourseModuleWithLessonsResult[];
  tribeSlug: string;
};

type ModuleFormState = {
  isActive: boolean;
  sortOrder: number;
  title: string;
  unlockAfterDays: number | null;
};

type LessonFileResult = NonNullable<LessonResult["files"]>[number];

type LessonFileAttachmentPayload = {
  assetId: string;
};

type LessonFileDraft = {
  assetId: string | null;
  fileName: string;
  fileSizeBytes: number;
  localId: string;
  status: LessonFileDraftStatus;
  wasAlreadyAttached: boolean;
};

type LessonFileUploadReservation = {
  assetId: string;
  uploadHeaders: Record<string, string>;
  uploadUrl: string;
};

type LessonFormState = {
  description: string;
  externalVideoUrl: string;
  /**
   * Replacement set of attachments, in display order. `undefined` means the
   * attachments section was never touched, so the request must omit the field
   * and leave the persisted set untouched.
   */
  files?: LessonFileAttachmentPayload[];
  isActive: boolean;
  sortOrder: number;
  title: string;
};

function buildModulesApiUrl(tribeSlug: string): string {
  return `${COURSES_API.apiTribesPrefix}${tribeSlug}${COURSES_API.coursesModules}`;
}

function buildModuleApiUrl(tribeSlug: string, moduleId: string): string {
  return `${COURSES_API.apiTribesPrefix}${tribeSlug}${COURSES_API.coursesModulesById}${moduleId}`;
}

function buildLessonsApiUrl(tribeSlug: string, moduleId: string): string {
  return `${COURSES_API.apiTribesPrefix}${tribeSlug}${COURSES_API.coursesModulesById}${moduleId}${COURSES_API.lessonsSuffix}`;
}

function buildLessonApiUrl(tribeSlug: string, lessonId: string): string {
  return `${COURSES_API.apiTribesPrefix}${tribeSlug}${COURSES_API.coursesLessons}${lessonId}`;
}

function buildLessonFileUploadsApiUrl(tribeSlug: string): string {
  return `${COURSES_API.apiTribesPrefix}${tribeSlug}${COURSES_API.coursesLessonFileUploads}`;
}

function buildLessonFileApiUrl(tribeSlug: string, fileId: string): string {
  return `${COURSES_API.apiTribesPrefix}${tribeSlug}${COURSES_API.coursesLessonFiles}${fileId}`;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { message?: string } | null;
    return payload?.message ?? COURSES_MANAGEMENT_COPY.unexpectedError;
  } catch {
    return COURSES_MANAGEMENT_COPY.unexpectedError;
  }
}

function generateOptimisticId(): string {
  const suffix =
    typeof crypto !== TYPEOF_UNDEFINED &&
    CRYPTO_RANDOM_UUID_PROPERTY in crypto
      ? crypto.randomUUID()
      : `${Date.now()}${OPTIMISTIC_ID_FALLBACK_SEPARATOR}${Math.random()}`;
  return `${OPTIMISTIC_ID_PREFIX}${suffix}`;
}

function isOptimisticId(id: string): boolean {
  return id.startsWith(OPTIMISTIC_ID_PREFIX);
}

function readModuleFromResponse(
  payload: unknown
): CourseModuleResult | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const candidate = (payload as { courseModule?: unknown }).courseModule;
  if (!candidate || typeof candidate !== "object") {
    return null;
  }
  const entry = candidate as Record<string, unknown>;
  if (
    typeof entry.id !== "string" ||
    typeof entry.title !== "string" ||
    typeof entry.sortOrder !== "number" ||
    typeof entry.isActive !== "boolean" ||
    typeof entry.courseId !== "string"
  ) {
    return null;
  }
  return {
    courseId: entry.courseId,
    id: entry.id,
    isActive: entry.isActive,
    sortOrder: entry.sortOrder,
    title: entry.title,
    unlockAfterDays:
      typeof entry.unlockAfterDays === "number" ? entry.unlockAfterDays : null,
  };
}

function readLessonFilesFromResponse(
  value: unknown
): LessonFileResult[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const files: LessonFileResult[] = [];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") {
      return undefined;
    }
    const entry = candidate as Record<string, unknown>;
    if (
      typeof entry.fileName !== "string" ||
      typeof entry.fileSizeBytes !== "number" ||
      typeof entry.id !== "string" ||
      typeof entry.mimeType !== "string" ||
      typeof entry.sortOrder !== "number"
    ) {
      return undefined;
    }
    files.push({
      fileName: entry.fileName,
      fileSizeBytes: entry.fileSizeBytes,
      id: entry.id,
      mimeType: entry.mimeType,
      sortOrder: entry.sortOrder,
    });
  }
  return files;
}

function readUploadReservationFromResponse(
  payload: unknown
): LessonFileUploadReservation | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const entry = payload as Record<string, unknown>;
  if (
    typeof entry.assetId !== "string" ||
    typeof entry.uploadUrl !== "string"
  ) {
    return null;
  }
  const uploadHeaders: Record<string, string> = {};
  if (entry.uploadHeaders && typeof entry.uploadHeaders === "object") {
    for (const [headerName, headerValue] of Object.entries(
      entry.uploadHeaders as Record<string, unknown>
    )) {
      if (typeof headerValue === "string") {
        uploadHeaders[headerName] = headerValue;
      }
    }
  }
  return {
    assetId: entry.assetId,
    uploadHeaders,
    uploadUrl: entry.uploadUrl,
  };
}

function readLessonFromResponse(payload: unknown): LessonResult | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const candidate = (payload as { lesson?: unknown }).lesson;
  if (!candidate || typeof candidate !== "object") {
    return null;
  }
  const entry = candidate as Record<string, unknown>;
  if (
    typeof entry.id !== "string" ||
    typeof entry.title !== "string" ||
    typeof entry.sortOrder !== "number" ||
    typeof entry.isActive !== "boolean" ||
    typeof entry.courseModuleId !== "string" ||
    typeof entry.externalVideoId !== "string" ||
    typeof entry.videoProvider !== "string"
  ) {
    return null;
  }
  return {
    courseModuleId: entry.courseModuleId,
    description:
      typeof entry.description === "string" ? entry.description : null,
    externalVideoId: entry.externalVideoId,
    ...(entry.files !== undefined
      ? { files: readLessonFilesFromResponse(entry.files) }
      : {}),
    id: entry.id,
    isActive: entry.isActive,
    sortOrder: entry.sortOrder,
    title: entry.title,
    videoProvider: entry.videoProvider as VideoProvider,
  };
}

type SetModules = Dispatch<SetStateAction<CourseModuleWithLessonsResult[]>>;

/**
 * Sends a JSON request to a course content endpoint.
 *
 * @param url - Endpoint.
 * @param method - HTTP method.
 * @param body - JSON body.
 * @returns The response.
 */
function sendJson(
  url: string,
  method: string,
  body: Record<string, unknown>
): Promise<Response> {
  return fetch(url, {
    body: JSON.stringify(body),
    headers: {
      [HTTP_HEADER_NAME.contentType]: HTTP_CONTENT_TYPE.applicationJson,
    },
    method,
  });
}

/**
 * Parses the lesson video URL, reporting an unsupported one to the author.
 *
 * @param externalVideoUrl - URL typed by the author.
 * @returns The parsed video, or `null` after the error toast.
 * @throws Any error other than `InvalidVideoUrlError`, unchanged.
 */
function parseLessonVideoOrNotify(
  externalVideoUrl: string
): ReturnType<typeof parseExternalVideoUrl> | null {
  try {
    return parseExternalVideoUrl(externalVideoUrl);
  } catch (error) {
    if (error instanceof InvalidVideoUrlError) {
      toast.error(COURSES_MANAGEMENT_COPY.invalidVideoUrlMessage);
      return null;
    }
    throw error;
  }
}

/**
 * Picks the editable fields of a module.
 *
 * @param source - Module, form values or server module.
 * @returns The fields patched by the module editor.
 */
function pickModuleFields(
  source: Pick<CourseModuleResult, "isActive" | "sortOrder" | "title" | "unlockAfterDays">
) {
  return {
    isActive: source.isActive,
    sortOrder: source.sortOrder,
    title: source.title,
    unlockAfterDays: source.unlockAfterDays,
  };
}

/**
 * Tracks the ids with a request in flight, including the swap from an
 * optimistic id to the server id.
 *
 * @returns The pending ids, their setter and the mark, clear and swap helpers.
 */
function usePendingIds() {
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());

  const markPending = useCallback((id: string) => {
    setPendingIds((current) => {
      const next = new Set(current);
      next.add(id);
      return next;
    });
  }, []);

  const clearPending = useCallback((id: string) => {
    setPendingIds((current) => {
      if (!current.has(id)) {
        return current;
      }
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }, []);

  const swapPending = useCallback((fromId: string, toId: string) => {
    setPendingIds((current) => {
      if (!current.has(fromId)) {
        return current;
      }
      const next = new Set(current);
      next.delete(fromId);
      next.add(toId);
      return next;
    });
  }, []);

  return { clearPending, markPending, pendingIds, setPendingIds, swapPending };
}

type PendingIdsState = ReturnType<typeof usePendingIds>;

/**
 * Keeps the controls that must regain focus once the form that replaced them
 * closes, and the add-lesson buttons that take focus after a lesson deletion.
 *
 * @returns The new module button ref, ref binders and focus helpers.
 */
function useCourseContentFocus() {
  const newModuleButtonRef = useRef<HTMLButtonElement>(null);
  const addLessonButtonsRef = useRef(new Map<string, HTMLButtonElement>());
  // Key of the control that must regain focus when it mounts again after the
  // form that replaced it closes (see FOCUS_RESTORE_KEY_PREFIX).
  const focusRestoreKeyRef = useRef<string | null>(null);

  /**
   * Builds a ref callback that focuses its element when it mounts while its
   * key is the pending focus-restore target.
   */
  const bindFocusRestore =
    (focusKey: string) => (element: HTMLElement | null) => {
      if (element && focusRestoreKeyRef.current === focusKey) {
        focusRestoreKeyRef.current = null;
        element.focus();
      }
    };

  const bindAddLessonButton =
    (moduleId: string) => (element: HTMLButtonElement | null) => {
      if (!element) {
        addLessonButtonsRef.current.delete(moduleId);
        return;
      }
      addLessonButtonsRef.current.set(moduleId, element);
      bindFocusRestore(FOCUS_RESTORE_KEY_PREFIX.addLesson + moduleId)(element);
    };

  const restoreFocusOnMount = (focusKey: string) => {
    focusRestoreKeyRef.current = focusKey;
  };

  const focusNewModuleButton = () => {
    newModuleButtonRef.current?.focus();
  };

  const focusAddLessonButton = (moduleId: string) => {
    addLessonButtonsRef.current.get(moduleId)?.focus();
  };

  return {
    bindAddLessonButton,
    bindFocusRestore,
    focusAddLessonButton,
    focusNewModuleButton,
    newModuleButtonRef,
    restoreFocusOnMount,
  };
}

/** State and helpers shared by the optimistic module and lesson mutations. */
type CourseContentMutationContext = {
  closeLessonCreator: (moduleId: string) => void;
  closeLessonEditor: (lessonId: string) => void;
  closeModuleEditor: (moduleId: string) => void;
  closeNewModuleForm: () => void;
  courseId: string;
  focusAddLessonButton: (moduleId: string) => void;
  focusNewModuleButton: () => void;
  lessonPending: PendingIdsState;
  modulePending: PendingIdsState;
  modules: CourseModuleWithLessonsResult[];
  setCreatingLessonModuleId: (moduleId: string | null) => void;
  setEditingLessonId: (lessonId: string | null) => void;
  setEditingModuleId: (moduleId: string | null) => void;
  setModules: SetModules;
  setShowNewModuleForm: (isOpen: boolean) => void;
  tribeSlug: string;
};

/**
 * Builds the handler that creates a module optimistically.
 *
 * @param context - Module tree state and helpers.
 * @returns The create handler.
 */
function createSubmitNewModule(context: CourseContentMutationContext) {
  const { courseId, modulePending, setModules } = context;

  const discardOptimisticModule = (optimisticId: string) => {
    setModules((current) => removeModuleById(current, optimisticId));
    modulePending.clearPending(optimisticId);
  };

  return async (form: ModuleFormState) => {
    const optimisticId = generateOptimisticId();
    const optimisticModule: CourseModuleWithLessonsResult = {
      courseId,
      id: optimisticId,
      isActive: true,
      lessons: [],
      sortOrder: form.sortOrder,
      title: form.title,
      unlockAfterDays: form.unlockAfterDays,
      viewerAccess: { isLocked: false, unlocksAt: null },
    };
    setModules((current) => appendModule(current, optimisticModule));
    modulePending.markPending(optimisticId);

    try {
      const response = await sendJson(buildModulesApiUrl(context.tribeSlug), HTTP_METHOD.post, {
        courseId,
        sortOrder: form.sortOrder,
        title: form.title,
        unlockAfterDays: form.unlockAfterDays,
      });

      if (!response.ok) {
        discardOptimisticModule(optimisticId);
        toast.error(await readErrorMessage(response));
        context.setShowNewModuleForm(true);
        return;
      }

      const payload: unknown = await response.json().catch(() => null);
      const serverModule = readModuleFromResponse(payload);
      if (!serverModule) {
        discardOptimisticModule(optimisticId);
        toast.error(COURSES_MANAGEMENT_COPY.unexpectedError);
        return;
      }
      setModules((current) =>
        replaceModuleId(current, optimisticId, serverModule)
      );
      modulePending.swapPending(optimisticId, serverModule.id);
      modulePending.clearPending(serverModule.id);
      context.closeNewModuleForm();
      toast.success(COURSES_MANAGEMENT_COPY.moduleCreatedMessage);
    } catch {
      discardOptimisticModule(optimisticId);
      toast.error(COURSES_MANAGEMENT_COPY.unexpectedError);
    }
  };
}

/**
 * Builds the handler that updates a module optimistically and restores it on failure.
 *
 * @param context - Module tree state and helpers.
 * @returns The update handler.
 */
function createSubmitModuleUpdate(context: CourseContentMutationContext) {
  const { modulePending, setModules } = context;

  return async (moduleId: string, form: ModuleFormState) => {
    const snapshot = findModuleSnapshot(context.modules, moduleId);
    if (!snapshot) {
      return;
    }
    const restoreSnapshot = () => {
      setModules((current) =>
        patchModuleFields(current, moduleId, pickModuleFields(snapshot.module))
      );
      modulePending.clearPending(moduleId);
    };
    setModules((current) =>
      patchModuleFields(current, moduleId, pickModuleFields(form))
    );
    modulePending.markPending(moduleId);

    try {
      const response = await sendJson(
        buildModuleApiUrl(context.tribeSlug, moduleId),
        HTTP_METHOD.patch,
        pickModuleFields(form)
      );

      if (!response.ok) {
        restoreSnapshot();
        toast.error(await readErrorMessage(response));
        context.setEditingModuleId(moduleId);
        return;
      }

      const payload: unknown = await response.json().catch(() => null);
      const serverModule = readModuleFromResponse(payload);
      if (serverModule) {
        setModules((current) =>
          patchModuleFields(current, moduleId, pickModuleFields(serverModule))
        );
      }
      modulePending.clearPending(moduleId);
      context.closeModuleEditor(moduleId);
      toast.success(COURSES_MANAGEMENT_COPY.moduleUpdatedMessage);
    } catch {
      restoreSnapshot();
      toast.error(COURSES_MANAGEMENT_COPY.unexpectedError);
    }
  };
}

/**
 * Builds the handler that deletes a module after confirmation and restores it on failure.
 *
 * @param context - Module tree state and helpers.
 * @returns The delete handler.
 */
function createDeleteModule(context: CourseContentMutationContext) {
  const { modulePending, setModules } = context;

  return async (moduleId: string) => {
    if (!window.confirm(COURSES_MANAGEMENT_COPY.deleteModuleConfirm)) {
      return;
    }
    const snapshot = findModuleSnapshot(context.modules, moduleId);
    if (!snapshot) {
      return;
    }
    const restoreSnapshot = () => {
      setModules((current) =>
        insertModuleAt(current, snapshot.module, snapshot.index)
      );
      modulePending.clearPending(moduleId);
    };
    setModules((current) => removeModuleById(current, moduleId));
    modulePending.markPending(moduleId);
    // The focused delete button leaves with its module; keep focus on the page.
    context.focusNewModuleButton();

    try {
      const response = await fetch(buildModuleApiUrl(context.tribeSlug, moduleId), {
        method: HTTP_METHOD.delete,
      });
      if (!response.ok) {
        restoreSnapshot();
        toast.error(await readErrorMessage(response));
        return;
      }
      modulePending.clearPending(moduleId);
      toast.success(COURSES_MANAGEMENT_COPY.moduleDeletedMessage);
    } catch {
      restoreSnapshot();
      toast.error(COURSES_MANAGEMENT_COPY.unexpectedError);
    }
  };
}

/**
 * Builds the handler that creates a lesson optimistically.
 *
 * @param context - Module tree state and helpers.
 * @returns The create handler.
 */
function createSubmitNewLesson(context: CourseContentMutationContext) {
  const { lessonPending, setModules } = context;

  return async (courseModuleId: string, form: LessonFormState) => {
    const parsedVideo = parseLessonVideoOrNotify(form.externalVideoUrl);
    if (!parsedVideo) {
      return;
    }

    const optimisticId = generateOptimisticId();
    const optimisticLesson: LessonWithViewerStateResult = {
      completed: false,
      courseModuleId,
      description: form.description,
      externalVideoId: parsedVideo.externalId,
      id: optimisticId,
      isActive: true,
      sortOrder: form.sortOrder,
      title: form.title,
      videoProvider: parsedVideo.provider,
    };
    const discardOptimisticLesson = () => {
      setModules((current) =>
        removeLessonById(current, courseModuleId, optimisticId)
      );
      lessonPending.clearPending(optimisticId);
    };
    setModules((current) =>
      appendLesson(current, courseModuleId, optimisticLesson)
    );
    lessonPending.markPending(optimisticId);

    try {
      const response = await sendJson(buildLessonsApiUrl(context.tribeSlug, courseModuleId), HTTP_METHOD.post, {
        description: form.description,
        externalVideoUrl: form.externalVideoUrl,
        ...(form.files !== undefined ? { files: form.files } : {}),
        sortOrder: form.sortOrder,
        title: form.title,
      });

      if (!response.ok) {
        discardOptimisticLesson();
        toast.error(await readErrorMessage(response));
        context.setCreatingLessonModuleId(courseModuleId);
        return;
      }

      const payload: unknown = await response.json().catch(() => null);
      const serverLesson = readLessonFromResponse(payload);
      if (!serverLesson) {
        discardOptimisticLesson();
        toast.error(COURSES_MANAGEMENT_COPY.unexpectedError);
        return;
      }
      setModules((current) =>
        replaceLessonId(current, courseModuleId, optimisticId, {
          ...serverLesson,
          completed: false,
        })
      );
      lessonPending.swapPending(optimisticId, serverLesson.id);
      lessonPending.clearPending(serverLesson.id);
      context.closeLessonCreator(courseModuleId);
      toast.success(COURSES_MANAGEMENT_COPY.lessonCreatedMessage);
    } catch {
      discardOptimisticLesson();
      toast.error(COURSES_MANAGEMENT_COPY.unexpectedError);
    }
  };
}

/**
 * Builds the handler that updates a lesson optimistically and restores it on failure.
 *
 * @param context - Module tree state and helpers.
 * @returns The update handler.
 */
function createSubmitLessonUpdate(context: CourseContentMutationContext) {
  const { lessonPending, setModules } = context;

  return async (lesson: LessonResult, form: LessonFormState) => {
    const parsedVideo = parseLessonVideoOrNotify(form.externalVideoUrl);
    if (!parsedVideo) {
      return;
    }

    const snapshot = findLessonSnapshot(context.modules, lesson.id);
    if (!snapshot) {
      return;
    }
    const restoreSnapshot = () => {
      setModules((current) =>
        patchLessonFields(current, snapshot.moduleId, snapshot.lesson.id, snapshot.lesson)
      );
      lessonPending.clearPending(lesson.id);
    };
    setModules((current) =>
      patchLessonFields(current, lesson.courseModuleId, lesson.id, {
        description: form.description,
        externalVideoId: parsedVideo.externalId,
        isActive: form.isActive,
        sortOrder: form.sortOrder,
        title: form.title,
        videoProvider: parsedVideo.provider,
      })
    );
    lessonPending.markPending(lesson.id);

    try {
      const response = await sendJson(buildLessonApiUrl(context.tribeSlug, lesson.id), HTTP_METHOD.patch, {
        courseModuleId: lesson.courseModuleId,
        description: form.description,
        externalVideoUrl: form.externalVideoUrl,
        ...(form.files !== undefined ? { files: form.files } : {}),
        isActive: form.isActive,
        sortOrder: form.sortOrder,
        title: form.title,
      });

      if (!response.ok) {
        restoreSnapshot();
        toast.error(await readErrorMessage(response));
        context.setEditingLessonId(lesson.id);
        return;
      }

      const payload: unknown = await response.json().catch(() => null);
      const serverLesson = readLessonFromResponse(payload);
      if (serverLesson) {
        setModules((current) =>
          patchLessonFields(current, serverLesson.courseModuleId, serverLesson.id, serverLesson)
        );
      }
      lessonPending.clearPending(lesson.id);
      context.closeLessonEditor(lesson.id);
      toast.success(COURSES_MANAGEMENT_COPY.lessonUpdatedMessage);
    } catch {
      restoreSnapshot();
      toast.error(COURSES_MANAGEMENT_COPY.unexpectedError);
    }
  };
}

/**
 * Builds the handler that deletes a lesson after confirmation and restores it on failure.
 *
 * @param context - Module tree state and helpers.
 * @returns The delete handler.
 */
function createDeleteLesson(context: CourseContentMutationContext) {
  const { lessonPending, setModules } = context;

  return async (lessonId: string) => {
    if (!window.confirm(COURSES_MANAGEMENT_COPY.deleteLessonConfirm)) {
      return;
    }
    const snapshot = findLessonSnapshot(context.modules, lessonId);
    if (!snapshot) {
      return;
    }
    const restoreSnapshot = () => {
      setModules((current) =>
        insertLessonAt(current, snapshot.moduleId, snapshot.lesson, snapshot.index)
      );
      lessonPending.clearPending(lessonId);
    };
    setModules((current) =>
      removeLessonById(current, snapshot.moduleId, lessonId)
    );
    lessonPending.markPending(lessonId);
    // The focused delete button leaves with its lesson; keep focus in the module.
    context.focusAddLessonButton(snapshot.moduleId);

    try {
      const response = await fetch(buildLessonApiUrl(context.tribeSlug, lessonId), {
        method: HTTP_METHOD.delete,
      });
      if (!response.ok) {
        restoreSnapshot();
        toast.error(await readErrorMessage(response));
        return;
      }
      lessonPending.clearPending(lessonId);
      toast.success(COURSES_MANAGEMENT_COPY.lessonDeletedMessage);
    } catch {
      restoreSnapshot();
      toast.error(COURSES_MANAGEMENT_COPY.unexpectedError);
    }
  };
}

/**
 * Keeps the module tree, its in-flight requests and which forms are open,
 * resetting them when the server sends another tree or tribe.
 *
 * @param props - Course identity, initial module tree and tribe slug.
 * @returns The module tree state, the focus binders and the mutation handlers.
 */
function useCourseContentManagement({
  courseId,
  initialModules,
  tribeSlug,
}: Omit<TribeCoursesManagementProps, "courseTitle">) {
  const [modules, setModules] =
    useState<CourseModuleWithLessonsResult[]>(initialModules);
  const [syncedInitialModules, setSyncedInitialModules] =
    useState(initialModules);
  const [syncedTribeSlug, setSyncedTribeSlug] = useState(tribeSlug);
  const modulePending = usePendingIds();
  const lessonPending = usePendingIds();
  const [showNewModuleForm, setShowNewModuleForm] = useState(false);
  const [editingModuleId, setEditingModuleId] = useState<string | null>(null);
  const [creatingLessonModuleId, setCreatingLessonModuleId] = useState<
    string | null
  >(null);
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null);
  const { focusAddLessonButton, focusNewModuleButton, restoreFocusOnMount, ...focus } =
    useCourseContentFocus();

  const closeNewModuleForm = () => {
    // The new module button stays disabled while the form is open: commit the
    // close first so the button can take focus again.
    flushSync(() => setShowNewModuleForm(false));
    focusNewModuleButton();
  };

  const closeModuleEditor = (moduleId: string) => {
    restoreFocusOnMount(FOCUS_RESTORE_KEY_PREFIX.editModule + moduleId);
    setEditingModuleId(null);
  };

  const closeLessonEditor = (lessonId: string) => {
    restoreFocusOnMount(FOCUS_RESTORE_KEY_PREFIX.editLesson + lessonId);
    setEditingLessonId(null);
  };

  const closeLessonCreator = (moduleId: string) => {
    restoreFocusOnMount(FOCUS_RESTORE_KEY_PREFIX.addLesson + moduleId);
    setCreatingLessonModuleId(null);
  };

  if (syncedInitialModules !== initialModules || syncedTribeSlug !== tribeSlug) {
    setSyncedInitialModules(initialModules);
    setSyncedTribeSlug(tribeSlug);
    setModules(initialModules);
    modulePending.setPendingIds(new Set());
    lessonPending.setPendingIds(new Set());
    setShowNewModuleForm(false);
    setEditingModuleId(null);
    setCreatingLessonModuleId(null);
    setEditingLessonId(null);
  }

  const context: CourseContentMutationContext = {
    closeLessonCreator, closeLessonEditor, closeModuleEditor, closeNewModuleForm, courseId,
    focusAddLessonButton, focusNewModuleButton, lessonPending, modulePending, modules,
    setCreatingLessonModuleId, setEditingLessonId, setEditingModuleId, setModules,
    setShowNewModuleForm, tribeSlug,
  };

  // The handlers are built when called, so render never touches the refs the
  // mutation helpers focus.
  return {
    ...focus,
    closeLessonCreator, closeLessonEditor, closeModuleEditor, closeNewModuleForm,
    creatingLessonModuleId, editingLessonId, editingModuleId, modules,
    pendingLessonIds: lessonPending.pendingIds, pendingModuleIds: modulePending.pendingIds,
    setCreatingLessonModuleId, setEditingLessonId, setEditingModuleId, setShowNewModuleForm,
    showNewModuleForm,
    deleteLesson: (lessonId: string) => createDeleteLesson(context)(lessonId),
    deleteModule: (moduleId: string) => createDeleteModule(context)(moduleId),
    submitLessonUpdate: (lesson: LessonResult, form: LessonFormState) =>
      createSubmitLessonUpdate(context)(lesson, form),
    submitModuleUpdate: (moduleId: string, form: ModuleFormState) =>
      createSubmitModuleUpdate(context)(moduleId, form),
    submitNewLesson: (courseModuleId: string, form: LessonFormState) =>
      createSubmitNewLesson(context)(courseModuleId, form),
    submitNewModule: (form: ModuleFormState) => createSubmitNewModule(context)(form),
  };
}

type CourseContentState = Omit<
  ReturnType<typeof useCourseContentManagement>,
  "newModuleButtonRef"
>;

type CourseModule = CourseModuleWithLessonsResult;
type CourseLesson = CourseModule["lessons"][number];

/**
 * Renders the title, badges and metadata of a lesson row.
 *
 * @param props - Lesson and whether a request is in flight.
 * @returns The lesson summary.
 */
function LessonSummary({
  isLessonPending,
  lesson,
}: {
  isLessonPending: boolean;
  lesson: CourseLesson;
}) {
  return (
    <div>
      <h3
        className={
          styles.TribeCoursesManagement__lessonTitle
        }
      >
        {lesson.title}
        {!lesson.isActive ? (
          <span
            className={
              styles.TribeCoursesManagement__inactiveBadge
            }
          >
            {COURSES_MANAGEMENT_COPY.inactiveBadge}
          </span>
        ) : null}
        {isLessonPending ? (
          <span
            className={
              styles.TribeCoursesManagement__pendingBadge
            }
          >
            {COURSES_MANAGEMENT_COPY.pendingBadge}
          </span>
        ) : null}
      </h3>
      <p
        className={
          styles.TribeCoursesManagement__lessonMeta
        }
      >
        {PROVIDER_LABEL[lesson.videoProvider]}: {lesson.externalVideoId} · Orden: {lesson.sortOrder}
      </p>
    </div>
  );
}

type CourseContentRowProps = {
  content: CourseContentState;
  tribeSlug: string;
};

/**
 * Renders one lesson of a module, as its summary or its inline editor.
 *
 * @param props - Content state, lesson and tribe slug.
 * @returns The animated lesson list item.
 */
function LessonRow({
  content,
  lesson,
  tribeSlug,
}: CourseContentRowProps & { lesson: CourseLesson }) {
  const isLessonPending = content.pendingLessonIds.has(lesson.id);
  const isLessonLocked = isLessonPending || isOptimisticId(lesson.id);

  return (
    <AnimatedListItem
      aria-busy={isLessonPending || undefined}
      className={cn(
        styles.TribeCoursesManagement__lessonItem,
        isLessonPending &&
          styles["TribeCoursesManagement__lessonItem--pending"]
      )}
    >
      {content.editingLessonId === lesson.id ? (
        <LessonForm
          headingLabel={`${EDIT_HEADING_PREFIX}${lesson.title}`}
          initialFiles={lesson.files ?? []}
          initialState={{
            description: lesson.description ?? "",
            externalVideoUrl: buildCanonicalVideoUrl(
              lesson.videoProvider,
              lesson.externalVideoId
            ),
            isActive: lesson.isActive,
            sortOrder: lesson.sortOrder,
            title: lesson.title,
          }}
          isEditing
          onCancel={() => content.closeLessonEditor(lesson.id)}
          onSubmit={(form) => content.submitLessonUpdate(lesson, form)}
          tribeSlug={tribeSlug}
        />
      ) : (
        <div
          className={
            styles.TribeCoursesManagement__lessonHeader
          }
        >
          <LessonSummary isLessonPending={isLessonPending} lesson={lesson} />
          <div
            aria-label={`Acciones de la lección ${lesson.title}`}
            className={styles.TribeCoursesManagement__actions}
            role={ARIA_ROLE_GROUP}
          >
            <Button
              disabled={isLessonLocked}
              onClick={() => content.setEditingLessonId(lesson.id)}
              ref={content.bindFocusRestore(
                FOCUS_RESTORE_KEY_PREFIX.editLesson + lesson.id
              )}
              type={FORM_BUTTON_TYPE.button}
              variant={BUTTON_VARIANT.secondary}
            >
              {COURSES_MANAGEMENT_COPY.editButton}
            </Button>
            <Button
              disabled={isLessonLocked}
              onClick={() => content.deleteLesson(lesson.id)}
              type={FORM_BUTTON_TYPE.button}
              variant={BUTTON_VARIANT.danger}
            >
              {COURSES_MANAGEMENT_COPY.deleteButton}
            </Button>
          </div>
        </div>
      )}
    </AnimatedListItem>
  );
}

/**
 * Renders the title, badges and metadata of a module row.
 *
 * @param props - Module and whether a request is in flight.
 * @returns The module summary.
 */
function ModuleSummary({
  courseModule,
  isModulePending,
}: {
  courseModule: CourseModule;
  isModulePending: boolean;
}) {
  return (
    <div>
      <h2
        className={styles.TribeCoursesManagement__moduleTitle}
      >
        {courseModule.title}
        {!courseModule.isActive ? (
          <span
            className={
              styles.TribeCoursesManagement__inactiveBadge
            }
          >
            {COURSES_MANAGEMENT_COPY.inactiveBadge}
          </span>
        ) : null}
        {isModulePending ? (
          <span
            className={
              styles.TribeCoursesManagement__pendingBadge
            }
          >
            {COURSES_MANAGEMENT_COPY.pendingBadge}
          </span>
        ) : null}
      </h2>
      <p
        className={
          styles.TribeCoursesManagement__moduleMeta
        }
      >
        Orden: {courseModule.sortOrder}
        {courseModule.unlockAfterDays !== null
          ? ` · Se desbloquea a los ${courseModule.unlockAfterDays} días`
          : ""}
      </p>
    </div>
  );
}

type ModuleRowProps = CourseContentRowProps & { courseModule: CourseModule };

/**
 * Renders the module header: its inline editor, or its summary and actions.
 *
 * @param props - Content state, module, its pending and locked states.
 * @returns The module header.
 */
function ModuleHeader({
  content,
  courseModule,
  isModuleLocked,
  isModulePending,
}: ModuleRowProps & { isModuleLocked: boolean; isModulePending: boolean }) {
  if (content.editingModuleId === courseModule.id) {
    return (
      <ModuleForm
        headingLabel={`${EDIT_HEADING_PREFIX}${courseModule.title}`}
        initialState={{
          isActive: courseModule.isActive,
          sortOrder: courseModule.sortOrder,
          title: courseModule.title,
          unlockAfterDays: courseModule.unlockAfterDays,
        }}
        isEditing
        onCancel={() => content.closeModuleEditor(courseModule.id)}
        onSubmit={(form) =>
          content.submitModuleUpdate(courseModule.id, form)
        }
      />
    );
  }

  return (
    <div className={styles.TribeCoursesManagement__moduleHeader}>
      <ModuleSummary courseModule={courseModule} isModulePending={isModulePending} />
      <div
        aria-label={`Acciones del módulo ${courseModule.title}`}
        className={styles.TribeCoursesManagement__actions}
        role={ARIA_ROLE_GROUP}
      >
        <Button
          disabled={isModuleLocked}
          onClick={() => content.setEditingModuleId(courseModule.id)}
          ref={content.bindFocusRestore(
            FOCUS_RESTORE_KEY_PREFIX.editModule + courseModule.id
          )}
          type={FORM_BUTTON_TYPE.button}
          variant={BUTTON_VARIANT.secondary}
        >
          {COURSES_MANAGEMENT_COPY.editButton}
        </Button>
        <Button
          disabled={isModuleLocked}
          onClick={() => content.deleteModule(courseModule.id)}
          type={FORM_BUTTON_TYPE.button}
          variant={BUTTON_VARIANT.danger}
        >
          {COURSES_MANAGEMENT_COPY.deleteButton}
        </Button>
      </div>
    </div>
  );
}

/**
 * Renders the new lesson form of a module, or the button that opens it.
 *
 * @param props - Content state, module, whether it is locked and tribe slug.
 * @returns The lesson creator.
 */
function ModuleLessonCreator({
  content,
  courseModule,
  isModuleLocked,
  tribeSlug,
}: ModuleRowProps & { isModuleLocked: boolean }) {
  if (content.creatingLessonModuleId === courseModule.id) {
    return (
      <LessonForm
        headingLabel={COURSES_MANAGEMENT_COPY.newLessonHeading}
        initialFiles={[]}
        initialState={{
          description: "",
          externalVideoUrl: "",
          isActive: true,
          sortOrder: courseModule.lessons.length,
          title: "",
        }}
        isEditing={false}
        onCancel={() => content.closeLessonCreator(courseModule.id)}
        onSubmit={(form) => content.submitNewLesson(courseModule.id, form)}
        tribeSlug={tribeSlug}
      />
    );
  }

  return (
    <Button
      className={styles.TribeCoursesManagement__addLessonButton}
      disabled={isModuleLocked}
      onClick={() => content.setCreatingLessonModuleId(courseModule.id)}
      ref={content.bindAddLessonButton(courseModule.id)}
      type={FORM_BUTTON_TYPE.button}
      variant={BUTTON_VARIANT.secondary}
    >
      {COURSES_MANAGEMENT_COPY.newLessonButton}
    </Button>
  );
}

/**
 * Renders one module with its lessons and its lesson creator.
 *
 * @param props - Content state, module and tribe slug.
 * @returns The animated module list item.
 */
function ModuleRow({ content, courseModule, tribeSlug }: ModuleRowProps) {
  const isModulePending = content.pendingModuleIds.has(courseModule.id);
  const isModuleLocked = isModulePending || isOptimisticId(courseModule.id);

  return (
    <AnimatedListItem
      aria-busy={isModulePending || undefined}
      className={cn(
        styles.TribeCoursesManagement__moduleItem,
        isModulePending &&
          styles["TribeCoursesManagement__moduleItem--pending"]
      )}
    >
      <ModuleHeader
        content={content}
        courseModule={courseModule}
        isModuleLocked={isModuleLocked}
        isModulePending={isModulePending}
        tribeSlug={tribeSlug}
      />

      <ul className={styles.TribeCoursesManagement__lessonList}>
        <AnimatePresence initial={false}>
          {courseModule.lessons.map((lesson) => (
            <LessonRow
              content={content}
              key={lesson.id}
              lesson={lesson}
              tribeSlug={tribeSlug}
            />
          ))}
        </AnimatePresence>
      </ul>

      <ModuleLessonCreator
        content={content}
        courseModule={courseModule}
        isModuleLocked={isModuleLocked}
        tribeSlug={tribeSlug}
      />
    </AnimatedListItem>
  );
}

/**
 * Renders the page heading, the back links and the new module button.
 *
 * @param props - Content state, new module button ref, course title and tribe slug.
 * @returns The page header.
 */
function CourseContentHeader({
  content,
  courseTitle,
  newModuleButtonRef,
  tribeSlug,
}: CourseContentRowProps & {
  courseTitle: string;
  newModuleButtonRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <header className={styles.TribeCoursesManagement__header}>
      <div>
        <h1 className={styles.TribeCoursesManagement__heading}>
          {COURSES_MANAGEMENT_COPY.pageHeading}: {courseTitle}
        </h1>
        <Link
          className={styles.TribeCoursesManagement__backLink}
          href={ROUTES.tribes.coursesManage(tribeSlug)}
        >
          {COURSES_MANAGEMENT_COPY.backToCoursesLink}
        </Link>
        {" · "}
        <Link
          className={styles.TribeCoursesManagement__backLink}
          href={ROUTES.tribes.courses(tribeSlug)}
        >
          {COURSES_MANAGEMENT_COPY.backLink}
        </Link>
      </div>
      <Button
        disabled={content.showNewModuleForm}
        onClick={() => content.setShowNewModuleForm(true)}
        ref={newModuleButtonRef}
        type={FORM_BUTTON_TYPE.button}
      >
        {COURSES_MANAGEMENT_COPY.newModuleButton}
      </Button>
    </header>
  );
}

/**
 * Leader-facing module and lesson editor of a course, with optimistic CRUD,
 * file attachments, animated list changes and focus kept on the affected
 * control when forms open and close.
 *
 * @param props - Course identity, initial module tree and tribe slug.
 * @returns Course content management page content.
 */
export function TribeCoursesManagement({
  courseId,
  courseTitle,
  initialModules,
  tribeSlug,
}: TribeCoursesManagementProps) {
  const { newModuleButtonRef, ...content } = useCourseContentManagement({
    courseId,
    initialModules,
    tribeSlug,
  });
  const { modules, showNewModuleForm } = content;

  return (
    <main className={styles.TribeCoursesManagement}>
      <CourseContentHeader
        content={content}
        courseTitle={courseTitle}
        newModuleButtonRef={newModuleButtonRef}
        tribeSlug={tribeSlug}
      />

      <AnimatedCollapse isOpen={showNewModuleForm}>
        <ModuleForm
          headingLabel={COURSES_MANAGEMENT_COPY.createModuleHeading}
          initialState={{
            isActive: true,
            sortOrder: modules.length,
            title: "",
            unlockAfterDays: null,
          }}
          isEditing={false}
          onCancel={content.closeNewModuleForm}
          onSubmit={content.submitNewModule}
        />
      </AnimatedCollapse>

      {modules.length === 0 && !showNewModuleForm ? (
        <p className={styles.TribeCoursesManagement__emptyState}>
          {COURSES_MANAGEMENT_COPY.emptyState}
        </p>
      ) : null}

      <ul className={styles.TribeCoursesManagement__moduleList}>
        <AnimatePresence initial={false}>
          {modules.map((courseModule) => (
            <ModuleRow
              content={content}
              courseModule={courseModule}
              key={courseModule.id}
              tribeSlug={tribeSlug}
            />
          ))}
        </AnimatePresence>
      </ul>
    </main>
  );
}

type ModuleFormProps = {
  headingLabel: string;
  initialState: ModuleFormState;
  isEditing: boolean;
  onCancel: () => void;
  onSubmit: (form: ModuleFormState) => Promise<void>;
};

/**
 * Title field state shared by the module and lesson forms: focuses the input
 * when the form opens and reports a visible error for a blank title.
 *
 * @param initialTitle - Title the form starts with.
 * @returns Title value, setters, validation and input wiring.
 */
function useRequiredTitleField(initialTitle: string) {
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitleValue] = useState(initialTitle);
  const [titleError, setTitleError] = useState<string | null>(null);

  useEffect(() => {
    titleInputRef.current?.focus();
  }, []);

  const setTitle = (nextTitle: string) => {
    setTitleValue(nextTitle);
    setTitleError(null);
  };

  /** Returns the trimmed title, or null after flagging a blank one. */
  const validateTitle = (): string | null => {
    const trimmedTitle = title.trim();

    if (trimmedTitle.length === 0) {
      setTitleError(COURSES_MANAGEMENT_COPY.titleRequiredMessage);
      titleInputRef.current?.focus();
      return null;
    }

    return trimmedTitle;
  };

  return {
    setTitle,
    title,
    titleError,
    titleInputRef,
    validateTitle,
  };
}

/**
 * Runs a form submission once at a time: a second submit landing before the
 * disabled state renders is ignored.
 *
 * @returns Whether a submission is running and the guarded runner.
 */
function useSingleSubmission() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Guards against a second submit landing before the disabled state renders.
  const isSubmittingRef = useRef(false);

  const isSubmissionRunning = () => isSubmittingRef.current;

  const runSubmission = async (submit: () => Promise<void>) => {
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      await submit();
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return { isSubmissionRunning, isSubmitting, runSubmission };
}

/**
 * Parses a numeric input value, falling back to zero.
 *
 * @param rawValue - Input value.
 * @returns The parsed integer, or 0.
 */
function parseSortOrderInput(rawValue: string): number {
  return Number.parseInt(rawValue, NUMERIC_PARSE_RADIX) || 0;
}

/**
 * Parses the unlock delay input; an empty or invalid value means no delay.
 *
 * @param rawValue - Input value.
 * @returns The parsed days, or `null`.
 */
function parseUnlockAfterDaysInput(rawValue: string): number | null {
  const parsedValue = Number.parseInt(rawValue, NUMERIC_PARSE_RADIX);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

/**
 * Renders the active switch shown while editing.
 *
 * @param props - Current value and its setter.
 * @returns The active switch field.
 */
function ActiveSwitchField({
  isActive,
  setIsActive,
}: {
  isActive: boolean;
  setIsActive: (isActive: boolean) => void;
}) {
  return (
    <label className={styles.TribeCoursesManagement__formField}>
      <span>{COURSES_MANAGEMENT_COPY.activeLabel}</span>
      <Switch
        checked={isActive}
        onCheckedChange={(value) => setIsActive(value)}
      />
    </label>
  );
}

/**
 * Renders the submit and cancel buttons of a form.
 *
 * @param props - Mode, busy and disabled states and the cancel handler.
 * @returns The form actions.
 */
function FormActions({
  isBusy,
  isEditing,
  isSubmitDisabled,
  isSubmitting,
  onCancel,
}: {
  isBusy: boolean;
  isEditing: boolean;
  isSubmitDisabled: boolean;
  isSubmitting: boolean;
  onCancel: () => void;
}) {
  return (
    <div className={styles.TribeCoursesManagement__formActions}>
      <Button
        aria-busy={isBusy || undefined}
        disabled={isSubmitDisabled}
        type={FORM_BUTTON_TYPE.submit}
      >
        {isEditing
          ? COURSES_MANAGEMENT_COPY.saveButton
          : COURSES_MANAGEMENT_COPY.createButton}
      </Button>
      <Button
        disabled={isSubmitting}
        onClick={onCancel}
        type={FORM_BUTTON_TYPE.button}
        variant={BUTTON_VARIANT.secondary}
      >
        {COURSES_MANAGEMENT_COPY.cancelButton}
      </Button>
    </div>
  );
}

/**
 * Renders the order and unlock delay fields of the module form.
 *
 * @param props - Current values and their setters.
 * @returns The module schedule fields.
 */
function ModuleScheduleFields({
  setSortOrder,
  setUnlockAfterDays,
  sortOrder,
  unlockAfterDays,
}: {
  setSortOrder: (sortOrder: number) => void;
  setUnlockAfterDays: (unlockAfterDays: number | null) => void;
  sortOrder: number;
  unlockAfterDays: number | null;
}) {
  return (
    <>
      <Input
        label={COURSES_MANAGEMENT_COPY.sortOrderLabel}
        onChange={(event) => setSortOrder(parseSortOrderInput(event.target.value))}
        type={INPUT_TYPE.number}
        value={sortOrder}
      />
      <Input
        description={COURSES_MANAGEMENT_COPY.unlockAfterDaysHelp}
        label={COURSES_MANAGEMENT_COPY.unlockAfterDaysLabel}
        min={0}
        onChange={(event) => {
          setUnlockAfterDays(parseUnlockAfterDaysInput(event.target.value));
        }}
        type={INPUT_TYPE.number}
        value={unlockAfterDays ?? ""}
      />
    </>
  );
}

/**
 * Create or edit form of a course module.
 *
 * @param props - Heading, initial values, mode and callbacks.
 * @returns Module form.
 */
function ModuleForm({
  headingLabel,
  initialState,
  isEditing,
  onCancel,
  onSubmit,
}: ModuleFormProps) {
  const {
    setTitle,
    title,
    titleError,
    titleInputRef,
    validateTitle,
  } = useRequiredTitleField(initialState.title);
  const [sortOrder, setSortOrder] = useState(initialState.sortOrder);
  const [isActive, setIsActive] = useState(initialState.isActive);
  const [unlockAfterDays, setUnlockAfterDays] = useState<number | null>(
    initialState.unlockAfterDays
  );
  const { isSubmissionRunning, isSubmitting, runSubmission } = useSingleSubmission();

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmissionRunning()) {
      return;
    }
    const validTitle = validateTitle();
    if (validTitle === null) {
      return;
    }
    await runSubmission(() =>
      onSubmit({
        isActive,
        sortOrder,
        title: validTitle,
        unlockAfterDays,
      })
    );
  };

  return (
    <form
      aria-busy={isSubmitting || undefined}
      className={cn(
        styles.TribeCoursesManagement__form,
        isEditing && styles["TribeCoursesManagement__form--inline"]
      )}
      noValidate
      onSubmit={handleSubmit}
    >
      <h3 className={styles.TribeCoursesManagement__formHeading}>
        {headingLabel}
      </h3>
      <Input
        error={titleError ?? undefined}
        label={COURSES_MANAGEMENT_COPY.titleLabel}
        onChange={(event) => setTitle(event.target.value)}
        placeholder={COURSES_MANAGEMENT_COPY.titleModulePlaceholder}
        ref={titleInputRef}
        required
        value={title}
      />
      <ModuleScheduleFields
        setSortOrder={setSortOrder}
        setUnlockAfterDays={setUnlockAfterDays}
        sortOrder={sortOrder}
        unlockAfterDays={unlockAfterDays}
      />
      {isEditing ? (
        <ActiveSwitchField isActive={isActive} setIsActive={setIsActive} />
      ) : null}
      <FormActions
        isBusy={isSubmitting}
        isEditing={isEditing}
        isSubmitDisabled={isSubmitting}
        isSubmitting={isSubmitting}
        onCancel={onCancel}
      />
    </form>
  );
}

type LessonFormProps = {
  headingLabel: string;
  initialFiles: LessonFileResult[];
  initialState: LessonFormState;
  isEditing: boolean;
  onCancel: () => void;
  onSubmit: (form: LessonFormState) => Promise<void>;
  tribeSlug: string;
};

/**
 * Builds the drafts of the files already attached to a lesson.
 *
 * @param initialFiles - Attached files.
 * @returns Ready drafts in display order.
 */
function buildInitialFileDrafts(initialFiles: LessonFileResult[]): LessonFileDraft[] {
  return [...initialFiles]
    .sort((leftFile, rightFile) => leftFile.sortOrder - rightFile.sortOrder)
    .map((lessonFile) => ({
      assetId: lessonFile.id,
      fileName: lessonFile.fileName,
      fileSizeBytes: lessonFile.fileSizeBytes,
      localId: lessonFile.id,
      status: LESSON_FILE_DRAFT_STATUS.ready,
      wasAlreadyAttached: true,
    }));
}

/**
 * Replaces one file draft.
 *
 * @param drafts - Current drafts.
 * @param localId - Draft to update.
 * @param patch - Fields to change.
 * @returns The drafts with the change applied.
 */
function patchFileDraft(
  drafts: LessonFileDraft[],
  localId: string,
  patch: Partial<LessonFileDraft>
): LessonFileDraft[] {
  return drafts.map((draft) =>
    draft.localId === localId ? { ...draft, ...patch } : draft
  );
}

/**
 * Deletes an unsaved lesson file asset without blocking the author.
 *
 * @param tribeSlug - Tribe slug.
 * @param assetId - Reserved asset to delete.
 */
function deleteLessonFileAssetBestEffort(tribeSlug: string, assetId: string) {
  void fetch(buildLessonFileApiUrl(tribeSlug, assetId), {
    method: HTTP_METHOD.delete,
  }).catch(() => {
    // Best-effort cleanup: a draft that survives an unreachable delete is
    // reclaimed by the scheduled orphan sweep, so the author flow stays
    // silent here on purpose.
  });
}

/**
 * Reserves the upload of a lesson file.
 *
 * @param tribeSlug - Tribe slug.
 * @param file - File to upload.
 * @returns The reservation response.
 */
function requestLessonFileReservation(tribeSlug: string, file: File): Promise<Response> {
  return sendJson(buildLessonFileUploadsApiUrl(tribeSlug), HTTP_METHOD.post, {
    fileName: file.name,
    fileSizeBytes: file.size,
    mimeType: file.type,
  });
}

/**
 * Uploads the file to its reserved storage URL.
 *
 * @param reservation - Upload reservation.
 * @param file - File to upload.
 * @returns The storage response.
 */
function putLessonFileUpload(
  reservation: LessonFileUploadReservation,
  file: File
): Promise<Response> {
  return fetch(reservation.uploadUrl, {
    body: file,
    headers: {
      [HTTP_HEADER_NAME.contentType]: file.type,
      ...reservation.uploadHeaders,
    },
    method: HTTP_METHOD.put,
  });
}

/**
 * Filters the selected files by type, size and remaining capacity, reporting
 * each rejected file (and the capacity limit once).
 *
 * @param selectedFiles - Files picked by the author.
 * @param currentCount - Drafts already listed.
 * @returns The accepted files with their draft ids.
 */
function acceptSelectedLessonFiles(
  selectedFiles: File[],
  currentCount: number
): { file: File; localId: string }[] {
  let projectedCount = currentCount;
  let capacityToastShown = false;
  const acceptedEntries: { file: File; localId: string }[] = [];

  for (const file of selectedFiles) {
    if (!isAllowedAttachmentMimeType(file.type)) {
      toast.error(buildFileTypeNotAllowedMessage(file.name));
      continue;
    }
    if (file.size > ATTACHMENT_FILE.maxFileSizeBytes) {
      toast.error(buildFileTooLargeMessage(file.name));
      continue;
    }
    if (projectedCount >= LESSON_FILES.maxCount) {
      if (!capacityToastShown) {
        toast.error(COURSES_MANAGEMENT_COPY.tooManyFilesMessage);
        capacityToastShown = true;
      }
      continue;
    }
    projectedCount += 1;
    acceptedEntries.push({ file, localId: generateOptimisticId() });
  }

  return acceptedEntries;
}

/**
 * Keeps the attachment drafts of the lesson form and the files whose upload
 * can still be retried or was abandoned.
 *
 * @param initialFiles - Files already attached to the lesson.
 * @returns The drafts, their state flags and the refs shared by the upload flow.
 */
function useLessonFileDrafts(initialFiles: LessonFileResult[]) {
  const [fileDrafts, setFileDrafts] = useState<LessonFileDraft[]>(() =>
    buildInitialFileDrafts(initialFiles)
  );
  const [filesTouched, setFilesTouched] = useState(false);
  // Selected `File` objects, kept outside React state so a failed upload can
  // be retried without asking the author to pick the file again.
  const pendingUploadFilesRef = useRef(new Map<string, File>());
  // Drafts removed while their upload was still in flight: the upload flow
  // checks this set after each await and cleans up the reserved asset.
  const discardedFileLocalIdsRef = useRef(new Set<string>());
  const hasUploadsInFlight = fileDrafts.some(
    (draft) => draft.status === LESSON_FILE_DRAFT_STATUS.uploading
  );
  const hasFailedUploads = fileDrafts.some(
    (draft) => draft.status === LESSON_FILE_DRAFT_STATUS.error
  );

  return {
    discardedFileLocalIdsRef,
    fileDrafts,
    filesTouched,
    hasFailedUploads,
    hasUploadsInFlight,
    pendingUploadFilesRef,
    setFileDrafts,
    setFilesTouched,
  };
}

/**
 * Uploads lesson files: reserves each upload, sends the file to storage and
 * cleans up the reserved asset when the draft was removed meanwhile.
 *
 * @param tribeSlug - Tribe slug.
 * @param drafts - Attachment drafts from `useLessonFileDrafts`.
 * @returns The upload function.
 */
function useLessonFileUploader(
  tribeSlug: string,
  drafts: ReturnType<typeof useLessonFileDrafts>
) {
  const { discardedFileLocalIdsRef, pendingUploadFilesRef, setFileDrafts } = drafts;

  /** Forgets a draft removed while uploading; returns whether it was removed. */
  const abandonIfDiscarded = (localId: string): boolean => {
    if (!discardedFileLocalIdsRef.current.delete(localId)) {
      return false;
    }
    pendingUploadFilesRef.current.delete(localId);
    return true;
  };

  const failUpload = (localId: string, message: string) => {
    setFileDrafts((current) =>
      patchFileDraft(current, localId, { status: LESSON_FILE_DRAFT_STATUS.error })
    );
    toast.error(message);
  };

  return async (localId: string, file: File) => {
    let reservedAssetId: string | null = null;
    try {
      const reservationResponse = await requestLessonFileReservation(tribeSlug, file);

      if (!reservationResponse.ok) {
        const message = await readErrorMessage(reservationResponse);
        if (!abandonIfDiscarded(localId)) {
          failUpload(localId, message);
        }
        return;
      }

      const payload: unknown = await reservationResponse.json().catch(() => null);
      const reservation = readUploadReservationFromResponse(payload);
      if (!reservation) {
        if (!abandonIfDiscarded(localId)) {
          failUpload(localId, COURSES_MANAGEMENT_COPY.fileUploadErrorMessage);
        }
        return;
      }
      reservedAssetId = reservation.assetId;

      if (abandonIfDiscarded(localId)) {
        deleteLessonFileAssetBestEffort(tribeSlug, reservation.assetId);
        return;
      }

      const uploadResponse = await putLessonFileUpload(reservation, file);

      if (abandonIfDiscarded(localId)) {
        deleteLessonFileAssetBestEffort(tribeSlug, reservation.assetId);
        return;
      }

      if (!uploadResponse.ok) {
        deleteLessonFileAssetBestEffort(tribeSlug, reservation.assetId);
        failUpload(localId, COURSES_MANAGEMENT_COPY.fileUploadErrorMessage);
        return;
      }

      pendingUploadFilesRef.current.delete(localId);
      setFileDrafts((current) =>
        patchFileDraft(current, localId, {
          assetId: reservation.assetId,
          status: LESSON_FILE_DRAFT_STATUS.ready,
        })
      );
    } catch {
      if (reservedAssetId) {
        deleteLessonFileAssetBestEffort(tribeSlug, reservedAssetId);
      }
      if (!abandonIfDiscarded(localId)) {
        failUpload(localId, COURSES_MANAGEMENT_COPY.fileUploadErrorMessage);
      }
    }
  };
}

/**
 * Handles picking, removing and retrying lesson file drafts, and discards the
 * unsaved uploads when the form is cancelled.
 *
 * @param tribeSlug - Tribe slug.
 * @param initialFiles - Files already attached to the lesson.
 * @returns The drafts state and the attachment handlers.
 */
function useLessonFileAttachments(tribeSlug: string, initialFiles: LessonFileResult[]) {
  const drafts = useLessonFileDrafts(initialFiles);
  const { discardedFileLocalIdsRef, fileDrafts, pendingUploadFilesRef, setFileDrafts, setFilesTouched } =
    drafts;
  const uploadLessonFile = useLessonFileUploader(tribeSlug, drafts);

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    // Reset the input so picking the same file again re-triggers `change`.
    event.target.value = "";
    if (selectedFiles.length === 0) {
      return;
    }

    const acceptedEntries = acceptSelectedLessonFiles(selectedFiles, fileDrafts.length);
    if (acceptedEntries.length === 0) {
      return;
    }

    setFilesTouched(true);
    setFileDrafts((current) => [
      ...current,
      ...acceptedEntries.map(({ file, localId }) => ({
        assetId: null,
        fileName: file.name,
        fileSizeBytes: file.size,
        localId,
        status: LESSON_FILE_DRAFT_STATUS.uploading,
        wasAlreadyAttached: false,
      })),
    ]);
    for (const { file, localId } of acceptedEntries) {
      pendingUploadFilesRef.current.set(localId, file);
      void uploadLessonFile(localId, file);
    }
  };

  const handleRemoveFileDraft = (draftToRemove: LessonFileDraft) => {
    setFilesTouched(true);
    setFileDrafts((current) =>
      current.filter((draft) => draft.localId !== draftToRemove.localId)
    );
    if (draftToRemove.status === LESSON_FILE_DRAFT_STATUS.uploading) {
      discardedFileLocalIdsRef.current.add(draftToRemove.localId);
      return;
    }
    pendingUploadFilesRef.current.delete(draftToRemove.localId);
    // Already-attached files are detached server-side by the PATCH replace,
    // so only unsaved drafts need their reserved asset cleaned up.
    if (draftToRemove.assetId && !draftToRemove.wasAlreadyAttached) {
      deleteLessonFileAssetBestEffort(tribeSlug, draftToRemove.assetId);
    }
  };

  const handleRetryFileUpload = (draftToRetry: LessonFileDraft) => {
    const file = pendingUploadFilesRef.current.get(draftToRetry.localId);
    if (!file) {
      return;
    }
    setFileDrafts((current) =>
      patchFileDraft(current, draftToRetry.localId, {
        status: LESSON_FILE_DRAFT_STATUS.uploading,
      })
    );
    void uploadLessonFile(draftToRetry.localId, file);
  };

  const discardUnsavedFiles = () => {
    for (const draft of fileDrafts) {
      if (draft.status === LESSON_FILE_DRAFT_STATUS.uploading) {
        discardedFileLocalIdsRef.current.add(draft.localId);
        continue;
      }
      if (draft.assetId && !draft.wasAlreadyAttached) {
        deleteLessonFileAssetBestEffort(tribeSlug, draft.assetId);
      }
    }
  };

  return {
    discardUnsavedFiles,
    fileDrafts,
    filesTouched: drafts.filesTouched,
    handleFileInputChange,
    handleRemoveFileDraft,
    handleRetryFileUpload,
    hasFailedUploads: drafts.hasFailedUploads,
    hasUploadsInFlight: drafts.hasUploadsInFlight,
  };
}

type LessonFileAttachmentsState = ReturnType<typeof useLessonFileAttachments>;

/**
 * Lists the attachments that are ready to send with the lesson.
 *
 * @param fileDrafts - Attachment drafts.
 * @returns The ready attachments in display order.
 */
function collectReadyFiles(fileDrafts: LessonFileDraft[]): LessonFileAttachmentPayload[] {
  const readyFiles: LessonFileAttachmentPayload[] = [];
  for (const draft of fileDrafts) {
    if (draft.status === LESSON_FILE_DRAFT_STATUS.ready && draft.assetId) {
      readyFiles.push({ assetId: draft.assetId });
    }
  }
  return readyFiles;
}

/**
 * Describes the video URL field: nothing while it shows an error, the
 * detected provider, or the supported providers help.
 *
 * @param videoUrlError - Current field error.
 * @param detectedProvider - Provider detected from the URL.
 * @returns The field description.
 */
function describeVideoUrlField(
  videoUrlError: string | null,
  detectedProvider: VideoProvider | null
): string | undefined {
  if (videoUrlError) {
    return undefined;
  }
  if (detectedProvider) {
    return `Detectado: ${PROVIDER_LABEL[detectedProvider]}`;
  }
  return COURSES_MANAGEMENT_COPY.videoUrlHelp;
}

/**
 * Keeps the lesson form values, validates them and submits the lesson with
 * its ready attachments.
 *
 * @param input - Initial values, attachments state and the submit callback.
 * @returns The form values, their setters and the submit handler.
 */
function useLessonFormState({
  attachments,
  initialState,
  onSubmit,
}: {
  attachments: LessonFileAttachmentsState;
  initialState: LessonFormState;
  onSubmit: LessonFormProps["onSubmit"];
}) {
  const titleField = useRequiredTitleField(initialState.title);
  const [externalVideoUrl, setExternalVideoUrlValue] = useState(
    initialState.externalVideoUrl
  );
  const videoUrlInputRef = useRef<HTMLInputElement>(null);
  const [videoUrlError, setVideoUrlError] = useState<string | null>(null);
  const setExternalVideoUrl = (nextVideoUrl: string) => {
    setExternalVideoUrlValue(nextVideoUrl);
    setVideoUrlError(null);
  };
  const submission = useSingleSubmission();
  const descriptionEditor = useRichLinkEditor({
    initialMarkdown: initialState.description,
  });
  const [sortOrder, setSortOrder] = useState(initialState.sortOrder);
  const [isActive, setIsActive] = useState(initialState.isActive);
  const detectedProvider = detectProviderFromInput(externalVideoUrl);

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (attachments.hasUploadsInFlight || submission.isSubmissionRunning()) {
      return;
    }
    if (attachments.hasFailedUploads) {
      toast.error(COURSES_MANAGEMENT_COPY.fileUploadFailedBlockMessage);
      return;
    }
    const validTitle = titleField.validateTitle();
    if (validTitle === null) {
      return;
    }
    if (!detectedProvider) {
      setVideoUrlError(COURSES_MANAGEMENT_COPY.invalidVideoUrlMessage);
      videoUrlInputRef.current?.focus();
      return;
    }
    const description = descriptionEditor.serialize().trim();
    if (description.length > COURSE_LESSON_DESCRIPTION.maxLength) {
      toast.error(COURSES_MANAGEMENT_COPY.descriptionTooLongMessage);
      return;
    }
    const readyFiles = collectReadyFiles(attachments.fileDrafts);
    await submission.runSubmission(() =>
      onSubmit({
        description,
        externalVideoUrl,
        ...(attachments.filesTouched ? { files: readyFiles } : {}),
        isActive,
        sortOrder,
        title: validTitle,
      })
    );
  };

  return {
    descriptionEditor, detectedProvider, externalVideoUrl, handleSubmit, isActive,
    isSubmitting: submission.isSubmitting, setExternalVideoUrl, setIsActive, setSortOrder,
    sortOrder, titleField, videoUrlError, videoUrlInputRef,
  };
}

/**
 * Renders one attachment draft with its status and its retry and remove actions.
 *
 * @param props - Draft, attachments state and whether the form is submitting.
 * @returns The attachment list item.
 */
function LessonFileDraftItem({
  attachments,
  draft,
  isSubmitting,
}: {
  attachments: LessonFileAttachmentsState;
  draft: LessonFileDraft;
  isSubmitting: boolean;
}) {
  return (
    <li className={styles.TribeCoursesManagement__fileItem}>
      <span className={styles.TribeCoursesManagement__fileName}>
        {draft.fileName}
      </span>
      <span className={styles.TribeCoursesManagement__fileSize}>
        {formatFileSize(draft.fileSizeBytes)}
      </span>
      <span
        className={LESSON_FILE_STATUS_CLASS_NAME[draft.status]}
        role={ARIA_ROLE_STATUS}
      >
        {LESSON_FILE_STATUS_LABEL[draft.status]}
      </span>
      <div className={styles.TribeCoursesManagement__fileActions}>
        {draft.status === LESSON_FILE_DRAFT_STATUS.error ? (
          <Button
            aria-label={`Reintentar subida de ${draft.fileName}`}
            disabled={isSubmitting}
            onClick={() => attachments.handleRetryFileUpload(draft)}
            size={BUTTON_SIZE.small}
            type={FORM_BUTTON_TYPE.button}
            variant={BUTTON_VARIANT.secondary}
          >
            {COURSES_MANAGEMENT_COPY.retryFileButton}
          </Button>
        ) : null}
        <Button
          aria-label={`Quitar ${draft.fileName}`}
          disabled={isSubmitting}
          onClick={() => attachments.handleRemoveFileDraft(draft)}
          size={BUTTON_SIZE.small}
          type={FORM_BUTTON_TYPE.button}
          variant={BUTTON_VARIANT.secondary}
        >
          {COURSES_MANAGEMENT_COPY.removeFileButton}
        </Button>
      </div>
    </li>
  );
}

/**
 * Renders the attachments field: drafts, the attach button and the hidden file input.
 *
 * @param props - Attachments state and whether the form is submitting.
 * @returns The attachments field.
 */
function LessonFilesField({
  attachments,
  isSubmitting,
}: {
  attachments: LessonFileAttachmentsState;
  isSubmitting: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { fileDrafts } = attachments;

  return (
    <div className={styles.TribeCoursesManagement__formField}>
      <span>{COURSES_MANAGEMENT_COPY.lessonFilesHeading}</span>
      {fileDrafts.length > 0 ? (
        <ul className={styles.TribeCoursesManagement__fileList}>
          {fileDrafts.map((draft) => (
            <LessonFileDraftItem
              attachments={attachments}
              draft={draft}
              isSubmitting={isSubmitting}
              key={draft.localId}
            />
          ))}
        </ul>
      ) : null}
      <div>
        <Button
          disabled={
            isSubmitting || fileDrafts.length >= LESSON_FILES.maxCount
          }
          onClick={() => fileInputRef.current?.click()}
          type={FORM_BUTTON_TYPE.button}
          variant={BUTTON_VARIANT.secondary}
        >
          {COURSES_MANAGEMENT_COPY.attachFileButton}
        </Button>
        <input
          accept={ATTACHMENT_FILE_INPUT_ACCEPT}
          aria-label={COURSES_MANAGEMENT_COPY.attachFileButton}
          className={styles.TribeCoursesManagement__fileInput}
          multiple
          onChange={attachments.handleFileInputChange}
          ref={fileInputRef}
          type={INPUT_TYPE.file}
        />
      </div>
      <small className={styles.TribeCoursesManagement__formHelp}>
        {LESSON_FILES_HELP_TEXT}
      </small>
    </div>
  );
}

/**
 * Renders the rich-text description editor with its length counter.
 *
 * @param props - Component props.
 * @param props.descriptionEditor - Description editor state.
 * @returns The description field.
 */
function LessonDescriptionField({
  descriptionEditor,
}: {
  descriptionEditor: ReturnType<typeof useRichLinkEditor>;
}) {
  // Mirror the backend's `normalizeText`/`normalizeOptionalText`: trim before
  // measuring so a whitespace-only description counts as empty (length 0) and is
  // never wrongly flagged as too long while it looks blank to the author.
  const descriptionLength = descriptionEditor.serialize().trim().length;

  return (
    <label className={styles.TribeCoursesManagement__formField}>
      <span>{COURSES_MANAGEMENT_COPY.descriptionLabel}</span>
      <div className={styles.TribeCoursesManagement__descriptionEditor}>
        <RichLinkEditor
          ariaLabel={COURSES_MANAGEMENT_COPY.descriptionLabel}
          copy={LESSON_DESCRIPTION_EDITOR_COPY}
          editor={descriptionEditor}
          isInvalid={descriptionLength > COURSE_LESSON_DESCRIPTION.maxLength}
          placeholder={COURSES_MANAGEMENT_COPY.descriptionPlaceholder}
        />
      </div>
      <small className={styles.TribeCoursesManagement__formHelp}>
        {descriptionLength}/{COURSE_LESSON_DESCRIPTION.maxLength}
      </small>
    </label>
  );
}

/**
 * Create or edit form of a lesson, including the video URL, the rich-text
 * description and the attachment uploads.
 *
 * @param props - Heading, initial values and files, mode and callbacks.
 * @returns Lesson form.
 */
function LessonForm({
  headingLabel,
  initialFiles,
  initialState,
  isEditing,
  onCancel,
  onSubmit,
  tribeSlug,
}: LessonFormProps) {
  const attachments = useLessonFileAttachments(tribeSlug, initialFiles);
  const { titleField, videoUrlInputRef, ...form } = useLessonFormState({
    attachments,
    initialState,
    onSubmit,
  });
  const { setTitle, title, titleError, titleInputRef } = titleField;
  const { hasFailedUploads, hasUploadsInFlight } = attachments;
  const { isSubmitting } = form;

  return (
    <form
      aria-busy={isSubmitting || undefined}
      className={cn(
        styles.TribeCoursesManagement__form,
        isEditing && styles["TribeCoursesManagement__form--inline"]
      )}
      noValidate
      onSubmit={form.handleSubmit}
    >
      <h3 className={styles.TribeCoursesManagement__formHeading}>
        {headingLabel}
      </h3>
      <Input
        error={titleError ?? undefined}
        label={COURSES_MANAGEMENT_COPY.titleLabel}
        onChange={(event) => setTitle(event.target.value)}
        placeholder={COURSES_MANAGEMENT_COPY.titleLessonPlaceholder}
        ref={titleInputRef}
        required
        value={title}
      />
      <Input
        description={describeVideoUrlField(form.videoUrlError, form.detectedProvider)}
        error={form.videoUrlError ?? undefined}
        label={COURSES_MANAGEMENT_COPY.videoUrlLabel}
        onChange={(event) => form.setExternalVideoUrl(event.target.value)}
        placeholder={COURSES_MANAGEMENT_COPY.videoUrlPlaceholder}
        ref={videoUrlInputRef}
        required
        value={form.externalVideoUrl}
      />
      <LessonDescriptionField descriptionEditor={form.descriptionEditor} />
      <LessonFilesField attachments={attachments} isSubmitting={isSubmitting} />
      <Input
        label={COURSES_MANAGEMENT_COPY.sortOrderLabel}
        onChange={(event) => form.setSortOrder(parseSortOrderInput(event.target.value))}
        type={INPUT_TYPE.number}
        value={form.sortOrder}
      />
      {isEditing ? (
        <ActiveSwitchField isActive={form.isActive} setIsActive={form.setIsActive} />
      ) : null}
      <FormActions
        isBusy={isSubmitting || hasUploadsInFlight}
        isEditing={isEditing}
        isSubmitDisabled={isSubmitting || hasUploadsInFlight || hasFailedUploads}
        isSubmitting={isSubmitting}
        onCancel={() => {
          attachments.discardUnsavedFiles();
          onCancel();
        }}
      />
    </form>
  );
}
