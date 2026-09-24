import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getTribeEventCalendar,
  listTribeEvents,
} from "@/src/modules/events/application/use-cases/manage-tribe-events-use-cases";
import { listUpcomingTribeEvents } from "@/src/modules/events/application/use-cases/list-upcoming-tribe-events-use-case";
import {
  getTribeEventAttendanceReport,
  getTribeEventAttendanceStreak,
  setTribeEventAttendance,
} from "@/src/modules/events/application/use-cases/tribe-event-attendance-use-cases";
import {
  clearTribeEventOccurrenceException,
  saveTribeEventOccurrenceException,
} from "@/src/modules/events/application/use-cases/tribe-event-occurrence-exception-use-cases";
import { TRIBE_EVENT_MUTATION_STATUS } from "@/src/modules/events/constants/tribe-events";
import type {
  TribeEvent,
  TribeEventOccurrenceException,
} from "@/src/modules/events/domain/entities/tribe-event";
import type { TribeEventOccurrenceExceptionRepository } from "@/src/modules/events/domain/repositories/tribe-event-occurrence-exception-repository";
import {
  createTribeEventExceptionRepositoryDouble,
  createTribeEventRepositoryDouble,
} from "../support/tribe-event-repository-doubles";

const EVENT_ID = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f";
const TRIBE_SLUG = "matematica-pro";
// Before every May slot used below: those occurrences have not ended yet.
const BEFORE_MAY_SLOTS = () => Date.parse("2026-05-01T12:00:00.000Z");
// 14 May 22:30 UTC: the 14 May slot (21:00-22:00 UTC) already ended.
const AFTER_MAY_14_SLOT = () => Date.parse("2026-05-14T22:30:00.000Z");

// Weekly on Thursdays 18:00-19:00 Buenos Aires (21:00-22:00 UTC).
const weeklySeries: TribeEvent = {
  capacity: null,
  description: null,
  endsAt: "2026-05-07T22:00:00.000Z",
  eventType: "workshop",
  id: EVENT_ID,
  meetingUrl: null,
  recurrenceFrequency: "weekly",
  recurrenceUntil: null,
  startsAt: "2026-05-07T21:00:00.000Z",
  title: "Taller semanal",
};

function createException(
  overrides: Partial<TribeEventOccurrenceException> = {}
): TribeEventOccurrenceException {
  return {
    eventId: EVENT_ID,
    kind: "cancelled",
    newEndsAt: null,
    newStartsAt: null,
    originalStartsAt: "2026-05-14T21:00:00.000Z",
    reason: null,
    ...overrides,
  };
}

function createListing(exceptions: TribeEventOccurrenceException[], events = [weeklySeries]) {
  return {
    attendances: [],
    events,
    exceptions,
    pendingProposalCount: 0,
    viewerPermissions: { canManageEvents: true, canProposeEvents: false },
  };
}

