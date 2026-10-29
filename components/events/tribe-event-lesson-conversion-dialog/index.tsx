"use client";

import { type SubmitEvent, useState } from "react";

import { Button, Dialog, DialogContent, Input, Select, Textarea, AnimatedCollapse, PresenceSwap } from "@golfo/ui";

import { TribeEventRetryButton } from "@/components/events/tribe-event-retry-button";
import { ButtonLink } from "@/components/navigation/link";
import {
  TRIBE_EVENT_POST_EVENT_LOAD_STATUS,
  type TribeEventOnDemandLoadState,
} from "@/lib/events/tribe-event-post-event-state";
import type {
  LessonConversionResponse,
  LessonConversionTargetsResponse,
} from "@/src/modules/courses/application/results/lesson-event-source-public-dto-schemas";
import {
  COURSE_LESSON_DESCRIPTION,
  COURSE_LESSON_TITLE,
} from "@/src/modules/courses/constants/courses";
import styles from "./styles.module.scss";

export type TribeEventLessonConversionFormPayload = {
  courseId: string;
  courseModuleId: string;
  description: string | null;
  title: string;
};

type TribeEventLessonConversionDialogProps = {
  convertedLesson: LessonConversionResponse | null;
  defaultDescription: string;
  defaultTitle: string;
  isOpen: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onRetry: () => void;
  onSubmit: (payload: TribeEventLessonConversionFormPayload) => void;
  targetsState: TribeEventOnDemandLoadState<{
    courses: LessonConversionTargetsResponse["courses"];
  }>;
};

const EMPTY_VALUE = "";
const FIELD_ID = {
  course: "tribe-event-lesson-course",
  description: "tribe-event-lesson-description",
  module: "tribe-event-lesson-module",
  title: "tribe-event-lesson-title",
  validationError: "tribe-event-lesson-validation-error",
} as const;

/** Required controls that the validation message can point at. */
type LessonRequiredFieldId =
  | typeof FIELD_ID.course
  | typeof FIELD_ID.module
  | typeof FIELD_ID.title;

/** Body states of the dialog; changing between them cross-fades the body. */
const BODY_PRESENCE_KEY = {
  empty: "empty",
  error: "error",
  form: "form",
  loading: "loading",
  result: "result",
} as const;

/** Data the body renders, frozen while the dialog animates out. */
type LessonConversionView = Pick<
  TribeEventLessonConversionDialogProps,
  "convertedLesson" | "targetsState"
>;
const BUTTON_ATTRIBUTE = {
  typeButton: "button",
  typeSubmit: "submit",
  variantGhost: "ghost",
} as const;
const COPY = {
  cancelButton: "Cancelar",
  closeButton: "Cerrar",
  courseLabel: "Curso",
  coursePlaceholder: "Elegí un curso",
  description:
    "Se crea una lección con el video de la grabación. Podés ajustar el título y la descripción antes de guardarla.",
  descriptionLabel: "Descripción (opcional)",
  existing: "Esta grabación ya era una lección de ese curso.",
  loading: "Cargando cursos…",
  missingFields: "Elegí un curso, un módulo y escribí el título de la lección.",
  moduleLabel: "Módulo",
  modulePlaceholder: "Elegí un módulo",
  noCourses:
    "La tribu todavía no tiene cursos con módulos. Creá uno desde Cursos para poder convertir la grabación.",
  openLesson: "Ver lección",
  submitButton: "Crear lección",
  submittingButton: "Creando…",
  success: "La lección ya está en el curso.",
  title: "Convertir en lección",
  titleLabel: "Título de la lección",
} as const;

/**
 * First required control still missing, in reading order (course, module,
 * title), or null when all of them are filled.
 */
function findFirstMissingField(
  hasCourse: boolean,
  courseModuleId: string,
  title: string
): LessonRequiredFieldId | null {
  if (!hasCourse) {
    return FIELD_ID.course;
  }

  if (!courseModuleId) {
    return FIELD_ID.module;
  }

  return title.trim() ? null : FIELD_ID.title;
}

