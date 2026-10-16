import type { HTMLAttributeReferrerPolicy } from "react";

/**
 * Referrer policy for member profile photos. They are hosted by the identity
 * provider (Google), which rejects some cross-site requests that carry a
 * `Referer`, so the photo fails and the avatar falls back to the initials.
 * Omitting the referrer also keeps the visited TuTribu page private.
 */
export const MEMBER_AVATAR_REFERRER_POLICY = "no-referrer" satisfies HTMLAttributeReferrerPolicy;
