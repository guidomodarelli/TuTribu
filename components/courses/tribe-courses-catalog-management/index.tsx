"use client";

import { useCallback, useEffect, useId, useRef, useState, type Dispatch, type RefObject, type SetStateAction, type SubmitEvent } from "react";
import { flushSync } from "react-dom";
import { AnimatePresence } from "motion/react";
import { toast, Button, Input, Switch, Textarea, AnimatedCollapse, AnimatedListItem, cn } from "@golfo/ui";

import { Link } from "@/components/navigation/link";
import { readCourseEntityEntry, sendCourseJson } from "@/lib/courses/course-api";
import { ROUTES } from "@/src/constants/routes";
import {
  COURSE_ACCESS_REQUIREMENT,
  COURSE_DESCRIPTION,
  COURSE_TITLE,
  COURSE_VIEWER_ACCESS_STATUS,
  type CourseAccessRequirement,
} from "@/src/modules/courses/constants/courses";
import { normalizeCourseAccessRequirement } from "@/src/modules/courses/domain/value-objects/course-access-requirement";
import type {
  CourseResult,
  CourseWithModulesResult,
} from "@/src/modules/courses/application/results/course-results";
import styles from "./styles.module.scss";

const CATALOG_MANAGEMENT_COPY = {
  academyBadge: "Academia",
  academyRequirementHint:
    "Solo aplica cuando la tribu funciona en modo academia. En modo clásico todos los integrantes siguen viendo el curso.",
  academyRequirementLabel: "Requiere academia",
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
  titleRequiredError: "Escribí un título para el curso.",
  unexpectedError: "No pudimos completar la acción. Intentá de nuevo.",
} as const;

const EDIT_HEADING_PREFIX = "Editar: ";
const COURSE_ACTIONS_LABEL_PREFIX = "Acciones del curso ";
const SORT_ORDER_META_SEPARATOR = ": ";

const HTTP_METHOD = {
  delete: "DELETE",
  patch: "PATCH",
  post: "POST",
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
  danger: "danger",
  secondary: "secondary",
} as const;
const INPUT_TYPE = {
  number: "number",
} as const;
const NUMERIC_PARSE_RADIX = 10;
const ARIA_ROLE_GROUP = "group";

/**
 * Builds the endpoint that creates courses of a tribe.
 *
 * @param tribeSlug - Tribe slug.
 * @returns Relative endpoint path.
 */
function buildCoursesApiUrl(tribeSlug: string): string {
  return `${COURSES_API.apiTribesPrefix}${tribeSlug}${COURSES_API.coursesSuffix}`;
}

/**
 * Builds the endpoint of a single course.
 *
 * @param tribeSlug - Tribe slug.
 * @param courseId - Course identifier.
 * @returns Relative endpoint path.
 */
function buildCourseApiUrl(tribeSlug: string, courseId: string): string {
  return `${COURSES_API.apiTribesPrefix}${tribeSlug}${COURSES_API.coursesById}${courseId}`;
}

/**
 * Builds the link to the module and lesson management of a course.
 *
 * @param tribeSlug - Tribe slug.
 * @param courseId - Course identifier.
 * @returns Relative page path with the course query parameter.
 */
