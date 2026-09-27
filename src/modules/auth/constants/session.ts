const SECONDS_PER_DAY = 86_400;
const MILLISECONDS_PER_SECOND = 1_000;
const SECONDS_PER_HOUR = 3_600;

/** Days a member stays signed in since their last visit before signing in again. */
export const MEMBER_SESSION_LIFETIME_DAYS = 180;

/**
 * Sliding session lifetime shared by the database row and the session cookie.
 * Better Auth pushes both expirations forward by `expiresIn` whenever a
 * refresh runs, which happens at most once per `updateAge` window.
 */
export const BETTER_AUTH_SESSION_OPTIONS = {
  expiresIn: MEMBER_SESSION_LIFETIME_DAYS * SECONDS_PER_DAY,
  updateAge: SECONDS_PER_DAY,
} as const satisfies { expiresIn: number; updateAge: number };

/**
 * Minimum time between two client keep-alive requests from the same page. The
 * server only writes after `updateAge`, so extra requests are plain reads; the
 * throttle keeps tab switching from flooding the session endpoint.
 */
export const MEMBER_SESSION_KEEP_ALIVE_MIN_INTERVAL_MS =
  SECONDS_PER_HOUR * MILLISECONDS_PER_SECOND;

/** Outcome of a client keep-alive request against the Better Auth session endpoint. */
export type MemberSessionRefreshStatus = "active" | "expired" | "failed";

export const MEMBER_SESSION_REFRESH_STATUS = {
  active: "active",
  expired: "expired",
  failed: "failed",
} as const satisfies Record<MemberSessionRefreshStatus, MemberSessionRefreshStatus>;
