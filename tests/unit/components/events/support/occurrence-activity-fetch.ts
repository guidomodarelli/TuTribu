import type { Mock } from "vitest";

/**
 * The occurrence detail mounts its activity container (post-event block and
 * conversation), which loads on its own. Calendar tests that focus on other
 * flows route those requests to empty answers and hand every other request
 * to `apiFetch`, so their call order and queued responses stay unchanged.
 */
const OCCURRENCE_ACTIVITY_PATH_PATTERN = /\/events\/[^/]+\/(?:post-event|comments)(?:\?|$)/;

const EMPTY_ACTIVITY_BODY = {
  canComment: false,
  comments: [],
  postEvent: {
    isCancelled: false,
    isFinished: true,
    materials: [],
    reactions: { counts: { fire: 0, neutral: 0, thumbs_up: 0 }, viewerReaction: null },
    recording: null,
    viewerPermissions: { canConvertToLesson: false, canManageResources: false, canParticipate: false },
  },
};

export function routeOccurrenceActivityRequests(apiFetch: Mock): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (OCCURRENCE_ACTIVITY_PATH_PATTERN.test(url) && (init?.method ?? "GET") === "GET") {
      return { json: async () => EMPTY_ACTIVITY_BODY, ok: true, status: 200 };
    }

    return apiFetch(input, init);
  }) as typeof fetch;
}
