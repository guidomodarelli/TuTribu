#!/usr/bin/env node
/**
 * Closes Playwright WebKit processes that outlived the test run that started them.
 *
 * On Windows, ending a process does not end its children. When a Playwright run dies abruptly
 * (an agent tool timeout, a closed terminal, `TerminateProcess`), `globalTeardown` never runs and
 * WebKit's `Playwright.exe`, `WebKitNetworkProcess.exe` and `WebKitWebProcess.exe` stay alive
 * under `%LOCALAPPDATA%\ms-playwright\webkit-*`. They inherit the repository folder as working
 * directory and keep it locked, so a worktree cannot be deleted until they end.
 *
 * A process is closed only when both hold: its executable lives inside an `ms-playwright` folder,
 * and its parent no longer exists (or is itself being closed as an orphan). A process whose parent
 * is alive belongs to a run in progress, possibly from another session, and is never touched.
 * Other platforms end the browser's descendants with it, so the cleanup is a no-op there.
 *
 * The Playwright configs run it as `globalSetup` (sweeping leftovers of earlier aborted runs) and
 * `globalTeardown`. Failures are logged as warnings and never fail the test run.
 *
 * Usage:
 *   pnpm e2e:cleanup [-- --dry-run]
 *   node scripts/e2e/clean-orphan-webkit-processes.mjs [--dry-run]
 *
 * @module clean-orphan-webkit-processes
 */

import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const OPERATION_PREFIX = "clean-orphan-webkit-processes";
const WINDOWS_PLATFORM = "win32";
const DRY_RUN_FLAG = "--dry-run";
/** Folder segment of every browser build Playwright installs (`%LOCALAPPDATA%\ms-playwright`). */
const PLAYWRIGHT_BROWSERS_FOLDER = "ms-playwright";
/** Bounds the PowerShell snapshot so a stuck WMI query cannot hang the test run. */
const PROCESS_SNAPSHOT_TIMEOUT_MS = 30_000;
const PROCESS_SNAPSHOT_MAX_BUFFER_BYTES = 8 * 1024 * 1024;

/**
 * Lists WebKit's processes first and every running process afterwards, in one PowerShell call:
 * a parent that starts after the first query is still seen alive, so a run starting in parallel
 * is never mistaken for an orphan. Start times travel as Unix milliseconds so they survive
 * `ConvertTo-Json` the same way on Windows PowerShell 5.1 and PowerShell 7.
 */
const PROCESS_SNAPSHOT_SCRIPT = [
  "function ConvertTo-UnixMilliseconds($date) { if ($date) { ([DateTimeOffset]$date).ToUnixTimeMilliseconds() } else { $null } }",
  "$webKitProcesses = @(Get-CimInstance Win32_Process -Filter \"Name='Playwright.exe' OR Name='WebKitNetworkProcess.exe' OR Name='WebKitWebProcess.exe'\" | ForEach-Object { @{ processId = $_.ProcessId; parentProcessId = $_.ParentProcessId; executablePath = $_.ExecutablePath; startedAtMs = ConvertTo-UnixMilliseconds $_.CreationDate } })",
  "$livingProcesses = @(Get-CimInstance Win32_Process | ForEach-Object { @{ processId = $_.ProcessId; startedAtMs = ConvertTo-UnixMilliseconds $_.CreationDate } })",
  "ConvertTo-Json -Compress -Depth 4 @{ webKitProcesses = $webKitProcesses; livingProcesses = $livingProcesses }",
].join("; ");

const execFileAsync = promisify(execFile);

/**
 * @typedef {object} WebKitProcess
 * @property {number} processId - Process id.
 * @property {number} parentProcessId - Id of the process that started it; it may no longer exist.
 * @property {string | null} executablePath - Executable path, or `null` when Windows denies it.
 * @property {number | null} startedAtMs - Start time in Unix milliseconds, or `null` when unknown.
 */

