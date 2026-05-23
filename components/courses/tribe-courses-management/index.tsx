"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ROUTES } from "@/src/constants/routes";
import type {
  CourseModuleWithLessonsResult,
  LessonResult,
} from "@/src/modules/courses/application/results/course-results";
import {
  VIDEO_PROVIDER,
  type VideoProvider,
} from "@/src/modules/courses/constants/courses";
import {
  InvalidVideoUrlError,
  parseExternalVideoUrl,
} from "@/src/modules/courses/domain/value-objects/external-video-url";
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
  errorTitle: "Error",
  inactiveBadge: "Inactivo",
  lessonCreatedMessage: "Lección creada.",
  lessonDeletedMessage: "Lección eliminada.",
  lessonFormHeading: "Lección",
  lessonUpdatedMessage: "Lección actualizada.",
  moduleCreatedMessage: "Módulo creado.",
  moduleDeletedMessage: "Módulo eliminado.",
  moduleUpdatedMessage: "Módulo actualizado.",
  newLessonButton: "Agregar lección",
  newLessonHeading: "Nueva lección",
  newModuleButton: "Nuevo módulo",
  pageHeading: "Gestionar cursos",
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

export function TribeCoursesManagement({
  initialModules,
  tribeSlug,
}: TribeCoursesManagementProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showNewModuleForm, setShowNewModuleForm] = useState(false);
  const [editingModuleId, setEditingModuleId] = useState<string | null>(null);
  const [creatingLessonModuleId, setCreatingLessonModuleId] = useState<
    string | null
  >(null);
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null);

  const refresh = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  const submitNewModule = async (form: ModuleFormState) => {
    const response = await fetch(buildModulesApiUrl(tribeSlug), {
      body: JSON.stringify({
        sortOrder: form.sortOrder,
        title: form.title,
      }),
      headers: { [HTTP_HEADER_NAME.contentType]: HTTP_CONTENT_TYPE.applicationJson },
      method: HTTP_METHOD.post,
    });
    if (!response.ok) {
      toast.error(await readErrorMessage(response));
      return;
    }
    toast.success(COURSES_MANAGEMENT_COPY.moduleCreatedMessage);
    setShowNewModuleForm(false);
    refresh();
  };

  const submitModuleUpdate = async (
    moduleId: string,
    form: ModuleFormState
  ) => {
    const response = await fetch(buildModuleApiUrl(tribeSlug, moduleId), {
      body: JSON.stringify({
        isActive: form.isActive,
        sortOrder: form.sortOrder,
        title: form.title,
      }),
      headers: { [HTTP_HEADER_NAME.contentType]: HTTP_CONTENT_TYPE.applicationJson },
      method: HTTP_METHOD.patch,
    });
    if (!response.ok) {
      toast.error(await readErrorMessage(response));
      return;
    }
    toast.success(COURSES_MANAGEMENT_COPY.moduleUpdatedMessage);
    setEditingModuleId(null);
    refresh();
  };

  const deleteModule = async (moduleId: string) => {
    if (!window.confirm(COURSES_MANAGEMENT_COPY.deleteModuleConfirm)) {
      return;
    }
    const response = await fetch(buildModuleApiUrl(tribeSlug, moduleId), {
      method: HTTP_METHOD.delete,
    });
    if (!response.ok) {
      toast.error(await readErrorMessage(response));
      return;
    }
    toast.success(COURSES_MANAGEMENT_COPY.moduleDeletedMessage);
    refresh();
  };

  const submitNewLesson = async (
    courseModuleId: string,
    form: LessonFormState
  ) => {
    const response = await fetch(
      buildLessonsApiUrl(tribeSlug, courseModuleId),
      {
        body: JSON.stringify({
          description: form.description,
          externalVideoUrl: form.externalVideoUrl,
          sortOrder: form.sortOrder,
          title: form.title,
        }),
        headers: { [HTTP_HEADER_NAME.contentType]: HTTP_CONTENT_TYPE.applicationJson },
        method: HTTP_METHOD.post,
      }
    );
    if (!response.ok) {
      toast.error(await readErrorMessage(response));
      return;
    }
    toast.success(COURSES_MANAGEMENT_COPY.lessonCreatedMessage);
    setCreatingLessonModuleId(null);
    refresh();
  };

  const submitLessonUpdate = async (
    lesson: LessonResult,
    form: LessonFormState
  ) => {
    const response = await fetch(buildLessonApiUrl(tribeSlug, lesson.id), {
      body: JSON.stringify({
        courseModuleId: lesson.courseModuleId,
        description: form.description,
        externalVideoUrl: form.externalVideoUrl,
        isActive: form.isActive,
        sortOrder: form.sortOrder,
        title: form.title,
      }),
      headers: { [HTTP_HEADER_NAME.contentType]: HTTP_CONTENT_TYPE.applicationJson },
      method: HTTP_METHOD.patch,
    });
    if (!response.ok) {
      toast.error(await readErrorMessage(response));
      return;
    }
    toast.success(COURSES_MANAGEMENT_COPY.lessonUpdatedMessage);
    setEditingLessonId(null);
    refresh();
  };

  const deleteLesson = async (lessonId: string) => {
    if (!window.confirm(COURSES_MANAGEMENT_COPY.deleteLessonConfirm)) {
      return;
    }
    const response = await fetch(buildLessonApiUrl(tribeSlug, lessonId), {
      method: HTTP_METHOD.delete,
    });
    if (!response.ok) {
      toast.error(await readErrorMessage(response));
      return;
    }
    toast.success(COURSES_MANAGEMENT_COPY.lessonDeletedMessage);
    refresh();
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
          disabled={isPending || showNewModuleForm}
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
            sortOrder: initialModules.length,
            title: "",
          }}
          isEditing={false}
          onCancel={() => setShowNewModuleForm(false)}
          onSubmit={submitNewModule}
        />
      ) : null}

      {initialModules.length === 0 && !showNewModuleForm ? (
        <p className={styles.TribeCoursesManagement__emptyState}>
          {COURSES_MANAGEMENT_COPY.emptyState}
        </p>
      ) : null}

      <ul className={styles.TribeCoursesManagement__moduleList}>
        {initialModules.map((courseModule) => (
          <li
            className={styles.TribeCoursesManagement__moduleItem}
            key={courseModule.id}
          >
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
                  </h2>
                  <p
                    className={
                      styles.TribeCoursesManagement__moduleMeta
                    }
                  >
                    Orden: {courseModule.sortOrder}
                  </p>
                </div>
                <div className={styles.TribeCoursesManagement__actions}>
                  <Button
                    onClick={() => setEditingModuleId(courseModule.id)}
                    type={FORM_BUTTON_TYPE.button}
                    variant={BUTTON_VARIANT.outline}
                  >
                    {COURSES_MANAGEMENT_COPY.editButton}
                  </Button>
                  <Button
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
              {courseModule.lessons.map((lesson) => (
                <li
                  className={styles.TribeCoursesManagement__lessonItem}
                  key={lesson.id}
                >
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
                        className={styles.TribeCoursesManagement__actions}
                      >
                        <Button
                          onClick={() => setEditingLessonId(lesson.id)}
                          type={FORM_BUTTON_TYPE.button}
                          variant={BUTTON_VARIANT.outline}
                        >
                          {COURSES_MANAGEMENT_COPY.editButton}
                        </Button>
                        <Button
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
              ))}
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
                onClick={() => setCreatingLessonModuleId(courseModule.id)}
                type={FORM_BUTTON_TYPE.button}
                variant={BUTTON_VARIANT.outline}
              >
                {COURSES_MANAGEMENT_COPY.newLessonButton}
              </Button>
            )}
          </li>
        ))}
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
