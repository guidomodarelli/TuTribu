import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
vi.mock("server-only", () => ({}));

import { COURSE_MUTATION_STATUS } from "@/src/modules/courses/constants/courses";
import { R2LessonFileRepository } from "@/src/modules/courses/infrastructure/repositories/r2-lesson-file-repository";
import type { FileObjectStorage } from "@/src/modules/shared/infrastructure/storage/r2-file-object-storage";

const CLOUDFLARE_R2_ENVIRONMENT = {
  CLOUDFLARE_ACCOUNT_ID: "account-id",
  CLOUDFLARE_R2_ACCESS_KEY_ID: "access-key-id",
  CLOUDFLARE_R2_BUCKET_NAME: "bucket-name",
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: "secret-access-key",
} as const;

const SIGNED_DOWNLOAD_URL = "https://r2.example.com/download";

const FILE_COMMAND = {
  fileId: "file-1",
  tribeSlug: "matematica-pro",
  userId: "leader-1",
} as const;

const DOWNLOADABLE_FILE_ROW = {
  file_name: "guia.pdf",
  id: "file-1",
  storage_key: "course-lesson-files/tribe-1/file-1",
} as const;

function buildDeletableFileRow(canDelete: boolean) {
  return {
    can_delete: canDelete,
    id: "file-1",
    sort_order: 0,
    status: "attached",
    storage_key: "course-lesson-files/tribe-1/file-1",
  };
}

const originalEnvironment = new Map<string, string | undefined>();

function saveCloudflareR2Environment() {
  for (const name of Object.keys(CLOUDFLARE_R2_ENVIRONMENT)) {
    originalEnvironment.set(name, process.env[name]);
  }
}

function restoreCloudflareR2Environment() {
  for (const [name, value] of originalEnvironment) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
}

function configureCloudflareR2Environment() {
  for (const [name, value] of Object.entries(CLOUDFLARE_R2_ENVIRONMENT)) {
    process.env[name] = value;
  }
}

function clearCloudflareR2Environment() {
  for (const name of Object.keys(CLOUDFLARE_R2_ENVIRONMENT)) {
    delete process.env[name];
  }
}

function createStorage() {
  return {
    createSignedDownloadUrl: vi.fn(async () => SIGNED_DOWNLOAD_URL),
    createSignedUploadUrl: vi.fn(),
    deleteObject: vi.fn(async () => true),
    getObjectSizeBytes: vi.fn(),
  };
}

function createRepository(rowsPerQuery: Record<string, unknown>[][]) {
  const execute = vi.fn();

  for (const rows of rowsPerQuery) {
    execute.mockResolvedValueOnce({ rows });
  }

  const storage = createStorage();
  const storageFactory = vi.fn(() => storage as unknown as FileObjectStorage);
  const repository = new R2LessonFileRepository(
    async (callback) => callback({ execute } as never),
    { storageFactory }
  );

  return { execute, repository, storage, storageFactory };
}

describe("R2LessonFileRepository", () => {
  beforeEach(() => {
    saveCloudflareR2Environment();
  });

  afterEach(() => {
    restoreCloudflareR2Environment();
  });

  describe("without R2 configured", () => {
    beforeEach(() => {
      clearCloudflareR2Environment();
    });

    it("answers notFound for a download of a missing or hidden file", async () => {
      const { execute, repository, storageFactory } = createRepository([[]]);

      await expect(repository.createDownloadUrl(FILE_COMMAND)).resolves.toEqual({
        status: COURSE_MUTATION_STATUS.notFound,
      });
      expect(execute).toHaveBeenCalledTimes(1);
      expect(storageFactory).not.toHaveBeenCalled();
    });

    it("answers invalidFile for a download of a visible file", async () => {
      const { repository } = createRepository([[DOWNLOADABLE_FILE_ROW]]);

      await expect(repository.createDownloadUrl(FILE_COMMAND)).resolves.toEqual({
        status: COURSE_MUTATION_STATUS.invalidFile,
      });
    });

    it("answers notFound for a deletion of a missing file", async () => {
      const { repository } = createRepository([[]]);

      await expect(repository.deleteFile(FILE_COMMAND)).resolves.toEqual({
        status: COURSE_MUTATION_STATUS.notFound,
      });
    });

    it("answers forbidden for a deletion the viewer cannot perform", async () => {
      const { repository } = createRepository([[buildDeletableFileRow(false)]]);

      await expect(repository.deleteFile(FILE_COMMAND)).resolves.toEqual({
        status: COURSE_MUTATION_STATUS.forbidden,
      });
    });

    it("answers invalidFile without marking a deletable file", async () => {
      const { execute, repository } = createRepository([
        [buildDeletableFileRow(true)],
      ]);

      await expect(repository.deleteFile(FILE_COMMAND)).resolves.toEqual({
        status: COURSE_MUTATION_STATUS.invalidFile,
      });
      expect(execute).toHaveBeenCalledTimes(1);
    });

    it("rejects an upload before touching the database", async () => {
      const { execute, repository } = createRepository([]);

      await expect(
        repository.createUpload({
          fileName: "guia.pdf",
          fileSizeBytes: 4096,
          mimeType: "application/pdf",
          tribeSlug: FILE_COMMAND.tribeSlug,
          userId: FILE_COMMAND.userId,
        })
      ).resolves.toEqual({ status: COURSE_MUTATION_STATUS.invalidFile });
      expect(execute).not.toHaveBeenCalled();
    });
  });

  describe("with R2 configured", () => {
    beforeEach(() => {
      configureCloudflareR2Environment();
    });

    it("signs a download for a visible file", async () => {
      const { repository, storage } = createRepository([[DOWNLOADABLE_FILE_ROW]]);

      await expect(repository.createDownloadUrl(FILE_COMMAND)).resolves.toEqual({
        downloadUrl: SIGNED_DOWNLOAD_URL,
        status: COURSE_MUTATION_STATUS.created,
      });
      expect(storage.createSignedDownloadUrl).toHaveBeenCalledWith({
        fileName: DOWNLOADABLE_FILE_ROW.file_name,
        storageKey: DOWNLOADABLE_FILE_ROW.storage_key,
      });
    });

    it("answers notFound for a hidden file without signing", async () => {
      const { repository, storage } = createRepository([[]]);

      await expect(repository.createDownloadUrl(FILE_COMMAND)).resolves.toEqual({
        status: COURSE_MUTATION_STATUS.notFound,
      });
      expect(storage.createSignedDownloadUrl).not.toHaveBeenCalled();
    });
  });
});
