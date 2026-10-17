/** @vitest-environment node */
/** Exercises the persisted diagnostic envelope without reading source text or exporting private browser errors. @module admission-whatsapp-browser-errors-tests */
import { describe, expect, it } from "vitest";
import { observeAdmissionWhatsappBrowserError } from "@/tests/support/admission-whatsapp-browser-errors";
import { ADMISSION_WHATSAPP_BROWSER_PHASE } from "@/tests/support/constants/admission-whatsapp-number";

describe("native WhatsApp browser diagnostics", () => {
  it("should correlate a native fetch error without preserving its private request URL", () => {
    const correctionUrl = "http://127.0.0.1:1234/api/tribes/private-tribe/admissions/requests/private-request/whatsapp";
    const error = new Error(`${correctionUrl.slice("http:".length)} due to access control checks.`);
    error.name = "Fetch API cannot load http";
    const result = observeAdmissionWhatsappBrowserError(error, { phase: ADMISSION_WHATSAPP_BROWSER_PHASE.correction, leaderSurface: false, origin: "http://127.0.0.1:1234", submissionUrl: null, correctionUrl, accountUrls: new Set() });

    expect(result).toMatchObject({ name: "NativeFetchError", phase: "correction", sameOrigin: true, matchesCorrection: true, matchesSubmission: false, matchesAccountProbe: false, accessControl: true, canceled: false });
    expect(JSON.stringify(result)).not.toContain(correctionUrl);
    expect(result).not.toHaveProperty("message");
    expect(result).not.toHaveProperty("stack");
  });

  it("should retain only three public chunk frames when a JavaScript error contains private text", () => {
    const error = new TypeError("Private invitation token and private@example.invalid");
    error.stack = `${error.name}: ${error.message}\n at http://127.0.0.1:1234/_next/static/chunks/first.js:1:10\n at http://127.0.0.1:1234/_next/static/chunks/second.js:2:20\n at http://127.0.0.1:1234/_next/static/chunks/third.js:3:30\n at http://127.0.0.1:1234/_next/static/chunks/fourth.js:4:40`;
    const result = observeAdmissionWhatsappBrowserError(error, { phase: ADMISSION_WHATSAPP_BROWSER_PHASE.personal, leaderSurface: false, origin: "http://127.0.0.1:1234", submissionUrl: null, correctionUrl: null, accountUrls: new Set() });

    expect(result.frames).toEqual([{ chunk: "first.js", line: 1, column: 10 }, { chunk: "second.js", line: 2, column: 20 }, { chunk: "third.js", line: 3, column: 30 }]);
    expect(result.name).toBe("TypeError");
    expect(JSON.stringify(result)).not.toContain("private");
    expect(JSON.stringify(result)).not.toContain("127.0.0.1");
  });

  it("should distinguish native cancellation wording without exporting the account URL", () => {
    const accountUrl = "http://127.0.0.1:1234/api/auth/get-session";
    const error = new Error(`${accountUrl.slice("http:".length)} Request cancelled.`);
    error.name = "Fetch API cannot load http";
    const result = observeAdmissionWhatsappBrowserError(error, { phase: ADMISSION_WHATSAPP_BROWSER_PHASE.personalNavigation, leaderSurface: false, origin: "http://127.0.0.1:1234", submissionUrl: null, correctionUrl: null, accountUrls: new Set([accountUrl]) });

    expect(result).toMatchObject({ name: "NativeFetchError", phase: "personal_navigation", matchesAccountProbe: true, accessControl: false, canceled: true });
    expect(JSON.stringify(result)).not.toContain(accountUrl);
  });

  it("should exclude private URL values and ordinary JavaScript text from native transport wording", () => {
    const error = new Error("//127.0.0.1:1234/api/auth/get-session?private=aborted Network failure.");
    error.name = "Fetch API cannot load http";
    const context = { phase: ADMISSION_WHATSAPP_BROWSER_PHASE.personalNavigation, leaderSurface: false, origin: "http://127.0.0.1:1234", submissionUrl: null, correctionUrl: null, accountUrls: new Set<string>() };

    expect(observeAdmissionWhatsappBrowserError(error, context)).toMatchObject({ name: "NativeFetchError", accessControl: false, canceled: false });
    expect(observeAdmissionWhatsappBrowserError(new TypeError("Private abort or access control text"), context)).toMatchObject({ name: "TypeError", accessControl: false, canceled: false });
  });

  it("should exclude message text and foreign frames even when they contain the own chunk path", () => {
    const error = new TypeError("private https://foreign.invalid/_next/static/chunks/private-reference.js:1:2");
    error.stack = `${error.name}: ${error.message}\n at foreign (https://foreign.invalid/_next/static/chunks/foreign-reference.js:3:4)\n at real (http://127.0.0.1:1234/_next/static/chunks/real.js:5:6)`;
    const result = observeAdmissionWhatsappBrowserError(error, { phase: ADMISSION_WHATSAPP_BROWSER_PHASE.common, leaderSurface: false, origin: "http://127.0.0.1:1234", submissionUrl: null, correctionUrl: null, accountUrls: new Set() });

    expect(result.frames).toEqual([{ chunk: "real.js", line: 5, column: 6 }]);
    expect(JSON.stringify(result)).not.toContain("private-reference");
    expect(JSON.stringify(result)).not.toContain("foreign-reference");
    expect(JSON.stringify(result)).not.toContain("foreign.invalid");
  });

  it("should exclude a complete multiline message before extracting a Safari frame", () => {
    const error = new TypeError("private\n at http://127.0.0.1:1234/_next/static/chunks/message-reference.js:1:2");
    error.stack = `${error.name}: ${error.message}\n actual@http://127.0.0.1:1234/_next/static/chunks/actual.js:3:4`;
    const result = observeAdmissionWhatsappBrowserError(error, { phase: ADMISSION_WHATSAPP_BROWSER_PHASE.common, leaderSurface: false, origin: "http://127.0.0.1:1234", submissionUrl: null, correctionUrl: null, accountUrls: new Set() });

    expect(result.frames).toEqual([{ chunk: "actual.js", line: 3, column: 4 }]);
    expect(JSON.stringify(result)).not.toContain("message-reference");
    expect(JSON.stringify(result)).not.toContain("private");
  });

  it("should preserve URL ownership when at signs occur in foreign paths or credentials", () => {
    const error = new TypeError("A controlled diagnostic error");
    error.stack = `${error.name}: ${error.message}\n at foreign (https://foreign.invalid/path@http://127.0.0.1:1234/_next/static/chunks/private-reference.js:1:2)\n foreign@https://foreign.invalid/path@http://127.0.0.1:1234/_next/static/chunks/foreign-reference.js:3:4\n at credential (http://private:secret@127.0.0.1:1234/_next/static/chunks/credential-reference.js:5:6)\n at foreign (https://foreign.invalid/path(http://127.0.0.1:1234/_next/static/chunks/parenthesis-reference.js:9:10)\n foreign@https://foreign.invalid/script.js?next=@http://127.0.0.1:1234/_next/static/chunks/query-reference.js:11:12\n actual@http://127.0.0.1:1234/_next/static/chunks/actual.js:7:8`;
    const result = observeAdmissionWhatsappBrowserError(error, { phase: ADMISSION_WHATSAPP_BROWSER_PHASE.common, leaderSurface: false, origin: "http://127.0.0.1:1234", submissionUrl: null, correctionUrl: null, accountUrls: new Set() });

    expect(result.frames).toEqual([{ chunk: "actual.js", line: 7, column: 8 }]);
    expect(JSON.stringify(result)).not.toContain("reference");
    expect(JSON.stringify(result)).not.toContain("private");
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(JSON.stringify(result)).not.toContain("foreign.invalid");
  });

  it("should keep a foreign account endpoint separate without retaining its address", () => {
    const foreignUrl = "https://external.invalid/api/auth/get-session";
    const error = new Error(`${foreignUrl.slice("https:".length)} due to access control checks.`);
    error.name = "Fetch API cannot load https";
    const result = observeAdmissionWhatsappBrowserError(error, { phase: ADMISSION_WHATSAPP_BROWSER_PHASE.ownAccountRecovery, leaderSurface: false, origin: "http://127.0.0.1:1234", submissionUrl: null, correctionUrl: null, accountUrls: new Set(["http://127.0.0.1:1234/api/auth/get-session"]) });

    expect(result).toMatchObject({ name: "NativeFetchError", sameOrigin: false, matchesAccountProbe: false });
    expect(JSON.stringify(result)).not.toContain(foreignUrl);
    expect(JSON.stringify(result)).not.toContain("external.invalid");
  });

  it("should replace an unknown error name without claiming a request correlation", () => {
    const error = new Error("No public diagnostic text is retained");
    error.name = "PrivateTokenName";
    const result = observeAdmissionWhatsappBrowserError(error, { phase: ADMISSION_WHATSAPP_BROWSER_PHASE.ownAccountRecovery, leaderSurface: true, origin: "http://127.0.0.1:1234", submissionUrl: null, correctionUrl: null, accountUrls: new Set(["http://127.0.0.1:1234/api/auth/get-session"]) });

    expect(result).toMatchObject({ name: "UnclassifiedError", leaderSurface: true, sameOrigin: null, matchesAccountProbe: false, frames: [] });
    expect(JSON.stringify(result)).not.toContain("PrivateTokenName");
    expect(JSON.stringify(result)).not.toContain(error.message);
  });
});
