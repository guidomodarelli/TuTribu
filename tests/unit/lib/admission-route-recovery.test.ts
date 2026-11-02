/** @vitest-environment node */

/** Covers the exit each admission or messaging page offers for every closed read failure. */
import { describe, expect, it, vi } from "vitest";
import { resolveAdmissionRouteRecovery } from "@/lib/academy-admissions/admission-route-recovery";
import { messagingSignInCallbackUrl, resolveMessagingRouteRecovery } from "@/lib/messaging/messaging-route-recovery";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";

const ACTIVITY = { pathname: "/synthetic-academy/academia/admissions/activity", search: "limit=100&utm_source=mail" };

describe("admission route recovery", () => {
  it("should offer signing in back to the same address for a missing session, never a reload", () => {
    const recovery = resolveAdmissionRouteRecovery(ADMISSION_ERROR_CODE.authenticationRequired, ACTIVITY);
    expect(recovery.retry).toBeUndefined();
    expect(new URL(recovery.signInHref ?? "", "https://tutribu.example").searchParams.get("callbackUrl")).toBe(`${ACTIVITY.pathname}?${ACTIVITY.search}`);
  });

  it("should offer the page without its query for a refusal caused by the address", () => {
    for (const code of [ADMISSION_ERROR_CODE.invalidInput, ADMISSION_ERROR_CODE.resourceUnavailable, ADMISSION_ERROR_CODE.invitationUnavailable]) {
      expect(resolveAdmissionRouteRecovery(code, ACTIVITY)).toEqual({ initialViewHref: ACTIVITY.pathname });
    }
  });

  it("should offer no retry nor initial view for a permission denial or an invalid link without query", () => {
    expect(resolveAdmissionRouteRecovery(ADMISSION_ERROR_CODE.permissionDenied, ACTIVITY)).toEqual({});
    expect(resolveAdmissionRouteRecovery(ADMISSION_ERROR_CODE.invalidInput, { pathname: "/admissions/invitations/truncated", search: "" })).toEqual({});
    expect(resolveAdmissionRouteRecovery(ADMISSION_ERROR_CODE.platformSecurityUnavailable, ACTIVITY)).toEqual({});
  });

  it("should retry only failures that can pass, including a change between the statements of one read", () => {
    const retry = vi.fn();
    for (const code of [ADMISSION_ERROR_CODE.unexpectedFailure, ADMISSION_ERROR_CODE.dependencyUnavailable, ADMISSION_ERROR_CODE.transportTimeout, ADMISSION_ERROR_CODE.publicContractUnusable, ADMISSION_ERROR_CODE.requestConflict, ADMISSION_ERROR_CODE.policyConflict]) {
      expect(resolveAdmissionRouteRecovery(code, ACTIVITY, retry)).toEqual({ retry });
    }
    expect(resolveAdmissionRouteRecovery(null, ACTIVITY, retry)).toEqual({ retry });
  });

  it("should offer Google sign-in back to the same messaging page for a missing or unusable session, and keep a retry only when the page passes one", () => {
    const usage = { pathname: "/synthetic-academy/academia/admissions/messaging", search: "return=policy-review" }, retry = vi.fn();
    expect(resolveMessagingRouteRecovery(MESSAGING_ERROR_CODE.authenticationRequired, usage)).toEqual({ googleSignInCallbackUrl: `${usage.pathname}?${usage.search}` });
    expect(resolveMessagingRouteRecovery(MESSAGING_ERROR_CODE.authenticationRequired, usage, retry)).toEqual({ googleSignInCallbackUrl: `${usage.pathname}?${usage.search}`, retry });
  });

  it("should never return Google sign-in to an address outside the app", () => {
    for (const pathname of ["//evil.example/academia", "/\\evil.example", "https://evil.example/academia"]) {
      expect(messagingSignInCallbackUrl({ pathname, search: "" })).toBe("/");
    }
    expect(messagingSignInCallbackUrl({ pathname: "/synthetic-academy/academia/admissions/messaging/connections", search: "" })).toBe("/synthetic-academy/academia/admissions/messaging/connections");
  });

  it("should apply the same rule to messaging pages, without retrying invalid input or a missing resource", () => {
    const connections = { pathname: "/synthetic-academy/academia/admissions/messaging/connections", search: "returnTo=rules" };
    expect(resolveMessagingRouteRecovery(MESSAGING_ERROR_CODE.invalidInput, connections)).toEqual({ initialViewHref: connections.pathname });
    expect(resolveMessagingRouteRecovery(MESSAGING_ERROR_CODE.resourceUnavailable, { ...connections, search: "" })).toEqual({});
    expect(resolveMessagingRouteRecovery(MESSAGING_ERROR_CODE.permissionDenied, connections)).toEqual({});
    expect(resolveMessagingRouteRecovery(MESSAGING_ERROR_CODE.unexpectedFailure, connections).retry).toBeTypeOf("function");
  });
});
