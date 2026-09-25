import type { TribeEventType } from "@/src/modules/events/application/results/tribe-event-result";
import type { TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND } from "@/src/modules/events/constants/tribe-events";

/**
 * UI contracts the event dialogs emit on submit. They describe what the
 * person chose in the form, not an endpoint wire shape: the browser adapters
 * (`tribe-event-proposals-api-client.ts`, `tribe-events-api-client.ts`)
 * translate them to request bodies, so a transport change never reaches the
 * presentational dialogs.
 */

/**
 * Meeting a member proposes from the reduced proposal form.
 */
export type TribeEventProposalSubmission = {
  description: string;
  durationMinutes: number;
  eventType: TribeEventType;
  /** ISO instant built from the Buenos Aires date and start time. */
  startsAt: string;
  title: string;
};

/**
 * Change requested for one date of a series. The dialog does not know the
 * original start: the owner of the selected occurrence adds it when it
 * builds the request.
 */
export type TribeEventOccurrenceExceptionSubmission =
  | {
      kind: typeof TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND.cancelled;
      reason: string;
    }
  | {
      kind: typeof TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND.moved;
      /** ISO end of the moved date, or null when it has no explicit end. */
      newEndsAt: string | null;
      newStartsAt: string;
      reason: string;
    };
