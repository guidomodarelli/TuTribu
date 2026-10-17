/** @vitest-environment node */
/** Observes actual WebKit checkbox events and settled state on the real policy page. @module admission-whatsapp-policy-interaction-tests */
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { webkit, type BrowserContext } from "@playwright/test";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { withAdmissionNextServer } from "@/tests/support/admission-next-server";
import { bindAdmissionBatchBrowserSession } from "@/tests/support/admission-batch-browser-fixture";
import { prepareAdmissionWhatsappBrowser } from "@/tests/support/admission-whatsapp-browser-fixture";
import { ADMISSION_WHATSAPP_POLICY_OBSERVATION as OBSERVATION } from "@/tests/support/constants/admission-whatsapp-policy-observation";
import { ADMISSION_WHATSAPP_BROWSER_VALIDATION as VALIDATION } from "@/tests/support/constants/admission-whatsapp-number";
import { ADMISSION_WHATSAPP_COPY } from "@/src/modules/academy-admissions/constants/admission-whatsapp-number";
import { ADMISSION_POLICY_BROWSER_COPY, ADMISSION_POLICY_SETTINGS_SEGMENT } from "@/src/modules/academy-admissions/constants/admission-policy-browser";
import { MESSAGING_KEY_PURPOSE } from "@/src/modules/messaging/constants/messaging-cryptography";
import { readMessagingHostingSecurityConfig } from "@/src/modules/messaging/infrastructure/config/messaging-hosting-security";

