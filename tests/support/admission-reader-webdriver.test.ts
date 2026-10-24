/** @vitest-environment node */
/** Exercises the HTTP boundary with a real loopback server; the Linux probe exercises the actual driver. */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { connectAdmissionReaderWebDriver, createAdmissionReaderWebDriverTransport } from "./admission-reader-webdriver.mjs";
import { ADMISSION_READER_WEBDRIVER as DRIVER } from "./constants/admission-reader-webdriver.mjs";

type RecordedCommand = { method: string; path: string; body?: Record<string, unknown> };
type ResponseWriter = (command: RecordedCommand, response: ServerResponse) => void;

/** @param write - Own loopback protocol fixture. @returns Bounded real HTTP listener and observed commands. */
async function driverBoundary(write: ResponseWriter) {
  const commands: RecordedCommand[] = [];
  const server = createServer(async (request: IncomingMessage, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    const command = { method: request.method ?? "", path: request.url ?? "", ...(body ? { body: JSON.parse(body) as Record<string, unknown> } : {}) };
    commands.push(command);
    response.setHeader("content-type", "application/json");
    write(command, response);
  });
  await new Promise<void>((fulfill) => server.listen(0, DRIVER.host, fulfill));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("DriverBoundary.listen failed: loopback_port_missing");
  return { origin: `http://${DRIVER.host}:${address.port}`, commands, close: () => new Promise<void>((fulfill, reject) => server.close((error) => error ? reject(error) : fulfill())) };
}

describe("native reader WebDriver transport", () => {
  it("observes the requested viewport and fixture through HTTP, without dispatching input", async () => {
    const width = 390, height = 900, chromeHeight = 80;
    let viewportReads = 0;
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1sAAAAASUVORK5CYII=", "base64");
    const boundary = await driverBoundary((command, response) => {
      let value: unknown = null;
      if (command.path === "/session") value = { sessionId: "owned-session", capabilities: { browserVersion: "2.50.0" } };
      if (command.body?.script === DRIVER.viewportScript) { viewportReads += 1; value = { width, height: viewportReads === 1 ? height - chromeHeight : height, outerWidth: width, outerHeight: height }; }
      if (command.body?.script === DRIVER.controlFocusScript) value = true;
      if (command.body?.script === DRIVER.statusScript) value = "Aviso sintético";
      if (command.path.endsWith("/screenshot")) value = png.toString("base64");
      response.end(JSON.stringify({ value }));
    });
    const directory = await mkdtemp(join(tmpdir(), "admission-webdriver-"));
    try {
      const browser = await connectAdmissionReaderWebDriver({ origin: boundary.origin, url: "http://127.0.0.1:1234/fixture", width, height });
      expect(browser.viewport).toEqual({ width, height });
      expect(browser.backend).toBe(DRIVER.backends.webkitgtk);
      expect(await browser.controlHasFocus()).toBe(true);
      expect(await browser.statusText()).toBe("Aviso sintético");
      await browser.screenshot(join(directory, "native.png"));
      expect(await readFile(join(directory, "native.png"))).toEqual(png);
      await browser.close(); await browser.close();
      expect(boundary.commands.filter((command) => command.path.endsWith("/window/rect")).map((command) => command.body)).toEqual([{ width, height }, { width, height: height + chromeHeight }]);
      expect(boundary.commands.filter((command) => command.method === "DELETE")).toHaveLength(1);
      expect(boundary.commands.some((command) => /actions|\/click|\/value/u.test(command.path))).toBe(false);
    } finally { await boundary.close(); await rm(directory, { recursive: true, force: true }); }
  });

  it("closes its session and fails when the real viewport does not match the requested width", async () => {
    const boundary = await driverBoundary((command, response) => response.end(JSON.stringify({ value: command.path === "/session" ? { sessionId: "owned-session" } : { width: 800, height: 900, outerWidth: 800, outerHeight: 980 } })));
    try {
      await expect(connectAdmissionReaderWebDriver({ origin: boundary.origin, url: "http://127.0.0.1:1234/fixture", width: 390, height: 900 })).rejects.toThrow(DRIVER.failures.viewport);
      expect(boundary.commands.at(-1)).toEqual({ method: "DELETE", path: "/session/owned-session" });
    } finally { await boundary.close(); }
  });

  it("reports the failed operation without echoing a provider message", async () => {
    const boundary = await driverBoundary((_command, response) => { response.writeHead(500); response.end(JSON.stringify({ value: { error: "unknown error", message: "private provider content" } })); });
    try {
      await expect(createAdmissionReaderWebDriverTransport(boundary.origin)("GET", "/status")).rejects.toThrow(`${DRIVER.failures.command}: GET 500`);
    } finally { await boundary.close(); }
  });

  it("rejects a missing response envelope instead of interpreting it as success", async () => {
    const boundary = await driverBoundary((_command, response) => response.end("{}"));
    try { await expect(createAdmissionReaderWebDriverTransport(boundary.origin)("GET", "/status")).rejects.toThrow(DRIVER.failures.response); }
    finally { await boundary.close(); }
  });

  it("refuses remote targets and network-path references before making a request", async () => {
    expect(() => createAdmissionReaderWebDriverTransport("https://example.com")).toThrow(DRIVER.failures.origin);
    await expect(createAdmissionReaderWebDriverTransport("http://127.0.0.1:1234")("GET", "//example.com/status")).rejects.toThrow(DRIVER.failures.origin);
    await expect(connectAdmissionReaderWebDriver({ origin: "http://127.0.0.1:1234", url: "https://example.com", width: 390, height: 900 })).rejects.toThrow(DRIVER.failures.origin);
  });
});
