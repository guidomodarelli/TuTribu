"use client";

import { type FormEvent, useState } from "react";

import { Button, Dialog, DialogContent, Input, Select, Textarea, AnimatedCollapse, PresenceSwap } from "@golfo/ui";

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
  sizeSmall: "sm",
  typeButton: "button",
  typeSubmit: "submit",
  variantGhost: "ghost",
  variantSecondary: "secondary",
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
  retry: "Reintentar",
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
  const [courseId, setCourseId] = useState(EMPTY_VALUE);
  const [courseModuleId, setCourseModuleId] = useState(EMPTY_VALUE);
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState(defaultDescription);
  const [invalidFieldId, setInvalidFieldId] = useState<LessonRequiredFieldId | null>(null);
  // Closing resets the conversion state in the same update, but the dialog
  // stays on screen while it animates out: the body keeps rendering the last
  // open view so it does not flash "Cargando cursos…" on its way out.
  const [retainedView, setRetainedView] = useState<LessonConversionView>({
    convertedLesson: openConvertedLesson,
    targetsState: openTargetsState,
  });

  if (
    isOpen &&
    (retainedView.convertedLesson !== openConvertedLesson ||
      retainedView.targetsState !== openTargetsState)
  ) {
    setRetainedView({ convertedLesson: openConvertedLesson, targetsState: openTargetsState });
  }

  const { convertedLesson, targetsState } = isOpen
    ? { convertedLesson: openConvertedLesson, targetsState: openTargetsState }
    : retainedView;
  const courses =
    targetsState.status === TRIBE_EVENT_POST_EVENT_LOAD_STATUS.loaded ? targetsState.courses : [];
  const coursesWithModules = courses.filter((course) => course.modules.length > 0);
  const selectedCourse = coursesWithModules.find((course) => course.id === courseId) ?? null;

  const handleSubmit = (submitEvent: FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault();

    if (isSubmitting) {
      return;
    }

    const missingFieldId = findFirstMissingField(selectedCourse !== null, courseModuleId, title);

    if (!selectedCourse || missingFieldId) {
      const fieldToFix = missingFieldId ?? FIELD_ID.course;
      const control = submitEvent.currentTarget.elements.namedItem(fieldToFix);

      setInvalidFieldId(fieldToFix);

      if (control instanceof HTMLElement) {
        control.focus();
      }

      return;
    }

    onSubmit({
      courseId: selectedCourse.id,
      courseModuleId,
      description: description.trim() || null,
      title: title.trim(),
    });
  };

  /** ARIA wiring that ties a required control to the validation message. */
  const getValidationProps = (fieldId: LessonRequiredFieldId) =>
    invalidFieldId === fieldId
      ? { "aria-describedby": FIELD_ID.validationError, "aria-invalid": true }
      : {};

  const bodyPresenceKey = convertedLesson
    ? BODY_PRESENCE_KEY.result
    : targetsState.status === TRIBE_EVENT_POST_EVENT_LOAD_STATUS.error
      ? BODY_PRESENCE_KEY.error
      : targetsState.status === TRIBE_EVENT_POST_EVENT_LOAD_STATUS.loaded
        ? coursesWithModules.length === 0
          ? BODY_PRESENCE_KEY.empty
          : BODY_PRESENCE_KEY.form
        : BODY_PRESENCE_KEY.loading;

  const renderBody = () => {
    if (convertedLesson) {
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
      return (
        <div className={styles.TribeEventLessonConversionDialog__result}>
          <p className={styles.TribeEventLessonConversionDialog__error} role="alert">
            {targetsState.message}
          </p>
          <Button
            size={BUTTON_ATTRIBUTE.sizeSmall}
            type={BUTTON_ATTRIBUTE.typeButton}
            variant={BUTTON_ATTRIBUTE.variantSecondary}
            onClick={onRetry}
          >
            {COPY.retry}
          </Button>
        </div>
      );
    }

    if (coursesWithModules.length === 0) {
      return <p className={styles.TribeEventLessonConversionDialog__muted}>{COPY.noCourses}</p>;
    }

    return (
      // Native validation is off so a missing field reaches the Spanish inline
      // message; `required` still marks the mandatory title for assistive tech.
      <form
        className={styles.TribeEventLessonConversionDialog__form}
        noValidate
        onSubmit={handleSubmit}
      >
        <Select
          {...getValidationProps(FIELD_ID.course)}
          id={FIELD_ID.course}
          label={COPY.courseLabel}
          options={coursesWithModules.map((course) => ({ label: course.title, value: course.id }))}
          placeholder={COPY.coursePlaceholder}
          value={courseId}
          onValueChange={(value) => {
            const course = coursesWithModules.find((candidate) => candidate.id === value);

            // Radix mirrors the choice into a hidden native select that can
            // report an empty value while the options are unmounted.
            if (!course) {
              return;
            }

            setInvalidFieldId(null);
            setCourseId(value);
            // A course with a single module preselects it.
            setCourseModuleId(course.modules.length === 1 ? course.modules[0].id : EMPTY_VALUE);
          }}
        />
        <Select
          {...getValidationProps(FIELD_ID.module)}
          disabled={!selectedCourse}
          id={FIELD_ID.module}
          label={COPY.moduleLabel}
          options={(selectedCourse?.modules ?? []).map((courseModule) => ({
            label: courseModule.title,
            value: courseModule.id,
          }))}
          placeholder={COPY.modulePlaceholder}
          value={courseModuleId}
          onValueChange={(value) => {
            if (!value) {
              return;
            }

            setInvalidFieldId(null);
            setCourseModuleId(value);
          }}
        />
        <Input
          {...getValidationProps(FIELD_ID.title)}
          id={FIELD_ID.title}
          label={COPY.titleLabel}
          maxLength={COURSE_LESSON_TITLE.maxLength}
          required
          value={title}
          onChange={(event) => {
            setInvalidFieldId(null);
            setTitle(event.currentTarget.value);
          }}
        />
        <Textarea
          id={FIELD_ID.description}
          label={COPY.descriptionLabel}
          maxLength={COURSE_LESSON_DESCRIPTION.maxLength}
          value={description}
          onChange={(event) => setDescription(event.currentTarget.value)}
        />
        <AnimatedCollapse isOpen={invalidFieldId !== null}>
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