describe.skipIf(process.env.RUN_ADMISSION_BROWSER_TESTS !== "1")("native declared WhatsApp policy interaction", () => {
  it("should preserve each actual pointer toggle after initial account observation in WebKit", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const keyrings = Object.fromEntries(Object.values(MESSAGING_KEY_PURPOSE).map((purpose) => { const id = randomUUID(); return [purpose, { activeKeyId: id, keys: [{ id, materialBase64: randomBytes(32).toString("base64") }] }]; }));
      const messagingSecurity = { environment: OBSERVATION.securityEnvironment, securityEpoch: randomUUID(), keyringsJson: JSON.stringify(keyrings) };
      const config = await readMessagingHostingSecurityConfig({ MESSAGING_SECURITY_ENVIRONMENT: messagingSecurity.environment, MESSAGING_SECURITY_EPOCH: messagingSecurity.securityEpoch, MESSAGING_RECOVERY_LOCK: "false", MESSAGING_KEYRINGS_JSON: messagingSecurity.keyringsJson });
      const fixture = await prepareAdmissionWhatsappBrowser(database, config);
      const initialPolicy = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select requires_whatsapp_number,version,verification_epoch from public.academy_admission_policies where tribe_id=${fixture.tribeId}`)).rows);
      expect(initialPolicy[0]?.requires_whatsapp_number).toBe(false);
      await database.withServerEnvironment((environment) => withAdmissionNextServer(environment, fixture.slug, async (origin, secret) => {
        const browser = await webkit.launch({ headless: true });
        let context: BrowserContext | null = null, storedPolicy: unknown = null, policyWrites = 0;
        const observations: object[] = [], lost: object[] = [], pageErrorNames: string[] = [];
        try {
          context = await browser.newContext({ viewport: { width: VALIDATION.widths[0], height: VALIDATION.height } });
          const page = await context.newPage();
          page.setDefaultTimeout(VALIDATION.actionTimeoutMs);
          page.on("pageerror", (error) => pageErrorNames.push(error.name));
          page.on("request", (request) => { if (request.method() === "PUT" && new URL(request.url()).pathname.endsWith("/policy")) policyWrites += 1; });
          await page.addInitScript(({ label, maximumEvents }) => {
            const records: object[] = [], identities = new WeakMap<Element, number>();
            let nextIdentity = 0, previous = "";
            /** @returns The publicly labelled checkbox and its label group, without reading private page data. */
            const control = () => {
              const caption = Array.from(document.querySelectorAll("label")).find((element) => element.textContent?.trim() === label);
              return { caption, element: caption ? document.getElementById(caption.htmlFor) : null };
            };
            /** @param kind - Native event or mutation. @param event - Optional actual pointer event. @returns Nothing; stores bounded structural observations only. */
            const record = (kind: string, event?: Event) => {
              const { caption, element } = control();
              if (!element || records.length >= maximumEvents) return;
              if (!identities.has(element)) identities.set(element, ++nextIdentity);
              const state = { instance: identities.get(element), checked: element.getAttribute("aria-checked"), disabled: element.hasAttribute("disabled"), fieldsetDisabled: element.closest("fieldset")?.disabled ?? false, busy: element.closest("form")?.getAttribute("aria-busy") };
              const fingerprint = JSON.stringify(state);
              if (kind === "mutation" && fingerprint === previous) return;
              previous = fingerprint;
              const rectangle = element.getBoundingClientRect(), style = getComputedStyle(element), scrollPositions = [];
              for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) if (ancestor.scrollTop || ancestor.scrollLeft) scrollPositions.push({ tag: ancestor.tagName, top: ancestor.scrollTop, left: ancestor.scrollLeft });
              records.push({ kind, time: performance.now(), ...state, trusted: event?.isTrusted ?? null, withinGroup: event?.target instanceof Node ? Boolean(caption?.parentElement?.contains(event.target)) : null, targetTag: event?.target instanceof Element ? event.target.tagName : null, point: event instanceof MouseEvent ? { x: event.clientX, y: event.clientY } : null, rectangle: { left: rectangle.left, top: rectangle.top, width: rectangle.width, height: rectangle.height }, transform: style.transform, transformOrigin: style.transformOrigin, documentScrollBehavior: getComputedStyle(document.documentElement).scrollBehavior, scrollY, scrollPositions });
            };
            for (const type of ["pointerdown", "pointerup", "click", "focusin"]) {
              document.addEventListener(type, (event) => record(`${type}:capture`, event), true);
              document.addEventListener(type, (event) => record(`${type}:bubble`, event));
            }
            document.addEventListener("scroll", () => record("scroll"), { capture: true, passive: true });
            new MutationObserver(() => record("mutation")).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-checked", "disabled", "aria-busy"] });
            (window as unknown as { declaredWhatsappPolicyEvents: object[] }).declaredWhatsappPolicyEvents = records;
          }, { label: ADMISSION_WHATSAPP_COPY.policyLabel, maximumEvents: OBSERVATION.maximumEvents });
          await bindAdmissionBatchBrowserSession(context, fixture.leader, origin, secret);
          const url = `${origin}/${fixture.slug}/${ADMISSION_POLICY_SETTINGS_SEGMENT}`;
          for (const motionPreference of OBSERVATION.motionPreferences) {
            await page.emulateMedia({ reducedMotion: motionPreference });
            const lostBeforeMode = lost.length;
            for (let loadIndex = 0; loadIndex < OBSERVATION.loads; loadIndex += 1) {
              await page.goto(url);
              const checkbox = page.getByRole("checkbox", { name: ADMISSION_WHATSAPP_COPY.policyLabel });
              await checkbox.waitFor();
              const trials = [];
              for (let trialIndex = 0; trialIndex < OBSERVATION.togglesPerLoad; trialIndex += 1) {
                const before = await checkbox.isChecked(), wanted = !before;
                let actionError = false;
                try { await checkbox.setChecked(wanted); } catch { actionError = true; }
                const immediate = await checkbox.isChecked();
                await page.waitForTimeout(OBSERVATION.settleObservationMs);
                const settled = await checkbox.isChecked();
                const trial = { motionPreference, loadIndex, trialIndex, before, wanted, immediate, settled, actionError, draftNoticeVisible: await page.locator("main:visible").getByText(ADMISSION_POLICY_BROWSER_COPY.draftChanged, { exact: true }).first().isVisible() };
                trials.push(trial); if (settled !== wanted) { lost.push(trial); break; }
              }
              observations.push({ motionPreference, loadIndex, trials, events: await page.evaluate(() => (window as unknown as { declaredWhatsappPolicyEvents: object[] }).declaredWhatsappPolicyEvents) });
              if (lost.length > lostBeforeMode) break;
            }
          }
          expect(policyWrites).toBe(0);
          storedPolicy = await database.withContext(fixture.own, async (transaction) => (await transaction.execute(sql`select requires_whatsapp_number,version,verification_epoch from public.academy_admission_policies where tribe_id=${fixture.tribeId}`)).rows);
          expect(storedPolicy).toEqual(initialPolicy);
          expect(pageErrorNames).toEqual([]);
          expect(lost).toEqual([]);
        } finally {
          try {
            const directory = process.env[OBSERVATION.directoryEnvironment];
            if (directory) { await mkdir(directory, { recursive: true }); await writeFile(join(directory, "webkit-policy-interaction.json"), JSON.stringify({ policyWrites, initialPolicy, storedPolicy, pageErrorNames, lost, observations }, null, 2)); }
          } finally { try { await context?.close(); } finally { await browser.close(); } }
        }
      }, { messagingSecurity }));
    });
  }, OBSERVATION.timeoutMs);
});
