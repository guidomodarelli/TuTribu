import { describe, expect, it } from "vitest";

import { resolveExternalApiMocksActivation } from "@/src/modules/shared/infrastructure/dev-mocks/external-api-mocks-activation";

describe("resolveExternalApiMocksActivation", () => {
  it("enables the mocks on the Node.js development server when the flag is on", () => {
    expect(
      resolveExternalApiMocksActivation({
        MOCK_EXTERNAL_APIS: "1",
        NEXT_RUNTIME: "nodejs",
        NODE_ENV: "development",
      })
    ).toBe("enabled");
  });

  it("accepts the flag written as true in any letter case", () => {
    expect(
      resolveExternalApiMocksActivation({
        MOCK_EXTERNAL_APIS: " TRUE ",
        NEXT_RUNTIME: "nodejs",
        NODE_ENV: "development",
      })
    ).toBe("enabled");
  });

  it("keeps the real providers when the flag is missing or off", () => {
    expect(
      resolveExternalApiMocksActivation({
        NEXT_RUNTIME: "nodejs",
        NODE_ENV: "development",
      })
    ).toBe("disabled");
    expect(
      resolveExternalApiMocksActivation({
        MOCK_EXTERNAL_APIS: "0",
        NEXT_RUNTIME: "nodejs",
        NODE_ENV: "development",
      })
    ).toBe("disabled");
  });

  it("ignores the flag outside the development server", () => {
    expect(
      resolveExternalApiMocksActivation({
        MOCK_EXTERNAL_APIS: "1",
        NEXT_RUNTIME: "nodejs",
        NODE_ENV: "production",
      })
    ).toBe("ignored-outside-development");
    expect(
      resolveExternalApiMocksActivation({
        MOCK_EXTERNAL_APIS: "1",
        NEXT_RUNTIME: "nodejs",
        NODE_ENV: "test",
      })
    ).toBe("ignored-outside-development");
  });

  it("does not start the Node.js interceptor in the edge runtime", () => {
    expect(
      resolveExternalApiMocksActivation({
        MOCK_EXTERNAL_APIS: "1",
        NEXT_RUNTIME: "edge",
        NODE_ENV: "development",
      })
    ).toBe("disabled");
  });
});
