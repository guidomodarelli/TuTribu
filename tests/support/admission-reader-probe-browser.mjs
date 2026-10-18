/** Composes actual browser adapters behind the synthetic probe's read-only observation port. */
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, webkit } from "@playwright/test";
import { configureAdmissionBrowserNativeFocus } from "./admission-browser-native-focus.mjs";
import { connectAdmissionReaderWebDriver, createAdmissionReaderWebDriverTransport } from "./admission-reader-webdriver.mjs";
import { ADMISSION_READER_PROBE as PROBE } from "./constants/admission-reader-probe.mjs";
import { ADMISSION_READER_WEBDRIVER as DRIVER } from "./constants/admission-reader-webdriver.mjs";

/** @returns An available local port; the subsequent driver must still prove that it owns a ready listener. */
async function availablePort() {
  const listener = createServer();
  await new Promise((fulfill, reject) => { listener.once("error", reject); listener.listen(0, DRIVER.host, fulfill); });
  const address = listener.address();
  await new Promise((fulfill, reject) => listener.close((error) => error ? reject(error) : fulfill()));
  if (!address || typeof address === "string") throw new Error(DRIVER.failures.startup);
  return address.port;
}

/** @param {{url:string,width:number,height:number}} options - Owned synthetic fixture. @returns The real stock WebKitGTK observation port. */
async function launchWebKitGtk(options) {
  if (process.platform !== "linux" || process.env.GITHUB_ACTIONS !== "true" || !process.env.DISPLAY) throw new Error(DRIVER.failures.platform);
  const port = await availablePort();
  const origin = `http://${DRIVER.host}:${port}`;
  const driver = spawn(DRIVER.binary, [`--host=${DRIVER.host}`, `--port=${port}`], { detached: true, stdio: "ignore", env: { ...process.env, LANG: PROBE.nativeBrowserLocale, LC_ALL: PROBE.nativeBrowserLocale } });
  let ended = false;
  const exited = new Promise((fulfill) => { const finish = () => { ended = true; fulfill(); }; driver.once("error", finish); driver.once("exit", finish); });
  /** @param {NodeJS.Signals} signal - Fixed termination signal for this isolated process group only. */
  function signalGroup(signal) {
    if (!driver.pid) return;
    try { process.kill(-driver.pid, signal); }
    catch (error) { if (error.code !== "ESRCH") throw error; }
  }
  /** @returns After the owned driver exited; escalates only its own isolated group. */
  async function stop() {
    signalGroup("SIGTERM");
    await Promise.race([exited, delay(DRIVER.stopTimeoutMs, undefined, { ref: false })]);
    if (!ended) { signalGroup("SIGKILL"); await exited; }
  }
  try {
    const command = createAdmissionReaderWebDriverTransport(origin);
    const deadline = Date.now() + DRIVER.startTimeoutMs;
    let ready = false;
    while (Date.now() < deadline && !ended) {
      try { ready = (await command("GET", "/status"))?.ready === true; }
      catch (error) { if (!(error instanceof Error) || error.message !== DRIVER.failures.transport) throw error; }
      if (ready) break;
      await delay(DRIVER.pollMs);
    }
    if (!ready || ended) throw new Error(DRIVER.failures.startup);
    const browser = await connectAdmissionReaderWebDriver({ origin, ...options });
    return { ...browser, async close() { try { await browser.close(); } finally { await stop(); } } };
  } catch (error) { await stop(); throw error; }
}

/**
 * @param {{engine:string,url:string,width:number,height:number}} options - Synthetic case only.
 * @returns A browser observation port; native keyboard and AT-SPI stay outside the adapter.
 */
export async function openAdmissionReaderProbeBrowser(options) {
  const backend = process.env[DRIVER.backendEnvironment] ?? DRIVER.backends.playwright;
  if (!Object.values(DRIVER.backends).includes(backend)) throw new Error(DRIVER.failures.backend);
  if (options.engine === "webkit" && backend === DRIVER.backends.webkitgtk) return launchWebKitGtk(options);
  const browser = await ({ chromium, webkit })[options.engine].launch({ headless: false, env: { ...process.env, LANG: PROBE.nativeBrowserLocale, LC_ALL: PROBE.nativeBrowserLocale }, ...(options.engine === "chromium" ? { args: PROBE.chromiumLaunchArguments } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: options.width, height: options.height }, reducedMotion: "reduce", locale: PROBE.locale });
    const page = await context.newPage();
    await page.goto(options.url, { waitUntil: "load" });
    const focusEmulationDisabled = await configureAdmissionBrowserNativeFocus(page);
    await page.bringToFront();
    const button = page.locator("#control");
    return {
      browserVersion: browser.version(), backend: DRIVER.backends.playwright, focusEmulationDisabled, viewport: page.viewportSize(),
      controlHasFocus: () => button.evaluate((element) => element.ownerDocument.hasFocus() && element === element.ownerDocument.activeElement),
      statusText: () => page.locator("#status").textContent(),
      screenshot: (path) => page.screenshot({ path }),
      close: () => browser.close(),
    };
  } catch (error) { await browser.close(); throw error; }
}
