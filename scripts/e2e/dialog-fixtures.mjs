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
const SESSION_SIGNATURE_ALGORITHM = "sha256";
const SESSION_SIGNATURE_ENCODING = "base64";

/** Seeded copy; Spanish because it renders in the product UI. */
const FIXTURE_COPY = {
  eventTitle: "Encuentro de prueba E2E",
  memberName: "Miembro E2E",
  messageContent: "Contenido del mensaje sembrado para validar los diálogos.",
  messageTitle: "Mensaje de prueba E2E",
  tribeName: "Tribu E2E de diálogos",
};

/** Mirrors the leader membership and default channel created by `PostgresTribeCreationRepository`. */
const FIXTURE_TRIBE = {
  channel: { emoji: "🔥", name: "Ronda", slug: "ronda", sortOrder: 20, accessScope: "tribemates" },
  memberRole: "leader",
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
 * Inserts a leader member with an active session, a tribe with its round
 * channel, one round message and one upcoming event.
 *
 * @param {{ connectionString: string, runId: string, authSecret: string }} input
 * @returns {Promise<{ sessionCookie: string, tribeSlug: string, messageTitle: string, eventTitle: string }>}
 */
export async function seedDialogFixtures({ connectionString, runId, authSecret }) {
  const client = new pg.Client({ connectionString });
  const now = new Date();
  const userId = `e2e-${runId}`;
  const sessionToken = randomBytes(SESSION_TOKEN_BYTES).toString("base64url");
  const tribeSlug = `e2e-dialogos-${runId}`;

  await client.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `insert into public."user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       values ($1, $2, $3, true, $4, $4)`,
      [userId, FIXTURE_COPY.memberName, `${userId}@tutribu.test`, now]
    );
    await client.query(
      `insert into public.session (id, token, "userId", "expiresAt", "createdAt", "updatedAt")
       values ($1, $2, $3, $4, $5, $5)`,
      [randomUUID(), sessionToken, userId, new Date(now.getTime() + SESSION_LIFETIME_MS), now]
    );
    const { rows: [tribe] } = await client.query(
      `insert into public.tribes (name, slug, visibility, created_by)
       values ($1, $2, $3, $4) returning id`,
      [FIXTURE_COPY.tribeName, tribeSlug, FIXTURE_TRIBE.visibility, userId]
    );
    await client.query(
      `insert into public.tribe_members (tribe_id, user_id, role, status) values ($1, $2, $3, $4)`,
      [tribe.id, userId, FIXTURE_TRIBE.memberRole, FIXTURE_TRIBE.memberStatus]
    );
    const { channel } = FIXTURE_TRIBE;
    const { rows: [insertedChannel] } = await client.query(
      `insert into public.tribe_channels (tribe_id, name, slug, emoji, sort_order, access_scope)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [tribe.id, channel.name, channel.slug, channel.emoji, channel.sortOrder, channel.accessScope]
    );
    await client.query(
      `insert into public.messages (tribe_id, channel_id, author_id, title, content, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $6)`,
      [tribe.id, insertedChannel.id, userId, FIXTURE_COPY.messageTitle, FIXTURE_COPY.messageContent, now]
    );
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
    eventTitle: FIXTURE_COPY.eventTitle,
    messageTitle: FIXTURE_COPY.messageTitle,
    sessionCookie: signSessionCookieValue(sessionToken, authSecret),
    tribeSlug,
  };
}
