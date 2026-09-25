"use client";

import { useRef, useState } from "react";
import { toast } from "beez-ui";

import {
  convertRecordingToLessonRequest,
  fetchLessonConversionTargetsRequest,
} from "@/lib/events/tribe-event-post-event-api-client";
import {
  TRIBE_EVENT_POST_EVENT_LOAD_STATUS,
  type TribeEventOnDemandLoadState,
} from "@/lib/events/tribe-event-post-event-state";
import type {
  LessonConversionResponse,
  LessonConversionTargetsResponse,
} from "@/src/modules/courses/application/results/lesson-event-source-public-dto-schemas";
import type { LessonFromEventRequestBody } from "@/src/modules/courses/infrastructure/api/lesson-event-source-request-schemas";

const COPY = {
  convertFailure: "No pudimos crear la lección. Intentá de nuevo.",
  loadFailure: "No pudimos cargar los cursos.",
} as const;

export type TribeEventLessonConversionPayload = Omit<
  LessonFromEventRequestBody,
  "eventId" | "occurrenceStartsAt"
>;

type TargetsLoadState = TribeEventOnDemandLoadState<{
  courses: LessonConversionTargetsResponse["courses"];
}>;

const IDLE_STATE = { status: TRIBE_EVENT_POST_EVENT_LOAD_STATUS.idle } as const;

/**
 * "Convertir en lección": loads the courses and modules on demand (when the
 * dialog opens, with an AbortController) and sends the conversion once at a
 * time. The result carries the lesson link, also when the occurrence already
 * had a lesson in that course (`isExisting`), and is shown only while the
 * dialog session that submitted it is still the current one.
 *
 * @param input - Tribe and occurrence of the recording.
 * @returns Targets state, submitting flag, the converted lesson, and actions.
 */
export function useTribeEventLessonConversion(input: {
  eventId: string;
  originalStartsAt: string;
  tribeSlug: string;
}) {
  const [targetsState, setTargetsState] = useState<TargetsLoadState>(IDLE_STATE);
  const [convertedLesson, setConvertedLesson] = useState<LessonConversionResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  // Dialog session generation. It only grows (opening or closing starts a new
  // session), so a conversion that finishes after its dialog was closed never
  // matches the session of a dialog reopened meanwhile.
  const dialogSessionRef = useRef(0);

  const loadTargets = () => {
    abortControllerRef.current?.abort();
    dialogSessionRef.current += 1;

    const abortController = new AbortController();

    abortControllerRef.current = abortController;
    setConvertedLesson(null);
    setTargetsState({ status: TRIBE_EVENT_POST_EVENT_LOAD_STATUS.loading });
    fetchLessonConversionTargetsRequest(input.tribeSlug, abortController.signal)
      .then((result) => {
        if (abortController.signal.aborted) {
          return;
        }

        setTargetsState(
          result.isSuccess
            ? { courses: result.courses, status: TRIBE_EVENT_POST_EVENT_LOAD_STATUS.loaded }
            : {
                message: result.message ?? COPY.loadFailure,
                status: TRIBE_EVENT_POST_EVENT_LOAD_STATUS.error,
              }
        );
      })
      .catch(() => {
        // Aborted loads are expected (dialog closed or reopened).
        if (!abortController.signal.aborted) {
          setTargetsState({
            message: COPY.loadFailure,
            status: TRIBE_EVENT_POST_EVENT_LOAD_STATUS.error,
          });
        }
      });
  };

  const reset = () => {
    abortControllerRef.current?.abort();
    dialogSessionRef.current += 1;
    abortControllerRef.current = null;
    setTargetsState(IDLE_STATE);
    setConvertedLesson(null);
  };

  const convert = async (payload: TribeEventLessonConversionPayload): Promise<boolean> => {
    if (isSubmittingRef.current) {
      return false;
    }

    const submittingDialogSession = dialogSessionRef.current;

    isSubmittingRef.current = true;
    setIsSubmitting(true);

    try {
      const result = await convertRecordingToLessonRequest(input.tribeSlug, {
        ...payload,
        eventId: input.eventId,
        occurrenceStartsAt: input.originalStartsAt,
      });

      if (!result.isSuccess) {
        toast.error(result.message ?? COPY.convertFailure);
        return false;
      }

      // Only the dialog session that submitted shows the result: a dialog
      // reopened while the request was pending keeps its own form. The toast
      // still reports the lesson that was created.
      if (dialogSessionRef.current === submittingDialogSession) {
        setConvertedLesson(result);
      }

      if (result.isExisting) {
        toast.info(result.message);
      } else {
        toast.success(result.message);
      }

      return true;
    } catch {
      toast.error(COPY.convertFailure);
      return false;
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return { convert, convertedLesson, isSubmitting, loadTargets, reset, targetsState };
}
