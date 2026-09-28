/** @vitest-environment node */

import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

type PortlessCommand = {
  commandArguments: string[];
  description: string;
};

type DevPortlessScript = {
  buildPortlessInvocation: (
    commandArguments: string[],
    platform?: string
  ) => { command: string; commandArguments: string[]; useShell: boolean };
  buildDevHostName: (options?: { appName: string; tld: string }) => string;
  buildHostsEntry: (hostName: string) => string;
  buildPortlessCommands: (options?: {
    appName: string;
    tld: string;
  }) => {
    proxyStart: PortlessCommand;
    proxyStop: PortlessCommand;
    runDevServer: PortlessCommand;
  };
  hasHostsEntry: (hostsContent: string, hostName: string) => boolean;
  isPortlessCaTrusted: (stateDirectory: string) => boolean;
  normalizeScriptArguments: (scriptArguments?: string[]) => {
    isDryRun: boolean;
  };
  resolveHostsPath: (platform: string, environment?: NodeJS.ProcessEnv) => string;
  resolvePortlessStateDirectory: (homeDirectory: string) => string;
};

let devPortlessScript: DevPortlessScript;

describe("dev portless script", () => {
  beforeAll(async () => {
    const importedModule = await import("../../../scripts/dev-portless.mjs");

    devPortlessScript = importedModule as unknown as DevPortlessScript;
  });

  it("should detect an existing loopback hosts entry regardless of spacing or comments", () => {
    const hostName = "dev-tutribu.app";

    expect(
      devPortlessScript.hasHostsEntry("127.0.0.1 dev-tutribu.app\n", hostName)
    ).toBe(true);
    expect(
      devPortlessScript.hasHostsEntry(
        "# hosts\r\n\t127.0.0.1\t\tdev-tutribu.app   # portless\r\n",
        hostName
      )
    ).toBe(true);
    expect(
      devPortlessScript.hasHostsEntry(
        "127.0.0.1 otra.app dev-tutribu.app\n",
        hostName
      )
    ).toBe(true);
  });

  it("should not treat commented, partial or foreign entries as a loopback mapping", () => {
    const hostName = "dev-tutribu.app";

    expect(
      devPortlessScript.hasHostsEntry("# 127.0.0.1 dev-tutribu.app\n", hostName)
    ).toBe(false);
    expect(
      devPortlessScript.hasHostsEntry(
        "127.0.0.1 dev-tutribu.app.example\n",
        hostName
      )
    ).toBe(false);
    expect(
      devPortlessScript.hasHostsEntry("10.0.0.5 dev-tutribu.app\n", hostName)
    ).toBe(false);
    expect(devPortlessScript.hasHostsEntry("", hostName)).toBe(false);
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
