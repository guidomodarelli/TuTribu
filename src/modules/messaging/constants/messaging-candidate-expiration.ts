/** Keeps candidate retirement deadlines separate from active-channel diagnostics and credential key rotation. @module messaging-candidate-expiration-constants */
import { MILLISECONDS_PER_SECOND, SECONDS_PER_DAY } from "@/src/constants/time";

/** Bounds byte destruction after the candidate's original idle expiration; late maintenance does not extend it. */
export const MESSAGING_EXPIRED_CANDIDATE_PURGE_WINDOW_MS = SECONDS_PER_DAY * MILLISECONDS_PER_SECOND;

/** Names closed assessment outcomes; these facts do not grant backend maintenance authority. */
export const MESSAGING_CANDIDATE_EXPIRATION_REASON = { selectedConnection: "selected_connection", notCandidate: "not_candidate", resourceRetired: "resource_retired", connectionRetired: "connection_retired", clockUnavailable: "clock_unavailable", activityUnavailable: "activity_unavailable", candidateCurrent: "candidate_current" } as const;

/** Bounds private candidate maintenance independently from provider dispatch or public pagination. */
export const MESSAGING_CANDIDATE_MAINTENANCE = { defaultBatchSize: 50, maximumBatchSize: 100, operation: "expire_abandoned_candidates", retirementReason: "candidate_expired" } as const;