type LessonConversionCourse = LessonConversionTargetsResponse["courses"][number];

/** ARIA wiring that ties a required control to the validation message. */
function getValidationProps(
  invalidFieldId: LessonRequiredFieldId | null,
  fieldId: LessonRequiredFieldId
) {
  return invalidFieldId === fieldId
    ? { "aria-describedby": FIELD_ID.validationError, "aria-invalid": true }
    : {};
}

/** Body state the dialog shows; changing it cross-fades the body. */
function resolveBodyPresenceKey(
  { convertedLesson, targetsState }: LessonConversionView,
  courseWithModulesCount: number
) {
  if (convertedLesson) {
    return BODY_PRESENCE_KEY.result;
  }

  if (targetsState.status === TRIBE_EVENT_POST_EVENT_LOAD_STATUS.error) {
    return BODY_PRESENCE_KEY.error;
  }

  if (targetsState.status !== TRIBE_EVENT_POST_EVENT_LOAD_STATUS.loaded) {
    return BODY_PRESENCE_KEY.loading;
  }

  return courseWithModulesCount === 0 ? BODY_PRESENCE_KEY.empty : BODY_PRESENCE_KEY.form;
}

/**
 * Closing resets the conversion state in the same update, but the dialog
 * stays on screen while it animates out: the body keeps rendering the last
 * open view so it does not flash "Cargando cursos…" on its way out.
 *
 * @param isOpen - Whether the dialog is open.
 * @param openView - Conversion state received from the container.
 * @returns The view the body must render.
 */
function useRetainedConversionView(isOpen: boolean, openView: LessonConversionView): LessonConversionView {
  const [retainedView, setRetainedView] = useState<LessonConversionView>(openView);

  if (
    isOpen &&
    (retainedView.convertedLesson !== openView.convertedLesson ||
      retainedView.targetsState !== openView.targetsState)
  ) {
    setRetainedView({ convertedLesson: openView.convertedLesson, targetsState: openView.targetsState });
  }

  return isOpen
    ? { convertedLesson: openView.convertedLesson, targetsState: openView.targetsState }
    : retainedView;
}

/**
 * Values of the conversion form. They live in the dialog, not in the form,
 * so they survive while the body swaps between states.
 */
function useLessonConversionFormState(defaultTitle: string, defaultDescription: string) {
  const [courseId, setCourseId] = useState(EMPTY_VALUE);
  const [courseModuleId, setCourseModuleId] = useState(EMPTY_VALUE);
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState(defaultDescription);
  const [invalidFieldId, setInvalidFieldId] = useState<LessonRequiredFieldId | null>(null);

  return {
    courseId,
    courseModuleId,
    description,
    invalidFieldId,
    setCourseId,
    setCourseModuleId,
    setDescription,
    setInvalidFieldId,
    setTitle,
    title,
  };
}

type LessonConversionFormState = ReturnType<typeof useLessonConversionFormState>;

type LessonConversionResultProps = {
  convertedLesson: LessonConversionResponse;
  onClose: () => void;
};

/** Created (or already existing) lesson with a link to it. */
function LessonConversionResult({ convertedLesson, onClose }: LessonConversionResultProps) {
  return (
    <div className={styles.TribeEventLessonConversionDialog__result}>
      <p className={styles.TribeEventLessonConversionDialog__resultText} role="status">
        {convertedLesson.isExisting ? COPY.existing : COPY.success}
      </p>
      <div className={styles.TribeEventLessonConversionDialog__actions}>
        <Button type={BUTTON_ATTRIBUTE.typeButton} variant={BUTTON_ATTRIBUTE.variantGhost} onClick={onClose}>
          {COPY.closeButton}
        </Button>
        <ButtonLink href={convertedLesson.lesson.href}>{COPY.openLesson}</ButtonLink>
      </div>
    </div>
  );
}

