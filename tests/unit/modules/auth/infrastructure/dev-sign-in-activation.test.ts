/** @vitest-environment node */

import { describe, expect, it } from "vitest";

import {
  resolveDevSignInActivation,
  resolveDevSignInCredentials,
  resolveDevSignInFormEmail,
} from "@/src/modules/auth/infrastructure/dev-sign-in/dev-sign-in-activation";

const DEV_CREDENTIALS = {
  DEV_SIGN_IN_EMAIL: " Dev@TuTribu.Example ",
  DEV_SIGN_IN_PASSWORD: "dev-password-123",
};

describe("resolveDevSignInActivation", () => {
  it("enables the dev sign-in on next dev when the flag is on", () => {
    expect(
      resolveDevSignInActivation({ DEV_SIGN_IN: "1", NODE_ENV: "development" })
    ).toBe("enabled");
    expect(
      resolveDevSignInActivation({ DEV_SIGN_IN: " TRUE ", NODE_ENV: "development" })
    ).toBe("enabled");
  });

  it("keeps it disabled when the flag is missing or off", () => {
    expect(resolveDevSignInActivation({ NODE_ENV: "development" })).toBe(
      "disabled"
    );
    expect(
      resolveDevSignInActivation({ DEV_SIGN_IN: "0", NODE_ENV: "development" })
    ).toBe("disabled");
  });

  it("ignores the flag in production builds and tests", () => {
    expect(
      resolveDevSignInActivation({ DEV_SIGN_IN: "1", NODE_ENV: "production" })
    ).toBe("ignored-outside-development");
    expect(resolveDevSignInActivation({ DEV_SIGN_IN: "1", NODE_ENV: "test" })).toBe(
      "ignored-outside-development"
    );
    expect(resolveDevSignInActivation({ DEV_SIGN_IN: "1" })).toBe(
      "ignored-outside-development"
    );
  });
});

describe("resolveDevSignInCredentials", () => {
  it("normalizes the email and falls back to the default member name", () => {
    expect(resolveDevSignInCredentials(DEV_CREDENTIALS)).toEqual({
      email: "dev@tutribu.example",
      name: "Integrante de desarrollo",
      password: "dev-password-123",
    });
  });

  it("fails with an actionable message when a credential is missing", () => {
    expect(() =>
      resolveDevSignInCredentials({ DEV_SIGN_IN_EMAIL: "dev@tutribu.example" })
    ).toThrow(/DEV_SIGN_IN_EMAIL or DEV_SIGN_IN_PASSWORD is empty/);
  });

  it("rejects a password Better Auth would refuse", () => {
    expect(() =>
      resolveDevSignInCredentials({
        DEV_SIGN_IN_EMAIL: "dev@tutribu.example",
        DEV_SIGN_IN_PASSWORD: "short",
      })
    ).toThrow(/shorter than 8 characters/);
  });
});

describe("resolveDevSignInFormEmail", () => {
  it("returns the dev member email only on next dev with the flag on", () => {
    expect(
      resolveDevSignInFormEmail({
        ...DEV_CREDENTIALS,
        DEV_SIGN_IN: "1",
        NODE_ENV: "development",
      })
    ).toBe("dev@tutribu.example");
    expect(
      resolveDevSignInFormEmail({
        ...DEV_CREDENTIALS,
        DEV_SIGN_IN: "1",
        NODE_ENV: "production",
      })
    ).toBeNull();
  });
});
