"use client";
/** Keeps resource-read recovery separate from action, validation and storage feedback. @module use-admission-view-feedback */
import { useCallback, useState } from "react";

/** Provenance belongs to the feedback owner; rendered message text never classifies an error. */
type AdmissionViewFeedback = { readonly message: string; readonly recoverableByRead: boolean };

/** @returns Stable feedback setters and recovery that clears only an earlier resource-read failure. */
export function useAdmissionViewFeedback() {
  const [feedback, setFeedback] = useState<AdmissionViewFeedback | null>(null);
  /** @param message - Action, validation or storage feedback; null explicitly clears the current message. */
  const setErrorMessage = useCallback((message: string | null) => { setFeedback(message === null ? null : { message, recoverableByRead: false }); }, []);
  /** @param message - Safe failure from the current resource or session read. */
  const setReadErrorMessage = useCallback((message: string) => { setFeedback({ message, recoverableByRead: true }); }, []);
  /** Clears a superseded read failure without dismissing unresolved action feedback. */
  const clearReadError = useCallback(() => { setFeedback((current) => current?.recoverableByRead ? null : current); }, []);
  return { errorMessage: feedback?.message ?? null, setErrorMessage, setReadErrorMessage, clearReadError };
}
