"use client";

import { useCallback, useState } from "react";
import { toast, Button, Input, Switch } from "beez-ui";

import { Link } from "@/components/navigation/link";



import { ROUTES } from "@/src/constants/routes";
import {
  COURSE_DESCRIPTION,
  COURSE_TITLE,
} from "@/src/modules/courses/constants/courses";
import type {
  CourseResult,
  CourseWithModulesResult,
} from "@/src/modules/courses/application/results/course-results";
import styles from "./styles.module.scss";

const CATALOG_MANAGEMENT_COPY = {
  activeLabel: "Activo",
  backLink: "Ver vista pública",
  cancelButton: "Cancelar",
  courseCreatedMessage: "Curso creado.",
  courseDeletedMessage: "Curso eliminado.",
  courseUpdatedMessage: "Curso actualizado.",
  coverLabel: "URL de la imagen de portada",
  coverPlaceholder: "https://ejemplo.com/portada.jpg",
  createButton: "Crear",
  createCourseHeading: "Nuevo curso",
  deleteButton: "Eliminar",
  deleteCourseConfirm:
    "Esto eliminará el curso con todos sus módulos y lecciones. ¿Continuar?",
  descriptionLabel: "Descripción",
  descriptionPlaceholder: "Texto corto que aparece en la card del curso",
  editButton: "Editar",
  emptyState: "Todavía no creaste ningún curso.",
  inactiveBadge: "Inactivo",
  manageContentButton: "Gestionar contenido",
  newCourseButton: "Nuevo curso",
  pageHeading: "Gestionar cursos",
  pendingBadge: "Guardando…",
  saveButton: "Guardar",
  sortOrderLabel: "Orden",
  titleLabel: "Título",
  titlePlaceholder: "Ej: Inversiones desde cero",
  unexpectedError: "No pudimos completar la acción. Intentá de nuevo.",
} as const;

const EDIT_HEADING_PREFIX = "Editar: ";

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
  coursesById: "/courses/",
  coursesSuffix: "/courses",
} as const;

const COURSE_MANAGE_QUERY_PARAM = "curso";

const OPTIMISTIC_ID_PREFIX = "optimistic-";
const FORM_BUTTON_TYPE = {
  button: "button",
  submit: "submit",
} as const;
const BUTTON_VARIANT = {
  destructive: "destructive",
  outline: "outline",
} as const;
const INPUT_TYPE = {
  number: "number",
} as const;
const NUMERIC_PARSE_RADIX = 10;
const ARIA_ROLE_GROUP = "group";

function buildCoursesApiUrl(tribeSlug: string): string {
  return `${COURSES_API.apiTribesPrefix}${tribeSlug}${COURSES_API.coursesSuffix}`;
}

function buildCourseApiUrl(tribeSlug: string, courseId: string): string {
  return `${COURSES_API.apiTribesPrefix}${tribeSlug}${COURSES_API.coursesById}${courseId}`;
}

function buildManageCourseHref(tribeSlug: string, courseId: string): string {
  return `${ROUTES.tribes.coursesManage(tribeSlug)}?${COURSE_MANAGE_QUERY_PARAM}=${courseId}`;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { message?: string };
    return payload?.message ?? CATALOG_MANAGEMENT_COPY.unexpectedError;
  } catch {
    return CATALOG_MANAGEMENT_COPY.unexpectedError;
  }
}

function generateOptimisticId(): string {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;
  return `${OPTIMISTIC_ID_PREFIX}${suffix}`;
}

function isOptimisticId(id: string): boolean {
  return id.startsWith(OPTIMISTIC_ID_PREFIX);
}

function readCourseFromResponse(payload: unknown): CourseResult | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const candidate = (payload as { course?: unknown }).course;
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
    coverImageUrl:
      typeof entry.coverImageUrl === "string" ? entry.coverImageUrl : null,
    description:
      typeof entry.description === "string" ? entry.description : null,
    id: entry.id,
    isActive: entry.isActive,
    sortOrder: entry.sortOrder,
    title: entry.title,
  };
}

