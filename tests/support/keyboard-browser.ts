/** Drives native browser controls by keyboard only, proving focus reaches each control before it is activated. @module keyboard-browser */
import { expect } from "vitest";
import type { Locator } from "@playwright/test";

/** @param control - Visible control. @param key - Activation key. @returns Once the control holds keyboard focus and received the key, without a pointer event. */
export async function pressFocused(control: Locator, key: "Enter" | "Space"): Promise<void> {
  await control.focus();
  await expect.poll(() => control.evaluate((element) => element === document.activeElement)).toBe(true);
  await control.press(key);
}
