/** A platform refusal of a personal invitation acceptance is definitive: the stored reference is released and nothing is kept uncertain. @module academy-personal-invitation-platform-security-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PersonalInvitationContainer } from "@/app/(admission)/admissions/invitations/[token]/personal-invitation-container";
import { AppUIProvider } from "@/components/providers/app-providers/app-ui-provider";
import type { PersonalInvitationPageState } from "@/src/modules/academy-admissions/application/results/personal-invitation-page-state";
import type { PersonalInvitationBrowserClient } from "@/src/modules/academy-admissions/application/ports/personal-invitation-browser-client";
import type { AdmissionContactBrowserClient } from "@/src/modules/academy-admissions/application/ports/admission-contact-browser-client";
import { createPersonalInvitationBrowserScope } from "@/lib/academy-admissions/personal-invitation-scope";
import { readPersonalInvitationSubmissionIntent } from "@/lib/academy-admissions/personal-invitation-submission-intent";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { PERSONAL_INVITATION_UI_COPY } from "@/src/modules/academy-admissions/constants/personal-invitation-ui";

const PLATFORM_MESSAGE = ADMISSION_ERROR_MESSAGE[ADMISSION_ERROR_CODE.platformSecurityUnavailable];
const TRIBE_SLUG = "synthetic-personal-platform";
const router = { back: vi.fn(), bfcacheId: "personal-platform", forward: vi.fn(), prefetch: vi.fn(), push: vi.fn(), refresh: vi.fn(), replace: vi.fn() } satisfies AppRouterInstance;

/** @param props - Real route contexts and the shared UI provider. @returns The same public boundaries product controls use. */
function Providers({ children, token }: { children: ReactNode; token: string }) {
  return <AppRouterContext.Provider value={router}><PathParamsContext.Provider value={{ token }}><AppUIProvider>{children}</AppUIProvider></PathParamsContext.Provider></AppRouterContext.Provider>;
}

afterEach(() => window.sessionStorage.clear());

/** @returns An available invitation whose acceptance the platform refuses, with doubles of the owned transport ports only. */
function fixture() {
  const token = randomBytes(32).toString("base64url"), viewerId = randomUUID(), now = new Date().toISOString();
  const preview = { state: "available" as const, requiresAllowlist: false, expectedOutcome: "pending" as const, overview: { tribe: { slug: TRIBE_SLUG, name: "Academia sintética", accessModel: "academy" as const }, policy: { mode: "manual_review" as const, contactType: "email" as const, requiresAdditionalVerification: false, isOpen: true, version: 1 }, state: "available" as const, nextAction: "request_admission" as const, safeMessage: "Al confirmar, enviarás una solicitud que deberá revisar el equipo de la academia." } };
  const state: PersonalInvitationPageState = { kind: "ready", preview, viewerId, renderedAt: now };
  const client: PersonalInvitationBrowserClient = {
    viewer: vi.fn(async () => ({ status: "ready" as const, value: { id: viewerId } })),
    overview: vi.fn(async () => ({ status: "ready" as const, value: { viewerId, preview } })),
    submit: vi.fn(async () => ({ status: "failed" as const, code: ADMISSION_ERROR_CODE.platformSecurityUnavailable, message: PLATFORM_MESSAGE, uncertain: false })),
    operation: vi.fn(),
    changeAccount: vi.fn(),
  };
  const contactClient: AdmissionContactBrowserClient = { current: vi.fn(), issue: vi.fn(), verify: vi.fn(), resend: vi.fn(), apply: vi.fn(), operation: vi.fn(), delivery: vi.fn() };
  return { token, viewerId, client, element: <Providers token={token}><PersonalInvitationContainer initialState={state} client={client} contactClient={contactClient} /></Providers> };
}

describe("personal invitation acceptance the platform cannot protect", () => {
  it("should release the refused acceptance, show that it depends on the TuTribu team and allow confirming again", async () => {
    const data = fixture(); render(data.element);
    const confirmation = screen.getByRole("checkbox", { name: /Confirmo que quiero usar esta invitación/i });
    await waitFor(() => expect(confirmation).toBeEnabled());
    fireEvent.click(confirmation); fireEvent.click(screen.getByRole("button", { name: "Confirmar invitación" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(PLATFORM_MESSAGE));
    const personalScope = await createPersonalInvitationBrowserScope(data.token);
    expect(readPersonalInvitationSubmissionIntent({ viewerId: data.viewerId, slug: TRIBE_SLUG, personalScope })).toBeNull();
    expect(screen.queryByText(PERSONAL_INVITATION_UI_COPY.uncertain)).not.toBeInTheDocument();
    expect(data.client.submit).toHaveBeenCalledOnce();
    expect(data.client.operation).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Confirmo que quiero usar esta invitación/i })).toBeEnabled());
  });
});
