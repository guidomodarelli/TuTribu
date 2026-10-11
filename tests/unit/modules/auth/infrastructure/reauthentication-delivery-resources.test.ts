/** @vitest-environment node */
/** Exercises exact original-connection and original-delivery authority resources on an owned PostgreSQL branch. @module reauthentication-delivery-resources-tests */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareNotificationDeliveryRecovery } from "@/tests/support/notification-delivery-recovery-fixture";
import { PostgresReauthenticationResourceAuthorizer } from "@/src/modules/auth/infrastructure/repositories/postgres-reauthentication-resource-authorizer";
import type { RecentAuthenticationScope } from "@/src/modules/auth/domain/entities/recent-authentication-evidence";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("message delivery global recency resources", () => {
  it("should resolve only the original delivery or original owned connection and preserve the existing wizard return route", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      const fixture = await prepareNotificationDeliveryRecovery(database);
      const scope: RecentAuthenticationScope = { userId: fixture.context.actorUserId, sessionId: fixture.context.sessionId, accountId: fixture.context.accountId, subject: fixture.context.subject, tribeId: fixture.context.tribeId, operation: "recover_notification_delivery", resourceId: fixture.context.deliveryId };
      const landing = `/connection-${scope.tribeId}`;
      const expected = { allowedReturnPaths: [landing, `${landing}/academia/admissions/messaging/connections`] };
      const resolve = (current: RecentAuthenticationScope) => database.withContext(fixture.own, (transaction) => new PostgresReauthenticationResourceAuthorizer(transaction).resolve(current));
      expect(await resolve(scope)).toEqual(expected);
      expect(await resolve({ ...scope, operation: "reconcile_message_delivery", resourceId: fixture.originalConnectionId })).toEqual(expected);
      expect(await resolve({ ...scope, tribeId: randomUUID() })).toBeNull();
      expect(await resolve({ ...scope, resourceId: fixture.input.targetConnectionId })).toBeNull();
      expect(await resolve({ ...scope, operation: "reconcile_message_delivery" })).toBeNull();
      expect(await resolve({ ...scope, operation: "retry_any_delivery" })).toBeNull();
      expect(await resolve({ ...scope, operation: "update_admission_policy", resourceId: scope.tribeId })).toEqual({ allowedReturnPaths: [landing, `${landing}/academia/admissions/settings`] });
    });
  });
});
