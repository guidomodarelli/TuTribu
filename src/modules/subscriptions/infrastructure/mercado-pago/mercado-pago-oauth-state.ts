/**
 * Signs and verifies Mercado Pago OAuth state payloads.
 *
 * @module mercado-pago-oauth-state
 */

import { createHmac, randomBytes, timingSafeEqual } from "crypto";

const MERCADO_PAGO_OAUTH_STATE = {
  encoding: "base64url",
  separator: ".",
  signatureAlgorithm: "sha256",
  tribeType: "tribe",
} as const;

type MercadoPagoOAuthStatePayload = {
  memberId: string;
  nonce: string;
  tribeSlug: string;
  type: typeof MERCADO_PAGO_OAUTH_STATE.tribeType;
};

export type VerifiedMercadoPagoOAuthState = {
  memberId: string;
  tribeSlug: string;
};

/**
 * Builds an opaque OAuth state value signed with a server-only secret.
 *
 * @param input - Tribe and member identity that starts the OAuth flow.
 * @returns Signed state value for the provider redirect.
 */
export function buildMercadoPagoOAuthState(input: {
  memberId: string;
  tribeSlug: string;
}): string {
  const payload: MercadoPagoOAuthStatePayload = {
    memberId: input.memberId,
    nonce: randomBytes(16).toString(MERCADO_PAGO_OAUTH_STATE.encoding),
    tribeSlug: input.tribeSlug,
    type: MERCADO_PAGO_OAUTH_STATE.tribeType,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    MERCADO_PAGO_OAUTH_STATE.encoding
  );

  return [
    encodedPayload,
    signMercadoPagoOAuthStatePayload(encodedPayload),
  ].join(MERCADO_PAGO_OAUTH_STATE.separator);
}

/**
 * Verifies and decodes an OAuth state value.
 *
 * @param state - State value received in the OAuth callback.
 * @returns Verified state identity, or null when invalid.
 */
export function verifyMercadoPagoOAuthState(
  state: string | null
): VerifiedMercadoPagoOAuthState | null {
  if (!state) {
    return null;
  }

  const [encodedPayload, receivedSignature] = state.split(
    MERCADO_PAGO_OAUTH_STATE.separator
  );

  if (!encodedPayload || !receivedSignature) {
    return null;
  }

  const expectedSignature = signMercadoPagoOAuthStatePayload(encodedPayload);

  if (!safeCompareHex(receivedSignature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, MERCADO_PAGO_OAUTH_STATE.encoding).toString(
        "utf8"
      )
    ) as Partial<MercadoPagoOAuthStatePayload>;

    if (
      payload.type !== MERCADO_PAGO_OAUTH_STATE.tribeType ||
      !payload.tribeSlug ||
      !payload.memberId
    ) {
      return null;
    }

    return {
      memberId: payload.memberId,
      tribeSlug: payload.tribeSlug,
    };
  } catch {
    return null;
  }
}

/**
 * Signs a state payload using the Mercado Pago application secret.
 *
 * @param encodedPayload - Base64url encoded state payload.
 * @returns Hex HMAC signature.
 */
function signMercadoPagoOAuthStatePayload(encodedPayload: string): string {
  const secret = process.env.MERCADO_PAGO_CLIENT_SECRET;

  if (!secret) {
    throw new Error("MERCADO_PAGO_CLIENT_SECRET is required for OAuth state");
  }

  return createHmac(MERCADO_PAGO_OAUTH_STATE.signatureAlgorithm, secret)
    .update(encodedPayload)
    .digest("hex");
}

/**
 * Compares two hex strings without leaking timing differences.
 *
 * @param receivedValue - Untrusted received hex value.
 * @param expectedValue - Expected hex value.
 * @returns Whether both values are equal.
 */
function safeCompareHex(receivedValue: string, expectedValue: string): boolean {
  const receivedBuffer = Buffer.from(receivedValue, "hex");
  const expectedBuffer = Buffer.from(expectedValue, "hex");

  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}
