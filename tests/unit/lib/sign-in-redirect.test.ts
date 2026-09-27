import { describe, expect, it } from "vitest";

import { buildSignInRedirectUrl } from "@/lib/auth/sign-in-redirect";

describe("buildSignInRedirectUrl", () => {
  it("encodes the return path so its own query string survives sign-in", () => {
    expect(
      buildSignInRedirectUrl("/matematica-pro/eventos?month=2026-05&event=abc@2026")
    ).toBe(
      "/auth/signin?callbackUrl=%2Fmatematica-pro%2Feventos%3Fmonth%3D2026-05%26event%3Dabc%402026"
    );
  });
});
