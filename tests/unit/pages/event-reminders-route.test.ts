// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { GET } from "@/app/api/maintenance/event-reminders/route";
import { createMaintenanceModules } from "@/src/modules/setup";

const sendTribeEventReminders = vi.fn();
const purgeReadNotifications = vi.fn();
const logError = vi.fn();
const logInfo = vi.fn();

vi.mock("@/src/modules/setup", () => ({
  createMaintenanceModules: vi.fn(),
}));

// The logger writes to the console; the double lets the tests assert the
// structured outcome of each step.
vi.mock("@/src/modules/shared/infrastructure/observability/server-logger", () => ({
  createServerLogger: vi.fn(() => ({ error: logError, info: logInfo, warn: vi.fn() })),
}));

const CRON_SECRET = "cron-secret-value";
const ROUTE_URL = "https://tutribu.example.com/api/maintenance/event-reminders";
const remindersSummary = {
  createdCount: 3,
  dueReminderCount: 2,
  isComplete: true,
  pageCount: 1,
  seriesCount: 4,
};
const purgeSummary = { batchCount: 1, isComplete: true, purgedCount: 0 };

function cronRequest(authorization?: string): Request {
  return new Request(ROUTE_URL, {
    headers: authorization ? { authorization } : {},
  });
}

describe("GET /api/maintenance/event-reminders", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = CRON_SECRET;
    sendTribeEventReminders.mockResolvedValue(remindersSummary);
    purgeReadNotifications.mockResolvedValue(purgeSummary);
    (createMaintenanceModules as Mock).mockResolvedValue({
      events: { useCases: { sendTribeEventReminders } },
      notifications: { useCases: { purgeReadNotifications } },
    });
  });

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
  });

  it("rejects requests without the cron bearer token before touching the database", async () => {
    const missing = await GET(cronRequest());
    const wrong = await GET(cronRequest("Bearer other-secret"));

    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(createMaintenanceModules).not.toHaveBeenCalled();
  });

  it("rejects every request when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;

    const response = await GET(cronRequest("Bearer undefined"));

    expect(response.status).toBe(401);
  });

  it("sends the due reminders, purges read notifications, and logs each step", async () => {
    const response = await GET(cronRequest(`Bearer ${CRON_SECRET}`));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      purge: purgeSummary,
      reminders: remindersSummary,
      status: "ok",
    });
    expect(logInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          createdCount: 3,
          operation_key: "send-tribe-event-reminders",
          result: "completed",
        }),
      })
    );
    expect(logInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          operation_key: "purge-read-notifications",
          result: "completed",
        }),
      })
    );
  });

  it("still purges when the reminder step fails and reports a safe error", async () => {
    sendTribeEventReminders.mockRejectedValueOnce(new Error("connection terminated"));

    const response = await GET(cronRequest(`Bearer ${CRON_SECRET}`));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ purge: purgeSummary, reminders: null, status: "error" });
    expect(JSON.stringify(body)).not.toContain("connection terminated");
    expect(purgeReadNotifications).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { operation_key: "send-tribe-event-reminders", result: "failed" },
      })
    );
  });
});
