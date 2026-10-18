/** @vitest-environment node */

import { describe, expect, it } from "vitest";

import {
  cleanOrphanWebKitProcesses,
  selectOrphanWebKitProcessIds,
} from "@/scripts/e2e/clean-orphan-webkit-processes.mjs";

/** WebKit build folder Playwright installs under `%LOCALAPPDATA%`. */
const PLAYWRIGHT_WEBKIT_FOLDER = "C:\\Users\\tester\\AppData\\Local\\ms-playwright\\webkit-2248";

/** Process id of the Playwright worker that is still running in the scenarios. */
const LIVING_WORKER_PID = 4100;

/** Process id of a Playwright worker that died without running its teardown. */
const DEAD_WORKER_PID = 4200;

/** Start time shared by the WebKit processes in the scenarios. */
const WEBKIT_STARTED_AT_MS = Date.UTC(2026, 9, 16, 11, 0);

/** The living worker started before its WebKit processes, as a real parent does. */
const LIVING_WORKER_STARTED_AT_MS = WEBKIT_STARTED_AT_MS - 60_000;

/** Running processes and their start times, with only the living worker in them. */
const livingProcesses = new Map<number, number | null>([[LIVING_WORKER_PID, LIVING_WORKER_STARTED_AT_MS]]);

const orphanNetworkProcess = {
  processId: 5100,
  parentProcessId: DEAD_WORKER_PID,
  executablePath: `${PLAYWRIGHT_WEBKIT_FOLDER}\\WebKitNetworkProcess.exe`,
  startedAtMs: WEBKIT_STARTED_AT_MS,
};

const attachedNetworkProcess = {
  processId: 5200,
  parentProcessId: LIVING_WORKER_PID,
  executablePath: `${PLAYWRIGHT_WEBKIT_FOLDER}\\WebKitNetworkProcess.exe`,
  startedAtMs: WEBKIT_STARTED_AT_MS,
};

const foreignWebKitProcess = {
  processId: 5300,
  parentProcessId: DEAD_WORKER_PID,
  executablePath: "C:\\Program Files\\SomeBrowser\\WebKitWebProcess.exe",
  startedAtMs: WEBKIT_STARTED_AT_MS,
};

describe("selectOrphanWebKitProcessIds", () => {
  it("selects a Playwright WebKit process whose parent no longer exists", () => {
    expect(selectOrphanWebKitProcessIds([orphanNetworkProcess], livingProcesses)).toEqual([
      orphanNetworkProcess.processId,
    ]);
  });

  it("keeps a Playwright WebKit process whose parent is still running", () => {
    expect(selectOrphanWebKitProcessIds([attachedNetworkProcess], livingProcesses)).toEqual([]);
  });

  it("selects a Playwright WebKit process whose parent id now belongs to a newer, unrelated process", () => {
    const reusedParentProcesses = new Map([[DEAD_WORKER_PID, WEBKIT_STARTED_AT_MS + 60_000]]);

    expect(selectOrphanWebKitProcessIds([orphanNetworkProcess], reusedParentProcesses)).toEqual([
      orphanNetworkProcess.processId,
    ]);
  });

  it("keeps a Playwright WebKit process when the parent start time is unknown", () => {
    expect(selectOrphanWebKitProcessIds([attachedNetworkProcess], new Map([[LIVING_WORKER_PID, null]]))).toEqual([]);
  });

  it("keeps a WebKit process that lives outside the ms-playwright folder even without a parent", () => {
    expect(selectOrphanWebKitProcessIds([foreignWebKitProcess], livingProcesses)).toEqual([]);
  });

  it("keeps a process whose executable path is unknown", () => {
    const processWithoutPath = { ...orphanNetworkProcess, executablePath: null };

    expect(selectOrphanWebKitProcessIds([processWithoutPath], livingProcesses)).toEqual([]);
  });

  it("selects nothing when there are no WebKit processes", () => {
    expect(selectOrphanWebKitProcessIds([], livingProcesses)).toEqual([]);
  });

  it("selects the descendants of an orphan WebKit browser together with it", () => {
    const orphanBrowser = {
      processId: 6000,
      parentProcessId: DEAD_WORKER_PID,
      executablePath: `${PLAYWRIGHT_WEBKIT_FOLDER}\\Playwright.exe`,
      startedAtMs: WEBKIT_STARTED_AT_MS,
    };
    const browserNetworkProcess = {
      processId: 6100,
      parentProcessId: orphanBrowser.processId,
      executablePath: `${PLAYWRIGHT_WEBKIT_FOLDER}\\WebKitNetworkProcess.exe`,
      startedAtMs: WEBKIT_STARTED_AT_MS,
    };
    const livingProcessesWithBrowser = new Map<number, number | null>([...livingProcesses, [orphanBrowser.processId, WEBKIT_STARTED_AT_MS]]);

    expect(
      selectOrphanWebKitProcessIds([browserNetworkProcess, orphanBrowser, attachedNetworkProcess], livingProcessesWithBrowser),
    ).toEqual([browserNetworkProcess.processId, orphanBrowser.processId]);
  });
});

