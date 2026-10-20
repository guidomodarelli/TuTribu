"use client";
/** Lets product screens open the mounted problem-report widget without owning or importing it. @module siteping-report-launcher */

/** Opener of the currently mounted widget; absent while the member has no reporting access or the widget is loading. */
let currentOpener: (() => void) | null = null;

/**
 * Registers the mounted widget's opener.
 *
 * @param open - Opens the widget panel.
 * @returns A cleanup that unregisters only this opener.
 */
export function registerSitepingReportLauncher(open: () => void): () => void {
  currentOpener = open;
  return () => { if (currentOpener === open) currentOpener = null; };
}

/** @returns True when the widget was opened; false when reporting is not available for this member right now. */
export function openSitepingReport(): boolean {
  if (!currentOpener) return false;
  currentOpener();
  return true;
}
