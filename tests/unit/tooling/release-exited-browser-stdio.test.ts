/** @vitest-environment node */

import { afterEach, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";

import { installExitedBrowserStdioRelease } from "@/tests/e2e/support/release-exited-browser-stdio";

/** Short grace period so the release happens well before the descendant ends. */
const TEST_GRACE_PERIOD_MS = 200;

/** How long the descendant keeps the inherited pipes open, far beyond any assertion window. */
const DESCENDANT_LIFETIME_MS = 20_000;

/** Window in which `close` must or must not arrive after the parent exits. */
const CLOSE_OBSERVATION_WINDOW_MS = 2_000;

/**
 * Parent process that mirrors WebKit's `Playwright.exe`: it starts a descendant that
 * inherits its stdio pipes, reports the descendant pid and exits right away. The descendant
 * is detached so it outlives the parent, as `WebKitNetworkProcess.exe` does; otherwise Node
 * on Windows ends it together with the parent.
 */
const PARENT_LEAVING_DESCENDANT_SCRIPT = `
const { spawn } = require("node:child_process");
const descendant = spawn(process.execPath, ["-e", "setTimeout(() => {}, ${DESCENDANT_LIFETIME_MS})"], { stdio: "inherit", detached: true });
process.stdout.write(String(descendant.pid) + "\\n", () => process.exit(0));
`;

const descendantPids: number[] = [];
const uninstallers: Array<() => void> = [];

afterEach(() => {
  for (const uninstall of uninstallers.splice(0)) uninstall();
  for (const descendantPid of descendantPids.splice(0)) {
    try {
      process.kill(descendantPid);
    } catch {
      // The descendant already ended; there is nothing left to clean up.
    }
  }
});

/** Parent process together with whether its `close` arrived soon after it exited. */
type ObservedParent = { parent: ChildProcess; closedSoonAfterExit: Promise<boolean> };

/**
 * Spawns the parent and resolves once it reported its descendant and exited. `close` is
 * observed from the spawn on, so an early `close` is never missed.
 */
async function spawnParentLeavingDescendant(): Promise<ObservedParent> {
  const parent = spawn(process.execPath, ["-e", PARENT_LEAVING_DESCENDANT_SCRIPT], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const closed = new Promise<void>((resolve) => parent.once("close", () => resolve()));
  const descendantPid = await new Promise<number>((resolve) => {
    parent.stdout.once("data", (chunk: Buffer) => resolve(Number(chunk.toString().trim())));
  });
  descendantPids.push(descendantPid);
  await new Promise((resolve) => parent.once("exit", resolve));
  const closedSoonAfterExit = Promise.race([
    closed.then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), CLOSE_OBSERVATION_WINDOW_MS)),
  ]);
  return { parent, closedSoonAfterExit };
}

describe("installExitedBrowserStdioRelease", () => {
  it("should release the pipes a descendant keeps open after a watched browser exits", async () => {
    const warnings: string[] = [];
    uninstallers.push(
      installExitedBrowserStdioRelease({
        executablePaths: [process.execPath],
        gracePeriodMs: TEST_GRACE_PERIOD_MS,
        warn: (message) => warnings.push(message),
      }),
    );

    const { parent, closedSoonAfterExit } = await spawnParentLeavingDescendant();

    await expect(closedSoonAfterExit).resolves.toBe(true);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(`pid=${parent.pid}`);
    expect(warnings[0]).toContain("exitCode=0");
  });

  it("should keep waiting for the pipes of processes that are not watched browsers", async () => {
    const warnings: string[] = [];
    uninstallers.push(
      installExitedBrowserStdioRelease({
        executablePaths: ["C:/unrelated/browser.exe"],
        gracePeriodMs: TEST_GRACE_PERIOD_MS,
        warn: (message) => warnings.push(message),
      }),
    );

    const { closedSoonAfterExit } = await spawnParentLeavingDescendant();

    await expect(closedSoonAfterExit).resolves.toBe(false);
    expect(warnings).toEqual([]);
  });

  it("should stop watching new browsers once uninstalled", async () => {
    const warnings: string[] = [];
    const uninstall = installExitedBrowserStdioRelease({
      executablePaths: [process.execPath],
      gracePeriodMs: TEST_GRACE_PERIOD_MS,
      warn: (message) => warnings.push(message),
    });
    uninstall();

    const { closedSoonAfterExit } = await spawnParentLeavingDescendant();

    await expect(closedSoonAfterExit).resolves.toBe(false);
    expect(warnings).toEqual([]);
  });
});
