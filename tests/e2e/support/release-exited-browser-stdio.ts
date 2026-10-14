/**
 * Lets Playwright workers shut down when a browser exits but a descendant keeps its pipes open.
 *
 * Playwright waits for the browser's `close` event, which Node emits only after the process
 * exited and every stdio pipe reached EOF. On Windows, WebKit's `Playwright.exe` passes those
 * pipe handles down to `WebKitNetworkProcess.exe`, which sometimes stays stuck in `ExitProcess`
 * after the browser exited. The pipes never reach EOF, the worker hangs on teardown and the
 * runner force-kills it after five minutes, failing a run whose tests all passed.
 *
 * Once a watched browser has emitted `exit`, the pipes only carry output from leftover
 * descendants, so they are released after a grace period and a warning records it. A browser
 * that never exits is left untouched, so the runner still reports it as a hung worker.
 */
import { ChildProcess } from "node:child_process";
import path from "node:path";

/** Time a browser's own pipes get to drain after `exit` before they are released. */
const DEFAULT_GRACE_PERIOD_MS = 5_000;

/** Options for {@link installExitedBrowserStdioRelease}. */
export type ExitedBrowserStdioReleaseOptions = {
  /** Browser executables to watch, as returned by `browserType.executablePath()`. */
  executablePaths: readonly string[];
  /** Time to wait after `exit` for the pipes to close on their own. */
  gracePeriodMs?: number;
  /** Receives the message describing each release. */
  warn?: (message: string) => void;
};

/** Internal `ChildProcess#spawn`, which every `child_process` spawn helper calls. */
type ChildProcessSpawn = (this: ChildProcess, ...spawnArguments: unknown[]) => unknown;

/** Compares executables by resolved path, case-insensitively where the file system is. */
function normalizeExecutablePath(executablePath: string): string {
  const resolvedPath = path.resolve(executablePath);
  return process.platform === "win32" ? resolvedPath.toLowerCase() : resolvedPath;
}

/** Releases the stdio pipes of `browserProcess` if they are still open after it exited. */
function releaseStdioAfterExit(
  browserProcess: ChildProcess,
  gracePeriodMs: number,
  warn: (message: string) => void,
): void {
  browserProcess.once("exit", (exitCode, signal) => {
    const releaseTimer = setTimeout(() => {
      const openPipes = browserProcess.stdio.filter(
        (pipe): pipe is NonNullable<typeof pipe> => pipe != null && !pipe.destroyed,
      );
      if (openPipes.length === 0) return;
      warn(
        `[e2e] Browser process pid=${browserProcess.pid} (${browserProcess.spawnfile}) exited with ` +
          `exitCode=${exitCode} signal=${signal}, but ${openPipes.length} stdio pipe(s) stayed open ` +
          `for ${gracePeriodMs} ms because a descendant process still holds them. Releasing them ` +
          "so the Playwright worker can shut down.",
      );
      for (const pipe of openPipes) pipe.destroy();
    }, gracePeriodMs);
    releaseTimer.unref();
    browserProcess.once("close", () => clearTimeout(releaseTimer));
  });
}

/**
 * Watches every process spawned from `executablePaths` and releases its stdio pipes when they
 * outlive the process. Returns a function that stops watching processes spawned afterwards.
 */
export function installExitedBrowserStdioRelease({
  executablePaths,
  gracePeriodMs = DEFAULT_GRACE_PERIOD_MS,
  warn = console.warn,
}: ExitedBrowserStdioReleaseOptions): () => void {
  const watchedExecutables = new Set(executablePaths.map(normalizeExecutablePath));
  const childProcessPrototype = ChildProcess.prototype as unknown as { spawn: ChildProcessSpawn };
  const originalSpawn = childProcessPrototype.spawn;

  childProcessPrototype.spawn = function spawnAndWatchBrowserStdio(this: ChildProcess, ...spawnArguments) {
    const spawnResult = originalSpawn.apply(this, spawnArguments);
    if (this.pid !== undefined && watchedExecutables.has(normalizeExecutablePath(this.spawnfile))) {
      releaseStdioAfterExit(this, gracePeriodMs, warn);
    }
    return spawnResult;
  };

  return () => {
    childProcessPrototype.spawn = originalSpawn;
  };
}
