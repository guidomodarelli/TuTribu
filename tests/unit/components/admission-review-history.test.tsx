/** Renders the request history timeline with real UI primitives and safe retained facts. @module admission-review-history-component-tests */
import { randomUUID } from "node:crypto";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdmissionReviewHistory } from "@/components/academy-admissions/admission-review-history";
import type { AdmissionReviewHistoryItemDto } from "@/src/modules/academy-admissions/constants/admission-review-history-schemas";

/** @param overrides - Event facts under test. @returns One retained history item. */
function historyItem(overrides: Partial<AdmissionReviewHistoryItemDto>): AdmissionReviewHistoryItemDto {
  return { id: randomUUID(), eventType: "pending_created", fromStatus: null, toStatus: "pending", resourceVersion: 1, actorKind: "account", createdAt: "2026-10-16T01:00:00.000Z", ...overrides };
}

describe("request history timeline", () => {
  it("should name a phone correction without a transition that kept the status, and keep real transitions", () => {
    render(<AdmissionReviewHistory items={[historyItem({ eventType: "whatsapp_number_changed", fromStatus: "pending", toStatus: "pending", resourceVersion: 2 }), historyItem({ eventType: "approved", fromStatus: "pending", toStatus: "approved", resourceVersion: 3 })]} checking={false} refreshDisabled={false} errorMessage={null} backHref="/synthetic-academy/academia/admissions" olderHref={null} newestHref={null} onRefresh={() => {}} />);
    const [correction, approval] = screen.getAllByRole("listitem");
    expect(correction).toHaveTextContent("Teléfono de WhatsApp actualizado");
    expect(correction).not.toHaveTextContent("Estado anterior");
    expect(correction).not.toHaveTextContent("Evento conservado");
    expect(approval).toHaveTextContent("Estado anterior");
    expect(approval).toHaveTextContent("Estado posterior");
  });
});
