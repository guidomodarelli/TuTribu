/** Renders the reviewer detail of a pending request with real UI primitives and a schema-checked review DTO. @module admission-review-eligibility-component-tests */
import { randomUUID } from "node:crypto";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdmissionReview } from "@/components/academy-admissions/admission-review";
import { admissionReviewSchema } from "@/src/modules/academy-admissions/application/results/admission-flow-result-schemas";

const noop = () => {};

describe("admission review eligibility", () => {
  it("should explain that the current rules require the phone the pending request lacks", () => {
    const selected = admissionReviewSchema.parse({ id: randomUUID(), status: "pending", version: 1, submittedAt: "2026-10-16T01:00:00.000Z", expiresAt: "2026-11-15T01:00:00.000Z", source: "common", needsVerification: false, eligibilityReasons: ["whatsapp_number_required"], requiresWhatsappNumber: true, pendingAgeThresholdReached: false, applicant: { id: randomUUID(), name: "Persona sintética" }, eligibleActions: ["reject"], evidence: { kind: "none" }, restrictions: { requiresAllowlist: false, requiresExceptionReason: false, invitation: null } });
    render(<AdmissionReview items={[selected]} selected={selected} hasMore={false} busy={false} disabled={false} confirmed={false} internalReason="" externalMessage="" errorMessage={null} statusMessage={null} uncertain={false} canRetry={false} onSelect={noop} onClose={noop} onRead={noop} onLoadMore={noop} onConfirm={noop} onInternalReason={noop} onExternalMessage={noop} onDecision={noop} onRetry={noop} />);
    expect(screen.getByText("Las reglas actuales exigen el teléfono y esta solicitud no lo tiene. La persona puede completarlo desde su solicitud.")).toBeInTheDocument();
  });
});
