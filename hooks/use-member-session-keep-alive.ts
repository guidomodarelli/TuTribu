"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  MEMBER_SESSION_KEEP_ALIVE_MIN_INTERVAL_MS,
  MEMBER_SESSION_REFRESH_STATUS,
} from "@/src/modules/auth/constants/session";
import { refreshMemberSession } from "@/src/modules/auth/infrastructure/better-auth/client";

const VISIBLE_DOCUMENT_STATE = "visible";

/**
 * Keeps the 180-day member session sliding while the member uses the app.
 *
 * Server renders only read the session, so the browser cookie is renewed here:
 * once when the platform loads and again when the tab becomes visible after
 * the throttle window. A failed renewal does not consume the window, so the
 * next time the tab becomes visible it retries. When the server no longer
 * recognizes the session, or it now belongs to another member, the route is
 * refreshed, because the authentication state changed and every
 * server-rendered view must stop showing the rendered member.
 *
 * @param authenticatedMemberId - Member the server rendered the page for, or
 * `null` for visitors.
 */
export function useMemberSessionKeepAlive(
  authenticatedMemberId: string | null
): void {
  const { refresh } = useRouter();

  useEffect(() => {
    if (authenticatedMemberId === null) {
      return;
    }

    const abortController = new AbortController();
    let lastRenewalStartedAt: number | null = null;
    let isRenewalInFlight = false;

    const renewSession = async () => {
      const now = Date.now();
      const isThrottled =
        lastRenewalStartedAt !== null &&
        now - lastRenewalStartedAt < MEMBER_SESSION_KEEP_ALIVE_MIN_INTERVAL_MS;

      if (isRenewalInFlight || isThrottled) {
        return;
      }

      isRenewalInFlight = true;
      const previousRenewalStartedAt = lastRenewalStartedAt;
      lastRenewalStartedAt = now;
      const status = await refreshMemberSession(
        abortController.signal,
        authenticatedMemberId
      );
      isRenewalInFlight = false;

      if (abortController.signal.aborted) {
        return;
      }

      if (status === MEMBER_SESSION_REFRESH_STATUS.failed) {
        lastRenewalStartedAt = previousRenewalStartedAt;
        return;
      }

      if (status === MEMBER_SESSION_REFRESH_STATUS.expired) {
        refresh();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === VISIBLE_DOCUMENT_STATE) {
        void renewSession();
      }
    };

    void renewSession();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      abortController.abort();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [authenticatedMemberId, refresh]);
}
