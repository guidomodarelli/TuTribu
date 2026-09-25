import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { TRIBE_EVENT_CALENDAR_FEED_TOKEN } from "@/src/modules/events/constants/tribe-event-calendar-feed";
import type { TribeEventCalendarFeedTokenCodec } from "@/src/modules/events/domain/repositories/tribe-event-calendar-feed-repository";

const TOKEN_ENCODING = "base64url";
const HASH_ALGORITHM = "sha256";
const HASH_ENCODING = "hex";
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;

/**
 * Crypto adapter of the calendar feed tokens.
 *
 * A token is 32 bytes from the CSPRNG (256 bits of entropy), so a plain
 * SHA-256 digest is enough to store it: there is nothing to brute-force that
 * a slow KDF (bcrypt, scrypt, argon2) would protect, unlike a human password,
 * and a fast digest lets every calendar poll resolve the token with one index
 * lookup. The stored digest is compared again with `timingSafeEqual` after
 * the lookup, as defense in depth.
 */
export const calendarFeedTokenCodec: TribeEventCalendarFeedTokenCodec = {
  generate() {
    const token = randomBytes(TRIBE_EVENT_CALENDAR_FEED_TOKEN.byteLength).toString(TOKEN_ENCODING);

    return { token, tokenHash: calendarFeedTokenCodec.hash(token) };
  },
  hash(token) {
    return createHash(HASH_ALGORITHM).update(token).digest(HASH_ENCODING);
  },
  matchesHash(candidateHash, storedHash) {
    if (!SHA256_HEX_PATTERN.test(candidateHash) || !SHA256_HEX_PATTERN.test(storedHash)) {
      return false;
    }

    return timingSafeEqual(
      Buffer.from(candidateHash, HASH_ENCODING),
      Buffer.from(storedHash, HASH_ENCODING)
    );
  },
};
