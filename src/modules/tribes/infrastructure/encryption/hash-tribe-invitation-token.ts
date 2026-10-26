/** Keeps the existing historical digest format shared by arrival and legacy access adapters. @module hash-tribe-invitation-token */
import { createHash } from "node:crypto";

/**
 * Computes the established SHA-256 hexadecimal lookup without retaining its bearer.
 * @param token - Boundary-normalized opaque historical token.
 * @returns Existing database lookup format; never an authorization claim.
 */
export function hashTribeInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
