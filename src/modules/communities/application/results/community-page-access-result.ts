import type { CommunityResult } from "./community-result";

export type CommunityPageAccessResult =
  | {
      status: "visible";
      community: CommunityResult;
    }
  | {
      status: "hidden";
      reason:
        | "unauthenticated_hidden"
        | "blocked_hidden"
        | "not_found_or_not_visible";
    };
