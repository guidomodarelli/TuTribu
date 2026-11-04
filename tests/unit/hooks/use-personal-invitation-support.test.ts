/** Exercises the settlement of a personal invitation initialization that ran out of time. @module use-personal-invitation-support-tests */
import { describe, expect, it, vi } from "vitest";
import { settlePersonalInitialization } from "@/hooks/use-personal-invitation-support";
import type { PersonalInvitationSubmissionIntent } from "@/lib/academy-admissions/personal-invitation-submission-intent";
import { PERSONAL_INVITATION_UI_COPY } from "@/src/modules/academy-admissions/constants/personal-invitation-ui";
import { BROWSER_REQUEST_TRANSPORT_MESSAGE } from "@/src/constants/browser-request";

/** @param pending - Original still unresolved, if any. @returns Refs of an initialization that timed out while it owned the workflow. */
function timedOutInitialization(pending: PersonalInvitationSubmissionIntent | null) {
  const initialization = new AbortController(); initialization.abort();
  const refs = { controllerRef: { current: initialization as AbortController | null }, busyRef: { current: true }, activeRef: { current: true }, pendingRef: { current: pending } };
  return { initialization, refs, setters: { setPhase: vi.fn(), setErrorMessage: vi.fn() } };
}

describe("personal invitation initialization timeout", () => {
  it("should report an interrupted read, not an original, when nothing was sent", () => {
    const data = timedOutInitialization(null);
    settlePersonalInitialization(data.refs, data.initialization, data.setters);
    expect(data.setters.setPhase).toHaveBeenCalledWith("idle");
    expect(data.setters.setErrorMessage).toHaveBeenCalledWith(BROWSER_REQUEST_TRANSPORT_MESSAGE);
    expect(data.refs.busyRef.current).toBe(false);
  });

  it("should keep asking to read the original when one stays unresolved", () => {
    const data = timedOutInitialization({ viewerId: "synthetic-viewer", slug: "synthetic-academy", personalScope: "a".repeat(64), operationId: "7a4d8b2f-3c5e-4d9f-8a21-2b3c4d5e6f70" });
    settlePersonalInitialization(data.refs, data.initialization, data.setters);
    expect(data.setters.setPhase).toHaveBeenCalledWith("uncertain");
    expect(data.setters.setErrorMessage).toHaveBeenCalledWith(PERSONAL_INVITATION_UI_COPY.uncertain);
  });
});
