/** @vitest-environment node */
/** Exercises concrete selected decisions, original recovery and indivisible PostgreSQL effects. @module admission-batch-atomicity-tests */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";
import { prepareAdmissionBatch } from "@/tests/support/admission-batch-database-fixture";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("native admission batch decisions", () => {
  it("should commit a valid selected decision with its expected conflict and preserve hidden requests when replayed", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      // Given actual pending requests and one stale explicitly selected version.
      const fixture = await prepareAdmissionBatch(database);
      const approved = await fixture.submitPending(), conflict = await fixture.submitPending(), hidden = await fixture.submitPending();
      const input = {
        ...fixture.scope, operationId: randomUUID(), confirmed: true as const, decision: "approve" as const,
        internalReason: "Revisión explícita del lote", externalMessage: "Tu solicitud fue aprobada.",
        items: [
          { admissionRequestId: approved.admissionRequestId, expectedVersion: approved.expectedVersion },
          { admissionRequestId: conflict.admissionRequestId, expectedVersion: conflict.expectedVersion + 1 },
        ],
      };

      // When one concrete owner processes the whole selection in one business transaction.
      const outcome = await fixture.writer.decideBatch(input);

      // Then the recorded result names every selected request and only confirmed effects.
      expect(outcome).toMatchObject({ state: "completed", operationId: input.operationId, replayed: false });
      if (outcome.state !== "completed") throw new Error("Admission batch did not reach a terminal result");
      expect(outcome.result.results).toHaveLength(2);
      expect(outcome.result.results).toEqual(expect.arrayContaining([
        { admissionRequestId: approved.admissionRequestId, status: "approved", version: 2 },
        { admissionRequestId: conflict.admissionRequestId, status: "conflict", code: "request_conflict" },
      ]));
      const readEffects = () => database.withContext(fixture.own, async (transaction) => ({
        requests: (await transaction.execute(sql`select id,status,version from public.academy_admission_requests where tribe_id=${fixture.tribeId} order by id`)).rows,
        decisions: (await transaction.execute<{ count: number }>(sql`select count(*)::int as count from public.academy_admission_decisions where tribe_id=${fixture.tribeId}`)).rows[0].count,
        memberships: (await transaction.execute<{ count: number }>(sql`select count(*)::int as count from public.academy_admission_membership_effects where tribe_id=${fixture.tribeId}`)).rows[0].count,
        notices: (await transaction.execute<{ count: number }>(sql`select count(*)::int as count from public.academy_admission_notification_obligations where tribe_id=${fixture.tribeId}`)).rows[0].count,
      }));
      const committed = await readEffects();
      expect(committed).toMatchObject({ decisions: 1, memberships: 1, notices: 4 });
      expect(committed.requests).toEqual(expect.arrayContaining([
        { id: approved.admissionRequestId, status: "approved", version: 2 },
        { id: conflict.admissionRequestId, status: "pending", version: 1 },
        { id: hidden.admissionRequestId, status: "pending", version: 1 },
      ]));
      expect(await fixture.writer.decideBatch({ ...input, items: [...input.items].reverse() })).toEqual({ ...outcome, replayed: true });
      expect(await readEffects()).toEqual(committed);
    });
  }, 1_200_000);

  it("should complete fifty explicit current versions and leave the unselected request pending when the boundary is reached", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      // Given the maximum explicit selection and one request outside it.
      const fixture = await prepareAdmissionBatch(database);
      const requests = await fixture.seedPendingSelection(51), selected = requests.slice(0, 50), hidden = requests[50];
      const input = { ...fixture.scope, operationId: randomUUID(), confirmed: true as const, decision: "approve" as const, internalReason: "Revisión de cincuenta solicitudes seleccionadas", externalMessage: null, items: selected.map((request) => ({ admissionRequestId: request.admissionRequestId, expectedVersion: request.expectedVersion })) };

      // When the concrete batch commits, no hidden row becomes an implicit selection.
      const outcome = await fixture.writer.decideBatch(input);

      // Then every selected decision, membership and notice belongs to that commit.
      expect(outcome).toMatchObject({ state: "completed", replayed: false });
      if (outcome.state !== "completed") throw new Error("Fifty selected admission decisions did not complete");
      expect(outcome.result.results).toHaveLength(50);
      expect(outcome.result.results).toEqual(expect.arrayContaining(selected.map((request) => ({ admissionRequestId: request.admissionRequestId, status: "approved", version: 2 }))));
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select (select count(*)::int from public.academy_admission_decisions where tribe_id=${fixture.tribeId}) as decisions,(select count(*)::int from public.academy_admission_membership_effects where tribe_id=${fixture.tribeId}) as memberships,(select count(*)::int from public.academy_admission_notification_obligations where tribe_id=${fixture.tribeId} and event_type='approved') as notices`)).rows[0]).toEqual({ decisions: 50, memberships: 50, notices: 50 });
        expect((await transaction.execute(sql`select status,version from public.academy_admission_requests where id=${hidden.admissionRequestId}`)).rows[0]).toEqual({ status: "pending", version: 1 });
      });
      expect(await fixture.writer.decideBatch({ ...input, items: [...input.items].reverse() })).toEqual({ ...outcome, replayed: true });
    });
  }, 1_200_000);

  it("should roll back every staged success and retain only registered progress when a later SQL write fails unexpectedly", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      // Given two current rows and an actual SQL failure on the later ordered decision.
      const fixture = await prepareAdmissionBatch(database), requests = await fixture.seedPendingSelection(2);
      await database.withContext(fixture.own, async (transaction) => {
        await transaction.execute(sql`create function public.synthetic_fail_later_admission_batch() returns trigger language plpgsql as $$ begin if new.request_id=(select request.id from public.academy_admission_requests request where request.tribe_id=new.tribe_id order by request.id desc limit 1) then raise exception using errcode='P0001',message='Controlled later admission batch persistence failure'; end if; return new; end; $$`);
        await transaction.execute(sql`create trigger synthetic_admission_batch_failure before insert on public.academy_admission_decisions for each row execute function public.synthetic_fail_later_admission_batch()`);
      });
      const input = { ...fixture.scope, operationId: randomUUID(), confirmed: true as const, decision: "approve" as const, internalReason: "Revisión con falla SQL controlada", externalMessage: null, items: requests.map((request) => ({ admissionRequestId: request.admissionRequestId, expectedVersion: 1 })) };

      // When the second decision throws, there is no independently committed first row.
      await expect(fixture.writer.decideBatch(input)).rejects.toMatchObject({ code: "operation_unresolved", operationId: input.operationId });

      // Then the ledger has genuine progress, and every business effect was rolled back.
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select status,version from public.academy_admission_requests where tribe_id=${fixture.tribeId}`)).rows).toEqual([{ status: "pending", version: 1 }, { status: "pending", version: 1 }]);
        expect((await transaction.execute(sql`select (select count(*)::int from public.academy_admission_decisions where tribe_id=${fixture.tribeId}) as decisions,(select count(*)::int from public.academy_admission_membership_effects where tribe_id=${fixture.tribeId}) as memberships,(select count(*)::int from public.academy_admission_notification_obligations where tribe_id=${fixture.tribeId}) as notices`)).rows[0]).toEqual({ decisions: 0, memberships: 0, notices: 0 });
        expect((await transaction.execute(sql`select state,public_result from public.academy_admission_operations where tribe_id=${fixture.tribeId} and idempotency_key=${input.operationId}`)).rows[0]).toEqual({ state: "started", public_result: null });
      });
      expect(await fixture.writer.decideBatch(input)).toEqual({ state: "started", operationId: input.operationId });
    });
  }, 1_200_000);

  it("should reconcile the original committed rejection results without another decision when the commit reply is lost", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      // Given two selected requests and response loss after the real business commit.
      const fixture = await prepareAdmissionBatch(database), requests = await fixture.seedPendingSelection(2);
      const input = { ...fixture.scope, operationId: randomUUID(), confirmed: true as const, decision: "reject" as const, internalReason: "Motivo interno que no sale del lote", externalMessage: "Podés presentar otra solicitud cuando se habilite.", items: requests.map((request) => ({ admissionRequestId: request.admissionRequestId, expectedVersion: 1 })) };
      fixture.loseNextCommittedReply();

      // When the owner consults the same ledger, it recovers the confirmed original.
      const outcome = await fixture.writer.decideBatch(input);

      // Then only minimal original versions are returned, and a replay cannot write again.
      expect(outcome).toMatchObject({ state: "completed", operationId: input.operationId, replayed: true });
      if (outcome.state !== "completed") throw new Error("Lost admission batch reply was not reconciled");
      expect(outcome.result.results).toEqual(expect.arrayContaining(requests.map((request) => ({ admissionRequestId: request.admissionRequestId, status: "rejected", version: 2 }))));
      expect(outcome.result.results).toHaveLength(2);
      expect(await fixture.writer.decideBatch(input)).toEqual(outcome);
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute(sql`select (select count(*)::int from public.academy_admission_decisions where tribe_id=${fixture.tribeId}) as decisions,(select count(*)::int from public.academy_admission_membership_effects where tribe_id=${fixture.tribeId}) as memberships,(select count(*)::int from public.academy_admission_notification_obligations where tribe_id=${fixture.tribeId} and event_type='rejected') as notices`)).rows[0]).toEqual({ decisions: 2, memberships: 0, notices: 2 });
      });
    });
  }, 1_200_000);

  it("should retain an all-conflict terminal original and refuse a changed version under its identity when every selected row is rejected", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      // Given only expected conflicts, not uncertain persistence failures.
      const fixture = await prepareAdmissionBatch(database), requests = await fixture.seedPendingSelection(2);
      const input = { ...fixture.scope, operationId: randomUUID(), confirmed: true as const, decision: "approve" as const, internalReason: "Revisión de versiones desactualizadas", externalMessage: null, items: requests.map((request) => ({ admissionRequestId: request.admissionRequestId, expectedVersion: 2 })) };

      // When no row succeeds, the actual completed ledger remains terminal.
      const outcome = await fixture.writer.decideBatch(input);

      // Then neither a replay nor altered versions invent a successful new action.
      expect(outcome).toMatchObject({ state: "completed", replayed: false });
      if (outcome.state !== "completed") throw new Error("Expected admission conflicts were treated as unfinished work");
      expect(outcome.result.results).toHaveLength(2);
      expect(outcome.result.results).toEqual(expect.arrayContaining(requests.map((request) => ({ admissionRequestId: request.admissionRequestId, status: "conflict", code: "request_conflict" }))));
      expect(await fixture.writer.decideBatch(input)).toEqual({ ...outcome, replayed: true });
      await expect(fixture.writer.decideBatch({ ...input, items: requests.map((request) => ({ admissionRequestId: request.admissionRequestId, expectedVersion: 1 })) })).rejects.toMatchObject({ code: "idempotency_conflict" });
      await database.withContext(fixture.own, async (transaction) => {
        expect((await transaction.execute<{ count: number }>(sql`select count(*)::int as count from public.academy_admission_decisions where tribe_id=${fixture.tribeId}`)).rows[0].count).toBe(0);
      });
    });
  }, 1_200_000);
});