describe("occurrence exceptions in the listing", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps a cancelled date struck in place and moves a date to its new day with a stable key", async () => {
    const execute = listTribeEvents({
      tribeEventOccurrenceExceptionRepository: createTribeEventExceptionRepositoryDouble(),
      tribeEventRepository: createTribeEventRepositoryDouble({
        listByTribeRange: vi.fn(async () =>
          createListing([
            createException({ reason: "Feriado" }),
            createException({
              kind: "moved",
              newStartsAt: "2026-05-22T21:00:00.000Z",
              originalStartsAt: "2026-05-21T21:00:00.000Z",
            }),
          ])
        ),
      }),
    });

    const result = await execute({
      eventTypes: [],
      month: "2026-05",
      occurrence: null,
      tribeSlug: TRIBE_SLUG,
    });

    expect(
      result.events.map((occurrence) => [
        occurrence.startsAt,
        occurrence.exception?.kind ?? null,
        occurrence.occurrenceKey,
      ])
    ).toEqual([
      ["2026-05-07T21:00:00.000Z", null, `${EVENT_ID}@2026-05-07T21:00:00.000Z`],
      ["2026-05-14T21:00:00.000Z", "cancelled", `${EVENT_ID}@2026-05-14T21:00:00.000Z`],
      ["2026-05-22T21:00:00.000Z", "moved", `${EVENT_ID}@2026-05-21T21:00:00.000Z`],
      ["2026-05-28T21:00:00.000Z", null, `${EVENT_ID}@2026-05-28T21:00:00.000Z`],
    ]);
    expect(result.events[1].exception).toEqual({ kind: "cancelled", reason: "Feriado" });
    expect(result.events[2]).toMatchObject({
      eventType: "workshop",
      originalStartsAt: "2026-05-21T21:00:00.000Z",
    });
  });

  it("attaches the attendance of a moved date through its original start", async () => {
    const execute = listTribeEvents({
      tribeEventOccurrenceExceptionRepository: createTribeEventExceptionRepositoryDouble(),
      tribeEventRepository: createTribeEventRepositoryDouble({
        listByTribeRange: vi.fn(async () => ({
          ...createListing([
            createException({
              kind: "moved",
              newStartsAt: "2026-06-02T21:00:00.000Z",
              originalStartsAt: "2026-05-28T21:00:00.000Z",
            }),
          ]),
          attendances: [
            {
              eventId: EVENT_ID,
              goingCount: 4,
              goingPreview: [],
              maybeCount: 0,
              occurrenceStartsAt: "2026-05-28T21:00:00.000Z",
              viewerStatus: "going" as const,
              viewerWaitlistPosition: null,
              waitlistedCount: 0,
            },
          ],
        })),
      }),
    });

    const result = await execute({
      eventTypes: [],
      month: "2026-06",
      occurrence: null,
      tribeSlug: TRIBE_SLUG,
    });

    expect(result.events[0]).toMatchObject({
      attendance: { goingCount: 4, viewerStatus: "going" },
      originalStartsAt: "2026-05-28T21:00:00.000Z",
      startsAt: "2026-06-02T21:00:00.000Z",
    });
  });

  it("filters the listing by event type when types are requested", async () => {
    const socialSeries: TribeEvent = {
      ...weeklySeries,
      eventType: "social",
      id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
      recurrenceFrequency: "none",
    };
    const execute = listTribeEvents({
      tribeEventOccurrenceExceptionRepository: createTribeEventExceptionRepositoryDouble(),
      tribeEventRepository: createTribeEventRepositoryDouble({
        listByTribeRange: vi.fn(async () => createListing([], [weeklySeries, socialSeries])),
      }),
    });

    const result = await execute({
      eventTypes: ["social"],
      month: "2026-05",
      occurrence: null,
      tribeSlug: TRIBE_SLUG,
    });

    expect(result.events.map((occurrence) => occurrence.eventType)).toEqual(["social"]);
  });

  it("opens a deep link without month in the month where the moved date is shown", async () => {
    const listByTribeRange = vi.fn(async () =>
      createListing([
        createException({
          kind: "moved",
          newStartsAt: "2026-06-02T21:00:00.000Z",
          originalStartsAt: "2026-05-28T21:00:00.000Z",
        }),
      ])
    );
    const find = vi.fn(async () =>
      createException({
        kind: "moved",
        newStartsAt: "2026-06-02T21:00:00.000Z",
        originalStartsAt: "2026-05-28T21:00:00.000Z",
      })
    );
    const key = `${EVENT_ID}@2026-05-28T21:00:00.000Z`;
    const execute = listTribeEvents({
      tribeEventOccurrenceExceptionRepository: createTribeEventExceptionRepositoryDouble({ find }),
      tribeEventRepository: createTribeEventRepositoryDouble({ listByTribeRange }),
    });

    const result = await execute({
      eventTypes: [],
      month: null,
      occurrence: { eventId: EVENT_ID, key, occurrenceStartsAt: "2026-05-28T21:00:00.000Z" },
      tribeSlug: TRIBE_SLUG,
    });

    expect(result.month.current).toBe("2026-06");
    expect(result.selectedOccurrenceKey).toBe(key);
    expect(find).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      originalStartsAt: "2026-05-28T21:00:00.000Z",
      tribeSlug: TRIBE_SLUG,
    });
  });

  it("leaves cancelled dates out of the upcoming list", async () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-05-10T12:00:00.000Z"));
    const execute = listUpcomingTribeEvents({
      tribeEventRepository: createTribeEventRepositoryDouble({
        listByTribeRange: vi.fn(async () => createListing([createException()])),
      }),
    });

    const result = await execute({ tribeSlug: TRIBE_SLUG });

    expect(result.events.map((occurrence) => occurrence.startsAt)).toEqual([
      "2026-05-21T21:00:00.000Z",
      "2026-05-28T21:00:00.000Z",
      "2026-06-04T21:00:00.000Z",
    ]);
  });
});