/** Courses failed to load, with a retry. */
function LessonConversionTargetsError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className={styles.TribeEventLessonConversionDialog__result}>
      <p className={styles.TribeEventLessonConversionDialog__error} role="alert">
        {message}
      </p>
      <TribeEventRetryButton onRetry={onRetry} />
    </div>
  );
}

type LessonConversionTargetSelectsProps = {
  coursesWithModules: LessonConversionCourse[];
  form: LessonConversionFormState;
  selectedCourse: LessonConversionCourse | null;
};

/** Course and module pickers; a course with a single module preselects it. */
function LessonConversionTargetSelects({
  coursesWithModules,
  form,
  selectedCourse,
}: LessonConversionTargetSelectsProps) {
  return (
    <>
      <Select
        {...getValidationProps(form.invalidFieldId, FIELD_ID.course)}
        id={FIELD_ID.course}
        label={COPY.courseLabel}
        options={coursesWithModules.map((course) => ({ label: course.title, value: course.id }))}
        placeholder={COPY.coursePlaceholder}
        value={form.courseId}
        onValueChange={(value) => {
          const course = coursesWithModules.find((candidate) => candidate.id === value);

          // Radix mirrors the choice into a hidden native select that can
          // report an empty value while the options are unmounted.
          if (!course) {
            return;
          }

          form.setInvalidFieldId(null);
          form.setCourseId(value);
          // A course with a single module preselects it.
          form.setCourseModuleId(course.modules.length === 1 ? course.modules[0].id : EMPTY_VALUE);
        }}
      />
      <Select
        {...getValidationProps(form.invalidFieldId, FIELD_ID.module)}
        disabled={!selectedCourse}
        id={FIELD_ID.module}
        label={COPY.moduleLabel}
        options={(selectedCourse?.modules ?? []).map((courseModule) => ({
          label: courseModule.title,
          value: courseModule.id,
        }))}
        placeholder={COPY.modulePlaceholder}
        value={form.courseModuleId}
        onValueChange={(value) => {
          if (!value) {
            return;
          }

          form.setInvalidFieldId(null);
          form.setCourseModuleId(value);
        }}
      />
    </>
  );
}

type LessonConversionFormProps = Pick<
  TribeEventLessonConversionDialogProps,
  "isSubmitting" | "onClose" | "onSubmit"
> &
  LessonConversionTargetSelectsProps;

/** Course, module, title and description of the lesson to create. */
function LessonConversionForm({
  coursesWithModules,
  form,
  isSubmitting,
  onClose,
  onSubmit,
  selectedCourse,
}: LessonConversionFormProps) {
  const handleSubmit = (submitEvent: SubmitEvent<HTMLFormElement>) => {
    submitEvent.preventDefault();

    if (isSubmitting) {
      return;
    }

    const missingFieldId = findFirstMissingField(selectedCourse !== null, form.courseModuleId, form.title);

    if (!selectedCourse || missingFieldId) {
      const fieldToFix = missingFieldId ?? FIELD_ID.course;
      const control = submitEvent.currentTarget.elements.namedItem(fieldToFix);

      form.setInvalidFieldId(fieldToFix);

      if (control instanceof HTMLElement) {
        control.focus();
      }

      return;
    }

    onSubmit({
      courseId: selectedCourse.id,
      courseModuleId: form.courseModuleId,
      description: form.description.trim() || null,
      title: form.title.trim(),
    });
  };

  return (
    // Native validation is off so a missing field reaches the Spanish inline
    // message; `required` still marks the mandatory title for assistive tech.
    <form
      className={styles.TribeEventLessonConversionDialog__form}
      noValidate
      onSubmit={handleSubmit}
    >
      <LessonConversionTargetSelects
        coursesWithModules={coursesWithModules}
        form={form}
        selectedCourse={selectedCourse}
      />
      <Input
        {...getValidationProps(form.invalidFieldId, FIELD_ID.title)}
        id={FIELD_ID.title}
        label={COPY.titleLabel}
        maxLength={COURSE_LESSON_TITLE.maxLength}
        required
        value={form.title}
        onChange={(event) => {
          form.setInvalidFieldId(null);
          form.setTitle(event.currentTarget.value);
        }}
      />
      <Textarea
        id={FIELD_ID.description}
        label={COPY.descriptionLabel}
        maxLength={COURSE_LESSON_DESCRIPTION.maxLength}
        value={form.description}
        onChange={(event) => form.setDescription(event.currentTarget.value)}
      />
      <AnimatedCollapse isOpen={form.invalidFieldId !== null}>
        <p
          className={styles.TribeEventLessonConversionDialog__error}
          id={FIELD_ID.validationError}
          role="alert"
        >
          {COPY.missingFields}
        </p>
      </AnimatedCollapse>
      <div className={styles.TribeEventLessonConversionDialog__actions}>
        <Button type={BUTTON_ATTRIBUTE.typeButton} variant={BUTTON_ATTRIBUTE.variantGhost} onClick={onClose}>
          {COPY.cancelButton}
        </Button>
        <Button disabled={isSubmitting} type={BUTTON_ATTRIBUTE.typeSubmit}>
          {isSubmitting ? COPY.submittingButton : COPY.submitButton}
        </Button>
      </div>
    </form>
  );
}

