/** Issues one-use OAuth nonce material and compares its stored hash with a signed callback. */
import "server-only";
import {timingSafeEqual} from "node:crypto";
import {GLOBAL_REAUTHENTICATION_NONCE_BYTES,GLOBAL_REAUTHENTICATION_NONCE_HASH_ALGORITHM} from "@/src/modules/auth/constants/recent-authentication";

/**
 * Generates a cryptographic nonce once; the writer persists only its digest.
 * @returns Plaintext for the existing OAuth URL and a private SHA-256 digest.
 */
export async function issueGlobalReauthenticationNonce():Promise<{nonce:string;nonceHash:Uint8Array}> {
  const bytes=crypto.getRandomValues(new Uint8Array(GLOBAL_REAUTHENTICATION_NONCE_BYTES));
  const nonce=Buffer.from(bytes).toString("base64url");
  bytes.fill(0);
  const nonceHash=new Uint8Array(await crypto.subtle.digest(GLOBAL_REAUTHENTICATION_NONCE_HASH_ALGORITHM,new TextEncoder().encode(nonce)));
  return {nonce,nonceHash};
}

/**
 * Compares the verified token's nonce with the server-issued digest, never a browser flag.
 * @param nonce - Claim from the same token accepted by the native Google verifier.
 * @param expectedHash - Digest stored when the owned intent began authorizing.
 * @returns False for absent material or a different nonce; equality uses the native safe primitive.
 */
export async function matchesGlobalReauthenticationNonce(nonce:string|null,expectedHash:Uint8Array|null):Promise<boolean> {
  if(!nonce||!expectedHash||expectedHash.byteLength!==GLOBAL_REAUTHENTICATION_NONCE_BYTES) return false;
  const actual=new Uint8Array(await crypto.subtle.digest(GLOBAL_REAUTHENTICATION_NONCE_HASH_ALGORITHM,new TextEncoder().encode(nonce)));
  return timingSafeEqual(actual,expectedHash);
}
