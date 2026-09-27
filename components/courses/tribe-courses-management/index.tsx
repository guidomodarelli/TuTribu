"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { toast, Button, Input, Switch, AnimatedCollapse, AnimatedListItem, formatFileSize, cn, RichLinkEditor, useRichLinkEditor } from "beez-ui";

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
const ARIA_ROLE_ALERT = "alert";
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
  destructive: "destructive",
  outline: "outline",
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
    const payload = (await response.json()) as { message?: string };
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
  const [modules, setModules] =
    useState<CourseModuleWithLessonsResult[]>(initialModules);
  const [syncedInitialModules, setSyncedInitialModules] =
    useState(initialModules);
  const [syncedTribeSlug, setSyncedTribeSlug] = useState(tribeSlug);
  const [pendingModuleIds, setPendingModuleIds] = useState<Set<string>>(
    () => new Set()
  );
  const [pendingLessonIds, setPendingLessonIds] = useState<Set<string>>(
    () => new Set()
  );
  const [showNewModuleForm, setShowNewModuleForm] = useState(false);
  const [editingModuleId, setEditingModuleId] = useState<string | null>(null);
  const [creatingLessonModuleId, setCreatingLessonModuleId] = useState<
    string | null
  >(null);
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null);
  const newModuleButtonRef = useRef<HTMLButtonElement>(null);
  const shouldFocusNewModuleButtonRef = useRef(false);
  const addLessonButtonsRef = useRef(new Map<string, HTMLButtonElement>());
  // Key of the control that must regain focus when it mounts again after the
  // form that replaced it closes (see FOCUS_RESTORE_KEY_PREFIX).
  const focusRestoreKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!showNewModuleForm && shouldFocusNewModuleButtonRef.current) {
      shouldFocusNewModuleButtonRef.current = false;
      newModuleButtonRef.current?.focus();
    }
  }, [showNewModuleForm]);

  const closeNewModuleForm = () => {
    shouldFocusNewModuleButtonRef.current = true;
    setShowNewModuleForm(false);
  };

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

  const closeModuleEditor = (moduleId: string) => {
    focusRestoreKeyRef.current = FOCUS_RESTORE_KEY_PREFIX.editModule + moduleId;
    setEditingModuleId(null);
  };

  const closeLessonEditor = (lessonId: string) => {
    focusRestoreKeyRef.current = FOCUS_RESTORE_KEY_PREFIX.editLesson + lessonId;
    setEditingLessonId(null);
  };

  const closeLessonCreator = (moduleId: string) => {
    focusRestoreKeyRef.current = FOCUS_RESTORE_KEY_PREFIX.addLesson + moduleId;
    setCreatingLessonModuleId(null);
  };

  if (syncedInitialModules !== initialModules || syncedTribeSlug !== tribeSlug) {
    setSyncedInitialModules(initialModules);
    setSyncedTribeSlug(tribeSlug);
    setModules(initialModules);
    setPendingModuleIds(new Set());
    setPendingLessonIds(new Set());
    setShowNewModuleForm(false);
    setEditingModuleId(null);
    setCreatingLessonModuleId(null);
    setEditingLessonId(null);
  }

  const markModulePending = useCallback((moduleId: string) => {
    setPendingModuleIds((current) => {
      const next = new Set(current);
      next.add(moduleId);
      return next;
    });
  }, []);

  const clearModulePending = useCallback((moduleId: string) => {
    setPendingModuleIds((current) => {
      if (!current.has(moduleId)) {
        return current;
      }
      const next = new Set(current);
      next.delete(moduleId);
      return next;
    });
  }, []);

  const swapModulePending = useCallback(
    (fromModuleId: string, toModuleId: string) => {
      setPendingModuleIds((current) => {
        if (!current.has(fromModuleId)) {
          return current;
        }
        const next = new Set(current);
        next.delete(fromModuleId);
        next.add(toModuleId);
        return next;
      });
    },
    []
  );

  const markLessonPending = useCallback((lessonId: string) => {
    setPendingLessonIds((current) => {
      const next = new Set(current);
      next.add(lessonId);
      return next;
    });
  }, []);

  const clearLessonPending = useCallback((lessonId: string) => {
    setPendingLessonIds((current) => {
      if (!current.has(lessonId)) {
        return current;
      }
      const next = new Set(current);
      next.delete(lessonId);
      return next;
    });
  }, []);

  const swapLessonPending = useCallback(
    (fromLessonId: string, toLessonId: string) => {
      setPendingLessonIds((current) => {
        if (!current.has(fromLessonId)) {
          return current;
        }
        const next = new Set(current);
        next.delete(fromLessonId);
        next.add(toLessonId);
        return next;
      });
    },
    []
  );

  const submitNewModule = async (form: ModuleFormState) => {
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
    markModulePending(optimisticId);

    try {
      const response = await fetch(buildModulesApiUrl(tribeSlug), {
        body: JSON.stringify({
          courseId,
          sortOrder: form.sortOrder,
          title: form.title,
          unlockAfterDays: form.unlockAfterDays,
        }),
        headers: {
          [HTTP_HEADER_NAME.contentType]: HTTP_CONTENT_TYPE.applicationJson,
        },
        method: HTTP_METHOD.post,
      });

      if (!response.ok) {
        setModules((current) => removeModuleById(current, optimisticId));
        clearModulePending(optimisticId);
        toast.error(await readErrorMessage(response));
        setShowNewModuleForm(true);
        return;
      }

      const payload = await response.json().catch(() => null);
      const serverModule = readModuleFromResponse(payload);
      if (!serverModule) {
        setModules((current) => removeModuleById(current, optimisticId));
        clearModulePending(optimisticId);
        toast.error(COURSES_MANAGEMENT_COPY.unexpectedError);
        return;
      }
      setModules((current) =>
        replaceModuleId(current, optimisticId, serverModule)
      );
      swapModulePending(optimisticId, serverModule.id);
      clearModulePending(serverModule.id);
      closeNewModuleForm();
      toast.success(COURSES_MANAGEMENT_COPY.moduleCreatedMessage);
    } catch {
      setModules((current) => removeModuleById(current, optimisticId));
      clearModulePending(optimisticId);
      toast.error(COURSES_MANAGEMENT_COPY.unexpectedError);
    }
  };

  const submitModuleUpdate = async (
    moduleId: string,
    form: ModuleFormState
  ) => {
    const snapshot = findModuleSnapshot(modules, moduleId);
    if (!snapshot) {
      return;
    }
    setModules((current) =>
      patchModuleFields(current, moduleId, {
        isActive: form.isActive,
        sortOrder: form.sortOrder,
        title: form.title,
        unlockAfterDays: form.unlockAfterDays,
      })
    );
    markModulePending(moduleId);

    try {
      const response = await fetch(buildModuleApiUrl(tribeSlug, moduleId), {
        body: JSON.stringify({
          isActive: form.isActive,
          sortOrder: form.sortOrder,
          title: form.title,
          unlockAfterDays: form.unlockAfterDays,
        }),
        headers: {
          [HTTP_HEADER_NAME.contentType]: HTTP_CONTENT_TYPE.applicationJson,
        },
        method: HTTP_METHOD.patch,
      });

      if (!response.ok) {
        setModules((current) =>
          patchModuleFields(current, moduleId, {
            isActive: snapshot.module.isActive,
            sortOrder: snapshot.module.sortOrder,
            title: snapshot.module.title,
            unlockAfterDays: snapshot.module.unlockAfterDays,
          })
        );
        clearModulePending(moduleId);
        toast.error(await readErrorMessage(response));
        setEditingModuleId(moduleId);
        return;
      }

      const payload = await response.json().catch(() => null);
      const serverModule = readModuleFromResponse(payload);
      if (serverModule) {
        setModules((current) =>
          patchModuleFields(current, moduleId, {
            isActive: serverModule.isActive,
            sortOrder: serverModule.sortOrder,
            title: serverModule.title,
            unlockAfterDays: serverModule.unlockAfterDays,
          })
        );
      }
      clearModulePending(moduleId);
      closeModuleEditor(moduleId);
      toast.success(COURSES_MANAGEMENT_COPY.moduleUpdatedMessage);
    } catch {
      setModules((current) =>
        patchModuleFields(current, moduleId, {
          isActive: snapshot.module.isActive,
          sortOrder: snapshot.module.sortOrder,
          title: snapshot.module.title,
          unlockAfterDays: snapshot.module.unlockAfterDays,
        })
      );
      clearModulePending(moduleId);
      toast.error(COURSES_MANAGEMENT_COPY.unexpectedError);
    }
  };

  const deleteModule = async (moduleId: string) => {
    if (!window.confirm(COURSES_MANAGEMENT_COPY.deleteModuleConfirm)) {
      return;
    }
    const snapshot = findModuleSnapshot(modules, moduleId);
    if (!snapshot) {
      return;
    }
    setModules((current) => removeModuleById(current, moduleId));
    markModulePending(moduleId);
    // The focused delete button leaves with its module; keep focus on the page.
    newModuleButtonRef.current?.focus();

    try {
      const response = await fetch(buildModuleApiUrl(tribeSlug, moduleId), {
        method: HTTP_METHOD.delete,
      });
      if (!response.ok) {
        setModules((current) =>
          insertModuleAt(current, snapshot.module, snapshot.index)
        );
        clearModulePending(moduleId);
        toast.error(await readErrorMessage(response));
        return;
      }
      clearModulePending(moduleId);
      toast.success(COURSES_MANAGEMENT_COPY.moduleDeletedMessage);
    } catch {
      setModules((current) =>
        insertModuleAt(current, snapshot.module, snapshot.index)
      );
      clearModulePending(moduleId);
      toast.error(COURSES_MANAGEMENT_COPY.unexpectedError);
    }
  };

  const submitNewLesson = async (
    courseModuleId: string,
    form: LessonFormState
  ) => {
    let parsedVideo: ReturnType<typeof parseExternalVideoUrl>;
    try {
      parsedVideo = parseExternalVideoUrl(form.externalVideoUrl);
    } catch (error) {
      if (error instanceof InvalidVideoUrlError) {
        toast.error(COURSES_MANAGEMENT_COPY.invalidVideoUrlMessage);
        return;
      }
      throw error;
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
    setModules((current) =>
      appendLesson(current, courseModuleId, optimisticLesson)
    );
    markLessonPending(optimisticId);

    try {
      const response = await fetch(
        buildLessonsApiUrl(tribeSlug, courseModuleId),
        {
          body: JSON.stringify({
            description: form.description,
            externalVideoUrl: form.externalVideoUrl,
            ...(form.files !== undefined ? { files: form.files } : {}),
            sortOrder: form.sortOrder,
            title: form.title,
          }),
          headers: {
            [HTTP_HEADER_NAME.contentType]: HTTP_CONTENT_TYPE.applicationJson,
          },
          method: HTTP_METHOD.post,
        }
      );

      if (!response.ok) {
        setModules((current) =>
          removeLessonById(current, courseModuleId, optimisticId)
        );
        clearLessonPending(optimisticId);
        toast.error(await readErrorMessage(response));
        setCreatingLessonModuleId(courseModuleId);
        return;
      }

      const payload = await response.json().catch(() => null);
      const serverLesson = readLessonFromResponse(payload);
      if (!serverLesson) {
        setModules((current) =>
          removeLessonById(current, courseModuleId, optimisticId)
        );
        clearLessonPending(optimisticId);
        toast.error(COURSES_MANAGEMENT_COPY.unexpectedError);
        return;
      }
      setModules((current) =>
        replaceLessonId(current, courseModuleId, optimisticId, {
          ...serverLesson,
          completed: false,
        })
      );
      swapLessonPending(optimisticId, serverLesson.id);
      clearLessonPending(serverLesson.id);
      closeLessonCreator(courseModuleId);
      toast.success(COURSES_MANAGEMENT_COPY.lessonCreatedMessage);
    } catch {
      setModules((current) =>
        removeLessonById(current, courseModuleId, optimisticId)
      );
      clearLessonPending(optimisticId);
      toast.error(COURSES_MANAGEMENT_COPY.unexpectedError);
    }
  };

  const submitLessonUpdate = async (
    lesson: LessonResult,
    form: LessonFormState
  ) => {
    let parsedVideo: ReturnType<typeof parseExternalVideoUrl>;
    try {
      parsedVideo = parseExternalVideoUrl(form.externalVideoUrl);
    } catch (error) {
      if (error instanceof InvalidVideoUrlError) {
        toast.error(COURSES_MANAGEMENT_COPY.invalidVideoUrlMessage);
        return;
      }
      throw error;
    }

    const snapshot = findLessonSnapshot(modules, lesson.id);
    if (!snapshot) {
      return;
    }
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
    markLessonPending(lesson.id);

    try {
      const response = await fetch(buildLessonApiUrl(tribeSlug, lesson.id), {
        body: JSON.stringify({
          courseModuleId: lesson.courseModuleId,
          description: form.description,
          externalVideoUrl: form.externalVideoUrl,
          ...(form.files !== undefined ? { files: form.files } : {}),
          isActive: form.isActive,
          sortOrder: form.sortOrder,
          title: form.title,
        }),
        headers: {
          [HTTP_HEADER_NAME.contentType]: HTTP_CONTENT_TYPE.applicationJson,
        },
        method: HTTP_METHOD.patch,
      });

      if (!response.ok) {
        setModules((current) =>
          patchLessonFields(
            current,
            snapshot.moduleId,
            snapshot.lesson.id,
            snapshot.lesson
          )
        );
        clearLessonPending(lesson.id);
        toast.error(await readErrorMessage(response));
        setEditingLessonId(lesson.id);
        return;
      }

      const payload = await response.json().catch(() => null);
      const serverLesson = readLessonFromResponse(payload);
      if (serverLesson) {
        setModules((current) =>
          patchLessonFields(
            current,
            serverLesson.courseModuleId,
            serverLesson.id,
            serverLesson
          )
        );
      }
      clearLessonPending(lesson.id);
      closeLessonEditor(lesson.id);
      toast.success(COURSES_MANAGEMENT_COPY.lessonUpdatedMessage);
    } catch {
      setModules((current) =>
        patchLessonFields(
          current,
          snapshot.moduleId,
          snapshot.lesson.id,
          snapshot.lesson
        )
      );
      clearLessonPending(lesson.id);
      toast.error(COURSES_MANAGEMENT_COPY.unexpectedError);
    }
  };

  const deleteLesson = async (lessonId: string) => {
    if (!window.confirm(COURSES_MANAGEMENT_COPY.deleteLessonConfirm)) {
      return;
    }
    const snapshot = findLessonSnapshot(modules, lessonId);
    if (!snapshot) {
      return;
    }
    setModules((current) =>
      removeLessonById(current, snapshot.moduleId, lessonId)
    );
    markLessonPending(lessonId);
    // The focused delete button leaves with its lesson; keep focus in the module.
    addLessonButtonsRef.current.get(snapshot.moduleId)?.focus();

    try {
      const response = await fetch(buildLessonApiUrl(tribeSlug, lessonId), {
        method: HTTP_METHOD.delete,
      });
      if (!response.ok) {
        setModules((current) =>
          insertLessonAt(
            current,
            snapshot.moduleId,
            snapshot.lesson,
            snapshot.index
          )
        );
        clearLessonPending(lessonId);
        toast.error(await readErrorMessage(response));
        return;
      }
      clearLessonPending(lessonId);
      toast.success(COURSES_MANAGEMENT_COPY.lessonDeletedMessage);
    } catch {
      setModules((current) =>
        insertLessonAt(
          current,
          snapshot.moduleId,
          snapshot.lesson,
          snapshot.index
        )
      );
      clearLessonPending(lessonId);
      toast.error(COURSES_MANAGEMENT_COPY.unexpectedError);
    }
  };

  return (
    <main className={styles.TribeCoursesManagement}>
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
          disabled={showNewModuleForm}
          onClick={() => setShowNewModuleForm(true)}
          ref={newModuleButtonRef}
          type={FORM_BUTTON_TYPE.button}
        >
          {COURSES_MANAGEMENT_COPY.newModuleButton}
        </Button>
      </header>

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
          onCancel={closeNewModuleForm}
          onSubmit={submitNewModule}
        />
      </AnimatedCollapse>

      {modules.length === 0 && !showNewModuleForm ? (
        <p className={styles.TribeCoursesManagement__emptyState}>
          {COURSES_MANAGEMENT_COPY.emptyState}
        </p>
      ) : null}

      <ul className={styles.TribeCoursesManagement__moduleList}>
        <AnimatePresence initial={false}>
          {modules.map((courseModule) => {
            const isModulePending = pendingModuleIds.has(courseModule.id);
            const isModuleOptimistic = isOptimisticId(courseModule.id);
            const isModuleLocked = isModulePending || isModuleOptimistic;

            return (
              <AnimatedListItem
                aria-busy={isModulePending || undefined}
                className={cn(
                  styles.TribeCoursesManagement__moduleItem,
                  isModulePending &&
                    styles["TribeCoursesManagement__moduleItem--pending"]
                )}
                key={courseModule.id}
              >
                {editingModuleId === courseModule.id ? (
                  <ModuleForm
                    headingLabel={`${EDIT_HEADING_PREFIX}${courseModule.title}`}
                    initialState={{
                      isActive: courseModule.isActive,
                      sortOrder: courseModule.sortOrder,
                      title: courseModule.title,
                      unlockAfterDays: courseModule.unlockAfterDays,
                    }}
                    isEditing
                    onCancel={() => closeModuleEditor(courseModule.id)}
                    onSubmit={(form) =>
                      submitModuleUpdate(courseModule.id, form)
                    }
                  />
                ) : (
                  <div className={styles.TribeCoursesManagement__moduleHeader}>
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
                    <div
                      aria-label={`Acciones del módulo ${courseModule.title}`}
                      className={styles.TribeCoursesManagement__actions}
                      role={ARIA_ROLE_GROUP}
                    >
                      <Button
                        disabled={isModuleLocked}
                        onClick={() => setEditingModuleId(courseModule.id)}
                        ref={bindFocusRestore(
                          FOCUS_RESTORE_KEY_PREFIX.editModule + courseModule.id
                        )}
                        type={FORM_BUTTON_TYPE.button}
                        variant={BUTTON_VARIANT.outline}
                      >
                        {COURSES_MANAGEMENT_COPY.editButton}
                      </Button>
                      <Button
                        disabled={isModuleLocked}
                        onClick={() => deleteModule(courseModule.id)}
                        type={FORM_BUTTON_TYPE.button}
                        variant={BUTTON_VARIANT.destructive}
                      >
                        {COURSES_MANAGEMENT_COPY.deleteButton}
                      </Button>
                    </div>
                  </div>
                )}

                <ul className={styles.TribeCoursesManagement__lessonList}>
                  <AnimatePresence initial={false}>
                    {courseModule.lessons.map((lesson) => {
                      const isLessonPending = pendingLessonIds.has(lesson.id);
                      const isLessonOptimistic = isOptimisticId(lesson.id);
                      const isLessonLocked =
                        isLessonPending || isLessonOptimistic;

                      return (
                        <AnimatedListItem
                          aria-busy={isLessonPending || undefined}
                          className={cn(
                            styles.TribeCoursesManagement__lessonItem,
                            isLessonPending &&
                              styles["TribeCoursesManagement__lessonItem--pending"]
                          )}
                          key={lesson.id}
                        >
                          {editingLessonId === lesson.id ? (
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
                              onCancel={() => closeLessonEditor(lesson.id)}
                              onSubmit={(form) => submitLessonUpdate(lesson, form)}
                              tribeSlug={tribeSlug}
                            />
                          ) : (
                            <div
                              className={
                                styles.TribeCoursesManagement__lessonHeader
                              }
                            >
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
                              <div
                                aria-label={`Acciones de la lección ${lesson.title}`}
                                className={styles.TribeCoursesManagement__actions}
                                role={ARIA_ROLE_GROUP}
                              >
                                <Button
                                  disabled={isLessonLocked}
                                  onClick={() => setEditingLessonId(lesson.id)}
                                  ref={bindFocusRestore(
                                    FOCUS_RESTORE_KEY_PREFIX.editLesson + lesson.id
                                  )}
                                  type={FORM_BUTTON_TYPE.button}
                                  variant={BUTTON_VARIANT.outline}
                                >
                                  {COURSES_MANAGEMENT_COPY.editButton}
                                </Button>
                                <Button
                                  disabled={isLessonLocked}
                                  onClick={() => deleteLesson(lesson.id)}
                                  type={FORM_BUTTON_TYPE.button}
                                  variant={BUTTON_VARIANT.destructive}
                                >
                                  {COURSES_MANAGEMENT_COPY.deleteButton}
                                </Button>
                              </div>
                            </div>
                          )}
                        </AnimatedListItem>
                      );
                    })}
                  </AnimatePresence>
                </ul>

                {creatingLessonModuleId === courseModule.id ? (
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
                    onCancel={() => closeLessonCreator(courseModule.id)}
                    onSubmit={(form) => submitNewLesson(courseModule.id, form)}
                    tribeSlug={tribeSlug}
                  />
                ) : (
                  <Button
                    className={styles.TribeCoursesManagement__addLessonButton}
                    disabled={isModuleLocked}
                    onClick={() => setCreatingLessonModuleId(courseModule.id)}
                    ref={bindAddLessonButton(courseModule.id)}
                    type={FORM_BUTTON_TYPE.button}
                    variant={BUTTON_VARIANT.outline}
                  >
                    {COURSES_MANAGEMENT_COPY.newLessonButton}
                  </Button>
                )}
              </AnimatedListItem>
            );
          })}
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
  const titleErrorId = useId();
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
    titleErrorId,
    titleInputRef,
    validateTitle,
  };
}