/**
 * "Convertir en lección": picks a course and a module of the tribe and
 * creates a lesson with the recording video and the prefilled event copy.
 * When the occurrence already had a lesson in that course, it links to it.
 * Loading, error, form and result cross-fade; a missing field is reported
 * under the form, marked invalid and focused.
 */
export function TribeEventLessonConversionDialog({
  convertedLesson: openConvertedLesson,
  defaultDescription,
  defaultTitle,
  isOpen,
  isSubmitting,
  onClose,
  onRetry,
  onSubmit,
  targetsState: openTargetsState,
}: TribeEventLessonConversionDialogProps) {
  const form = useLessonConversionFormState(defaultTitle, defaultDescription);
  const view = useRetainedConversionView(isOpen, {
    convertedLesson: openConvertedLesson,
    targetsState: openTargetsState,
  });
  const { convertedLesson, targetsState } = view;
  const courses =
    targetsState.status === TRIBE_EVENT_POST_EVENT_LOAD_STATUS.loaded ? targetsState.courses : [];
  const coursesWithModules = courses.filter((course) => course.modules.length > 0);
  const selectedCourse = coursesWithModules.find((course) => course.id === form.courseId) ?? null;
  const bodyPresenceKey = resolveBodyPresenceKey(view, coursesWithModules.length);

  const renderBody = () => {
    if (convertedLesson) {
      return <LessonConversionResult convertedLesson={convertedLesson} onClose={onClose} />;
    }

    if (
      targetsState.status === TRIBE_EVENT_POST_EVENT_LOAD_STATUS.loading ||
      targetsState.status === TRIBE_EVENT_POST_EVENT_LOAD_STATUS.idle
    ) {
      return (
        <p className={styles.TribeEventLessonConversionDialog__muted} role="status">
          {COPY.loading}
        </p>
      );
    }

    if (targetsState.status === TRIBE_EVENT_POST_EVENT_LOAD_STATUS.error) {
      return <LessonConversionTargetsError message={targetsState.message} onRetry={onRetry} />;
    }

    if (coursesWithModules.length === 0) {
      return <p className={styles.TribeEventLessonConversionDialog__muted}>{COPY.noCourses}</p>;
    }

    return (
      <LessonConversionForm
        coursesWithModules={coursesWithModules}
        form={form}
        isSubmitting={isSubmitting}
        selectedCourse={selectedCourse}
        onClose={onClose}
        onSubmit={onSubmit}
      />
    );
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent
        className={styles.TribeEventLessonConversionDialog}
        title={COPY.title}
        description={COPY.description}
      >
        <PresenceSwap presenceKey={bodyPresenceKey}>{renderBody()}</PresenceSwap>
      </DialogContent>
    </Dialog>
  );
}
