/** @vitest-environment node */
/** Exercises an actual browser request with a private cookie and URL when the owned server resets its transport. @module private-browser-request-tests */
import { createServer } from "node:http";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { chromium } from "@playwright/test";
import { describe, expect, it } from "vitest";
import { runPrivateBrowserRequest } from "./private-browser-request";

describe("private browser request errors", () => {
  it("should discard a real transport call log while retaining only its public operation", async () => {
    const cookie = randomUUID(), privateRoute = randomUUID();
    let receivedPrivateCookie = false;
    const server = createServer((request) => { receivedPrivateCookie = request.headers.cookie?.includes(cookie) === true; request.socket.destroy(); });
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Private browser request test failed: owned server unavailable");
    const browser = await chromium.launch({ headless: true });
    try {
      const origin = `http://127.0.0.1:${address.port}`, context = await browser.newContext();
      try {
        await context.addCookies([{ name: "better-auth.session_token", value: cookie, url: origin, httpOnly: true }]);
        let failure: unknown;
        try { await runPrivateBrowserRequest("read_private_surface", () => context.request.get(`${origin}/private/${privateRoute}`)); }
        catch (error) { failure = error; }
        expect(receivedPrivateCookie).toBe(true);
        expect(failure instanceof Error).toBe(true);
        if (!(failure instanceof Error)) throw new Error("Private browser request test failed: safe failure unavailable");
        expect(failure.message === "PrivateBrowserRequest:read_private_surface failed: transport_unavailable").toBe(true);
        expect("cause" in failure).toBe(false);
        const artifact = JSON.stringify({ name: failure.name, message: failure.message, stack: failure.stack });
        expect([cookie, privateRoute].every((value) => !artifact.includes(value))).toBe(true);
      } finally { await context.close(); }
    } finally {
      await browser.close();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
