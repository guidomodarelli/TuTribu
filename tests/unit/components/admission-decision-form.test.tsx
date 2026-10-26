/** Exercises when the shared decision form lets a reviewer approve or reject without an internal reason. @module admission-decision-form-tests */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdmissionDecisionForm, type AdmissionDecisionFormProps } from "@/components/academy-admissions/admission-decision-form";
import { ADMISSION_REVIEW_UI_COPY } from "@/src/modules/academy-admissions/constants/admission-review-ui";

/** @param overrides - Props that change the scenario. @returns A confirmed, editable form with both decisions available. */
function renderForm(overrides: Partial<AdmissionDecisionFormProps> = {}) {
  render(<AdmissionDecisionForm internalReason="" externalMessage="" confirmed disabled={false} allowApprove allowReject
    onInternalReason={vi.fn()} onExternalMessage={vi.fn()} onConfirm={vi.fn()} onDecision={vi.fn()} {...overrides} />);
}

describe("AdmissionDecisionForm", () => {
  it("should let a confirmed reviewer approve without an internal reason while rejecting still needs one", () => {
    renderForm();

    expect(screen.getByLabelText(ADMISSION_REVIEW_UI_COPY.internalReason)).not.toBeRequired();
    expect(screen.getByText(new RegExp(ADMISSION_REVIEW_UI_COPY.internalOptionalHelp))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.approve })).toBeEnabled();
    expect(screen.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.reject })).toBeDisabled();
  });

  it("should require the internal reason before approving an exception", () => {
    renderForm({ approveRequiresReason: true });

    expect(screen.getByLabelText(ADMISSION_REVIEW_UI_COPY.internalReasonRequired)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.approve })).toBeDisabled();
    expect(screen.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.reject })).toBeDisabled();
  });

  it("should enable both decisions once a reason is written for an exception", () => {
    renderForm({ approveRequiresReason: true, internalReason: "Excepción acordada con el equipo" });

    expect(screen.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.approve })).toBeEnabled();
    expect(screen.getByRole("button", { name: ADMISSION_REVIEW_UI_COPY.reject })).toBeEnabled();
  });
});
