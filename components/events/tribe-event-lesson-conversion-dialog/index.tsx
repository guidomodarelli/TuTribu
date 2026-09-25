"use client";

import { type FormEvent, useState } from "react";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "beez-ui";

import { Link } from "@/components/navigation/link";
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
} as const;
const BUTTON_ATTRIBUTE = {
  sizeSmall: "sm",
  typeButton: "button",
  typeSubmit: "submit",
  variantGhost: "ghost",
  variantOutline: "outline",
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
 * "Convertir en lección": picks a course and a module of the tribe and
 * creates a lesson with the recording video and the prefilled event copy.
 * When the occurrence already had a lesson in that course, it links to it.
 */
export function TribeEventLessonConversionDialog({
  convertedLesson,
  defaultDescription,
  defaultTitle,
  isOpen,
  isSubmitting,
  onClose,
  onRetry,
  onSubmit,
  targetsState,
}: TribeEventLessonConversionDialogProps) {
  const [courseId, setCourseId] = useState(EMPTY_VALUE);
  const [courseModuleId, setCourseModuleId] = useState(EMPTY_VALUE);
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState(defaultDescription);
  const [validationError, setValidationError] = useState<string | null>(null);
  const courses =
    targetsState.status === TRIBE_EVENT_POST_EVENT_LOAD_STATUS.loaded ? targetsState.courses : [];
  const coursesWithModules = courses.filter((course) => course.modules.length > 0);
  const selectedCourse = coursesWithModules.find((course) => course.id === courseId) ?? null;

  const handleSubmit = (submitEvent: FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault();

    if (isSubmitting) {
      return;
    }

    if (!selectedCourse || !courseModuleId || !title.trim()) {
      setValidationError(COPY.missingFields);
      return;
    }

    onSubmit({
      courseId: selectedCourse.id,
      courseModuleId,
      description: description.trim() || null,
      title: title.trim(),
    });
  };

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
            <Button asChild>
              <Link href={convertedLesson.lesson.href}>{COPY.openLesson}</Link>
            </Button>
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
            variant={BUTTON_ATTRIBUTE.variantOutline}
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
      <form className={styles.TribeEventLessonConversionDialog__form} onSubmit={handleSubmit}>
        <div className={styles.TribeEventLessonConversionDialog__field}>
          <label htmlFor={FIELD_ID.course}>{COPY.courseLabel}</label>
          <Select
            value={courseId}
            onValueChange={(value) => {
              const course = coursesWithModules.find((candidate) => candidate.id === value);

              // Radix mirrors the choice into a hidden native select that can
              // report an empty value while the options are unmounted.
              if (!course) {
                return;
              }

              setValidationError(null);
              setCourseId(value);
              // A course with a single module preselects it.
              setCourseModuleId(course.modules.length === 1 ? course.modules[0].id : EMPTY_VALUE);
            }}
          >
            <SelectTrigger className={styles.TribeEventLessonConversionDialog__select} id={FIELD_ID.course}>
              <SelectValue placeholder={COPY.coursePlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {coursesWithModules.map((course) => (
                <SelectItem key={course.id} value={course.id}>
                  {course.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className={styles.TribeEventLessonConversionDialog__field}>
          <label htmlFor={FIELD_ID.module}>{COPY.moduleLabel}</label>
          <Select
            disabled={!selectedCourse}
            value={courseModuleId}
            onValueChange={(value) => {
              if (!value) {
                return;
              }

              setValidationError(null);
              setCourseModuleId(value);
            }}
          >
            <SelectTrigger className={styles.TribeEventLessonConversionDialog__select} id={FIELD_ID.module}>
              <SelectValue placeholder={COPY.modulePlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {(selectedCourse?.modules ?? []).map((courseModule) => (
                <SelectItem key={courseModule.id} value={courseModule.id}>
                  {courseModule.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className={styles.TribeEventLessonConversionDialog__field}>
          <label htmlFor={FIELD_ID.title}>{COPY.titleLabel}</label>
          <Input
            id={FIELD_ID.title}
            maxLength={COURSE_LESSON_TITLE.maxLength}
            required
            value={title}
            onChange={(event) => {
              setValidationError(null);
              setTitle(event.currentTarget.value);
            }}
          />
        </div>
        <div className={styles.TribeEventLessonConversionDialog__field}>
          <label htmlFor={FIELD_ID.description}>{COPY.descriptionLabel}</label>
          <Textarea
            className={styles.TribeEventLessonConversionDialog__textarea}
            id={FIELD_ID.description}
            maxLength={COURSE_LESSON_DESCRIPTION.maxLength}
            value={description}
            onChange={(event) => setDescription(event.currentTarget.value)}
          />
        </div>
        {validationError ? (
          <p className={styles.TribeEventLessonConversionDialog__error} role="alert">
            {validationError}
          </p>
        ) : null}
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
      <DialogContent className={styles.TribeEventLessonConversionDialog}>
        <DialogHeader>
          <DialogTitle>{COPY.title}</DialogTitle>
          <DialogDescription>{COPY.description}</DialogDescription>
        </DialogHeader>
        {renderBody()}
      </DialogContent>
    </Dialog>
  );
}
