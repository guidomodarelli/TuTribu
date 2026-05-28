import { PostgresMemberProfileRepository } from "@/src/modules/auth/infrastructure/repositories/postgres-member-profile-repository";

const MEMBER_ID = "member-1";
const IMAGE_URL = "https://lh3.googleusercontent.com/a/new=s96-c";

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

describe("PostgresMemberProfileRepository", () => {
  it("returns the stored image for a member", async () => {
    const execute = jest.fn(async () => ({ rows: [{ image: IMAGE_URL }] }));
    const repository = new PostgresMemberProfileRepository(async (callback) =>
      callback({ execute } as never)
    );

    await expect(repository.getImage(MEMBER_ID)).resolves.toBe(IMAGE_URL);

    const sqlText = getSqlText(execute.mock.calls[0]?.[0]);
    expect(sqlText).toContain("select image");
    expect(sqlText).toContain('public."user"');
    expect(sqlText).toContain("where id = ");
  });

  it("returns null when the member has no stored image", async () => {
    const repository = new PostgresMemberProfileRepository(async (callback) =>
      callback({ execute: jest.fn(async () => ({ rows: [] })) } as never)
    );

    await expect(repository.getImage(MEMBER_ID)).resolves.toBeNull();
  });

  it("updates the stored image for a member", async () => {
    const execute = jest.fn(async () => ({ rows: [] }));
    const repository = new PostgresMemberProfileRepository(async (callback) =>
      callback({ execute } as never)
    );

    await repository.updateImage(MEMBER_ID, IMAGE_URL);

    const sqlText = getSqlText(execute.mock.calls[0]?.[0]);
    expect(sqlText).toContain('update public."user"');
    expect(sqlText).toContain("set image = ");
    expect(sqlText).toContain("where id = ");
  });
});