describe("saveTribeEventOccurrenceException", () => {
  function createUseCase(overrides: {
    find?: TribeEventOccurrenceExceptionRepository["find"];
    findById?: TribeEvent | null;
    now?: () => number;
    save?: TribeEventOccurrenceExceptionRepository["save"];
  } = {}) {
    const save =
      overrides.save ??
      vi.fn(async () => ({
        exception: createException(),
        status: TRIBE_EVENT_MUTATION_STATUS.exceptionSaved,
      }));
    const listEventOccurrences = vi.fn(async () => ({
      attendances: [],
      event: weeklySeries,
      exceptions: [createException()],
    }));
    const execute = saveTribeEventOccurrenceException({
      now: overrides.now ?? BEFORE_MAY_SLOTS,
      tribeEventOccurrenceExceptionRepository: createTribeEventExceptionRepositoryDouble({
        ...(overrides.find ? { find: overrides.find } : {}),
        save,
      }),
      tribeEventRepository: createTribeEventRepositoryDouble({
        findById: vi.fn(async () =>
          overrides.findById === undefined ? weeklySeries : overrides.findById
        ),
        listEventOccurrences,
      }),
    });

    return { execute, listEventOccurrences, save };
  }

  const cancelCommand = {
    eventId: EVENT_ID,
    kind: "cancelled" as const,
    newEndsAt: null,
    newStartsAt: null,
    originalStartsAt: "2026-05-14T21:00:00.000Z",
    reason: "Feriado",
    tribeSlug: TRIBE_SLUG,
    visibleMonth: "2026-05",
  };

  it("cancels a real date of the series and answers with the fresh month", async () => {
    const { execute, listEventOccurrences, save } = createUseCase();

    const result = await execute(cancelCommand);

    expect(result.status).toBe(TRIBE_EVENT_MUTATION_STATUS.exceptionSaved);
    expect(save).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      kind: "cancelled",
      newEndsAt: null,
      newStartsAt: null,
      originalStartsAt: "2026-05-14T21:00:00.000Z",
      reason: "Feriado",
      tribeSlug: TRIBE_SLUG,
    });
    expect(listEventOccurrences).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      rangeEnd: "2026-06-01T03:00:00.000Z",
      rangeStart: "2026-05-01T03:00:00.000Z",
      tribeSlug: TRIBE_SLUG,
    });
    expect(
      "occurrences" in result ? result.occurrences[1]?.exception : null
    ).toEqual({ kind: "cancelled", reason: null });
  });

  it("rejects single events and instants that are not a slot of the series", async () => {
    const single = createUseCase({
      findById: { ...weeklySeries, recurrenceFrequency: "none" },
    });
    const series = createUseCase();

    await expect(single.execute(cancelCommand)).resolves.toEqual({
      status: TRIBE_EVENT_MUTATION_STATUS.invalidOccurrence,
    });
    await expect(
      series.execute({ ...cancelCommand, originalStartsAt: "2026-05-15T21:00:00.000Z" })
    ).resolves.toEqual({ status: TRIBE_EVENT_MUTATION_STATUS.invalidOccurrence });
    expect(single.save).not.toHaveBeenCalled();
    expect(series.save).not.toHaveBeenCalled();
  });

  it("requires a new end after the new start when moving a date", async () => {
    const { execute, save } = createUseCase();

    await expect(
      execute({
        ...cancelCommand,
        kind: "moved",
        newEndsAt: "2026-05-15T20:00:00.000Z",
        newStartsAt: "2026-05-15T21:00:00.000Z",
      })
    ).resolves.toEqual({ status: TRIBE_EVENT_MUTATION_STATUS.invalidDate });
    expect(save).not.toHaveBeenCalled();
  });

  it("forwards the not found and forbidden outcomes", async () => {
    const missing = createUseCase({ findById: null });
    const forbidden = createUseCase({
      save: vi.fn(async () => ({ status: TRIBE_EVENT_MUTATION_STATUS.forbidden })),
    });

    await expect(missing.execute(cancelCommand)).resolves.toEqual({
      status: TRIBE_EVENT_MUTATION_STATUS.notFound,
    });
    await expect(forbidden.execute(cancelCommand)).resolves.toEqual({
      status: TRIBE_EVENT_MUTATION_STATUS.forbidden,
    });
  });

  it("restores a date and answers with the visible month", async () => {
    const clear = vi.fn(async () => ({ status: TRIBE_EVENT_MUTATION_STATUS.exceptionCleared }));
    const execute = clearTribeEventOccurrenceException({
      now: BEFORE_MAY_SLOTS,
      tribeEventOccurrenceExceptionRepository: createTribeEventExceptionRepositoryDouble({ clear }),
      tribeEventRepository: createTribeEventRepositoryDouble({
        findById: vi.fn(async () => weeklySeries),
        listEventOccurrences: vi.fn(async () => ({
          attendances: [],
          event: weeklySeries,
          exceptions: [],
        })),
      }),
    });

    const result = await execute({
      eventId: EVENT_ID,
      originalStartsAt: "2026-05-14T21:00:00.000Z",
      tribeSlug: TRIBE_SLUG,
      visibleMonth: "2026-05",
    });

    expect(result.status).toBe(TRIBE_EVENT_MUTATION_STATUS.exceptionCleared);
    expect("occurrences" in result ? result.occurrences : []).toHaveLength(4);
  });

  it("keeps an ended date frozen: no cancel, move, or restore", async () => {
    const { execute, save } = createUseCase({ now: AFTER_MAY_14_SLOT });
    const clear = vi.fn();
    const restore = clearTribeEventOccurrenceException({
      now: AFTER_MAY_14_SLOT,
      tribeEventOccurrenceExceptionRepository: createTribeEventExceptionRepositoryDouble({ clear }),
      tribeEventRepository: createTribeEventRepositoryDouble({
        findById: vi.fn(async () => weeklySeries),
      }),
    });

    await expect(execute(cancelCommand)).resolves.toEqual({
      status: TRIBE_EVENT_MUTATION_STATUS.occurrenceEnded,
    });
    await expect(
      restore({
        eventId: EVENT_ID,
        originalStartsAt: "2026-05-14T21:00:00.000Z",
        tribeSlug: TRIBE_SLUG,
        visibleMonth: "2026-05",
      })
    ).resolves.toEqual({ status: TRIBE_EVENT_MUTATION_STATUS.occurrenceEnded });
    expect(save).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });

  it("uses the effective time of a moved date and refuses moving a date into the past", async () => {
    // The 14 May slot was moved to 20 May, so it is still ahead at 14 May 22:30.
    const movedLater = createUseCase({
      find: vi.fn(async () =>
        createException({ kind: "moved", newStartsAt: "2026-05-20T21:00:00.000Z" })
      ),
      now: AFTER_MAY_14_SLOT,
    });
    const intoThePast = createUseCase({ now: BEFORE_MAY_SLOTS });

    await expect(movedLater.execute(cancelCommand)).resolves.toMatchObject({
      status: TRIBE_EVENT_MUTATION_STATUS.exceptionSaved,
    });
    await expect(
      intoThePast.execute({
        ...cancelCommand,
        kind: "moved",
        newStartsAt: "2026-04-20T21:00:00.000Z",
      })
    ).resolves.toEqual({ status: TRIBE_EVENT_MUTATION_STATUS.occurrenceEnded });
    expect(intoThePast.save).not.toHaveBeenCalled();
  });
});