/**
 * @typedef {object} ProcessSnapshot
 * @property {WebKitProcess[]} webKitProcesses - Running WebKit processes.
 * @property {Map<number, number | null>} livingProcesses - Start time of every running process, by id.
 */

/**
 * @typedef {object} ProcessSystem
 * @property {() => Promise<ProcessSnapshot>} readProcessSnapshot - Reads the running processes.
 * @property {(processId: number) => void} terminateProcess - Ends a process; throws when it cannot.
 */

/**
 * @typedef {object} CleanupResult
 * @property {number[]} orphanProcessIds - Orphan Playwright WebKit processes found.
 * @property {number[]} terminatedProcessIds - Orphans that were closed.
 * @property {number[]} failedProcessIds - Orphans that could not be closed.
 */

/**
 * Tells whether an executable belongs to a browser build installed by Playwright.
 *
 * @param {string | null} executablePath
 * @returns {boolean}
 */
function isPlaywrightExecutable(executablePath) {
  if (!executablePath) return false;
  return executablePath
    .toLowerCase()
    .split(/[\\/]/)
    .includes(PLAYWRIGHT_BROWSERS_FOLDER);
}

/**
 * Tells whether the process that started `webKitProcess` is still running. Windows reuses process
 * ids, so a living process that started after `webKitProcess` cannot be its parent. When either
 * start time is unknown the parent is assumed alive, so the process is kept.
 *
 * @param {WebKitProcess} webKitProcess
 * @param {Map<number, number | null>} livingProcesses
 * @returns {boolean}
 */
function isParentAlive(webKitProcess, livingProcesses) {
  if (!livingProcesses.has(webKitProcess.parentProcessId)) return false;
  const parentStartedAtMs = livingProcesses.get(webKitProcess.parentProcessId);
  if (parentStartedAtMs == null || webKitProcess.startedAtMs == null) return true;
  return parentStartedAtMs <= webKitProcess.startedAtMs;
}

/**
 * Decides which WebKit processes to close: those installed by Playwright whose parent no longer
 * exists, plus their Playwright descendants, whose parent is about to be closed too.
 *
 * @param {WebKitProcess[]} webKitProcesses - Running WebKit processes.
 * @param {Map<number, number | null>} livingProcesses - Start time of every running process, by id.
 * @returns {number[]} Ids to close, in the order of `webKitProcesses`.
 */
export function selectOrphanWebKitProcessIds(webKitProcesses, livingProcesses) {
  const playwrightProcesses = webKitProcesses.filter((webKitProcess) =>
    isPlaywrightExecutable(webKitProcess.executablePath),
  );
  const orphanProcessIds = new Set();
  let foundNewOrphan = true;

  while (foundNewOrphan) {
    foundNewOrphan = false;
    for (const playwrightProcess of playwrightProcesses) {
      if (orphanProcessIds.has(playwrightProcess.processId)) continue;
      const parentIsGone =
        orphanProcessIds.has(playwrightProcess.parentProcessId) || !isParentAlive(playwrightProcess, livingProcesses);
      if (parentIsGone) {
        orphanProcessIds.add(playwrightProcess.processId);
        foundNewOrphan = true;
      }
    }
  }

  return playwrightProcesses
    .map((playwrightProcess) => playwrightProcess.processId)
    .filter((processId) => orphanProcessIds.has(processId));
}