function buildManageCourseHref(tribeSlug: string, courseId: string): string {
  return `${ROUTES.tribes.coursesManage(tribeSlug)}?${COURSE_MANAGE_QUERY_PARAM}=${courseId}`;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { message?: string } | null;
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
  const entry = readCourseEntityEntry(payload, "course");
  if (!entry) {
    return null;
  }
  return {
    accessRequirement: normalizeCourseAccessRequirement(
      typeof entry.accessRequirement === "string" ? entry.accessRequirement : null
    ),
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
  accessRequirement: CourseAccessRequirement;
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

const MANAGER_VIEWER_ACCESS = {
  completedLessonCount: 0,
  status: COURSE_VIEWER_ACCESS_STATUS.available,
} as const;

function toCourseWithModules(course: CourseResult): CourseWithModulesResult {
  return {
    ...course,
    lastViewedLessonId: null,
    modules: [],
    viewerAccess: MANAGER_VIEWER_ACCESS,
  };
}

type SetCourses = Dispatch<SetStateAction<CourseWithModulesResult[]>>;

/**
 * Removes a course from the list.
 *
 * @param courses - Current courses.
 * @param courseId - Course to remove.
 * @returns The courses without it.
 */
function withoutCourse(
  courses: CourseWithModulesResult[],
  courseId: string
): CourseWithModulesResult[] {
  return courses.filter((course) => course.id !== courseId);
}

/**
 * Replaces one course and keeps the list sorted.
 *
 * @param courses - Current courses.
 * @param courseId - Course to replace.
 * @param replace - Builds the new version from the current one.
 * @returns The sorted courses with the replacement applied.
 */
function replaceCourse(
  courses: CourseWithModulesResult[],
  courseId: string,
  replace: (course: CourseWithModulesResult) => CourseWithModulesResult
): CourseWithModulesResult[] {
  return sortCourses(
    courses.map((course) => (course.id === courseId ? replace(course) : course))
  );
}

/**
 * Puts a deleted course back at its previous position.
 *
 * @param courses - Current courses.
 * @param snapshotIndex - Position the course had before the deletion.
 * @param snapshot - Course as it was before the deletion.
 * @returns The courses with the course restored.
 */
function restoreCourseAt(
  courses: CourseWithModulesResult[],
  snapshotIndex: number,
  snapshot: CourseWithModulesResult
): CourseWithModulesResult[] {
  const next = [...courses];
  next.splice(snapshotIndex, 0, snapshot);
  return next;
}

/**
 * Builds the course shown while its creation is in flight.
 *
 * @param optimisticId - Temporary identifier of the course.
 * @param form - Submitted form values.
 * @returns The optimistic course.
 */
function buildOptimisticCourse(
  optimisticId: string,
  form: CourseFormState
): CourseWithModulesResult {
  return {
    accessRequirement: form.accessRequirement,
    coverImageUrl: form.coverImageUrl || null,
    description: form.description || null,
    id: optimisticId,
    isActive: true,
    lastViewedLessonId: null,
    modules: [],
    sortOrder: form.sortOrder,
    title: form.title,
    viewerAccess: MANAGER_VIEWER_ACCESS,
  };
}

/**
 * Tracks the courses with a request in flight.
 *
 * @returns The pending ids, their setter and the mark and clear helpers.
 */
function usePendingCourseIds() {
  const [pendingCourseIds, setPendingCourseIds] = useState<Set<string>>(
    () => new Set()
  );

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

  return { clearCoursePending, markCoursePending, pendingCourseIds, setPendingCourseIds };
}

/** State and helpers shared by the optimistic course mutations. */
type CourseMutationContext = {
  clearCoursePending: (courseId: string) => void;
  closeCourseEditor: (courseId: string) => void;
  closeNewCourseForm: () => void;
  courses: CourseWithModulesResult[];
  markCoursePending: (courseId: string) => void;
  focusNewCourseButton: () => void;
  setCourses: SetCourses;
  setEditingCourseId: (courseId: string | null) => void;
  setShowNewCourseForm: (isOpen: boolean) => void;
  tribeSlug: string;
};

/**
 * Builds the handler that creates a course optimistically.
 *
 * @param context - Course list state and helpers.
 * @returns The create handler.
 */
function createSubmitNewCourse(context: CourseMutationContext) {
  const { clearCoursePending, markCoursePending, setCourses } = context;

  const discardOptimisticCourse = (optimisticId: string) => {
    setCourses((current) => withoutCourse(current, optimisticId));
    clearCoursePending(optimisticId);
  };

  return async (form: CourseFormState) => {
    const optimisticId = generateOptimisticId();
    const optimisticCourse = buildOptimisticCourse(optimisticId, form);
    setCourses((current) => sortCourses([...current, optimisticCourse]));
    markCoursePending(optimisticId);

    try {
      const response = await sendCourseJson(buildCoursesApiUrl(context.tribeSlug), HTTP_METHOD.post, {
        accessRequirement: form.accessRequirement,
        coverImageUrl: form.coverImageUrl,
        description: form.description,
        sortOrder: form.sortOrder,
        title: form.title,
      });

      if (!response.ok) {
        discardOptimisticCourse(optimisticId);
        toast.error(await readErrorMessage(response));
        context.setShowNewCourseForm(true);
        return;
      }

      const payload: unknown = await response.json().catch(() => null);
      const serverCourse = readCourseFromResponse(payload);
      if (!serverCourse) {
        discardOptimisticCourse(optimisticId);
        toast.error(CATALOG_MANAGEMENT_COPY.unexpectedError);
        return;
      }
      setCourses((current) =>
        replaceCourse(current, optimisticId, () => toCourseWithModules(serverCourse))
      );
      clearCoursePending(optimisticId);
      context.closeNewCourseForm();
      toast.success(CATALOG_MANAGEMENT_COPY.courseCreatedMessage);
    } catch {
      discardOptimisticCourse(optimisticId);
      toast.error(CATALOG_MANAGEMENT_COPY.unexpectedError);
    }
  };
}

/**
 * Builds the handler that updates a course optimistically and restores it on failure.
 *
 * @param context - Course list state and helpers.
 * @returns The update handler.
 */
function createSubmitCourseUpdate(context: CourseMutationContext) {
  const { clearCoursePending, markCoursePending, setCourses } = context;

  return async (courseId: string, form: CourseFormState) => {
    const snapshot = context.courses.find((course) => course.id === courseId);
    if (!snapshot) {
      return;
    }
    const restoreSnapshot = () => {
      setCourses((current) => replaceCourse(current, courseId, () => snapshot));
      clearCoursePending(courseId);
    };
    setCourses((current) =>
      replaceCourse(current, courseId, (course) => ({
        ...course,
        accessRequirement: form.accessRequirement,
        coverImageUrl: form.coverImageUrl || null,
        description: form.description || null,
        isActive: form.isActive,
        sortOrder: form.sortOrder,
        title: form.title,
      }))
    );
    markCoursePending(courseId);

    try {
      const response = await sendCourseJson(buildCourseApiUrl(context.tribeSlug, courseId), HTTP_METHOD.patch, {
        accessRequirement: form.accessRequirement,
        coverImageUrl: form.coverImageUrl,
        description: form.description,
        isActive: form.isActive,
        sortOrder: form.sortOrder,
        title: form.title,
      });

      if (!response.ok) {
        restoreSnapshot();
        toast.error(await readErrorMessage(response));
        context.setEditingCourseId(courseId);
        return;
      }

      const payload: unknown = await response.json().catch(() => null);
      const serverCourse = readCourseFromResponse(payload);
      if (serverCourse) {
        setCourses((current) =>
          replaceCourse(current, courseId, (course) => ({ ...course, ...serverCourse }))
        );
      }
      clearCoursePending(courseId);
      context.closeCourseEditor(courseId);
      toast.success(CATALOG_MANAGEMENT_COPY.courseUpdatedMessage);
    } catch {
      restoreSnapshot();
      toast.error(CATALOG_MANAGEMENT_COPY.unexpectedError);
    }
  };
}

/**
 * Builds the handler that deletes a course after confirmation and restores it on failure.
 *
 * @param context - Course list state and helpers.
 * @returns The delete handler.
 */
function createDeleteCourse(context: CourseMutationContext) {
  const { clearCoursePending, courses, markCoursePending, setCourses } = context;

  return async (courseId: string) => {
    if (!window.confirm(CATALOG_MANAGEMENT_COPY.deleteCourseConfirm)) {
      return;
    }
    const snapshot = courses.find((course) => course.id === courseId);
    const snapshotIndex = courses.findIndex((course) => course.id === courseId);
    if (!snapshot) {
      return;
    }
    const restoreSnapshot = () => {
      setCourses((current) => restoreCourseAt(current, snapshotIndex, snapshot));
      clearCoursePending(courseId);
    };
    setCourses((current) => withoutCourse(current, courseId));
    markCoursePending(courseId);
    // The focused delete button leaves with its row; keep focus on the page.
    context.focusNewCourseButton();

    try {
      const response = await fetch(buildCourseApiUrl(context.tribeSlug, courseId), {
        method: HTTP_METHOD.delete,
      });
      if (!response.ok) {
        restoreSnapshot();
        toast.error(await readErrorMessage(response));
        return;
      }
      clearCoursePending(courseId);
      toast.success(CATALOG_MANAGEMENT_COPY.courseDeletedMessage);
    } catch {
      restoreSnapshot();
      toast.error(CATALOG_MANAGEMENT_COPY.unexpectedError);
    }
  };
}

/**
 * Keeps the catalog list, its in-flight requests and which form is open,
 * resetting them when the server sends another catalog or tribe.
 *
 * @param initialCourses - Courses rendered by the server.
 * @param tribeSlug - Tribe slug used by the endpoints.
 * @returns The catalog state, the focus helpers and the mutation handlers.
 */
function useCatalogManagement(
  initialCourses: CourseWithModulesResult[],
  tribeSlug: string
) {
  const [courses, setCourses] =
    useState<CourseWithModulesResult[]>(initialCourses);
  const [syncedInitialCourses, setSyncedInitialCourses] =
    useState(initialCourses);
  const [syncedTribeSlug, setSyncedTribeSlug] = useState(tribeSlug);
  const { clearCoursePending, markCoursePending, pendingCourseIds, setPendingCourseIds } =
    usePendingCourseIds();
  const [showNewCourseForm, setShowNewCourseForm] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  // Controls that must regain focus once the form that replaced them closes.
  const newCourseButtonRef = useRef<HTMLButtonElement>(null);
  const courseIdToRefocusRef = useRef<string | null>(null);

  const closeNewCourseForm = () => {
    // The new course button stays disabled while the form is open: commit the
    // close first so the button can take focus again.
    flushSync(() => setShowNewCourseForm(false));
    newCourseButtonRef.current?.focus();
  };

  const closeCourseEditor = (courseId: string) => {
    courseIdToRefocusRef.current = courseId;
    setEditingCourseId(null);
  };

  const focusEditButtonAfterEditing =
    (courseId: string) => (editButton: HTMLButtonElement | null) => {
      if (editButton && courseIdToRefocusRef.current === courseId) {
        courseIdToRefocusRef.current = null;
        editButton.focus();
      }
    };

  if (syncedInitialCourses !== initialCourses || syncedTribeSlug !== tribeSlug) {
    setSyncedInitialCourses(initialCourses);
    setSyncedTribeSlug(tribeSlug);
    setCourses(initialCourses);
    setPendingCourseIds(new Set());
    setShowNewCourseForm(false);
    setEditingCourseId(null);
  }

  const focusNewCourseButton = () => {
    newCourseButtonRef.current?.focus();
  };

  const mutationContext: CourseMutationContext = {
    clearCoursePending, closeCourseEditor, closeNewCourseForm, courses, focusNewCourseButton,
    markCoursePending, setCourses, setEditingCourseId, setShowNewCourseForm, tribeSlug,
  };

  // The handlers are built when called, so render never touches the refs the
  // mutation helpers focus.
  return {
    closeCourseEditor, closeNewCourseForm, courses,
    deleteCourse: (courseId: string) => createDeleteCourse(mutationContext)(courseId),
    editingCourseId, focusEditButtonAfterEditing, newCourseButtonRef, pendingCourseIds,
    setEditingCourseId, setShowNewCourseForm, showNewCourseForm,
    submitCourseUpdate: (courseId: string, form: CourseFormState) =>
      createSubmitCourseUpdate(mutationContext)(courseId, form),
    submitNewCourse: (form: CourseFormState) => createSubmitNewCourse(mutationContext)(form),
  };
}

type CatalogManagementState = Omit<ReturnType<typeof useCatalogManagement>, "newCourseButtonRef">;

/**
 * Renders the title, badges, order and description of a course row.
 *
 * @param props - Course and whether a request is in flight.
 * @returns The course summary.
 */
function CourseSummary({
  course,
  isCoursePending,
}: {
  course: CourseWithModulesResult;
  isCoursePending: boolean;
}) {
  return (
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
        {course.accessRequirement ===
        COURSE_ACCESS_REQUIREMENT.academy ? (
          <span
            className={
              styles.TribeCoursesCatalogManagement__inactiveBadge
            }
          >
            {CATALOG_MANAGEMENT_COPY.academyBadge}
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
        {CATALOG_MANAGEMENT_COPY.sortOrderLabel}
        {SORT_ORDER_META_SEPARATOR}
        {course.sortOrder}
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
  );
}

type CourseRowProps = {
  catalog: CatalogManagementState;
  course: CourseWithModulesResult;
  tribeSlug: string;
};

/**
 * Renders the manage, edit and delete actions of a course row.
 *
 * @param props - Catalog state, course, whether it is locked and tribe slug.
 * @returns The course actions group.
 */
function CourseActions({
  catalog,
  course,
  isCourseLocked,
  tribeSlug,
}: CourseRowProps & { isCourseLocked: boolean }) {
  return (
    <div
      aria-label={COURSE_ACTIONS_LABEL_PREFIX + course.title}
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
        onClick={() => catalog.setEditingCourseId(course.id)}
        ref={catalog.focusEditButtonAfterEditing(course.id)}
        type={FORM_BUTTON_TYPE.button}
        variant={BUTTON_VARIANT.secondary}
      >
        {CATALOG_MANAGEMENT_COPY.editButton}
      </Button>
      <Button
        disabled={isCourseLocked}
        onClick={() => catalog.deleteCourse(course.id)}
        type={FORM_BUTTON_TYPE.button}
        variant={BUTTON_VARIANT.danger}
      >
        {CATALOG_MANAGEMENT_COPY.deleteButton}
      </Button>
    </div>
  );
}

/**
 * Renders one course of the catalog, as its summary or its inline editor.
 *
 * @param props - Catalog state, course and tribe slug.
 * @returns The animated course list item.
 */
function CourseRow({ catalog, course, tribeSlug }: CourseRowProps) {
  const isCoursePending = catalog.pendingCourseIds.has(course.id);
  const isCourseLocked = isCoursePending || isOptimisticId(course.id);

  return (
    <AnimatedListItem
      aria-busy={isCoursePending || undefined}
      className={cn(
        styles.TribeCoursesCatalogManagement__courseItem,
        isCoursePending &&
          styles["TribeCoursesCatalogManagement__courseItem--pending"]
      )}
    >
      {catalog.editingCourseId === course.id ? (
        <CourseForm
          headingLabel={`${EDIT_HEADING_PREFIX}${course.title}`}
          initialState={{
            accessRequirement: course.accessRequirement,
            coverImageUrl: course.coverImageUrl ?? "",
            description: course.description ?? "",
            isActive: course.isActive,
            sortOrder: course.sortOrder,
            title: course.title,
          }}
          isEditing
          onCancel={() => catalog.closeCourseEditor(course.id)}
          onSubmit={(form) => catalog.submitCourseUpdate(course.id, form)}
        />
      ) : (
        <div className={styles.TribeCoursesCatalogManagement__courseHeader}>
          <CourseSummary course={course} isCoursePending={isCoursePending} />
          <CourseActions
            catalog={catalog}
            course={course}
            isCourseLocked={isCourseLocked}
            tribeSlug={tribeSlug}
          />
        </div>
      )}
    </AnimatedListItem>
  );
}

/**
 * Renders the page heading, the public view link and the new course button.
 *
 * @param props - Catalog state and tribe slug.
 * @returns The page header.
 */
function CatalogManagementHeader({
  catalog,
  newCourseButtonRef,
  tribeSlug,
}: Omit<CourseRowProps, "course"> & {
  newCourseButtonRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
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
        disabled={catalog.showNewCourseForm}
        onClick={() => catalog.setShowNewCourseForm(true)}
        ref={newCourseButtonRef}
        type={FORM_BUTTON_TYPE.button}
      >
        {CATALOG_MANAGEMENT_COPY.newCourseButton}
      </Button>
    </header>
  );
}

/**
 * Leader-facing course catalog editor with optimistic create, update and
 * delete, animated list changes and focus kept on the affected control.
 *
 * @param props - Initial courses and tribe slug.
 * @returns Course catalog management page content.
 */
export function TribeCoursesCatalogManagement({
  initialCourses,
  tribeSlug,
}: TribeCoursesCatalogManagementProps) {
  const { newCourseButtonRef, ...catalog } = useCatalogManagement(initialCourses, tribeSlug);
  const { courses, showNewCourseForm } = catalog;

  return (
    <main className={styles.TribeCoursesCatalogManagement}>
      <CatalogManagementHeader
        catalog={catalog}
        newCourseButtonRef={newCourseButtonRef}
        tribeSlug={tribeSlug}
      />

      <AnimatedCollapse isOpen={showNewCourseForm}>
        <CourseForm
          headingLabel={CATALOG_MANAGEMENT_COPY.createCourseHeading}
          initialState={{
            accessRequirement: COURSE_ACCESS_REQUIREMENT.membership,
            coverImageUrl: "",
            description: "",
            isActive: true,
            sortOrder: courses.length,
            title: "",
          }}
          isEditing={false}
          onCancel={catalog.closeNewCourseForm}
          onSubmit={catalog.submitNewCourse}
        />
      </AnimatedCollapse>

      {courses.length === 0 && !showNewCourseForm ? (
        <p className={styles.TribeCoursesCatalogManagement__emptyState}>
          {CATALOG_MANAGEMENT_COPY.emptyState}
        </p>
      ) : null}

      <ul className={styles.TribeCoursesCatalogManagement__courseList}>
        <AnimatePresence initial={false}>
          {courses.map((course) => (
            <CourseRow
              catalog={catalog}
              course={course}
              key={course.id}
              tribeSlug={tribeSlug}
            />
          ))}
        </AnimatePresence>
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

/**
 * Keeps the course form values, focuses the title on open and validates that
 * the title is not blank before calling `onSubmit`.
 *
 * @param initialState - Initial form values.
 * @param onSubmit - Receives the validated values.
 * @returns The form values, their setters and the submit handler.
 */
function useCourseFormState(
  initialState: CourseFormState,
  onSubmit: CourseFormProps["onSubmit"]
) {
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [title, setTitle] = useState(initialState.title);
  const [description, setDescription] = useState(initialState.description);
  const [coverImageUrl, setCoverImageUrl] = useState(
    initialState.coverImageUrl
  );
  const [sortOrder, setSortOrder] = useState(initialState.sortOrder);
  const [isActive, setIsActive] = useState(initialState.isActive);
  const [accessRequirement, setAccessRequirement] = useState(
    initialState.accessRequirement
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Guards against a second submit landing before the disabled state renders.
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    titleInputRef.current?.focus();
  }, []);

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isSubmittingRef.current) {
      return;
    }

    const trimmedTitle = title.trim();

    if (trimmedTitle.length === 0) {
      setTitleError(CATALOG_MANAGEMENT_COPY.titleRequiredError);
      titleInputRef.current?.focus();
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      await onSubmit({
        accessRequirement,
        coverImageUrl: coverImageUrl.trim(),
        description,
        isActive,
        sortOrder,
        title: trimmedTitle,
      });
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return {
    accessRequirement, coverImageUrl, description, handleSubmit, isActive, isSubmitting,
    setAccessRequirement, setCoverImageUrl, setDescription, setIsActive, setSortOrder,
    setTitle, setTitleError, sortOrder, title, titleError, titleInputRef,
  };
}

type CourseFormFieldsProps = {
  formState: Omit<ReturnType<typeof useCourseFormState>, "titleInputRef">;
  isEditing: boolean;
};

/**
 * Renders the title, description, cover and order fields of the course form.
 *
 * @param props - Component props.
 * @param props.formState - Form values and setters.
 * @param props.titleInputRef - Title input, focused on open and on a blank title.
 * @returns The text fields.
 */
function CourseTextFields({
  formState,
  titleInputRef,
}: Pick<CourseFormFieldsProps, "formState"> & {
  titleInputRef: RefObject<HTMLInputElement | null>;
}) {
  return (
    <>
      <Input
        error={formState.titleError ?? undefined}
        label={CATALOG_MANAGEMENT_COPY.titleLabel}
        maxLength={COURSE_TITLE.maxLength}
        onChange={(event) => {
          formState.setTitle(event.target.value);
          formState.setTitleError(null);
        }}
        placeholder={CATALOG_MANAGEMENT_COPY.titlePlaceholder}
        ref={titleInputRef}
        required
        value={formState.title}
      />
      <Textarea
        label={CATALOG_MANAGEMENT_COPY.descriptionLabel}
        maxLength={COURSE_DESCRIPTION.maxLength}
        onChange={(event) => formState.setDescription(event.target.value)}
        placeholder={CATALOG_MANAGEMENT_COPY.descriptionPlaceholder}
        rows={2}
        value={formState.description}
      />
      <Input
        label={CATALOG_MANAGEMENT_COPY.coverLabel}
        onChange={(event) => formState.setCoverImageUrl(event.target.value)}
        placeholder={CATALOG_MANAGEMENT_COPY.coverPlaceholder}
        type="url"
        value={formState.coverImageUrl}
      />
      <Input
        label={CATALOG_MANAGEMENT_COPY.sortOrderLabel}
        min={0}
        onChange={(event) =>
          formState.setSortOrder(
            Number.parseInt(event.target.value, NUMERIC_PARSE_RADIX) || 0
          )
        }
        type={INPUT_TYPE.number}
        value={formState.sortOrder}
      />
    </>
  );
}

/**
 * Renders the active switch (when editing) and the academy requirement switch.
 *
 * @param props - Form values and whether the form edits an existing course.
 * @returns The switches with the academy hint.
 */
function CourseAccessFields({ formState, isEditing }: CourseFormFieldsProps) {
  const academyHintId = useId();

  return (
    <>
      {isEditing ? (
        <label className={styles.TribeCoursesCatalogManagement__formSwitch}>
          <Switch checked={formState.isActive} onCheckedChange={formState.setIsActive} />
          <span>{CATALOG_MANAGEMENT_COPY.activeLabel}</span>
        </label>
      ) : null}
      <label className={styles.TribeCoursesCatalogManagement__formSwitch}>
        <Switch
          aria-describedby={academyHintId}
          checked={formState.accessRequirement === COURSE_ACCESS_REQUIREMENT.academy}
          onCheckedChange={(checked) =>
            formState.setAccessRequirement(
              checked
                ? COURSE_ACCESS_REQUIREMENT.academy
                : COURSE_ACCESS_REQUIREMENT.membership
            )
          }
        />
        <span>{CATALOG_MANAGEMENT_COPY.academyRequirementLabel}</span>
      </label>
      <p
        className={styles.TribeCoursesCatalogManagement__courseMeta}
        id={academyHintId}
      >
        {CATALOG_MANAGEMENT_COPY.academyRequirementHint}
      </p>
    </>
  );
}

/**
 * Create or edit form of a course. Focuses the title on open and validates
 * that the title is not blank before calling `onSubmit`.
 *
 * @param props - Heading, initial values, mode and callbacks.
 * @returns Course form.
 */
function CourseForm({
  headingLabel,
  initialState,
  isEditing,
  onCancel,
  onSubmit,
}: CourseFormProps) {
  const { titleInputRef, ...formState } = useCourseFormState(initialState, onSubmit);
  const { isSubmitting } = formState;

  return (
    <form
      aria-busy={isSubmitting || undefined}
      className={cn(
        styles.TribeCoursesCatalogManagement__form,
        isEditing && styles["TribeCoursesCatalogManagement__form--inline"]
      )}
      noValidate
      onSubmit={formState.handleSubmit}
    >
      <h3 className={styles.TribeCoursesCatalogManagement__formHeading}>
        {headingLabel}
      </h3>
      <CourseTextFields formState={formState} titleInputRef={titleInputRef} />
      <CourseAccessFields formState={formState} isEditing={isEditing} />
      <div className={styles.TribeCoursesCatalogManagement__formActions}>
        <Button
          aria-busy={isSubmitting || undefined}
          disabled={isSubmitting}
          type={FORM_BUTTON_TYPE.submit}
        >
          {isEditing
            ? CATALOG_MANAGEMENT_COPY.saveButton
            : CATALOG_MANAGEMENT_COPY.createButton}
        </Button>
        <Button
          disabled={isSubmitting}
          onClick={onCancel}
          type={FORM_BUTTON_TYPE.button}
          variant={BUTTON_VARIANT.secondary}
        >
          {CATALOG_MANAGEMENT_COPY.cancelButton}
        </Button>
      </div>
    </form>
  );
}