type FieldErrorProps = {
  id: string;
  message: string | null;
};

/**
 * Inline validation message rendered next to the affected field.
 *
 * @param props - Element id referenced by `aria-describedby` and the message.
 * @returns The message, or nothing when there is no error.
 */
function FieldError({ id, message }: FieldErrorProps) {
  if (!message) {
    return null;
  }

  return (
    <span
      className={styles.TribeCoursesManagement__fieldError}
      id={id}
      role={ARIA_ROLE_ALERT}
    >
      {message}
    </span>
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
    titleErrorId,
    titleInputRef,
    validateTitle,
  } = useRequiredTitleField(initialState.title);
  const [sortOrder, setSortOrder] = useState(initialState.sortOrder);
  const [isActive, setIsActive] = useState(initialState.isActive);
  const [unlockAfterDays, setUnlockAfterDays] = useState<number | null>(
    initialState.unlockAfterDays
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Guards against a second submit landing before the disabled state renders.
  const isSubmittingRef = useRef(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmittingRef.current) {
      return;
    }
    const validTitle = validateTitle();
    if (validTitle === null) {
      return;
    }
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      await onSubmit({
        isActive,
        sortOrder,
        title: validTitle,
        unlockAfterDays,
      });
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
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
      <label className={styles.TribeCoursesManagement__formField}>
        <span>{COURSES_MANAGEMENT_COPY.titleLabel}</span>
        <Input
          aria-describedby={titleError ? titleErrorId : undefined}
          aria-invalid={titleError ? true : undefined}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={COURSES_MANAGEMENT_COPY.titleModulePlaceholder}
          ref={titleInputRef}
          required
          value={title}
        />
        <FieldError id={titleErrorId} message={titleError} />
      </label>
      <label className={styles.TribeCoursesManagement__formField}>
        <span>{COURSES_MANAGEMENT_COPY.sortOrderLabel}</span>
        <Input
          onChange={(event) =>
            setSortOrder(Number.parseInt(event.target.value, NUMERIC_PARSE_RADIX) || 0)
          }
          type={INPUT_TYPE.number}
          value={sortOrder}
        />
      </label>
      <label className={styles.TribeCoursesManagement__formField}>
        <span>{COURSES_MANAGEMENT_COPY.unlockAfterDaysLabel}</span>
        <Input
          min={0}
          onChange={(event) => {
            const parsedValue = Number.parseInt(
              event.target.value,
              NUMERIC_PARSE_RADIX
            );
            setUnlockAfterDays(
              Number.isFinite(parsedValue) ? parsedValue : null
            );
          }}
          type={INPUT_TYPE.number}
          value={unlockAfterDays ?? ""}
        />
        <span className={styles.TribeCoursesManagement__formHelp}>
          {COURSES_MANAGEMENT_COPY.unlockAfterDaysHelp}
        </span>
      </label>
      {isEditing ? (
        <label className={styles.TribeCoursesManagement__formField}>
          <span>{COURSES_MANAGEMENT_COPY.activeLabel}</span>
          <Switch
            checked={isActive}
            onCheckedChange={(value) => setIsActive(value)}
          />
        </label>
      ) : null}
      <div className={styles.TribeCoursesManagement__formActions}>
        <Button
          aria-busy={isSubmitting || undefined}
          disabled={isSubmitting}
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
          variant={BUTTON_VARIANT.outline}
        >
          {COURSES_MANAGEMENT_COPY.cancelButton}
        </Button>
      </div>
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
  const {
    setTitle,
    title,
    titleError,
    titleErrorId,
    titleInputRef,
    validateTitle,
  } = useRequiredTitleField(initialState.title);
  const [externalVideoUrl, setExternalVideoUrlValue] = useState(
    initialState.externalVideoUrl
  );
  const videoUrlInputRef = useRef<HTMLInputElement>(null);
  const videoUrlErrorId = useId();
  const [videoUrlError, setVideoUrlError] = useState<string | null>(null);
  const setExternalVideoUrl = (nextVideoUrl: string) => {
    setExternalVideoUrlValue(nextVideoUrl);
    setVideoUrlError(null);
  };
  // Guards against a second submit landing before the disabled state renders.
  const isSubmittingRef = useRef(false);
  const descriptionEditor = useRichLinkEditor({
    initialMarkdown: initialState.description,
  });
  const [sortOrder, setSortOrder] = useState(initialState.sortOrder);
  const [isActive, setIsActive] = useState(initialState.isActive);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fileDrafts, setFileDrafts] = useState<LessonFileDraft[]>(() =>
    [...initialFiles]
      .sort((leftFile, rightFile) => leftFile.sortOrder - rightFile.sortOrder)
      .map((lessonFile) => ({
        assetId: lessonFile.id,
        fileName: lessonFile.fileName,
        fileSizeBytes: lessonFile.fileSizeBytes,
        localId: lessonFile.id,
        status: LESSON_FILE_DRAFT_STATUS.ready,
        wasAlreadyAttached: true,
      }))
  );
  const [filesTouched, setFilesTouched] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Selected `File` objects, kept outside React state so a failed upload can
  // be retried without asking the author to pick the file again.
  const pendingUploadFilesRef = useRef(new Map<string, File>());
  // Drafts removed while their upload was still in flight: the upload flow
  // checks this set after each await and cleans up the reserved asset.
  const discardedFileLocalIdsRef = useRef(new Set<string>());

  const detectedProvider = detectProviderFromInput(externalVideoUrl);
  // Mirror the backend's `normalizeText`/`normalizeOptionalText`: trim before
  // measuring so a whitespace-only description counts as empty (length 0) and is
  // never wrongly flagged as too long while it looks blank to the author.
  const descriptionLength = descriptionEditor.serialize().trim().length;
  const isDescriptionTooLong =
    descriptionLength > COURSE_LESSON_DESCRIPTION.maxLength;
  const hasUploadsInFlight = fileDrafts.some(
    (draft) => draft.status === LESSON_FILE_DRAFT_STATUS.uploading
  );
  const hasFailedUploads = fileDrafts.some(
    (draft) => draft.status === LESSON_FILE_DRAFT_STATUS.error
  );

  const deleteLessonFileAssetBestEffort = (assetId: string) => {
    void fetch(buildLessonFileApiUrl(tribeSlug, assetId), {
      method: HTTP_METHOD.delete,
    }).catch(() => {
      // Best-effort cleanup: a draft that survives an unreachable delete is
      // reclaimed by the scheduled orphan sweep, so the author flow stays
      // silent here on purpose.
    });
  };

  const markFileDraftFailed = (localId: string) => {
    setFileDrafts((current) =>
      current.map((draft) =>
        draft.localId === localId
          ? { ...draft, status: LESSON_FILE_DRAFT_STATUS.error }
          : draft
      )
    );
  };

  const uploadLessonFile = async (localId: string, file: File) => {
    let reservedAssetId: string | null = null;
    try {
      const reservationResponse = await fetch(
        buildLessonFileUploadsApiUrl(tribeSlug),
        {
          body: JSON.stringify({
            fileName: file.name,
            fileSizeBytes: file.size,
            mimeType: file.type,
          }),
          headers: {
            [HTTP_HEADER_NAME.contentType]: HTTP_CONTENT_TYPE.applicationJson,
          },
          method: HTTP_METHOD.post,
        }
      );

      if (!reservationResponse.ok) {
        const message = await readErrorMessage(reservationResponse);
        if (discardedFileLocalIdsRef.current.delete(localId)) {
          pendingUploadFilesRef.current.delete(localId);
          return;
        }
        markFileDraftFailed(localId);
        toast.error(message);
        return;
      }

      const payload = await reservationResponse.json().catch(() => null);
      const reservation = readUploadReservationFromResponse(payload);
      if (!reservation) {
        if (discardedFileLocalIdsRef.current.delete(localId)) {
          pendingUploadFilesRef.current.delete(localId);
          return;
        }
        markFileDraftFailed(localId);
        toast.error(COURSES_MANAGEMENT_COPY.fileUploadErrorMessage);
        return;
      }
      reservedAssetId = reservation.assetId;

      if (discardedFileLocalIdsRef.current.delete(localId)) {
        deleteLessonFileAssetBestEffort(reservation.assetId);
        pendingUploadFilesRef.current.delete(localId);
        return;
      }

      const uploadResponse = await fetch(reservation.uploadUrl, {
        body: file,
        headers: {
          [HTTP_HEADER_NAME.contentType]: file.type,
          ...reservation.uploadHeaders,
        },
        method: HTTP_METHOD.put,
      });

      if (discardedFileLocalIdsRef.current.delete(localId)) {
        deleteLessonFileAssetBestEffort(reservation.assetId);
        pendingUploadFilesRef.current.delete(localId);
        return;
      }

      if (!uploadResponse.ok) {
        deleteLessonFileAssetBestEffort(reservation.assetId);
        markFileDraftFailed(localId);
        toast.error(COURSES_MANAGEMENT_COPY.fileUploadErrorMessage);
        return;
      }

      pendingUploadFilesRef.current.delete(localId);
      setFileDrafts((current) =>
        current.map((draft) =>
          draft.localId === localId
            ? {
                ...draft,
                assetId: reservation.assetId,
                status: LESSON_FILE_DRAFT_STATUS.ready,
              }
            : draft
        )
      );
    } catch {
      if (reservedAssetId) {
        deleteLessonFileAssetBestEffort(reservedAssetId);
      }
      if (discardedFileLocalIdsRef.current.delete(localId)) {
        pendingUploadFilesRef.current.delete(localId);
        return;
      }
      markFileDraftFailed(localId);
      toast.error(COURSES_MANAGEMENT_COPY.fileUploadErrorMessage);
    }
  };

  const handleAttachFileClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    // Reset the input so picking the same file again re-triggers `change`.
    event.target.value = "";
    if (selectedFiles.length === 0) {
      return;
    }

    let projectedCount = fileDrafts.length;
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
      deleteLessonFileAssetBestEffort(draftToRemove.assetId);
    }
  };

  const handleRetryFileUpload = (draftToRetry: LessonFileDraft) => {
    const file = pendingUploadFilesRef.current.get(draftToRetry.localId);
    if (!file) {
      return;
    }
    setFileDrafts((current) =>
      current.map((draft) =>
        draft.localId === draftToRetry.localId
          ? { ...draft, status: LESSON_FILE_DRAFT_STATUS.uploading }
          : draft
      )
    );
    void uploadLessonFile(draftToRetry.localId, file);
  };

  const handleCancel = () => {
    for (const draft of fileDrafts) {
      if (draft.status === LESSON_FILE_DRAFT_STATUS.uploading) {
        discardedFileLocalIdsRef.current.add(draft.localId);
        continue;
      }
      if (draft.assetId && !draft.wasAlreadyAttached) {
        deleteLessonFileAssetBestEffort(draft.assetId);
      }
    }
    onCancel();
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (hasUploadsInFlight || isSubmittingRef.current) {
      return;
    }
    if (hasFailedUploads) {
      toast.error(COURSES_MANAGEMENT_COPY.fileUploadFailedBlockMessage);
      return;
    }
    const validTitle = validateTitle();
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
    const readyFiles: LessonFileAttachmentPayload[] = [];
    for (const draft of fileDrafts) {
      if (draft.status === LESSON_FILE_DRAFT_STATUS.ready && draft.assetId) {
        readyFiles.push({ assetId: draft.assetId });
      }
    }
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      await onSubmit({
        description,
        externalVideoUrl,
        ...(filesTouched ? { files: readyFiles } : {}),
        isActive,
        sortOrder,
        title: validTitle,
      });
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
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
      <label className={styles.TribeCoursesManagement__formField}>
        <span>{COURSES_MANAGEMENT_COPY.titleLabel}</span>
        <Input
          aria-describedby={titleError ? titleErrorId : undefined}
          aria-invalid={titleError ? true : undefined}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={COURSES_MANAGEMENT_COPY.titleLessonPlaceholder}
          ref={titleInputRef}
          required
          value={title}
        />
        <FieldError id={titleErrorId} message={titleError} />
      </label>
      <label className={styles.TribeCoursesManagement__formField}>
        <span>{COURSES_MANAGEMENT_COPY.videoUrlLabel}</span>
        <Input
          aria-describedby={videoUrlError ? videoUrlErrorId : undefined}
          aria-invalid={videoUrlError ? true : undefined}
          onChange={(event) => setExternalVideoUrl(event.target.value)}
          placeholder={COURSES_MANAGEMENT_COPY.videoUrlPlaceholder}
          ref={videoUrlInputRef}
          required
          value={externalVideoUrl}
        />
        {videoUrlError ? (
          <FieldError id={videoUrlErrorId} message={videoUrlError} />
        ) : (
          <small
            className={cn(
              styles.TribeCoursesManagement__formHelp,
              detectedProvider &&
                styles["TribeCoursesManagement__formHelp--success"]
            )}
          >
            {detectedProvider
              ? `Detectado: ${PROVIDER_LABEL[detectedProvider]}`
              : COURSES_MANAGEMENT_COPY.videoUrlHelp}
          </small>
        )}
      </label>
      <label className={styles.TribeCoursesManagement__formField}>
        <span>{COURSES_MANAGEMENT_COPY.descriptionLabel}</span>
        <div className={styles.TribeCoursesManagement__descriptionEditor}>
          <RichLinkEditor
            ariaLabel={COURSES_MANAGEMENT_COPY.descriptionLabel}
            copy={LESSON_DESCRIPTION_EDITOR_COPY}
            editor={descriptionEditor}
            isInvalid={isDescriptionTooLong}
            placeholder={COURSES_MANAGEMENT_COPY.descriptionPlaceholder}
          />
        </div>
        <small className={styles.TribeCoursesManagement__formHelp}>
          {descriptionLength}/{COURSE_LESSON_DESCRIPTION.maxLength}
        </small>
      </label>
      <div className={styles.TribeCoursesManagement__formField}>
        <span>{COURSES_MANAGEMENT_COPY.lessonFilesHeading}</span>
        {fileDrafts.length > 0 ? (
          <ul className={styles.TribeCoursesManagement__fileList}>
            {fileDrafts.map((draft) => {
              return (
                <li
                  className={styles.TribeCoursesManagement__fileItem}
                  key={draft.localId}
                >
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
                        onClick={() => handleRetryFileUpload(draft)}
                        size={BUTTON_SIZE.small}
                        type={FORM_BUTTON_TYPE.button}
                        variant={BUTTON_VARIANT.outline}
                      >
                        {COURSES_MANAGEMENT_COPY.retryFileButton}
                      </Button>
                    ) : null}
                    <Button
                      aria-label={`Quitar ${draft.fileName}`}
                      disabled={isSubmitting}
                      onClick={() => handleRemoveFileDraft(draft)}
                      size={BUTTON_SIZE.small}
                      type={FORM_BUTTON_TYPE.button}
                      variant={BUTTON_VARIANT.outline}
                    >
                      {COURSES_MANAGEMENT_COPY.removeFileButton}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
        <div>
          <Button
            disabled={
              isSubmitting || fileDrafts.length >= LESSON_FILES.maxCount
            }
            onClick={handleAttachFileClick}
            type={FORM_BUTTON_TYPE.button}
            variant={BUTTON_VARIANT.outline}
          >
            {COURSES_MANAGEMENT_COPY.attachFileButton}
          </Button>
          <input
            accept={ATTACHMENT_FILE_INPUT_ACCEPT}
            aria-label={COURSES_MANAGEMENT_COPY.attachFileButton}
            className={styles.TribeCoursesManagement__fileInput}
            multiple
            onChange={handleFileInputChange}
            ref={fileInputRef}
            type={INPUT_TYPE.file}
          />
        </div>
        <small className={styles.TribeCoursesManagement__formHelp}>
          {LESSON_FILES_HELP_TEXT}
        </small>
      </div>
      <label className={styles.TribeCoursesManagement__formField}>
        <span>{COURSES_MANAGEMENT_COPY.sortOrderLabel}</span>
        <Input
          onChange={(event) =>
            setSortOrder(Number.parseInt(event.target.value, NUMERIC_PARSE_RADIX) || 0)
          }
          type={INPUT_TYPE.number}
          value={sortOrder}
        />
      </label>
      {isEditing ? (
        <label className={styles.TribeCoursesManagement__formField}>
          <span>{COURSES_MANAGEMENT_COPY.activeLabel}</span>
          <Switch
            checked={isActive}
            onCheckedChange={(value) => setIsActive(value)}
          />
        </label>
      ) : null}
      <div className={styles.TribeCoursesManagement__formActions}>
        <Button
          aria-busy={isSubmitting || hasUploadsInFlight || undefined}
          disabled={isSubmitting || hasUploadsInFlight || hasFailedUploads}
          type={FORM_BUTTON_TYPE.submit}
        >
          {isEditing
            ? COURSES_MANAGEMENT_COPY.saveButton
            : COURSES_MANAGEMENT_COPY.createButton}
        </Button>
        <Button
          disabled={isSubmitting}
          onClick={handleCancel}
          type={FORM_BUTTON_TYPE.button}
          variant={BUTTON_VARIANT.outline}
        >
          {COURSES_MANAGEMENT_COPY.cancelButton}
        </Button>
      </div>
    </form>
  );
}
