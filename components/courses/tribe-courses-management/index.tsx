"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";

import { Link } from "@/components/navigation/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ROUTES } from "@/src/constants/routes";
import type {
  CourseModuleResult,
  CourseModuleWithLessonsResult,
  LessonResult,
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
  editButton: "Editar",
  emptyState: "Todavía no creaste ningún módulo.",
  inactiveBadge: "Inactivo",
  invalidVideoUrlMessage:
    "La URL del video no es válida. Revisá el enlace e intentá de nuevo.",
  lessonCreatedMessage: "Lección creada.",
  lessonDeletedMessage: "Lección eliminada.",
  lessonUpdatedMessage: "Lección actualizada.",
  moduleCreatedMessage: "Módulo creado.",
  moduleDeletedMessage: "Módulo eliminado.",
  moduleUpdatedMessage: "Módulo actualizado.",
  newLessonButton: "Agregar lección",
  newLessonHeading: "Nueva lección",
  newModuleButton: "Nuevo módulo",
  pageHeading: "Gestionar cursos",
  pendingBadge: "Guardando…",
  saveButton: "Guardar",
  sortOrderLabel: "Orden",
  titleLabel: "Título",
  titleLessonPlaceholder: "Ej: Qué dinero invertir",
  titleModulePlaceholder: "Ej: Empezar acá",
  unexpectedError: "No pudimos completar la acción. Intentá de nuevo.",
  videoUrlHelp:
    "Pegá la URL completa del video (Vimeo, Wistia, Loom o YouTube).",
  videoUrlLabel: "URL del video",
  videoUrlPlaceholder: "https://vimeo.com/123456789",
} as const;

const EDIT_HEADING_PREFIX = "Editar: ";

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
} as const;

const HTTP_HEADER_NAME = {
  contentType: "Content-Type",
} as const;

const HTTP_CONTENT_TYPE = {
  applicationJson: "application/json",
} as const;

const COURSES_API = {
  apiTribesPrefix: "/api/tribes/",
  coursesLessons: "/courses/lessons/",
  coursesModules: "/courses/modules",
  coursesModulesById: "/courses/modules/",
  lessonsSuffix: "/lessons",
} as const;

const BUTTON_VARIANT = {
  destructive: "destructive",
  outline: "outline",
} as const;

const INPUT_TYPE = {
  number: "number",
} as const;

const FORM_BUTTON_TYPE = {
  button: "button",
  submit: "submit",
} as const;

const NUMERIC_PARSE_RADIX = 10;

type TribeCoursesManagementProps = {
  initialModules: CourseModuleWithLessonsResult[];
  tribeSlug: string;
};

type ModuleFormState = {
  isActive: boolean;
  sortOrder: number;
  title: string;
};

type LessonFormState = {
  description: string;
  externalVideoUrl: string;
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
    typeof entry.isActive !== "boolean"
  ) {
    return null;
  }
  return {
    id: entry.id,
    isActive: entry.isActive,
    sortOrder: entry.sortOrder,
    title: entry.title,
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
    id: entry.id,
    isActive: entry.isActive,
    sortOrder: entry.sortOrder,
    title: entry.title,
    videoProvider: entry.videoProvider as VideoProvider,
  };
}