describe("attendance with exceptions", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects answers for a cancelled date without touching attendance", async () => {
    const setAttendance = vi.fn();
    const execute = setTribeEventAttendance({
      now: BEFORE_MAY_SLOTS,
      tribeEventOccurrenceExceptionRepository: createTribeEventExceptionRepositoryDouble({
        find: vi.fn(async () => createException()),
      }),
      tribeEventRepository: createTribeEventRepositoryDouble({
        findById: vi.fn(async () => weeklySeries),
        setAttendance,
      }),
    });

    await expect(
      execute({
        eventId: EVENT_ID,
        occurrenceStartsAt: "2026-05-14T21:00:00.000Z",
        status: "going",
        tribeSlug: TRIBE_SLUG,
      })
    ).resolves.toEqual({ status: TRIBE_EVENT_MUTATION_STATUS.occurrenceCancelled });
    expect(setAttendance).not.toHaveBeenCalled();
  });

  it("decides whether a moved date ended with its new time, keyed by the original start", async () => {
    const setAttendance = vi.fn(async () => ({
      attendance: {
        goingCount: 1,
        goingPreview: [],
        maybeCount: 0,
        viewerStatus: "going" as const,
        viewerWaitlistPosition: null,
        waitlistedCount: 0,
      },
      status: TRIBE_EVENT_MUTATION_STATUS.attendanceSaved,
    }));
    const createExecute = (newStartsAt: string) =>
      setTribeEventAttendance({
        now: AFTER_MAY_14_SLOT,
        tribeEventOccurrenceExceptionRepository: createTribeEventExceptionRepositoryDouble({
          find: vi.fn(async () => createException({ kind: "moved", newStartsAt })),
        }),
        tribeEventRepository: createTribeEventRepositoryDouble({
          findById: vi.fn(async () => weeklySeries),
          setAttendance,
        }),
      });
    const answer = {
      eventId: EVENT_ID,
      occurrenceStartsAt: "2026-05-14T21:00:00.000Z",
      status: "going" as const,
      tribeSlug: TRIBE_SLUG,
    };

    // Original slot over, moved later: still open.
    await expect(createExecute("2026-05-20T21:00:00.000Z")(answer)).resolves.toMatchObject({
      status: TRIBE_EVENT_MUTATION_STATUS.attendanceSaved,
    });
    expect(setAttendance).toHaveBeenCalledWith(
      expect.objectContaining({ occurrenceStartsAt: "2026-05-14T21:00:00.000Z" })
    );
    // Moved earlier and already over: frozen.
    await expect(createExecute("2026-05-12T21:00:00.000Z")(answer)).resolves.toEqual({
      status: TRIBE_EVENT_MUTATION_STATUS.occurrenceEnded,
    });
    expect(setAttendance).toHaveBeenCalledTimes(1);
  });

  it("keeps cancelled dates out of the manager trend", async () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-06-01T12:00:00.000Z"));
    const getOccurrenceAttendanceReport = vi.fn(async () => ({
      attendees: [],
      status: TRIBE_EVENT_MUTATION_STATUS.found,
      trend: [],
    }));
    const execute = getTribeEventAttendanceReport({
      tribeEventOccurrenceExceptionRepository: createTribeEventExceptionRepositoryDouble({
        listByEvent: vi.fn(async () => [createException()]),
      }),
      tribeEventRepository: createTribeEventRepositoryDouble({
        findById: vi.fn(async () => weeklySeries),
        getOccurrenceAttendanceReport,
      }),
    });

    await execute({
      eventId: EVENT_ID,
      occurrenceStartsAt: "2026-05-28T21:00:00.000Z",
      tribeSlug: TRIBE_SLUG,
    });

    expect(getOccurrenceAttendanceReport).toHaveBeenCalledWith(
      expect.objectContaining({
        trendOccurrenceStartsAts: [
          "2026-05-07T21:00:00.000Z",
          "2026-05-21T21:00:00.000Z",
          "2026-05-28T21:00:00.000Z",
        ],
      })
    );
  });

  it("does not count a cancelled date in the viewer streak", async () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-06-01T12:00:00.000Z"));
    const execute = getTribeEventAttendanceStreak({
      tribeEventOccurrenceExceptionRepository: createTribeEventExceptionRepositoryDouble(),
      tribeEventRepository: createTribeEventRepositoryDouble({
        listViewerAttendanceHistory: vi.fn(async () => ({
          events: [weeklySeries],
          exceptions: [createException()],
          viewerAttendances: [
            {
              eventId: EVENT_ID,
              occurrenceStartsAt: "2026-05-14T21:00:00.000Z",
              status: "going" as const,
            },
            {
              eventId: EVENT_ID,
              occurrenceStartsAt: "2026-05-21T21:00:00.000Z",
              status: "going" as const,
            },
          ],
        })),
      }),
    });

    // Only 21 May counts: 14 May was cancelled, so the streak stays below 2.
    await expect(execute({ tribeSlug: TRIBE_SLUG })).resolves.toBeNull();
  });
});

