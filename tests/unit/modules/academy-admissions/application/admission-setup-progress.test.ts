import { describe, expect, it } from "vitest";
import { deriveAdmissionSetupProgress, type AdmissionSetupFacts } from "@/src/modules/academy-admissions/application/queries/admission-setup-progress";

/** A tribe that has not configured anything yet. */
const empty: AdmissionSetupFacts = {
  policy: { exists: false, open: false, paused: false, sendsCodes: false, verifiesPhone: false },
  messaging: { connected: false, usage: null },
  notifications: { emailEnabled: false, receivesEmail: false },
};

const statuses = (facts: AdmissionSetupFacts) => Object.fromEntries(deriveAdmissionSetupProgress(facts).steps.map((step) => [step.id, step.status]));

describe("deriveAdmissionSetupProgress", () => {
  it("starts with the rules and only requires rules and opening when nothing sends messages", () => {
    const progress = deriveAdmissionSetupProgress(empty);

    expect(progress.next).toBe("rules");
    expect(progress.required).toBe(2);
    expect(progress.completed).toBe(0);
    expect(statuses(empty)).toEqual({ rules: "pending", connection: "optional", usage: "optional", open: "pending", notifications: "optional" });
  });

  it("asks to open the admissions after a saved draft that was never activated", () => {
    const draft: AdmissionSetupFacts = { ...empty, policy: { ...empty.policy, exists: true } };

    expect(deriveAdmissionSetupProgress(draft)).toMatchObject({ next: "open", completed: 1, required: 2 });
  });

  it("requires the connection and a notification quota once email notices are on", () => {
    const facts: AdmissionSetupFacts = {
      policy: { exists: true, open: true, paused: false, sendsCodes: false, verifiesPhone: false },
      messaging: { connected: true, usage: { countryCount: 1, verificationDailyLimit: 10, notificationDailyLimit: 0 } },
      notifications: { emailEnabled: true, receivesEmail: true },
    };

    const progress = deriveAdmissionSetupProgress(facts);

    expect(statuses(facts)).toMatchObject({ connection: "done", usage: "pending", notifications: "done" });
    expect(progress).toMatchObject({ next: "usage", required: 4, completed: 3 });
  });

  it("requires countries and a code quota when the rules verify a phone", () => {
    const facts: AdmissionSetupFacts = {
      policy: { exists: true, open: false, paused: false, sendsCodes: true, verifiesPhone: true },
      messaging: { connected: true, usage: { countryCount: 0, verificationDailyLimit: 10, notificationDailyLimit: 0 } },
      notifications: null,
    };

    expect(statuses(facts)).toMatchObject({ connection: "done", usage: "pending", open: "pending" });
    expect(deriveAdmissionSetupProgress(facts).next).toBe("usage");
  });

  it("marks paused admissions as the pending opening step", () => {
    const paused: AdmissionSetupFacts = { ...empty, policy: { ...empty.policy, exists: true, paused: true } };

    expect(deriveAdmissionSetupProgress(paused).steps.find((step) => step.id === "open")).toEqual({ id: "open", status: "pending", paused: true });
  });

  it("points to the recommended notices once the required steps are done, and finishes after them", () => {
    const open: AdmissionSetupFacts = { ...empty, policy: { ...empty.policy, exists: true, open: true } };
    const withNotices: AdmissionSetupFacts = { policy: open.policy, messaging: { connected: true, usage: { countryCount: 1, verificationDailyLimit: 10, notificationDailyLimit: 20 } }, notifications: { emailEnabled: true, receivesEmail: true } };

    expect(deriveAdmissionSetupProgress(open)).toMatchObject({ next: "connection", completed: 2, required: 2 });
    expect(deriveAdmissionSetupProgress(withNotices)).toMatchObject({ next: null, completed: 4, required: 4 });
  });

  it("does not count the omitted personal frequency as receiving email notices", () => {
    const omitted: AdmissionSetupFacts = { ...empty, policy: { ...empty.policy, exists: true, open: true }, notifications: { emailEnabled: true, receivesEmail: false } };

    expect(statuses(omitted).notifications).toBe("optional");
  });
});