type CourseFormState = {
  coverImageUrl: string;
  description: string;
  isActive: boolean;
  sortOrder: number;
  title: string;
};

type TribeCoursesCatalogManagementProps = {
  initialCourses: CourseWithModulesResult[];
  tribeSlug: string;
};

function sortCourses(
  courses: CourseWithModulesResult[]
): CourseWithModulesResult[] {
  return [...courses].sort(
    (leftCourse, rightCourse) => leftCourse.sortOrder - rightCourse.sortOrder
  );
}

function toCourseWithModules(course: CourseResult): CourseWithModulesResult {
  return {
    ...course,
    lastViewedLessonId: null,
    modules: [],
  };
}

export function TribeCoursesCatalogManagement({
  initialCourses,
  tribeSlug,
}: TribeCoursesCatalogManagementProps) {
  const [courses, setCourses] =
    useState<CourseWithModulesResult[]>(initialCourses);
  const [syncedInitialCourses, setSyncedInitialCourses] =
    useState(initialCourses);
  const [syncedTribeSlug, setSyncedTribeSlug] = useState(tribeSlug);
  const [pendingCourseIds, setPendingCourseIds] = useState<Set<string>>(
    () => new Set()
  );
  const [showNewCourseForm, setShowNewCourseForm] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);

  if (syncedInitialCourses !== initialCourses || syncedTribeSlug !== tribeSlug) {
    setSyncedInitialCourses(initialCourses);
    setSyncedTribeSlug(tribeSlug);
    setCourses(initialCourses);
    setPendingCourseIds(new Set());
    setShowNewCourseForm(false);
    setEditingCourseId(null);
  }

  const markCoursePending = useCallback((courseId: string) => {
    setPendingCourseIds((current) => {
      const next = new Set(current);
      next.add(courseId);
      return next;
    });
  }, []);

  const clearCoursePending = useCallback((courseId: string) => {
    setPendingCourseIds((current) => {
      if (!current.has(courseId)) {
        return current;
      }
      const next = new Set(current);
      next.delete(courseId);
      return next;
    });
  }, []);

  const submitNewCourse = async (form: CourseFormState) => {
    const optimisticId = generateOptimisticId();
    const optimisticCourse: CourseWithModulesResult = {
      coverImageUrl: form.coverImageUrl || null,
      description: form.description || null,
      id: optimisticId,
      isActive: true,
      lastViewedLessonId: null,
      modules: [],
      sortOrder: form.sortOrder,
      title: form.title,
    };
    setCourses((current) => sortCourses([...current, optimisticCourse]));
    markCoursePending(optimisticId);

    try {
      const response = await fetch(buildCoursesApiUrl(tribeSlug), {
        body: JSON.stringify({
          coverImageUrl: form.coverImageUrl,
          description: form.description,
          sortOrder: form.sortOrder,
          title: form.title,
        }),
        headers: {
          [HTTP_HEADER_NAME.contentType]: HTTP_CONTENT_TYPE.applicationJson,
        },
        method: HTTP_METHOD.post,
      });

      if (!response.ok) {
        setCourses((current) =>
          current.filter((course) => course.id !== optimisticId)
        );
        clearCoursePending(optimisticId);
        toast.error(await readErrorMessage(response));
        setShowNewCourseForm(true);
        return;
      }

      const payload = await response.json().catch(() => null);
      const serverCourse = readCourseFromResponse(payload);
      if (!serverCourse) {
        setCourses((current) =>
          current.filter((course) => course.id !== optimisticId)
        );
        clearCoursePending(optimisticId);
        toast.error(CATALOG_MANAGEMENT_COPY.unexpectedError);
        return;
      }
      setCourses((current) =>
        sortCourses(
          current.map((course) =>
            course.id === optimisticId
              ? toCourseWithModules(serverCourse)
              : course
          )
        )
      );
      clearCoursePending(optimisticId);
      setShowNewCourseForm(false);
      toast.success(CATALOG_MANAGEMENT_COPY.courseCreatedMessage);
    } catch {
      setCourses((current) =>
        current.filter((course) => course.id !== optimisticId)
      );
      clearCoursePending(optimisticId);
      toast.error(CATALOG_MANAGEMENT_COPY.unexpectedError);
    }
  };

  const submitCourseUpdate = async (
    courseId: string,
    form: CourseFormState
  ) => {
    const snapshot = courses.find((course) => course.id === courseId);
    if (!snapshot) {
      return;
    }
    setCourses((current) =>
      sortCourses(
        current.map((course) =>
          course.id === courseId
            ? {
                ...course,
                coverImageUrl: form.coverImageUrl || null,
                description: form.description || null,
                isActive: form.isActive,
                sortOrder: form.sortOrder,
                title: form.title,
              }
            : course
        )
      )
    );
    markCoursePending(courseId);

    try {
      const response = await fetch(buildCourseApiUrl(tribeSlug, courseId), {
        body: JSON.stringify({
          coverImageUrl: form.coverImageUrl,
          description: form.description,
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
        setCourses((current) =>
          sortCourses(
            current.map((course) => (course.id === courseId ? snapshot : course))
          )
        );
        clearCoursePending(courseId);
        toast.error(await readErrorMessage(response));
        setEditingCourseId(courseId);
        return;
      }

      const payload = await response.json().catch(() => null);
      const serverCourse = readCourseFromResponse(payload);
      if (serverCourse) {
        setCourses((current) =>
          sortCourses(
            current.map((course) =>
              course.id === courseId
                ? { ...course, ...serverCourse }
                : course
            )
          )
        );
      }
      clearCoursePending(courseId);
      setEditingCourseId(null);
      toast.success(CATALOG_MANAGEMENT_COPY.courseUpdatedMessage);
    } catch {
      setCourses((current) =>
        sortCourses(
          current.map((course) => (course.id === courseId ? snapshot : course))
        )
      );
      clearCoursePending(courseId);
      toast.error(CATALOG_MANAGEMENT_COPY.unexpectedError);
    }
  };

  const deleteCourse = async (courseId: string) => {
    if (!window.confirm(CATALOG_MANAGEMENT_COPY.deleteCourseConfirm)) {
      return;
    }
    const snapshot = courses.find((course) => course.id === courseId);
    const snapshotIndex = courses.findIndex((course) => course.id === courseId);
    if (!snapshot) {
      return;
    }
    setCourses((current) =>
      current.filter((course) => course.id !== courseId)
    );
    markCoursePending(courseId);

    try {
      const response = await fetch(buildCourseApiUrl(tribeSlug, courseId), {
        method: HTTP_METHOD.delete,
      });
      if (!response.ok) {
        setCourses((current) => {
          const next = [...current];
          next.splice(snapshotIndex, 0, snapshot);
          return next;
        });
        clearCoursePending(courseId);
        toast.error(await readErrorMessage(response));
        return;
      }
      clearCoursePending(courseId);
      toast.success(CATALOG_MANAGEMENT_COPY.courseDeletedMessage);
    } catch {
      setCourses((current) => {
        const next = [...current];
        next.splice(snapshotIndex, 0, snapshot);
        return next;
      });
      clearCoursePending(courseId);
      toast.error(CATALOG_MANAGEMENT_COPY.unexpectedError);
    }
  };

  return (
    <main className={styles.TribeCoursesCatalogManagement}>
      <header className={styles.TribeCoursesCatalogManagement__header}>
        <div>
          <h1 className={styles.TribeCoursesCatalogManagement__heading}>
            {CATALOG_MANAGEMENT_COPY.pageHeading}
          </h1>
          <Link
            className={styles.TribeCoursesCatalogManagement__backLink}
            href={ROUTES.tribes.courses(tribeSlug)}
          >
            {CATALOG_MANAGEMENT_COPY.backLink}
          </Link>
        </div>
        <Button
          disabled={showNewCourseForm}
          onClick={() => setShowNewCourseForm(true)}
          type={FORM_BUTTON_TYPE.button}
        >
          {CATALOG_MANAGEMENT_COPY.newCourseButton}
        </Button>
      </header>

      {showNewCourseForm ? (
        <CourseForm
          headingLabel={CATALOG_MANAGEMENT_COPY.createCourseHeading}
          initialState={{
            coverImageUrl: "",
            description: "",
            isActive: true,
            sortOrder: courses.length,
            title: "",
          }}
          isEditing={false}
          onCancel={() => setShowNewCourseForm(false)}
          onSubmit={submitNewCourse}
        />
      ) : null}

      {courses.length === 0 && !showNewCourseForm ? (
        <p className={styles.TribeCoursesCatalogManagement__emptyState}>
          {CATALOG_MANAGEMENT_COPY.emptyState}
        </p>
      ) : null}

      <ul className={styles.TribeCoursesCatalogManagement__courseList}>
        {courses.map((course) => {
          const isCoursePending = pendingCourseIds.has(course.id);
          const isCourseLocked = isCoursePending || isOptimisticId(course.id);
          const courseItemClassName = isCoursePending
            ? `${styles.TribeCoursesCatalogManagement__courseItem} ${styles["TribeCoursesCatalogManagement__courseItem--pending"]}`
            : styles.TribeCoursesCatalogManagement__courseItem;

          return (
            <li className={courseItemClassName} key={course.id}>
              {editingCourseId === course.id ? (
                <CourseForm
                  headingLabel={`${EDIT_HEADING_PREFIX}${course.title}`}
                  initialState={{
                    coverImageUrl: course.coverImageUrl ?? "",
                    description: course.description ?? "",
                    isActive: course.isActive,
                    sortOrder: course.sortOrder,
                    title: course.title,
                  }}
                  isEditing
                  onCancel={() => setEditingCourseId(null)}
                  onSubmit={(form) => submitCourseUpdate(course.id, form)}
                />
              ) : (
                <div className={styles.TribeCoursesCatalogManagement__courseHeader}>
                  <div>
                    <h2 className={styles.TribeCoursesCatalogManagement__courseTitle}>
                      {course.title}
                      {!course.isActive ? (
                        <span
                          className={
                            styles.TribeCoursesCatalogManagement__inactiveBadge
                          }
                        >
                          {CATALOG_MANAGEMENT_COPY.inactiveBadge}
                        </span>
                      ) : null}
                      {isCoursePending ? (
                        <span
                          className={
                            styles.TribeCoursesCatalogManagement__pendingBadge
                          }
                        >
                          {CATALOG_MANAGEMENT_COPY.pendingBadge}
                        </span>
                      ) : null}
                    </h2>
                    <p className={styles.TribeCoursesCatalogManagement__courseMeta}>
                      Orden: {course.sortOrder}
                    </p>
                    {course.description ? (
                      <p
                        className={
                          styles.TribeCoursesCatalogManagement__courseDescription
                        }
                      >
                        {course.description}
                      </p>
                    ) : null}
                  </div>
                  <div
                    aria-label={`Acciones del curso ${course.title}`}
                    className={styles.TribeCoursesCatalogManagement__actions}
                    role={ARIA_ROLE_GROUP}
                  >
                    {!isCourseLocked ? (
                      <Link
                        className={
                          styles.TribeCoursesCatalogManagement__manageContentLink
                        }
                        href={buildManageCourseHref(tribeSlug, course.id)}
                      >
                        {CATALOG_MANAGEMENT_COPY.manageContentButton}
                      </Link>
                    ) : null}
                    <Button
                      disabled={isCourseLocked}
                      onClick={() => setEditingCourseId(course.id)}
                      type={FORM_BUTTON_TYPE.button}
                      variant={BUTTON_VARIANT.outline}
                    >
                      {CATALOG_MANAGEMENT_COPY.editButton}
                    </Button>
                    <Button
                      disabled={isCourseLocked}
                      onClick={() => deleteCourse(course.id)}
                      type={FORM_BUTTON_TYPE.button}
                      variant={BUTTON_VARIANT.destructive}
                    >
                      {CATALOG_MANAGEMENT_COPY.deleteButton}
                    </Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}

type CourseFormProps = {
  headingLabel: string;
  initialState: CourseFormState;
  isEditing: boolean;
  onCancel: () => void;
  onSubmit: (form: CourseFormState) => Promise<void>;
};

function CourseForm({
  headingLabel,
  initialState,
  isEditing,
  onCancel,
  onSubmit,
}: CourseFormProps) {
  const [title, setTitle] = useState(initialState.title);
  const [description, setDescription] = useState(initialState.description);
  const [coverImageUrl, setCoverImageUrl] = useState(
    initialState.coverImageUrl
  );
  const [sortOrder, setSortOrder] = useState(initialState.sortOrder);
  const [isActive, setIsActive] = useState(initialState.isActive);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      await onSubmit({
        coverImageUrl: coverImageUrl.trim(),
        description,
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
      className={styles.TribeCoursesCatalogManagement__form}
      onSubmit={handleSubmit}
    >
      <h3 className={styles.TribeCoursesCatalogManagement__formHeading}>
        {headingLabel}
      </h3>
      <label className={styles.TribeCoursesCatalogManagement__formField}>
        <span>{CATALOG_MANAGEMENT_COPY.titleLabel}</span>
        <Input
          maxLength={COURSE_TITLE.maxLength}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={CATALOG_MANAGEMENT_COPY.titlePlaceholder}
          required
          value={title}
        />
      </label>
      <label className={styles.TribeCoursesCatalogManagement__formField}>
        <span>{CATALOG_MANAGEMENT_COPY.descriptionLabel}</span>
        <textarea
          className={styles.TribeCoursesCatalogManagement__textarea}
          maxLength={COURSE_DESCRIPTION.maxLength}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={CATALOG_MANAGEMENT_COPY.descriptionPlaceholder}
          rows={2}
          value={description}
        />
      </label>
      <label className={styles.TribeCoursesCatalogManagement__formField}>
        <span>{CATALOG_MANAGEMENT_COPY.coverLabel}</span>
        <Input
          onChange={(event) => setCoverImageUrl(event.target.value)}
          placeholder={CATALOG_MANAGEMENT_COPY.coverPlaceholder}
          type="url"
          value={coverImageUrl}
        />
      </label>
      <label className={styles.TribeCoursesCatalogManagement__formField}>
        <span>{CATALOG_MANAGEMENT_COPY.sortOrderLabel}</span>
        <Input
          min={0}
          onChange={(event) =>
            setSortOrder(
              Number.parseInt(event.target.value, NUMERIC_PARSE_RADIX) || 0
            )
          }
          type={INPUT_TYPE.number}
          value={sortOrder}
        />
      </label>
      {isEditing ? (
        <label className={styles.TribeCoursesCatalogManagement__formSwitch}>
          <Switch checked={isActive} onCheckedChange={setIsActive} />
          <span>{CATALOG_MANAGEMENT_COPY.activeLabel}</span>
        </label>
      ) : null}
      <div className={styles.TribeCoursesCatalogManagement__formActions}>
        <Button disabled={isSubmitting} type={FORM_BUTTON_TYPE.submit}>
          {isEditing
            ? CATALOG_MANAGEMENT_COPY.saveButton
            : CATALOG_MANAGEMENT_COPY.createButton}
        </Button>
        <Button
          onClick={onCancel}
          type={FORM_BUTTON_TYPE.button}
          variant={BUTTON_VARIANT.outline}
        >
          {CATALOG_MANAGEMENT_COPY.cancelButton}
        </Button>
      </div>
    </form>
  );
}
