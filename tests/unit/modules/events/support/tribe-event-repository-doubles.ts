import { vi } from "vitest";

import type { TribeEventOccurrenceExceptionRepository } from "@/src/modules/events/domain/repositories/tribe-event-occurrence-exception-repository";
import type { TribeEventProposalRepository } from "@/src/modules/events/domain/repositories/tribe-event-proposal-repository";
import type { TribeEventRepository } from "@/src/modules/events/domain/repositories/tribe-event-repository";

/**
 * Doubles of the events ports (the boundary the use cases depend on). Each
 * method is a `vi.fn` the test overrides with the behavior it needs.
 */

export function createTribeEventRepositoryDouble(
  overrides: Partial<TribeEventRepository> = {}
) {
  return {
    clearAttendance: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    findById: vi.fn(),
    getOccurrenceAttendanceReport: vi.fn(),
    listByTribeRange: vi.fn(),
    listEventOccurrences: vi.fn(async () => ({ attendances: [], event: null, exceptions: [] })),
    listViewerAttendanceHistory: vi.fn(),
    setAttendance: vi.fn(),
    update: vi.fn(),
    ...overrides,
  } satisfies TribeEventRepository;
}

export function createTribeEventExceptionRepositoryDouble(
  overrides: Partial<TribeEventOccurrenceExceptionRepository> = {}
) {
  return {
    clear: vi.fn(),
    find: vi.fn(async () => null),
    listByEvent: vi.fn(async () => []),
    save: vi.fn(),
    ...overrides,
  } satisfies TribeEventOccurrenceExceptionRepository;
}

export function createTribeEventProposalRepositoryDouble(
  overrides: Partial<TribeEventProposalRepository> = {}
) {
  return {
    approve: vi.fn(),
    create: vi.fn(),
    list: vi.fn(),
    reject: vi.fn(),
    withdraw: vi.fn(),
    ...overrides,
  } satisfies TribeEventProposalRepository;
}
