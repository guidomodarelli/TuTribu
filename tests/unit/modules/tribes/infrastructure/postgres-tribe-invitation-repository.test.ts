import { PostgresTribeInvitationRepository } from "@/src/modules/tribes/infrastructure/repositories/postgres-tribe-invitation-repository";

function getSqlText(statement: unknown): string {
  return ((statement as { queryChunks?: unknown[] }).queryChunks ?? [])
    .map((chunk) => {
      if (typeof chunk === "string") {
        return chunk;
      }

      if (
        chunk &&
        typeof chunk === "object" &&
        "value" in chunk &&
        Array.isArray((chunk as { value: unknown }).value)
      ) {
        return (chunk as { value: string[] }).value.join("");
      }

      return "";
    })
    .join("");
}

const FORBIDDEN_INVITATION_TOKEN_CONTEXT_SETTING = [
  "current",
  "invitation",
  "token",
].join("_");
const FORBIDDEN_TRIBE_INVITATION_ID_CAST = [
  "tribe_invitations.id",
  "text",
].join("::");

describe("PostgresTribeInvitationRepository", () => {
  it("creates invitations with a one-time visible token, token hash, and manager permission guard", async () => {
    const execute = jest.fn(async () => ({
      rows: [
        {
          created_at: "2026-04-26T07:00:00.000Z",
          created_by_name: "Grace Hopper",
          id: "invitation-1",
          status: "created",
        },
      ],
    }));
    const repository = new PostgresTribeInvitationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.create({
        baseUrl: "https://tutribu.example.com",
        invitationId: "550e8400-e29b-41d4-a716-446655440000",
        token: "plain-token",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toMatchObject({
      invitationUrl: "https://tutribu.example.com/tribu/matematica-pro/invitar/plain-token",
      status: "created",
    });

    const sqlText = getSqlText(execute.mock.calls[0]?.[0]);

    expect(sqlText).toContain("insert into public.tribe_invitations");
    expect(sqlText).toContain("public.can_manage_tribe_invitations");
    expect(sqlText).toContain("token_hash");
    expect(sqlText).not.toContain("token,");
    expect(sqlText).not.toContain("plain-token");
  });

  it("maps missing invitation storage during creation to setup_required", async () => {
    const execute = jest.fn(async () => {
      throw {
        cause: {
          code: "42P01",
        },
      };
    });
    const repository = new PostgresTribeInvitationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.create({
        baseUrl: "https://tutribu.example.com",
        invitationId: "550e8400-e29b-41d4-a716-446655440000",
        token: "plain-token",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: "setup_required" });
  });

  it("lists active invitations without exposing acceptance links for managers", async () => {
    const execute = jest.fn(async () => ({
      rows: [
        {
          created_at: "2026-04-26T07:00:00.000Z",
          created_by_name: "Grace Hopper",
          id: "550e8400-e29b-41d4-a716-446655440000",
        },
      ],
    }));
    const repository = new PostgresTribeInvitationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.listByTribeSlug({
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual([
        {
          createdAt: "2026-04-26T07:00:00.000Z",
          createdByName: "Grace Hopper",
          id: "550e8400-e29b-41d4-a716-446655440000",
          invitationUrl: null,
        },
      ]);

    const sqlText = getSqlText(execute.mock.calls[0]?.[0]);

    expect(sqlText).toContain("tribe_invitations.status");
    expect(sqlText).not.toContain("tribe_invitations.token");
    expect(sqlText).toContain("public.can_manage_tribe_invitations");
  });

  it("returns an empty list when invitation storage has not been migrated yet", async () => {
    const execute = jest.fn(async () => {
      throw {
        cause: {
          code: "42P01",
        },
      };
    });
    const repository = new PostgresTribeInvitationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.listByTribeSlug({
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual([]);
  });

  it("revokes active invitations with manager permission guard", async () => {
    const execute = jest.fn(async () => ({
      rows: [{ status: "revoked" }],
    }));
    const repository = new PostgresTribeInvitationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.revoke({
        invitationId: "550e8400-e29b-41d4-a716-446655440000",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: "revoked" });

    const sqlText = getSqlText(execute.mock.calls[0]?.[0]);

    expect(sqlText).toContain("update public.tribe_invitations");
    expect(sqlText).toContain("status = ");
    expect(sqlText).toContain("revoked_at");
  });

  it("maps malformed invitation identifiers to not_found before querying Postgres", async () => {
    const execute = jest.fn();
    const repository = new PostgresTribeInvitationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.revoke({
        invitationId: "not-a-uuid",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: "not_found" });

    expect(execute).not.toHaveBeenCalled();
  });

  it("accepts invitations idempotently without persisting the plain token", async () => {
    const execute = jest.fn(async () => ({
      rows: [{ status: "accepted" }],
    }));
    const repository = new PostgresTribeInvitationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.accept({
        token: "plain-token",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: "accepted" });

    const sqlText = getSqlText(execute.mock.calls[0]?.[0]);

    expect(sqlText).toContain("on conflict (tribe_id, user_id) do nothing");
    expect(sqlText).toContain("existing_membership");
    expect(sqlText).toContain("app.current_invitation_hash");
    expect(sqlText).not.toContain(FORBIDDEN_INVITATION_TOKEN_CONTEXT_SETTING);
    expect(sqlText).toMatch(
      /target_invitation as \([\s\S]*cross join invitation_acceptance_context[\s\S]*where tribe_invitations\.token_hash/
    );
    expect(sqlText).toMatch(
      /target_tribe as \([\s\S]*inner join target_invitation[\s\S]*where tribes\.slug/
    );
    expect(sqlText).not.toContain(FORBIDDEN_TRIBE_INVITATION_ID_CAST);
    expect(sqlText).toContain("status = 'blocked'");
    expect(sqlText).not.toContain("plain-token");
  });

  it("rechecks membership after insert conflicts so concurrent accepts stay idempotent", async () => {
    const execute = jest.fn(async () => ({
      rows: [{ status: "accepted" }],
    }));
    const repository = new PostgresTribeInvitationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.accept({
        token: "plain-token",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: "accepted" });

    const sqlText = getSqlText(execute.mock.calls[0]?.[0]);
    const insertConflictPosition = sqlText.indexOf(
      "on conflict (tribe_id, user_id) do nothing"
    );
    const postInsertMembershipPosition = sqlText.indexOf(
      "post_insert_membership"
    );

    expect(insertConflictPosition).toBeGreaterThan(-1);
    expect(postInsertMembershipPosition).toBeGreaterThan(insertConflictPosition);
    expect(sqlText).toMatch(
      /post_insert_membership as \([\s\S]*from public\.tribe_members[\s\S]*where tribe_members\.user_id/
    );
    expect(sqlText).toMatch(
      /post_insert_membership where status in \('active', 'muted'\)/
    );
  });

  it("maps revoked invitation acceptance to a controlled result", async () => {
    const execute = jest.fn(async () => ({
      rows: [{ status: "revoked" }],
    }));
    const repository = new PostgresTribeInvitationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.accept({
        token: "revoked-token",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: "revoked" });
  });

  it("resolves revoked invitations before requiring visible tribe access", async () => {
    const execute = jest.fn(async () => ({
      rows: [{ status: "revoked" }],
    }));
    const repository = new PostgresTribeInvitationRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(
      repository.accept({
        token: "revoked-token",
        tribeSlug: "matematica-pro",
      })
    ).resolves.toEqual({ status: "revoked" });

    const sqlText = getSqlText(execute.mock.calls[0]?.[0]);
    const targetInvitationPosition = sqlText.indexOf("target_invitation as");
    const targetTribePosition = sqlText.indexOf("target_tribe as");
    const revokedStatusPosition = sqlText.indexOf("status = ");
    const invalidFallbackPosition = sqlText.indexOf(
      "not exists (select 1 from target_invitation)"
    );

    expect(targetInvitationPosition).toBeGreaterThan(-1);
    expect(targetTribePosition).toBeGreaterThan(-1);
    expect(targetInvitationPosition).toBeLessThan(targetTribePosition);
    expect(revokedStatusPosition).toBeLessThan(invalidFallbackPosition);
  });
});
