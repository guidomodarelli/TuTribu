import {
  MESSAGE_FILES,
  MESSAGE_MUTATION_STATUS,
} from "@/src/modules/messages/constants/message-round";
import {
  NORMALIZED_MESSAGE_FILES_STATUS,
  createMessageFileDownloadUrl,
  createMessageFileUpload,
  deleteMessageFile,
  normalizeMessageFileDrafts,
} from "@/src/modules/messages/application/use-cases/message-files-use-cases";

const ASSET_ID = "a3bb189e-8bf9-4888-9912-ace4e6543002";
const OTHER_ASSET_ID = "b4cc290f-9c0a-4999-aa23-bdf5f7654113";

describe("normalizeMessageFileDrafts", () => {
  it("derives sortOrder from the array index", () => {
    const normalized = normalizeMessageFileDrafts([
      { assetId: ASSET_ID },
      { assetId: OTHER_ASSET_ID },
    ]);

    expect(normalized).toEqual({
      files: [
        { assetId: ASSET_ID, sortOrder: 0 },
        { assetId: OTHER_ASSET_ID, sortOrder: 1 },
      ],
      status: NORMALIZED_MESSAGE_FILES_STATUS.valid,
    });
  });

  it("treats an absent list as an empty valid list", () => {
    expect(normalizeMessageFileDrafts(undefined)).toEqual({
      files: [],
      status: NORMALIZED_MESSAGE_FILES_STATUS.valid,
    });
  });

  it("rejects lists above the per-message ceiling", () => {
    const drafts = Array.from(
      { length: MESSAGE_FILES.maxCount + 1 },
      (unused, index) => ({
        assetId: `${index}3bb189e-8bf9-4888-9912-ace4e6543002`,
      })
    );

    expect(normalizeMessageFileDrafts(drafts)).toEqual({
      status: MESSAGE_MUTATION_STATUS.invalidFile,
    });
  });

  it("rejects duplicate and malformed asset ids", () => {
    expect(
      normalizeMessageFileDrafts([
        { assetId: ASSET_ID },
        { assetId: ASSET_ID },
      ])
    ).toEqual({ status: MESSAGE_MUTATION_STATUS.invalidFile });
    expect(normalizeMessageFileDrafts([{ assetId: "not-a-uuid" }])).toEqual({
      status: MESSAGE_MUTATION_STATUS.invalidFile,
    });
  });
});

describe("createMessageFileUpload", () => {
  const VALID_COMMAND = {
    fileName: "  guia.pdf  ",
    fileSizeBytes: 2048,
    mimeType: "Application/PDF",
    tribeSlug: "  mi-tribu  ",
    userId: "  user-1  ",
  };

  it("normalizes the declaration and reserves the upload", async () => {
    const createUpload = jest.fn(async () => ({
      assetId: ASSET_ID,
      status: MESSAGE_MUTATION_STATUS.created,
      uploadHeaders: {},
      uploadUrl: "https://example.com/upload",
    }));
    const execute = createMessageFileUpload({
      messageFileRepository: { createUpload },
    });

    await expect(execute(VALID_COMMAND)).resolves.toMatchObject({
      assetId: ASSET_ID,
      status: MESSAGE_MUTATION_STATUS.created,
    });

    expect(createUpload).toHaveBeenCalledWith({
      fileName: "guia.pdf",
      fileSizeBytes: 2048,
      mimeType: "application/pdf",
      tribeSlug: "mi-tribu",
      userId: "user-1",
    });
  });

  it("rejects disallowed MIME types without touching the repository", async () => {
    const createUpload = jest.fn();
    const execute = createMessageFileUpload({
      messageFileRepository: { createUpload },
    });

    await expect(
      execute({ ...VALID_COMMAND, mimeType: "application/x-sh" })
    ).resolves.toEqual({ status: MESSAGE_MUTATION_STATUS.invalidFile });

    expect(createUpload).not.toHaveBeenCalled();
  });

  it("rejects declared sizes above the ceiling without touching the repository", async () => {
    const createUpload = jest.fn();
    const execute = createMessageFileUpload({
      messageFileRepository: { createUpload },
    });

    await expect(
      execute({ ...VALID_COMMAND, fileSizeBytes: 26 * 1024 * 1024 })
    ).resolves.toEqual({ status: MESSAGE_MUTATION_STATUS.invalidFile });

    expect(createUpload).not.toHaveBeenCalled();
  });
});

describe("deleteMessageFile", () => {
  it("trims identifiers before delegating to the repository", async () => {
    const deleteFile = jest.fn(async () => ({
      status: MESSAGE_MUTATION_STATUS.deleted,
    }));
    const execute = deleteMessageFile({
      messageFileRepository: { deleteFile },
    });

    await expect(
      execute({
        assetId: `  ${ASSET_ID}  `,
        tribeSlug: "  mi-tribu  ",
        userId: "  user-1  ",
      })
    ).resolves.toEqual({ status: MESSAGE_MUTATION_STATUS.deleted });

    expect(deleteFile).toHaveBeenCalledWith({
      assetId: ASSET_ID,
      tribeSlug: "mi-tribu",
      userId: "user-1",
    });
  });
});

describe("createMessageFileDownloadUrl", () => {
  it("rejects malformed asset ids without touching the repository", async () => {
    const createDownloadUrl = jest.fn();
    const execute = createMessageFileDownloadUrl({
      messageFileRepository: { createDownloadUrl },
    });

    await expect(
      execute({ assetId: "not-a-uuid", tribeSlug: "mi-tribu", userId: "user-1" })
    ).resolves.toEqual({ status: MESSAGE_MUTATION_STATUS.notFound });

    expect(createDownloadUrl).not.toHaveBeenCalled();
  });

  it("delegates well-formed asset ids to the repository", async () => {
    const createDownloadUrl = jest.fn(async () => ({
      downloadUrl: "https://example.com/signed",
      status: MESSAGE_MUTATION_STATUS.created,
    }));
    const execute = createMessageFileDownloadUrl({
      messageFileRepository: { createDownloadUrl },
    });

    await expect(
      execute({
        assetId: `  ${ASSET_ID}  `,
        tribeSlug: "mi-tribu",
        userId: "user-1",
      })
    ).resolves.toEqual({
      downloadUrl: "https://example.com/signed",
      status: MESSAGE_MUTATION_STATUS.created,
    });

    expect(createDownloadUrl).toHaveBeenCalledWith({
      assetId: ASSET_ID,
      tribeSlug: "mi-tribu",
      userId: "user-1",
    });
  });
});
