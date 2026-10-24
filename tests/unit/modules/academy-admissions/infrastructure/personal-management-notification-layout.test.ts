/** @vitest-environment node */
/** Exercises the actual signed-in layout inbox on the personal-management SQL fixture. @module personal-management-notification-layout-tests */
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { preparePersonalInvitationManagementDatabase } from "@/tests/support/personal-invitation-management-database-fixture";
import { PostgresNotificationRepository } from "@/src/modules/notifications/infrastructure/repositories/postgres-notification-repository";
import { buildNotificationsModule } from "@/src/modules/notifications/setup";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native personal management layout inbox", () => {
  it("should load the current leader inbox on the personal management fixture without a missing-schema failure", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await preparePersonalInvitationManagementDatabase(database);
      const notifications = buildNotificationsModule({ notificationRepository: new PostgresNotificationRepository((run) => database.withContext(fixture.own, run)) });
      try { expect(await notifications.useCases.getNotificationInbox()).toEqual({ notifications: [], unreadCount: 0 }); }
      catch (error) {
        const cause = error instanceof Error && "cause" in error ? error.cause : error;
        const code = typeof cause === "object" && cause !== null && "code" in cause ? cause.code : null;
        process.stdout.write(JSON.stringify({ phase: "personal_management_inbox", postgresCode: code }) + "\n");
        throw new Error("Personal management layout inbox failed against its native fixture", { cause: error });
      }
    });
  }, 1_200_000);
});
