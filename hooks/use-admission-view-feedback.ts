"use client";
/** Keeps resource-read recovery separate from action, validation and storage feedback. @module use-admission-view-feedback */
import { useCallback, useState } from "react";
import { ADMISSION_FEEDBACK_ORIGIN, type AdmissionFeedbackOrigin } from "@/src/modules/academy-admissions/constants/admission-ui";

/** Provenance belongs to the feedback owner; rendered message text never classifies an error. */
type AdmissionViewFeedback = { readonly message: string; readonly recoverableByRead: boolean; readonly origin: AdmissionFeedbackOrigin };

/** @returns Stable feedback setters, the step or action that produced the current message, and recovery that clears only an earlier resource-read failure. */
export function useAdmissionViewFeedback() {
  const [feedback, setFeedback] = useState<AdmissionViewFeedback | null>(null);
  /**
   * @param message - Action, validation or storage feedback; null explicitly clears the current message.
   * @param origin - The step, action or field that produced it, so the page can show it there; the page itself by default.
   */
  const setErrorMessage = useCallback((message: string | null, origin: AdmissionFeedbackOrigin = ADMISSION_FEEDBACK_ORIGIN.page) => { setFeedback(message === null ? null : { message, recoverableByRead: false, origin }); }, []);
  /** @param message - Safe failure from the current resource or session read, which belongs to the page. */
  const setReadErrorMessage = useCallback((message: string) => { setFeedback({ message, recoverableByRead: true, origin: ADMISSION_FEEDBACK_ORIGIN.page }); }, []);
  /** Clears a superseded read failure without dismissing unresolved action feedback. */
  const clearReadError = useCallback(() => { setFeedback((current) => current?.recoverableByRead ? null : current); }, []);
  return { errorMessage: feedback?.message ?? null, errorOrigin: feedback?.origin ?? ADMISSION_FEEDBACK_ORIGIN.page, setErrorMessage, setReadErrorMessage, clearReadError };
}
