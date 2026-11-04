import { describe, expect, it } from "vitest";

import { buildAccountChangeSignInUrl, buildSignInRedirectUrl } from "@/lib/auth/sign-in-redirect";
import type { AdmissionPageState } from "@/src/modules/academy-admissions/application/results/admission-page-state";
import { resolveAccountChangeReturnPath } from "@/lib/academy-admissions/admission-account-change";
import { withGoogleAccountChooser } from "@/src/modules/auth/infrastructure/better-auth/client";

describe("buildSignInRedirectUrl", () => {
  it("encodes the return path so its own query string survives sign-in", () => {
    expect(
      buildSignInRedirectUrl("/matematica-pro/eventos?month=2026-05&event=abc@2026")
    ).toBe(
      "/auth/signin?callbackUrl=%2Fmatematica-pro%2Feventos%3Fmonth%3D2026-05%26event%3Dabc%402026"
    );
  });
});

describe("account change sign-in", () => {
  it("asks for the Google account chooser and keeps the return path", () => {
    const url = new URL(buildAccountChangeSignInUrl("/admissions/synthetic-academy"), "https://tutribu.app");
    expect(url.pathname).toBe("/auth/signin");
    expect(url.searchParams.get("callbackUrl")).toBe("/admissions/synthetic-academy");
    expect(url.searchParams.get("selectAccount")).toBe("1");
  });

  it("sends the new account to the academy entry instead of the request of the account that left", () => {
    const state: AdmissionPageState = { kind: "ready", viewerId: "synthetic-viewer", renderedAt: "2026-10-07T01:00:00Z", request: { id: "7a4d8b2f-3c5e-4d9f-8a21-2b3c4d5e6f70", status: "rejected", version: 2, submittedAt: "2026-10-01T01:00:00Z", expiresAt: "2026-10-31T01:00:00Z", source: "common", needsVerification: false, eligibilityReasons: [] }, overview: { tribe: { slug: "synthetic-academy", name: "Academia sintética", accessModel: "academy" }, policy: null, state: "closed", nextAction: "change_account", safeMessage: "Ingresá con otra cuenta." } };
    expect(resolveAccountChangeReturnPath({ state })).toBe("/admissions/synthetic-academy");
    expect(resolveAccountChangeReturnPath({ state, arrivalReturnPath: "/admissions/synthetic-academy/legacy/token" })).toBe("/admissions/synthetic-academy/legacy/token");
  });

  it("adds the account chooser to the Google authorization URL without dropping its state", () => {
    const url = new URL(withGoogleAccountChooser("https://accounts.google.com/o/oauth2/v2/auth?client_id=synthetic&state=opaque-state&prompt=consent&access_type=offline"));
    expect(url.searchParams.get("prompt")).toBe("select_account consent");
    expect(url.searchParams.get("state")).toBe("opaque-state");
    expect(url.searchParams.get("access_type")).toBe("offline");
  });
});