describe("getTribeEventCalendar", () => {
  it("returns the series with its still-valid cancelled and moved dates", async () => {
    const execute = getTribeEventCalendar({
      tribeEventOccurrenceExceptionRepository: createTribeEventExceptionRepositoryDouble({
        listByEvent: vi.fn(async () => [
          createException(),
          createException({
            kind: "moved",
            newStartsAt: "2026-05-22T21:00:00.000Z",
            originalStartsAt: "2026-05-21T21:00:00.000Z",
          }),
          createException({ originalStartsAt: "2026-05-15T21:00:00.000Z" }),
        ]),
      }),
      tribeEventRepository: createTribeEventRepositoryDouble({
        findById: vi.fn(async () => weeklySeries),
      }),
    });

    const result = await execute({ eventId: EVENT_ID, tribeSlug: TRIBE_SLUG });

    expect(result?.event.recurrenceRule).toBe("FREQ=WEEKLY");
    expect(result?.occurrenceExceptions).toEqual([
      {
        endsAt: "2026-05-14T22:00:00.000Z",
        exception: { kind: "cancelled", reason: null },
        originalStartsAt: "2026-05-14T21:00:00.000Z",
        startsAt: "2026-05-14T21:00:00.000Z",
      },
      {
        endsAt: "2026-05-22T22:00:00.000Z",
        exception: { kind: "moved", reason: null },
        originalStartsAt: "2026-05-21T21:00:00.000Z",
        startsAt: "2026-05-22T21:00:00.000Z",
      },
    ]);
  });
});