/** @type {ProcessSystem} */
const windowsProcessSystem = {
  async readProcessSnapshot() {
    const { stdout } = await execFileAsync(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-Command", PROCESS_SNAPSHOT_SCRIPT],
      { maxBuffer: PROCESS_SNAPSHOT_MAX_BUFFER_BYTES, timeout: PROCESS_SNAPSHOT_TIMEOUT_MS, windowsHide: true },
    );
    /** @type {{ webKitProcesses?: WebKitProcess[], livingProcesses?: Array<{ processId: number, startedAtMs: number | null }> }} */
    const snapshot = JSON.parse(stdout);
    return {
      webKitProcesses: (snapshot.webKitProcesses ?? []).map((webKitProcess) => ({
        processId: webKitProcess.processId,
        parentProcessId: webKitProcess.parentProcessId,
        executablePath: webKitProcess.executablePath ?? null,
        startedAtMs: webKitProcess.startedAtMs ?? null,
      })),
      livingProcesses: new Map(
        (snapshot.livingProcesses ?? []).map((livingProcess) => [livingProcess.processId, livingProcess.startedAtMs ?? null]),
      ),
    };
  },
  terminateProcess(processId) {
    process.kill(processId);
  },
};

/** Empty result for runs that find or close nothing. */
function createEmptyResult() {
  return { orphanProcessIds: [], terminatedProcessIds: [], failedProcessIds: [] };
}

/**
 * Finds orphan Playwright WebKit processes and closes them. Never throws: failures to read the
 * process list or to close a process are reported through `warn`.
 *
 * @param {object} [options]
 * @param {string} [options.platform] - Platform to act on; defaults to the current one.
 * @param {ProcessSystem} [options.system] - Process access; defaults to Windows' PowerShell and `process.kill`.
 * @param {boolean} [options.dryRun] - Report the orphans without closing them.
 * @param {boolean} [options.reportClean] - Also log when no orphan is found, for manual runs.
 * @param {(message: string) => void} [options.log] - Receives informational messages.
 * @param {(message: string) => void} [options.warn] - Receives failure messages.
 * @returns {Promise<CleanupResult>}
 */
export async function cleanOrphanWebKitProcesses({
  platform = process.platform,
  system = windowsProcessSystem,
  dryRun = false,
  reportClean = false,
  log = console.log,
  warn = console.warn,
} = {}) {
  if (platform !== WINDOWS_PLATFORM) return createEmptyResult();

  let snapshot;
  try {
    snapshot = await system.readProcessSnapshot();
  } catch (error) {
    warn(
      `[e2e] ${OPERATION_PREFIX}:readProcessSnapshot failed; orphan WebKit processes were not cleaned: ` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
    return createEmptyResult();
  }

  const orphanProcessIds = selectOrphanWebKitProcessIds(snapshot.webKitProcesses, snapshot.livingProcesses);
  const result = { ...createEmptyResult(), orphanProcessIds };
  if (orphanProcessIds.length === 0) {
    if (reportClean) log("[e2e] No orphan Playwright WebKit processes found.");
    return result;
  }

  if (dryRun) {
    log(`[e2e] Found ${orphanProcessIds.length} orphan Playwright WebKit process(es): ${orphanProcessIds.join(", ")}.`);
    return result;
  }

  for (const processId of orphanProcessIds) {
    try {
      system.terminateProcess(processId);
      result.terminatedProcessIds.push(processId);
    } catch (error) {
      result.failedProcessIds.push(processId);
      warn(
        `[e2e] ${OPERATION_PREFIX}:terminateProcess failed for pid=${processId}: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (result.terminatedProcessIds.length > 0) {
    log(
      `[e2e] Closed ${result.terminatedProcessIds.length} orphan Playwright WebKit process(es): ` +
        `${result.terminatedProcessIds.join(", ")}.`,
    );
  }
  return result;
}

/** Playwright `globalSetup` and `globalTeardown` entry: the config argument is not needed. */
export default async function cleanOrphanWebKitProcessesHook() {
  await cleanOrphanWebKitProcesses();
}

const isDirectRun = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  const dryRun = process.argv.slice(2).includes(DRY_RUN_FLAG);
  if (process.platform !== WINDOWS_PLATFORM) {
    console.log("[e2e] Orphan WebKit cleanup only applies on Windows; nothing to do.");
  }
  await cleanOrphanWebKitProcesses({ dryRun, reportClean: true });
}