export function TribeCoursesManagement({
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
      id: optimisticId,
      isActive: true,
      lessons: [],
      sortOrder: form.sortOrder,
      title: form.title,
    };
    setModules((current) => appendModule(current, optimisticModule));
    markModulePending(optimisticId);

    try {
      const response = await fetch(buildModulesApiUrl(tribeSlug), {
        body: JSON.stringify({
          sortOrder: form.sortOrder,
          title: form.title,
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
      setShowNewModuleForm(false);
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
      })
    );
    markModulePending(moduleId);

    try {
      const response = await fetch(buildModuleApiUrl(tribeSlug, moduleId), {
        body: JSON.stringify({
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
          patchModuleFields(current, moduleId, {
            isActive: snapshot.module.isActive,
            sortOrder: snapshot.module.sortOrder,
            title: snapshot.module.title,
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
          })
        );
      }
      clearModulePending(moduleId);
      setEditingModuleId(null);
      toast.success(COURSES_MANAGEMENT_COPY.moduleUpdatedMessage);
    } catch {
      setModules((current) =>
        patchModuleFields(current, moduleId, {
          isActive: snapshot.module.isActive,
          sortOrder: snapshot.module.sortOrder,
          title: snapshot.module.title,
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
    const optimisticLesson: LessonResult = {
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
        replaceLessonId(current, courseModuleId, optimisticId, serverLesson)
      );
      swapLessonPending(optimisticId, serverLesson.id);
      clearLessonPending(serverLesson.id);
      setCreatingLessonModuleId(null);
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
      setEditingLessonId(null);
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
            {COURSES_MANAGEMENT_COPY.pageHeading}
          </h1>
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
          type={FORM_BUTTON_TYPE.button}
        >
          {COURSES_MANAGEMENT_COPY.newModuleButton}
        </Button>
      </header>

      {showNewModuleForm ? (
        <ModuleForm
          headingLabel={COURSES_MANAGEMENT_COPY.createModuleHeading}
          initialState={{
            isActive: true,
            sortOrder: modules.length,
            title: "",
          }}
          isEditing={false}
          onCancel={() => setShowNewModuleForm(false)}
          onSubmit={submitNewModule}
        />
      ) : null}

      {modules.length === 0 && !showNewModuleForm ? (
        <p className={styles.TribeCoursesManagement__emptyState}>
          {COURSES_MANAGEMENT_COPY.emptyState}
        </p>
      ) : null}

      <ul className={styles.TribeCoursesManagement__moduleList}>
        {modules.map((courseModule) => {
          const isModulePending = pendingModuleIds.has(courseModule.id);
          const isModuleOptimistic = isOptimisticId(courseModule.id);
          const isModuleLocked = isModulePending || isModuleOptimistic;
          const moduleItemClassName = isModulePending
            ? `${styles.TribeCoursesManagement__moduleItem} ${styles["TribeCoursesManagement__moduleItem--pending"]}`
            : styles.TribeCoursesManagement__moduleItem;

          return (
            <li className={moduleItemClassName} key={courseModule.id}>
              {editingModuleId === courseModule.id ? (
                <ModuleForm
                  headingLabel={`${EDIT_HEADING_PREFIX}${courseModule.title}`}
                  initialState={{
                    isActive: courseModule.isActive,
                    sortOrder: courseModule.sortOrder,
                    title: courseModule.title,
                  }}
                  isEditing
                  onCancel={() => setEditingModuleId(null)}
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
                {courseModule.lessons.map((lesson) => {
                  const isLessonPending = pendingLessonIds.has(lesson.id);
                  const isLessonOptimistic = isOptimisticId(lesson.id);
                  const isLessonLocked =
                    isLessonPending || isLessonOptimistic;
                  const lessonItemClassName = isLessonPending
                    ? `${styles.TribeCoursesManagement__lessonItem} ${styles["TribeCoursesManagement__lessonItem--pending"]}`
                    : styles.TribeCoursesManagement__lessonItem;

                  return (
                    <li className={lessonItemClassName} key={lesson.id}>
                      {editingLessonId === lesson.id ? (
                        <LessonForm
                          headingLabel={`${EDIT_HEADING_PREFIX}${lesson.title}`}
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
                          onCancel={() => setEditingLessonId(null)}
                          onSubmit={(form) => submitLessonUpdate(lesson, form)}
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
                    </li>
                  );
                })}
              </ul>

              {creatingLessonModuleId === courseModule.id ? (
                <LessonForm
                  headingLabel={COURSES_MANAGEMENT_COPY.newLessonHeading}
                  initialState={{
                    description: "",
                    externalVideoUrl: "",
                    isActive: true,
                    sortOrder: courseModule.lessons.length,
                    title: "",
                  }}
                  isEditing={false}
                  onCancel={() => setCreatingLessonModuleId(null)}
                  onSubmit={(form) => submitNewLesson(courseModule.id, form)}
                />
              ) : (
                <Button
                  disabled={isModuleLocked}
                  onClick={() => setCreatingLessonModuleId(courseModule.id)}
                  type={FORM_BUTTON_TYPE.button}
                  variant={BUTTON_VARIANT.outline}
                >
                  {COURSES_MANAGEMENT_COPY.newLessonButton}
                </Button>
              )}
            </li>
          );
        })}
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

function ModuleForm({
  headingLabel,
  initialState,
  isEditing,
  onCancel,
  onSubmit,
}: ModuleFormProps) {
  const [title, setTitle] = useState(initialState.title);
  const [sortOrder, setSortOrder] = useState(initialState.sortOrder);
  const [isActive, setIsActive] = useState(initialState.isActive);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      await onSubmit({ isActive, sortOrder, title });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      className={styles.TribeCoursesManagement__form}
      onSubmit={handleSubmit}
    >
      <h3 className={styles.TribeCoursesManagement__formHeading}>
        {headingLabel}
      </h3>
      <label className={styles.TribeCoursesManagement__formField}>
        <span>{COURSES_MANAGEMENT_COPY.titleLabel}</span>
        <Input
          onChange={(event) => setTitle(event.target.value)}
          placeholder={COURSES_MANAGEMENT_COPY.titleModulePlaceholder}
          required
          value={title}
        />
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
        <Button disabled={isSubmitting} type={FORM_BUTTON_TYPE.submit}>
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
  initialState: LessonFormState;
  isEditing: boolean;
  onCancel: () => void;
  onSubmit: (form: LessonFormState) => Promise<void>;
};

function LessonForm({
  headingLabel,
  initialState,
  isEditing,
  onCancel,
  onSubmit,
}: LessonFormProps) {
  const [title, setTitle] = useState(initialState.title);
  const [externalVideoUrl, setExternalVideoUrl] = useState(
    initialState.externalVideoUrl
  );
  const [description, setDescription] = useState(initialState.description);
  const [sortOrder, setSortOrder] = useState(initialState.sortOrder);
  const [isActive, setIsActive] = useState(initialState.isActive);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const detectedProvider = detectProviderFromInput(externalVideoUrl);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      await onSubmit({
        description,
        externalVideoUrl,
        isActive,
        sortOrder,
        title,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      className={styles.TribeCoursesManagement__form}
      onSubmit={handleSubmit}
    >
      <h3 className={styles.TribeCoursesManagement__formHeading}>
        {headingLabel}
      </h3>
      <label className={styles.TribeCoursesManagement__formField}>
        <span>{COURSES_MANAGEMENT_COPY.titleLabel}</span>
        <Input
          onChange={(event) => setTitle(event.target.value)}
          placeholder={COURSES_MANAGEMENT_COPY.titleLessonPlaceholder}
          required
          value={title}
        />
      </label>
      <label className={styles.TribeCoursesManagement__formField}>
        <span>{COURSES_MANAGEMENT_COPY.videoUrlLabel}</span>
        <Input
          onChange={(event) => setExternalVideoUrl(event.target.value)}
          placeholder={COURSES_MANAGEMENT_COPY.videoUrlPlaceholder}
          required
          value={externalVideoUrl}
        />
        <small className={styles.TribeCoursesManagement__formHelp}>
          {detectedProvider
            ? `Detectado: ${PROVIDER_LABEL[detectedProvider]}`
            : COURSES_MANAGEMENT_COPY.videoUrlHelp}
        </small>
      </label>
      <label className={styles.TribeCoursesManagement__formField}>
        <span>{COURSES_MANAGEMENT_COPY.descriptionLabel}</span>
        <Textarea
          onChange={(event) => setDescription(event.target.value)}
          placeholder={COURSES_MANAGEMENT_COPY.descriptionPlaceholder}
          rows={4}
          value={description}
        />
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
        <Button disabled={isSubmitting} type={FORM_BUTTON_TYPE.submit}>
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
