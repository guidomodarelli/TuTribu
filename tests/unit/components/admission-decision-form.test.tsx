/** Exercises that the shared decision form never requires an internal reason to approve or reject. @module admission-decision-form-tests */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdmissionDecisionForm, type AdmissionDecisionFormProps } from "@/components/academy-admissions/admission-decision-form";
import { ADMISSION_REVIEW_UI_COPY } from "@/src/modules/academy-admissions/constants/admission-review-ui";

/** @param overrides - Props that change the scenario. @returns A confirmed, editable form with both decisions available. */
function renderForm(overrides: Partial<AdmissionDecisionFormProps> = {}) {
  render(<AdmissionDecisionForm internalReason="" externalMessage="" confirmed disabled={false} allowApprove allowReject
    onInternalReason={vi.fn()} onExternalMessage={vi.fn()} onConfirm={vi.fn()} onDecision={vi.fn()} {...overrides} />);
}

describe("AdmissionDecisionForm", () => {
  it("should let a confirmed reviewer approve or reject without an internal reason and label the field as optional", () => {
    const onDecision = vi.fn();
    renderForm({ onDecision });

    expect(screen.getByLabelText(/^Motivo interno \(opcional\)$/u)).not.toBeRequired();
    fireEvent.click(screen.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.approve }));
    fireEvent.click(screen.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.reject }));
    expect(onDecision.mock.calls).toEqual([["approve"], ["reject"]]);
  });

  it("should keep both decisions available when the internal reason holds only spaces", () => {
    renderForm({ internalReason: "   " });

    expect(screen.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.approve })).toBeEnabled();
    expect(screen.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.reject })).toBeEnabled();
  });

  it("should keep both decisions disabled until the reviewer confirms, regardless of the internal reason", () => {
    renderForm({ confirmed: false, internalReason: "Revisión registrada" });

    expect(screen.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.approve })).toBeDisabled();
    expect(screen.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.reject })).toBeDisabled();
  });
});
