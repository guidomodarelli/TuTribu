/** @vitest-environment node */

/** Exercises source binding, immutable evidence and one-use application on real Postgres. */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withAcademyAdmissionDatabase } from "@/tests/support/academy-admission-database";

describe.skipIf(process.env.RUN_ADMISSION_SQL_TESTS !== "1")("admission proof persistence", () => {
  it("should derive a proof only from its verified admission challenge and apply it once", async () => {
    await withAcademyAdmissionDatabase(async (database) => {
      await database.applyMigration("20261005090000_create_admission_identity_evidence.sql");
      await database.applyMigration("20261005091000_create_academy_admission_core.sql");
      if (process.env.APPLY_ADMISSION_EVIDENCE_GUARDS === "1") await database.applyMigration("20261005091500_guard_admission_evidence_transitions.sql");
      const userId = randomUUID();
      const tribeId = randomUUID();
      const connectionId = randomUUID();
      const contact = `${userId}@example.test`;
      const verifiedAt = new Date();
      const expiresAt = new Date(verifiedAt.getTime() + 600_000);
      const applyBefore = new Date(verifiedAt.getTime() + 900_000);
      const own = { userId, email: null };
      await database.withContext({ userId: null, email: null }, async (transaction) => {
        await transaction.execute(sql`insert into public."user" (id,name,email,"emailVerified","createdAt","updatedAt") values (${userId},'Synthetic proof account',${contact},false,clock_timestamp(),clock_timestamp())`);
        await transaction.execute(sql`insert into public.tribes (id,name,slug,created_by) values (${tribeId},'Synthetic proof tribe',${`proof-${tribeId}`},${userId})`);
      });
      const insertChallenge = (purpose: "admission" | "connection_diagnostic", state: "issued" | "verified") => database.withContext(own, async (transaction) => {
        const result = await transaction.execute(sql`
          insert into public.contact_verification_challenges (user_id,tribe_id,contact_type,normalized_contact,contact_fingerprint,fingerprint_key_id,purpose,verification_epoch,connection_id,connection_version,security_epoch,channel,state,is_current,created_at,expires_at,verified_at,code_mac,mac_key_id,delivery_id)
          values (${userId},${tribeId},'email',${contact},${new Uint8Array(32)},'synthetic-fingerprint',${purpose},${purpose === "admission" ? 1 : null},${connectionId},1,'synthetic-epoch','email',${state},${state === "verified"},${verifiedAt},${expiresAt},${state === "verified" ? verifiedAt : null},${new Uint8Array(32)},'synthetic-code',${randomUUID()}) returning id
        `);
        return result.rows[0].id as string;
      });
      const diagnosticId = await insertChallenge("connection_diagnostic","verified");
      const issuedId = await insertChallenge("admission","issued");
      const insertProof = (challengeId: string, proofConnectionId = connectionId, status = "available") => database.withContext(own, async (transaction) => transaction.execute(sql`
        insert into public.academy_admission_verification_proofs (challenge_id,user_id,tribe_id,contact_type,normalized_contact,verification_epoch,connection_id,connection_version,security_epoch,verified_at,apply_before,status)
        values (${challengeId},${userId},${tribeId},'email',${contact},1,${proofConnectionId},1,'synthetic-epoch',${verifiedAt},${applyBefore},${status}) returning id
      `));

      // Structural origin is independent of transport success or a browser flag.
      await expect(insertProof(diagnosticId)).rejects.toMatchObject({ cause: { code: "23514" } });
      await expect(insertProof(issuedId)).rejects.toMatchObject({ cause: { code: "23514" } });
      const invalidatedChallengeId = await insertChallenge("admission","verified");
      await database.withContext(own, async (transaction) => transaction.execute(sql`update public.contact_verification_challenges set invalidated_at=clock_timestamp(),invalidation_reason='synthetic_revocation' where id=${invalidatedChallengeId}`));
      await expect(insertProof(invalidatedChallengeId)).rejects.toMatchObject({ cause: { code: "23514" } });
      await database.withContext(own, async (transaction) => transaction.execute(sql`update public.contact_verification_challenges set is_current=false where id=${invalidatedChallengeId}`));
      const verifiedId = await insertChallenge("admission","verified");
      await expect(insertProof(verifiedId,randomUUID())).rejects.toMatchObject({ cause: { code: "23514" } });
      await expect(insertProof(verifiedId,connectionId,"invalid")).rejects.toMatchObject({ cause: { code: "23514" } });
      const proofId = (await insertProof(verifiedId)).rows[0].id;
      await expect(insertProof(verifiedId)).rejects.toMatchObject({ cause: { code: "23505" } });
      await expect(database.withContext(own, async (transaction) => transaction.execute(sql`update public.academy_admission_verification_proofs set invalidated_at=clock_timestamp(),invalidation_reason='synthetic_revocation' where id=${proofId}`))).rejects.toMatchObject({ cause: { code: "23514" } });
      await expect(database.withContext(own, async (transaction) => transaction.execute(sql`update public.academy_admission_verification_proofs set verified_at=verified_at+interval '1 minute',apply_before=apply_before+interval '1 minute' where id=${proofId}`))).rejects.toMatchObject({ cause: { code: "23514" } });

      const requestId = randomUUID();
      await database.withContext(own, async (transaction) => {
        await transaction.execute(sql`
          with instant as (select clock_timestamp() as now)
          insert into public.academy_admission_requests (id,tribe_id,user_id,source,contact_type,normalized_contact,evidence_source,proof_id,submitted_at,expires_at)
          select ${requestId},${tribeId},${userId},'common','email',${contact},'local',${proofId},now,now+interval '30 days' from instant
        `);
        await transaction.execute(sql`update public.academy_admission_verification_proofs set status='applied',applied_request_id=${requestId},applied_at=clock_timestamp() where id=${proofId}`);
      });
      await expect(database.withContext(own, async (transaction) => transaction.execute(sql`update public.academy_admission_verification_proofs set applied_request_id=${randomUUID()} where id=${proofId}`))).rejects.toMatchObject({ cause: { code: "23514" } });
      await expect(database.withContext(own, async (transaction) => transaction.execute(sql`update public.academy_admission_verification_proofs set status='available',applied_request_id=null,applied_at=null where id=${proofId}`))).rejects.toMatchObject({ cause: { code: "23514" } });
      const result = await database.withContext(own, async (transaction) => (await transaction.execute(sql`select status,applied_request_id from public.academy_admission_verification_proofs where id=${proofId}`)).rows);
      expect(result).toEqual([{ status: "applied", applied_request_id: requestId }]);
      await expect(database.withContext(own, async (transaction) => transaction.execute(sql`update public.academy_admission_verification_proofs set invalidated_at=clock_timestamp(),invalidation_reason='synthetic_revocation' where id=${proofId}`))).rejects.toMatchObject({ cause: { code: "23514" } });
      await database.withContext(own, async (transaction) => transaction.execute(sql`update public.academy_admission_verification_proofs set status='invalid',invalidated_at=clock_timestamp(),invalidation_reason='synthetic_revocation' where id=${proofId}`));
      await expect(database.withContext(own, async (transaction) => transaction.execute(sql`update public.academy_admission_verification_proofs set invalidated_at=null,invalidation_reason=null where id=${proofId}`))).rejects.toMatchObject({ cause: { code: "23514" } });
      expect(await database.withContext(own, async (transaction) => (await transaction.execute(sql`select id from public.tribe_members where tribe_id=${tribeId} and user_id=${userId}`)).rows)).toEqual([]);
    });
  }, 120_000);
});
