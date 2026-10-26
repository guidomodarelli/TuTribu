/** Moves between `GuidedSteps` steps and waits for the exit transition, so it settles inside Testing Library's `act`. */
import { fireEvent, waitFor } from "@testing-library/react";
import { expect } from "vitest";

/**
 * Clicks a step control (Continuar, Atrás) and waits until the leaving step's fieldset is removed. `AnimatePresence`
 * keeps the previous step mounted until its exit finishes, even with reduced motion, and that state update would
 * otherwise land after the test's last assertion, outside `act`.
 * @param control - The step control inside the guided form.
 * @returns After the previous step left the document.
 */
export async function changeGuidedStep(control: HTMLElement): Promise<void> {
  const leavingStep = control.closest("form")?.querySelector("fieldset");
  fireEvent.click(control);
  if (leavingStep) await waitFor(() => expect(leavingStep).not.toBeInTheDocument());
}
