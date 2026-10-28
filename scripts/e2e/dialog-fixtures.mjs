/**
 * Seeds the minimal data the authenticated dialog scenarios need on the
 * disposable test database, and signs a Better Auth session for its member.
 *
 * The session is created the way Better Auth stores it (a `session` row plus a
 * cookie holding `token.HMAC-SHA256(secret, token)`, URL-encoded), so no test
 * route, test plugin or alternative sign-in method reaches production code.
 *
 * @module dialog-fixtures
 */

import { createHmac, randomBytes, randomUUID } from "node:crypto";

import pg from "pg";

const SESSION_LIFETIME_MS = 24 * 60 * 60 * 1000;
const EVENT_LEAD_TIME_MS = 2 * 24 * 60 * 60 * 1000;
const EVENT_DURATION_MS = 60 * 60 * 1000;
const SESSION_TOKEN_BYTES = 24;
/** Gap between seeded messages, so the round lists them newest first in a stable order. */
const MESSAGE_SPACING_MS = 60 * 60 * 1000;
const SESSION_SIGNATURE_ALGORITHM = "sha256";
const SESSION_SIGNATURE_ENCODING = "base64";

/** Seeded copy; Spanish because it renders in the product UI. */
const FIXTURE_COPY = {
  eventTitle: "Encuentro de prueba E2E",
  memberName: "Miembro E2E",
  messageContent: "Contenido del mensaje sembrado para validar los diálogos.",
  messageTitle: "Mensaje de prueba E2E",
  discussedMessageContent: "Mensaje sembrado con comentarios y me gustas.",
  discussedMessageReplies: ["Primer comentario sembrado.", "Segundo comentario sembrado."],
  discussedMessageTitle: "Mensaje con comentarios E2E",
  likedMessageContent: "Mensaje sembrado con me gustas y sin comentarios.",
  likedMessageTitle: "Mensaje con me gustas E2E",
  tribemateName: "Integrante E2E",
  tribeName: "Tribu E2E de diálogos",
};

/** Mirrors the leader membership and default channel created by `PostgresTribeCreationRepository`. */
const FIXTURE_TRIBE = {
  channel: { emoji: "🔥", name: "Ronda", slug: "ronda", sortOrder: 20, accessScope: "tribemates" },
  memberRole: "leader",
  reactionType: "like",
  tribemateRole: "tribemate",
  memberStatus: "active",
  visibility: "private",
};

/**
 * Signs a session token exactly like `better-call`'s `signCookieValue`.
 *
 * @param {string} token - Session token stored in the `session` row.
 * @param {string} secret - `BETTER_AUTH_SECRET` the server runs with.
 * @returns {string} URL-encoded cookie value.
 */
export function signSessionCookieValue(token, secret) {
  const signature = createHmac(SESSION_SIGNATURE_ALGORITHM, secret)
    .update(token)
    .digest(SESSION_SIGNATURE_ENCODING);

  return encodeURIComponent(`${token}.${signature}`);
}

/**
 * Inserts a member with an active session.
 *
 * @param {pg.Client} client - Client inside the seeding transaction.
 * @param {{ userId: string, name: string, now: Date }} member
 * @returns {Promise<string>} Session token to sign into the cookie.
 */
async function insertMemberWithSession(client, { userId, name, now }) {
  const sessionToken = randomBytes(SESSION_TOKEN_BYTES).toString("base64url");

  await client.query(
    `insert into public."user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
     values ($1, $2, $3, true, $4, $4)`,
    [userId, name, `${userId}@tutribu.test`, now]
  );
  await client.query(
    `insert into public.session (id, token, "userId", "expiresAt", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $5)`,
    [randomUUID(), sessionToken, userId, new Date(now.getTime() + SESSION_LIFETIME_MS), now]
  );

  return sessionToken;
}

/**
 * Inserts a round message and returns its id.
 *
 * @param {pg.Client} client - Client inside the seeding transaction.
 * @param {{ tribeId: string, channelId: string, authorId: string, title: string, content: string, createdAt: Date }} message
 * @returns {Promise<string>} Message id.
 */
async function insertMessage(client, { tribeId, channelId, authorId, title, content, createdAt }) {
  const { rows: messageRows } = await client.query(
    `insert into public.messages (tribe_id, channel_id, author_id, title, content, created_at, updated_at)
     values ($1, $2, $3, $4, $5, $6, $6) returning id`,
    [tribeId, channelId, authorId, title, content, createdAt]
  );
  const [message] = messageRows;

  return message.id;
}

/**
 * Inserts a like from each member on a message.
 *
 * @param {pg.Client} client - Client inside the seeding transaction.
 * @param {{ tribeId: string, messageId: string, userIds: string[] }} reactions
 */
async function insertLikes(client, { tribeId, messageId, userIds }) {
  for (const userId of userIds) {
    await client.query(
      `insert into public.message_reactions (message_id, tribe_id, user_id, type) values ($1, $2, $3, $4)`,
      [messageId, tribeId, userId, FIXTURE_TRIBE.reactionType]
    );
  }
}

