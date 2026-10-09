/** Builds a one-way browser recovery scope, never a server authorization proof. @module personal-invitation-scope */
import { PERSONAL_INVITATION_BROWSER_HASH } from "@/src/modules/academy-admissions/constants/personal-invitation-browser";
import { PERSONAL_INVITATION_TOKEN } from "@/src/modules/academy-admissions/constants/personal-invitation-token";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";

/** @param token - Canonical opaque proposal already present in the route. @returns A one-way, domain-separated scope for references only. @throws When token or native cryptography cannot be used safely. */
export async function createPersonalInvitationBrowserScope(token: string): Promise<string> {
  if (!PERSONAL_INVITATION_TOKEN.canonicalPattern.test(token) || !globalThis.crypto?.subtle) throw new Error(ADMISSION_ERROR_CODE.invalidInput);
  const material = new TextEncoder().encode(`${PERSONAL_INVITATION_BROWSER_HASH.domain}${token}`);
  const digest = await globalThis.crypto.subtle.digest(PERSONAL_INVITATION_BROWSER_HASH.algorithm, material);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(PERSONAL_INVITATION_BROWSER_HASH.radix).padStart(PERSONAL_INVITATION_BROWSER_HASH.byteWidth, "0")).join("");
}
