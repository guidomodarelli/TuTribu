// @vitest-environment node
/**
 * Exercises the tribe channel access rule (migration
 * 20261022233000_tribe_channel_access_rule) against an explicitly isolated
 * Postgres branch: free academy members read the campfire, its channels and
 * attachments but cannot write; academy members and leaders read and write;
 * events keep the academy boundary.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";

import { createPostgresPool } from "@/src/modules/shared/infrastructure/database/postgres-pool";
import { runWithGuardedTransaction, type RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import { MESSAGE_MUTATION_STATUS } from "@/src/modules/messages/constants/message-round";
import { PostgresMessageMutationRepository } from "@/src/modules/messages/infrastructure/repositories/postgres-message-mutation-repository";
import { PostgresMessageRoundRepository } from "@/src/modules/messages/infrastructure/repositories/postgres-message-round-repository";
import { PostgresTribeChannelRepository } from "@/src/modules/messages/infrastructure/repositories/postgres-tribe-channel-repository";
import { PostgresTribeReadRepository } from "@/src/modules/tribes/infrastructure/repositories/postgres-tribe-read-repository";

const validationDatabaseUrl = process.env.ACADEMY_VALIDATION_DATABASE_URL;
const validationDatabaseHost = process.env.ACADEMY_VALIDATION_DATABASE_HOST;

const FOUND_STATUS = "found";
const INSUFFICIENT_PRIVILEGE_SQLSTATE = "42501";

type ChannelAccessFixture = {
  academyTribeSlug: string;
  academyTribeId: string;
  legacyTribeSlug: string;
  legacyTribeId: string;
  messageId: string;
  legacyMessageId: string;
  freeMemberId: string;
  mutedMemberId: string;
  academyMemberId: string;
  leaderId: string;
  outsiderId: string;
  nonBypassRole: string;
};

describe.skipIf(!validationDatabaseUrl)("tribe channel access rule", () => {
  let pool: ReturnType<typeof createPostgresPool>;
  let fixture: ChannelAccessFixture;

  /** Runs repository work as the runtime role with the given current user. */
  function executeAs(userId: string) {
    return <Result>(work: (database: RequestDatabase) => Promise<Result>) =>
      runWithGuardedTransaction(pool, work, async (database) => {
        await database.execute(sql`select set_config('app.current_user_id', ${userId}, true)`);
      });
  }

  /** Counts what RLS lets a member see as a role without BYPASSRLS. */
  async function readAsNonBypassRole(userId: string) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('app.current_user_id', $1, true)", [userId]);
      await client.query(`set local role ${fixture.nonBypassRole}`);
      const counts = await client.query<Record<string, number | boolean>>(`select
        (select rolbypassrls from pg_roles where rolname = current_user) as bypasses_rls,
        (select count(*) from public.tribe_channels where tribe_id = $1)::int as channels,
        (select count(*) from public.messages where tribe_id = $1)::int as messages,
        (select count(*) from public.message_replies where tribe_id = $1)::int as replies,
        (select count(*) from public.message_reactions where tribe_id = $1)::int as likes,
        (select count(*) from public.message_files where tribe_id = $1)::int as files,
        (select count(*) from public.message_images where tribe_id = $1)::int as images,
        public.can_read_tribe_content($1) as reads_community_content`, [fixture.academyTribeId]);
      let replyInsert = "inserted";
      try {
        await client.query("savepoint reply_insert");
        await client.query(
          "insert into public.message_replies(message_id,tribe_id,author_id,content) values ($1,$2,$3,'Respuesta de prueba')",
          [fixture.messageId, fixture.academyTribeId, userId]
        );
      } catch (error) {
        replyInsert = (error as { code?: string }).code ?? "unknown";
        await client.query("rollback to savepoint reply_insert");
      }
      return { ...counts.rows[0], replyInsert };
    } finally {
      await client.query("rollback");
      client.release();
    }
  }

  beforeAll(async () => {
    if (!validationDatabaseHost || new URL(validationDatabaseUrl!).hostname !== validationDatabaseHost ||
      process.env.ACADEMY_VALIDATION_IS_EPHEMERAL !== "true") {
      throw new Error("Channel access integration tests require an explicitly provisioned ephemeral database host.");
    }
    pool = createPostgresPool({ connectionString: validationDatabaseUrl!, operation: "channel-access-validation" });
    const runId = randomUUID();
    fixture = {
      academyTribeSlug: `channel-academy-${runId}`,
      academyTribeId: randomUUID(),
      legacyTribeSlug: `channel-legacy-${runId}`,
      legacyTribeId: randomUUID(),
      messageId: randomUUID(),
      legacyMessageId: randomUUID(),
      freeMemberId: `channel-free-${runId}`,
      mutedMemberId: `channel-muted-${runId}`,
      academyMemberId: `channel-academy-member-${runId}`,
      leaderId: `channel-leader-${runId}`,
      outsiderId: `channel-outsider-${runId}`,
      nonBypassRole: `channel_access_probe_${runId.replaceAll("-", "_")}`,
    };
    const userIds = [fixture.freeMemberId, fixture.mutedMemberId, fixture.academyMemberId, fixture.leaderId, fixture.outsiderId];
    for (const userId of userIds) {
      await pool.query('insert into public."user"(id,name,email,"emailVerified","createdAt","updatedAt") values($1,$2,$3,true,now(),now())',
        [userId, "Persona ficticia", `${userId}@example.com`]);
    }
    for (const [tribeId, slug] of [[fixture.academyTribeId, fixture.academyTribeSlug], [fixture.legacyTribeId, fixture.legacyTribeSlug]]) {
      await pool.query("insert into public.tribes(id,name,slug,created_by) values($1,'Tribu ficticia',$2,$3)", [tribeId, slug, fixture.leaderId]);
      await pool.query("insert into public.tribe_members(tribe_id,user_id,role,status) values ($1,$2,'leader','active') on conflict do nothing", [tribeId, fixture.leaderId]);
      await pool.query("insert into public.tribe_members(tribe_id,user_id,role,status) values ($1,$2,'tribemate','active'),($1,$3,'tribemate','muted'),($1,$4,'tribemate','active')",
        [tribeId, fixture.freeMemberId, fixture.mutedMemberId, fixture.academyMemberId]);
    }
    await pool.query("insert into public.tribe_academy_settings(tribe_id,access_model) values($1,'academy')", [fixture.academyTribeId]);
    await pool.query("insert into public.member_access_grants(tribe_id,user_id,product_key,source_type,source_key,starts_at,ends_at) values($1,$2,'academy','manual_bonus','channel-access-bonus',now()-interval '1 day',now()+interval '30 days')",
      [fixture.academyTribeId, fixture.academyMemberId]);
    for (const [tribeId, messageId] of [[fixture.academyTribeId, fixture.messageId], [fixture.legacyTribeId, fixture.legacyMessageId]]) {
      const channel = await pool.query<{ id: string }>("insert into public.tribe_channels(tribe_id,name,slug,emoji,sort_order) values($1,'Fogón','fogon','🔥',0) returning id", [tribeId]);
      await pool.query("insert into public.messages(id,tribe_id,author_id,content,channel_id) values($1,$2,$3,'Bienvenida a la tribu',$4)", [messageId, tribeId, fixture.leaderId, channel.rows[0].id]);
    }
    await pool.query("insert into public.message_replies(message_id,tribe_id,author_id,content) values($1,$2,$3,'Gracias')", [fixture.messageId, fixture.academyTribeId, fixture.academyMemberId]);
    await pool.query("insert into public.message_reactions(message_id,tribe_id,user_id,type) values($1,$2,$3,'like')", [fixture.messageId, fixture.academyTribeId, fixture.academyMemberId]);
    await pool.query("insert into public.message_files(tribe_id,uploaded_by,storage_key,file_name,mime_type,file_size_bytes,status,message_id,sort_order) values($1,$2,'channel-access/guide.pdf','guia.pdf','application/pdf',10,'attached',$3,0)",
      [fixture.academyTribeId, fixture.leaderId, fixture.messageId]);
    await pool.query("insert into public.message_images(tribe_id,uploaded_by,cloudflare_image_id,delivery_url,status,message_id,sort_order) values($1,$2,'channel-access-image','https://example.com/image.png','attached',$3,0)",
      [fixture.academyTribeId, fixture.leaderId, fixture.messageId]);
    await pool.query(`create role ${fixture.nonBypassRole} nologin nobypassrls`);
    await pool.query(`grant ${fixture.nonBypassRole} to current_user`);
    await pool.query(`grant usage on schema public to ${fixture.nonBypassRole}`);
    await pool.query(`grant select, insert on public.tribe_channels, public.messages, public.message_replies, public.message_reactions, public.message_files, public.message_images, public.tribe_members, public.tribe_academy_settings, public.member_access_grants to ${fixture.nonBypassRole}`);
  });

  afterAll(async () => {
    if (!pool) return;
    if (fixture) {
      await pool.query("delete from public.tribes where id = any($1)", [[fixture.academyTribeId, fixture.legacyTribeId]]);
      await pool.query('delete from public."user" where id = any($1)', [[fixture.freeMemberId, fixture.mutedMemberId, fixture.academyMemberId, fixture.leaderId, fixture.outsiderId]]);
      await pool.query(`drop owned by ${fixture.nonBypassRole}`);
      await pool.query(`drop role if exists ${fixture.nonBypassRole}`);
    }
    await pool.end();
  });

  it("should let a free academy member read the campfire through RLS but not write it", async () => {
    await expect(readAsNonBypassRole(fixture.freeMemberId)).resolves.toEqual({
      bypasses_rls: false, channels: 1, messages: 1, replies: 1, likes: 1, files: 1, images: 1,
      reads_community_content: false, replyInsert: INSUFFICIENT_PRIVILEGE_SQLSTATE,
    });
  });

  it("should let academy members and leaders read and write through RLS", async () => {
    for (const userId of [fixture.academyMemberId, fixture.leaderId]) {
      await expect(readAsNonBypassRole(userId)).resolves.toEqual({
        bypasses_rls: false, channels: 1, messages: 1, replies: 1, likes: 1, files: 1, images: 1,
        reads_community_content: true, replyInsert: "inserted",
      });
    }
  });

  it("should hide the channels from people outside the tribe", async () => {
    await expect(readAsNonBypassRole(fixture.outsiderId)).resolves.toMatchObject({ channels: 0, messages: 0, files: 0, replyInsert: INSUFFICIENT_PRIVILEGE_SQLSTATE });
  });

  it("should give a free member channel read access without community access", async () => {
    const tribes = new PostgresTribeReadRepository(executeAs(fixture.freeMemberId));
    await expect(tribes.findCurrentMembershipAccessBySlug(fixture.academyTribeSlug)).resolves.toMatchObject({
      channelReadAccess: true, communityAccess: false, status: "active",
    });
    const memberTribes = await tribes.listVisibleMembershipTribes();
    expect(memberTribes.find((tribe) => tribe.slug === fixture.academyTribeSlug)).toMatchObject({ hasChannelReadAccess: true, hasCommunityAccess: false });
  });

  it("should list channels, replies and likes for a free member and keep writing for academy members", async () => {
    const channels = new PostgresTribeChannelRepository(executeAs(fixture.freeMemberId));
    await expect(channels.listByTribeSlug({ tribeSlug: fixture.academyTribeSlug })).resolves.toHaveLength(1);
    const outsiderChannels = new PostgresTribeChannelRepository(executeAs(fixture.outsiderId));
    await expect(outsiderChannels.listByTribeSlug({ tribeSlug: fixture.academyTribeSlug })).resolves.toEqual([]);

    const round = new PostgresMessageRoundRepository(executeAs(fixture.freeMemberId));
    const query = { messageId: fixture.messageId, tribeSlug: fixture.academyTribeSlug, viewerId: fixture.freeMemberId };
    await expect(round.listRepliesByMessageId(query)).resolves.toMatchObject({ status: FOUND_STATUS, replies: [expect.objectContaining({ content: "Gracias" })] });
    await expect(round.listLikersByMessageId(query)).resolves.toMatchObject({ status: FOUND_STATUS, totalCount: 1 });
    const outsiderRound = new PostgresMessageRoundRepository(executeAs(fixture.outsiderId));
    await expect(outsiderRound.listRepliesByMessageId({ ...query, viewerId: fixture.outsiderId })).resolves.toEqual({ status: MESSAGE_MUTATION_STATUS.forbidden });

    const freeMutations = new PostgresMessageMutationRepository(executeAs(fixture.freeMemberId));
    await expect(freeMutations.create({ authorId: fixture.freeMemberId, content: "Hola", messageId: fixture.messageId, tribeSlug: fixture.academyTribeSlug }))
      .resolves.toMatchObject({ status: MESSAGE_MUTATION_STATUS.forbidden });
    await expect(freeMutations.toggle({ messageId: fixture.messageId, tribeSlug: fixture.academyTribeSlug, userId: fixture.freeMemberId }))
      .resolves.toMatchObject({ status: MESSAGE_MUTATION_STATUS.forbidden });
    const academyMutations = new PostgresMessageMutationRepository(executeAs(fixture.academyMemberId));
    await expect(academyMutations.create({ authorId: fixture.academyMemberId, content: "Hola", messageId: fixture.messageId, tribeSlug: fixture.academyTribeSlug }))
      .resolves.toMatchObject({ status: MESSAGE_MUTATION_STATUS.created });
  });

  it("should derive the campfire permissions from the channel write rule", async () => {
    const viewerState = async (userId: string, tribeSlug: string) =>
      (await new PostgresMessageRoundRepository(executeAs(userId)).listViewerStateByTribeSlug({ tribeSlug, viewerId: userId })).viewerPermissions;

    await expect(viewerState(fixture.freeMemberId, fixture.academyTribeSlug)).resolves.toMatchObject({
      canCreateMessage: false, canReact: false, canReply: false, requiresAcademyToParticipate: true,
    });
    await expect(viewerState(fixture.mutedMemberId, fixture.academyTribeSlug)).resolves.toMatchObject({
      canCreateMessage: false, requiresAcademyToParticipate: false,
    });
    await expect(viewerState(fixture.academyMemberId, fixture.academyTribeSlug)).resolves.toMatchObject({
      canCreateMessage: true, canReact: true, canReply: true, requiresAcademyToParticipate: false,
    });
    await expect(viewerState(fixture.leaderId, fixture.academyTribeSlug)).resolves.toMatchObject({ canCreateMessage: true, canPinMessages: true });
    await expect(viewerState(fixture.freeMemberId, fixture.legacyTribeSlug)).resolves.toMatchObject({
      canCreateMessage: true, requiresAcademyToParticipate: false,
    });
  });
});
