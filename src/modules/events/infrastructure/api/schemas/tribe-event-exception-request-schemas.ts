import { z } from "zod";

import type { TribeEventOccurrenceExceptionInput } from "@/src/modules/events/application/commands/tribe-event-command";
import {
  TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND,
  TRIBE_EVENT_OCCURRENCE_EXCEPTION_REASON_MAX_LENGTH,
} from "@/src/modules/events/constants/tribe-events";
import {
  createOptionalTextFieldSchema,
  createTribeEventInstantSchema,
  tribeEventMonthSchema,
} from "@/src/modules/events/infrastructure/api/schemas/tribe-event-input-fields";
import { TRIBE_EVENT_INPUT_ISSUE } from "@/src/modules/events/infrastructure/api/schemas/tribe-event-input-issue";

/**
 * Input contracts of `app/api/tribes/[slug]/events/[eventId]/exceptions`:
 * cancel or move one date of a series (PUT) and restore it (DELETE). Params
 * reuse `tribeEventRouteParamsSchema`.
 */

/**
 * Body of `PUT .../exceptions`. A moved date needs its new start; a
 * cancelled date drops any new time it may carry. Whether the original start
 * is a real slot of the series is a business rule of the use case.
 */
export const tribeEventOccurrenceExceptionBodySchema = z
  .object(
    {
      kind: z.enum(TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND, {
        error: TRIBE_EVENT_INPUT_ISSUE.invalidException,
      }),
      newEndsAt: createOptionalTextFieldSchema(
        TRIBE_EVENT_INPUT_ISSUE.invalidDate,
        createTribeEventInstantSchema(TRIBE_EVENT_INPUT_ISSUE.invalidDate)
      ),
      newStartsAt: createOptionalTextFieldSchema(
        TRIBE_EVENT_INPUT_ISSUE.invalidDate,
        createTribeEventInstantSchema(TRIBE_EVENT_INPUT_ISSUE.invalidDate)
      ),
      originalStartsAt: createTribeEventInstantSchema(TRIBE_EVENT_INPUT_ISSUE.invalidException),
      reason: createOptionalTextFieldSchema(
        TRIBE_EVENT_INPUT_ISSUE.invalidInput,
        z.string().max(TRIBE_EVENT_OCCURRENCE_EXCEPTION_REASON_MAX_LENGTH, {
          error: TRIBE_EVENT_INPUT_ISSUE.invalidInput,
        })
      ),
    },
    { error: TRIBE_EVENT_INPUT_ISSUE.invalidException }
  )
  .refine(
    (body) =>
      body.kind !== TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND.moved || body.newStartsAt !== null,
    { error: TRIBE_EVENT_INPUT_ISSUE.invalidMove, path: ["newStartsAt"] }
  )
  .transform(
    (body): TribeEventOccurrenceExceptionInput =>
      body.kind === TRIBE_EVENT_OCCURRENCE_EXCEPTION_KIND.moved
        ? body
        : { ...body, newEndsAt: null, newStartsAt: null }
  );

/**
 * Wire shape the browser sends to `PUT .../exceptions`.
 */
export type TribeEventOccurrenceExceptionRequestBody = z.input<
  typeof tribeEventOccurrenceExceptionBodySchema
>;

/**
 * `?month=` (visible month to answer with) of `PUT .../exceptions`.
 */
export const tribeEventExceptionSaveQuerySchema = z.object({
  month: tribeEventMonthSchema.optional(),
});

/**
 * `?occurrence=&month=` of `DELETE .../exceptions` ("Restaurar fecha"): the
 * original start of the date to restore and the visible month.
 */
export const tribeEventExceptionClearQuerySchema = z.object({
  month: tribeEventMonthSchema.optional(),
  occurrence: createTribeEventInstantSchema(TRIBE_EVENT_INPUT_ISSUE.invalidException),
});
