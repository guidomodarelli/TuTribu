/** @vitest-environment node */

import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

type DevPortlessScript = {
  classifyDevHostResolution: (
    addresses: string[]
  ) => "loopback" | "elsewhere" | "missing";
  isPortlessCaTrusted: (stateDirectory: string) => boolean;
  isPortlessVersionSupported: (versionText: string) => boolean;
  resolvePortlessStateDirectory: (homeDirectory: string) => string;
};

let devPortlessScript: DevPortlessScript;

describe("dev portless script", () => {
  beforeAll(async () => {
    const importedModule = await import("../../../scripts/dev-portless.mjs");

    devPortlessScript = importedModule as unknown as DevPortlessScript;
  });

  it("should accept the dev host only when every DNS address is loopback", () => {
    expect(devPortlessScript.classifyDevHostResolution(["127.0.0.1"])).toBe(
      "loopback"
    );
    expect(
      devPortlessScript.classifyDevHostResolution(["127.0.0.1", "::1"])
    ).toBe("loopback");
  });

  it("should report a dev host that resolves elsewhere or does not resolve", () => {
    expect(
      devPortlessScript.classifyDevHostResolution(["104.21.10.20"])
    ).toBe("elsewhere");
    expect(
      devPortlessScript.classifyDevHostResolution(["127.0.0.1", "172.67.1.1"])
    ).toBe("elsewhere");
    expect(devPortlessScript.classifyDevHostResolution([])).toBe("missing");
  });

  it("should accept portless 0.15.5 or newer, which supports the dotted TLD", () => {
    expect(devPortlessScript.isPortlessVersionSupported("0.15.5")).toBe(true);
    expect(devPortlessScript.isPortlessVersionSupported("0.16.0")).toBe(true);
    expect(devPortlessScript.isPortlessVersionSupported("1.0.0")).toBe(true);
    expect(
      devPortlessScript.isPortlessVersionSupported("portless v0.15.10\n")
    ).toBe(true);
  });

  it("should reject older portless releases and output without a readable version", () => {
    expect(devPortlessScript.isPortlessVersionSupported("0.15.4")).toBe(false);
    expect(devPortlessScript.isPortlessVersionSupported("0.9.99")).toBe(false);
    expect(devPortlessScript.isPortlessVersionSupported("")).toBe(false);
    expect(devPortlessScript.isPortlessVersionSupported("unknown")).toBe(false);
    expect(devPortlessScript.isPortlessVersionSupported("0.15")).toBe(false);
  });

  it("should consider the portless CA trusted only when the trust marker exists", () => {
    const homeDirectory = mkdtempSync(path.join(os.tmpdir(), "dev-portless-"));
    const stateDirectory =
      devPortlessScript.resolvePortlessStateDirectory(homeDirectory);

    try {
      expect(stateDirectory).toBe(path.join(homeDirectory, ".portless"));
      expect(devPortlessScript.isPortlessCaTrusted(stateDirectory)).toBe(false);

      writeFileSync(path.join(homeDirectory, "ca.trusted"), "fingerprint");
      expect(devPortlessScript.isPortlessCaTrusted(homeDirectory)).toBe(true);
    } finally {
      rmSync(homeDirectory, { force: true, recursive: true });
    }
  });
});