describe("cleanOrphanWebKitProcesses", () => {
  /** Builds a system adapter that records the processes it was asked to terminate. */
  function createSystemDouble({
    failingProcessIds = new Set<number>(),
    snapshotError,
  }: { failingProcessIds?: Set<number>; snapshotError?: Error } = {}) {
    const terminatedProcessIds: number[] = [];

    return {
      terminatedProcessIds,
      system: {
        readProcessSnapshot: async () => {
          if (snapshotError) throw snapshotError;
          return {
            webKitProcesses: [orphanNetworkProcess, attachedNetworkProcess, foreignWebKitProcess],
            livingProcesses,
          };
        },
        terminateProcess: (processId: number) => {
          if (failingProcessIds.has(processId)) throw new Error("Access is denied.");
          terminatedProcessIds.push(processId);
        },
      },
    };
  }

  it("does nothing outside Windows", async () => {
    const { system, terminatedProcessIds } = createSystemDouble();

    const result = await cleanOrphanWebKitProcesses({ platform: "linux", system, log: () => {}, warn: () => {} });

    expect(result).toEqual({ orphanProcessIds: [], terminatedProcessIds: [], failedProcessIds: [] });
    expect(terminatedProcessIds).toEqual([]);
  });

  it("terminates only the orphan Playwright WebKit processes on Windows", async () => {
    const { system, terminatedProcessIds } = createSystemDouble();

    const result = await cleanOrphanWebKitProcesses({ platform: "win32", system, log: () => {}, warn: () => {} });

    expect(terminatedProcessIds).toEqual([orphanNetworkProcess.processId]);
    expect(result.terminatedProcessIds).toEqual([orphanNetworkProcess.processId]);
  });

  it("reports the orphans without terminating them in a dry run", async () => {
    const { system, terminatedProcessIds } = createSystemDouble();

    const result = await cleanOrphanWebKitProcesses({
      platform: "win32",
      system,
      dryRun: true,
      log: () => {},
      warn: () => {},
    });

    expect(result.orphanProcessIds).toEqual([orphanNetworkProcess.processId]);
    expect(terminatedProcessIds).toEqual([]);
  });

  it("warns with the process id and keeps going when a process cannot be terminated", async () => {
    const warnings: string[] = [];
    const { system } = createSystemDouble({ failingProcessIds: new Set([orphanNetworkProcess.processId]) });

    const result = await cleanOrphanWebKitProcesses({
      platform: "win32",
      system,
      log: () => {},
      warn: (message: string) => warnings.push(message),
    });

    expect(result.failedProcessIds).toEqual([orphanNetworkProcess.processId]);
    expect(warnings.join("\n")).toContain(`pid=${orphanNetworkProcess.processId}`);
  });

  it("warns and resolves when the process snapshot cannot be read", async () => {
    const warnings: string[] = [];
    const { system } = createSystemDouble({ snapshotError: new Error("powershell not found") });

    const result = await cleanOrphanWebKitProcesses({
      platform: "win32",
      system,
      log: () => {},
      warn: (message: string) => warnings.push(message),
    });

    expect(result).toEqual({ orphanProcessIds: [], terminatedProcessIds: [], failedProcessIds: [] });
    expect(warnings).toHaveLength(1);
  });
});
