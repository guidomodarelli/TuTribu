/**
 * Models the one-use global intent without persisting a plaintext nonce.
 *
 * @module global-reauthentication-intent
 */
import type { RecentAuthenticationScope } from "./recent-authentication-evidence";

/** Facts already resolved after the signed nonce has been compared with its stored hash. */
export type GlobalReauthenticationIntentFacts = Omit<RecentAuthenticationScope, "sessionId"> & {
  id: string;
  originalSessionId: string;
  nonceVerified: boolean;
  consumedAt: Date | null;
  expiresAt: Date;
};

/** Stores only nonce hash and scope; cryptographic matching produces facts separately. */
export type GlobalReauthenticationIntent = Omit<GlobalReauthenticationIntentFacts, "nonceVerified"> & {
  nonceHash: Uint8Array | null;
  createdAt: Date;
  status: "created" | "authorizing" | "consumed" | "expired";
  returnPath: string;
};
