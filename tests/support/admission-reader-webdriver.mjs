/** Talks to the real W3C WebDriver HTTP boundary; never synthesizes input or reader output. */
import { writeFile } from "node:fs/promises";
import { ADMISSION_READER_WEBDRIVER as DRIVER } from "./constants/admission-reader-webdriver.mjs";

/**
 * @param {string} origin - Owned loopback driver, never a remote provider endpoint.
 * @returns A bounded transport that keeps provider payloads out of diagnostics.
 */
export function createAdmissionReaderWebDriverTransport(origin) {
  const parsedOrigin = new URL(origin);
  if (parsedOrigin.protocol !== "http:" || parsedOrigin.hostname !== DRIVER.host || parsedOrigin.username || parsedOrigin.password || parsedOrigin.pathname !== "/" || parsedOrigin.search || parsedOrigin.hash) throw new Error(DRIVER.failures.origin);
  return async function command(method, path, body) {
    if (!path.startsWith("/") || path.startsWith("//")) throw new Error(DRIVER.failures.origin);
    let response;
    try { response = await fetch(new URL(path, origin), { method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(DRIVER.requestTimeoutMs), redirect: "error" }); }
    catch (error) { throw new Error(DRIVER.failures.transport, { cause: error }); }
    let payload;
    try { payload = await response.json(); }
    catch (error) { throw new Error(DRIVER.failures.response, { cause: error }); }
    if (!response.ok || payload?.value?.error) throw new Error(`${DRIVER.failures.command}: ${method} ${response.status}`);
    if (!payload || !Object.hasOwn(payload, "value")) throw new Error(DRIVER.failures.response);
    return payload.value;
  };
}

/**
 * Creates a real MiniBrowser session, sizes its observed viewport and navigates the synthetic fixture.
 * @param {{origin:string,url:string,width:number,height:number}} options - Owned driver and fixture dimensions.
 * @returns A fixture-specific observation port; all input remains native X11 in the caller.
 */
export async function connectAdmissionReaderWebDriver({ origin, url, width, height }) {
  const fixtureUrl = new URL(url);
  if (fixtureUrl.protocol !== "http:" || fixtureUrl.hostname !== DRIVER.host || fixtureUrl.username || fixtureUrl.password || !Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0) throw new Error(DRIVER.failures.origin);
  const command = createAdmissionReaderWebDriverTransport(origin);
  const created = await command("POST", "/session", { capabilities: { alwaysMatch: { browserName: DRIVER.browserName } } });
  if (typeof created?.sessionId !== "string" || !/^[a-zA-Z0-9-]+$/u.test(created.sessionId)) throw new Error(DRIVER.failures.session);
  const prefix = `/session/${created.sessionId}`;
  let closed = false;
  /** @returns After requesting termination of this exact owned session once. */
  async function close() { if (closed) return; closed = true; await command("DELETE", prefix); }
  /** @param {string} script - Fixed read-only fixture inspection. @returns Native browser script result. */
  const inspect = (script) => command("POST", `${prefix}/execute/sync`, { script, args: [] });
  try {
    await command("POST", `${prefix}/window/rect`, { width, height });
    await command("POST", `${prefix}/url`, { url });
    const initial = await inspect(DRIVER.viewportScript);
    if (!initial || ![initial.width, initial.height, initial.outerWidth, initial.outerHeight].every(Number.isFinite)) throw new Error(DRIVER.failures.viewport);
    await command("POST", `${prefix}/window/rect`, { width: width + initial.outerWidth - initial.width, height: height + initial.outerHeight - initial.height });
    const viewport = await inspect(DRIVER.viewportScript);
    if (viewport?.width !== width || viewport?.height !== height) throw new Error(DRIVER.failures.viewport);
    return {
      browserVersion: created.capabilities?.browserVersion ?? "unreported",
      backend: DRIVER.backends.webkitgtk,
      focusEmulationDisabled: false,
      viewport: { width: viewport.width, height: viewport.height },
      controlHasFocus: async () => await inspect(DRIVER.controlFocusScript) === true,
      documentHasFocus: async () => await inspect(DRIVER.documentFocusScript) === true,
      statusText: () => inspect(DRIVER.statusScript),
      async screenshot(path) {
        const encoded = await command("GET", `${prefix}/screenshot`);
        if (typeof encoded !== "string" || !encoded || encoded.length > DRIVER.maximumScreenshotCharacters || !/^[a-zA-Z0-9+/]+={0,2}$/u.test(encoded)) throw new Error(DRIVER.failures.screenshot);
        const bytes = Buffer.from(encoded, "base64");
        if (bytes.toString("base64") !== encoded) throw new Error(DRIVER.failures.screenshot);
        await writeFile(path, bytes);
      },
      close,
    };
  } catch (error) {
    try { await close(); }
    catch (closeError) { throw new AggregateError([error, closeError], DRIVER.failures.session, { cause: closeError }); }
    throw error;
  }
}