/**
 * Inserts a leader and a tribemate, each with an active session, a tribe with
 * its round channel, three leader messages (a plain one, one with replies and
 * likes, and one with likes only) and one upcoming event. The tribemate sees
 * the leader's messages without the actions menu.
 *
 * @param {{ connectionString: string, runId: string, authSecret: string }} input
 * @returns {Promise<{ sessionCookie: string, tribemateSessionCookie: string, tribeSlug: string, messageTitle: string, discussedMessageTitle: string, likedMessageTitle: string, eventTitle: string }>}
 */
export async function seedDialogFixtures({ connectionString, runId, authSecret }) {
  const client = new pg.Client({ connectionString });
  const now = new Date();
  const userId = `e2e-${runId}`;
  const tribemateId = `e2e-tribemate-${runId}`;
  let sessionToken;
  let tribemateSessionToken;
  const tribeSlug = `e2e-dialogos-${runId}`;

  await client.connect();

  try {
    await client.query("BEGIN");
    sessionToken = await insertMemberWithSession(client, { name: FIXTURE_COPY.memberName, now, userId });
    tribemateSessionToken = await insertMemberWithSession(client, {
      name: FIXTURE_COPY.tribemateName,
      now,
      userId: tribemateId,
    });
    const { rows: tribeRows } = await client.query(
      `insert into public.tribes (name, slug, visibility, created_by)
       values ($1, $2, $3, $4) returning id`,
      [FIXTURE_COPY.tribeName, tribeSlug, FIXTURE_TRIBE.visibility, userId]
    );
    const [tribe] = tribeRows;
    await client.query(
      `insert into public.tribe_members (tribe_id, user_id, role, status) values ($1, $2, $3, $4)`,
      [tribe.id, userId, FIXTURE_TRIBE.memberRole, FIXTURE_TRIBE.memberStatus]
    );
    await client.query(
      `insert into public.tribe_members (tribe_id, user_id, role, status) values ($1, $2, $3, $4)`,
      [tribe.id, tribemateId, FIXTURE_TRIBE.tribemateRole, FIXTURE_TRIBE.memberStatus]
    );
    const { channel } = FIXTURE_TRIBE;
    const { rows: channelRows } = await client.query(
      `insert into public.tribe_channels (tribe_id, name, slug, emoji, sort_order, access_scope)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [tribe.id, channel.name, channel.slug, channel.emoji, channel.sortOrder, channel.accessScope]
    );
    const [insertedChannel] = channelRows;
    const messageBase = { authorId: userId, channelId: insertedChannel.id, tribeId: tribe.id };
    await insertMessage(client, {
      ...messageBase,
      content: FIXTURE_COPY.messageContent,
      createdAt: now,
      title: FIXTURE_COPY.messageTitle,
    });
    const discussedMessageId = await insertMessage(client, {
      ...messageBase,
      content: FIXTURE_COPY.discussedMessageContent,
      createdAt: new Date(now.getTime() - MESSAGE_SPACING_MS),
      title: FIXTURE_COPY.discussedMessageTitle,
    });
    const replyAuthorIds = [tribemateId, userId];
    for (const [replyIndex, replyContent] of FIXTURE_COPY.discussedMessageReplies.entries()) {
      await client.query(
        `insert into public.message_replies (message_id, tribe_id, author_id, content) values ($1, $2, $3, $4)`,
        [discussedMessageId, tribe.id, replyAuthorIds[replyIndex % replyAuthorIds.length], replyContent]
      );
    }
    await insertLikes(client, { messageId: discussedMessageId, tribeId: tribe.id, userIds: [userId, tribemateId] });
    const likedMessageId = await insertMessage(client, {
      ...messageBase,
      content: FIXTURE_COPY.likedMessageContent,
      createdAt: new Date(now.getTime() - 2 * MESSAGE_SPACING_MS),
      title: FIXTURE_COPY.likedMessageTitle,
    });
    await insertLikes(client, { messageId: likedMessageId, tribeId: tribe.id, userIds: [userId, tribemateId] });
    const eventStartsAt = new Date(now.getTime() + EVENT_LEAD_TIME_MS);
    await client.query(
      `insert into public.events (tribe_id, created_by, title, starts_at, ends_at)
       values ($1, $2, $3, $4, $5)`,
      [tribe.id, userId, FIXTURE_COPY.eventTitle, eventStartsAt, new Date(eventStartsAt.getTime() + EVENT_DURATION_MS)]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw new Error(`dialog-fixtures:seedDialogFixtures failed for run ${runId}`, { cause: error });
  } finally {
    await client.end();
  }

  return {
    discussedMessageTitle: FIXTURE_COPY.discussedMessageTitle,
    eventTitle: FIXTURE_COPY.eventTitle,
    likedMessageTitle: FIXTURE_COPY.likedMessageTitle,
    messageTitle: FIXTURE_COPY.messageTitle,
    sessionCookie: signSessionCookieValue(sessionToken, authSecret),
    tribemateSessionCookie: signSessionCookieValue(tribemateSessionToken, authSecret),
    tribeSlug,
  };
}
