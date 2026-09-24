import { describe, expect, it } from "vitest";

import {
  describeNotification,
  describeUnreadNotifications,
  formatUnreadBadge,
} from "@/lib/notifications/notification-presentation";
import type { NotificationItemResult } from "@/src/modules/notifications/application/results/notification-result";

const EVENT_ID = "6f3c7a1e-2b4d-4c8e-9f10-1a2b3c4d5e6f";
const PROPOSAL_ID = "5b6c7d8e-9f0a-4b1c-8d2e-3f4a5b6c7d8e";
// Thursday 7 May 2026, 18:00 in Buenos Aires.
const OCCURRENCE = "2026-05-07T21:00:00.000Z";
// Friday 8 May 2026, 19:30 in Buenos Aires.
const MOVED_TO = "2026-05-08T22:30:00.000Z";
const TRIBE = { name: "Matemática Pro", slug: "matematica-pro" };
const DEEP_LINK = `/matematica-pro/eventos?event=${encodeURIComponent(`${EVENT_ID}@${OCCURRENCE}`)}`;

function eventItem(
  type: Exclude<NotificationItemResult["type"], "event_proposal_reviewed">,
  overrides: Partial<{ eventTitle: string | null; startsAt: string }> = {}
): NotificationItemResult {
  return {
    createdAt: "2026-05-06T15:00:00.000Z",
    event: {
      eventId: EVENT_ID,
      eventTitle: "taller de álgebra",
      occurrenceStartsAt: OCCURRENCE,
      startsAt: OCCURRENCE,
      ...overrides,
    },
    id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
    readAt: null,
    tribe: TRIBE,
    type,
  };
}

describe("describeNotification", () => {
  it("builds reminder copy in Buenos Aires time with the occurrence deep link", () => {
    expect(describeNotification(eventItem("event_reminder_24h"))).toEqual({
      detail: "Jueves 7 de mayo a las 18:00 · Matemática Pro",
      href: DEEP_LINK,
      sentAtLabel: "06 may · 12:00",
      title: "Mañana: taller de álgebra",
    });
    expect(describeNotification(eventItem("event_reminder_15m"))).toMatchObject({
      detail: "18:00 · Matemática Pro",
      title: "Taller de álgebra empieza en 15 minutos",
    });
  });

  it("describes a promotion, a cancelled date, and a moved date", () => {
    expect(describeNotification(eventItem("event_waitlist_promoted")).title).toBe(
      "¡Se liberó un lugar! Ya estás confirmado en taller de álgebra."
    );
    expect(describeNotification(eventItem("event_occurrence_cancelled"))).toMatchObject({
      detail: "Era el jueves 7 de mayo a las 18:00 · Matemática Pro",
      title: "Se canceló taller de álgebra",
    });
    expect(
      describeNotification(eventItem("event_occurrence_moved", { startsAt: MOVED_TO }))
    ).toMatchObject({
      detail: "Ahora es el viernes 8 de mayo a las 19:30 · Matemática Pro",
      href: DEEP_LINK,
      title: "Taller de álgebra cambió de horario",
    });
  });

  it("announces an available recording with the occurrence deep link", () => {
    expect(describeNotification(eventItem("event_recording_available"))).toMatchObject({
      detail: "Fue el jueves 7 de mayo a las 18:00 · Matemática Pro",
      href: DEEP_LINK,
      title: "Ya está la grabación de taller de álgebra",
    });
  });

  it("links a deleted event to the tribe calendar instead of a dead occurrence", () => {
    expect(describeNotification(eventItem("event_reminder_24h", { eventTitle: null }))).toMatchObject({
      href: "/matematica-pro/eventos",
      title: "Mañana: un evento",
    });
  });

  it("describes a reviewed proposal with its note and the new event link", () => {
    const approved: NotificationItemResult = {
      createdAt: "2026-05-06T15:00:00.000Z",
      id: "1a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
      proposal: {
        decision: "approved",
        eventId: EVENT_ID,
        eventStartsAt: OCCURRENCE,
        proposalId: PROPOSAL_ID,
        proposalTitle: "Club de lectura",
        reviewNote: null,
      },
      readAt: null,
      tribe: TRIBE,
      type: "event_proposal_reviewed",
    };

    expect(describeNotification(approved)).toMatchObject({
      detail: "Matemática Pro",
      href: DEEP_LINK,
      title: "Aprobaron tu propuesta «Club de lectura»",
    });
    expect(
      describeNotification({
        ...approved,
        proposal: { ...approved.proposal, decision: "rejected", eventId: null, eventStartsAt: null, reviewNote: "Otro día" },
      })
    ).toMatchObject({
      detail: "Nota: Otro día",
      href: "/matematica-pro/eventos",
      title: "Tu propuesta «Club de lectura» no fue aprobada",
    });
  });
});

describe("unread badge copy", () => {
  it("caps the visible badge and announces the count", () => {
    expect(formatUnreadBadge(3)).toBe("3");
    expect(formatUnreadBadge(42)).toBe("9+");
    expect(describeUnreadNotifications(0)).toBe("Notificaciones");
    expect(describeUnreadNotifications(1)).toBe("Notificaciones, 1 sin leer");
    expect(describeUnreadNotifications(12)).toBe("Notificaciones, 9+ sin leer");
  });
});
