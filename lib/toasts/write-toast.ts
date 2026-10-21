"use client";
/** Ties one write's lifecycle to a single `toast.promise`, decided by the write's own confirmed outcome. @module write-toast */
import { toast } from "@golfo/ui";

/**
 * How a finished write is announced: a confirmed success or a failure the person can act on, or nothing when the
 * screen keeps the state itself (an unconfirmed original, a changed account, a conflict shown next to the form).
 */
export type WriteToastOutcome = { kind: "success" | "error"; message: string } | { kind: "silent" };

/** A write whose toast is still loading; `finish` settles it exactly once. */
export type WriteToast = {
  /** Records the outcome to announce; the last call before `finish` wins. */
  announce: (outcome: WriteToastOutcome) => void;
  /** Settles the toast with the announced outcome, or dismisses it when nothing was announced. */
  finish: () => void;
};

/** Neither a success nor an actionable failure: the loading toast is dismissed and the screen keeps the state. */
export const WRITE_TOAST_SILENT: WriteToastOutcome = { kind: "silent" };

/** Thrown into the tracked promise so `toast.promise` shows its error variant with the write's own message. */
class WriteToastFailure extends Error {}

/**
 * Starts the loading toast of one write. The outcome is announced while the write runs, because one write
 * can end in several branches; `toast.promise` reads the message only when the tracked promise settles.
 *
 * @param loading - Progress copy shown while the write is in flight.
 * @returns Controls to record the outcome and settle the toast once.
 */
export function startWriteToast(loading: string): WriteToast {
  let outcome: WriteToastOutcome = WRITE_TOAST_SILENT, settled = false, settle: () => void = () => {};
  const tracked = new Promise<string>((resolve, reject) => {
    settle = () => {
      if (outcome.kind === "success") resolve(outcome.message);
      else if (outcome.kind === "error") reject(new WriteToastFailure(outcome.message));
      else resolve("");
    };
  });
  // `success` and `error` stay undefined for a silent outcome, so Sonner dismisses the loading toast instead.
  const data: Parameters<typeof toast.promise<string>>[1] = { loading };
  void tracked.then(() => {}, () => {});
  toast.promise(tracked, data);
  return {
    announce: (next) => { if (!settled) outcome = next; },
    finish: () => {
      if (settled) return;
      settled = true;
      if (outcome.kind === "success") data.success = (message: string) => message;
      if (outcome.kind === "error") data.error = (error: unknown) => error instanceof Error ? error.message : "";
      settle();
    },
  };
}
