import { vi, describe, it, expect } from "vitest";
import {
  getTribeSupport,
  saveTribeSupport,
} from "@/src/modules/tribes/application/use-cases/manage-tribe-support-use-cases";
import { TRIBE_SUPPORT_CHANNEL, TRIBE_SUPPORT_SAVE_STATUS } from "@/src/modules/tribes/constants/tribe-support";
import type {
  TribeSupportRepository,
  TribeSupportSettings,
} from "@/src/modules/tribes/domain/repositories/tribe-support-repository";

function buildSettings(
  overrides: Partial<TribeSupportSettings> = {}
): TribeSupportSettings {
  return {
    channel: TRIBE_SUPPORT_CHANNEL.whatsapp,
    message: "Hola, vengo desde la tribu",
    phoneNumber: "+54 9 11 1234 5678",
    ...overrides,
  };
}

function buildRepository(
  overrides: Partial<TribeSupportRepository> = {}
): TribeSupportRepository {
  return {
    getByTribeSlug: vi.fn(async () => null),
    save: vi.fn(async () => ({
      settings: buildSettings(),
      status: TRIBE_SUPPORT_SAVE_STATUS.updated,
    })),
    ...overrides,
  };
}

describe("manage tribe support use cases", () => {
  it("returns null when there is no support configuration", async () => {
    const repository = buildRepository();
    const useCase = getTribeSupport({
      tribeSupportRepository: repository,
    });

    const result = await useCase({ tribeSlug: " matematica-pro " });

    expect(result).toBeNull();
    expect(repository.getByTribeSlug).toHaveBeenCalledWith({
      tribeSlug: "matematica-pro",
    });
  });

  it("returns the stored support configuration when present", async () => {
    const settings = buildSettings();
    const repository = buildRepository({
      getByTribeSlug: vi.fn(async () => settings),
    });
    const useCase = getTribeSupport({
      tribeSupportRepository: repository,
    });

    const result = await useCase({ tribeSlug: "matematica-pro" });

    expect(result).toEqual(settings);
  });

  it("normalizes input before saving and forwards forbidden status", async () => {
    const repository = buildRepository({
      save: vi.fn(async () => ({
        settings: null,
        status: TRIBE_SUPPORT_SAVE_STATUS.forbidden,
      })),
    });
    const useCase = saveTribeSupport({
      tribeSupportRepository: repository,
    });

    const result = await useCase({
      channel: TRIBE_SUPPORT_CHANNEL.whatsapp,
      message: "   ",
      phoneNumber: " +54 9 11 1234 5678 ",
      tribeSlug: " matematica-pro ",
    });

    expect(repository.save).toHaveBeenCalledWith({
      channel: TRIBE_SUPPORT_CHANNEL.whatsapp,
      message: null,
      phoneNumber: "+54 9 11 1234 5678",
      tribeSlug: "matematica-pro",
    });
    expect(result.status).toBe(TRIBE_SUPPORT_SAVE_STATUS.forbidden);
    expect(result.settings).toBeNull();
  });

  it("returns updated settings when the repository confirms the save", async () => {
    const savedSettings = buildSettings({ message: "Hola" });
    const repository = buildRepository({
      save: vi.fn(async () => ({
        settings: savedSettings,
        status: TRIBE_SUPPORT_SAVE_STATUS.updated,
      })),
    });
    const useCase = saveTribeSupport({
      tribeSupportRepository: repository,
    });

    const result = await useCase({
      channel: TRIBE_SUPPORT_CHANNEL.whatsapp,
      message: " Hola ",
      phoneNumber: "+54 9 11 1234 5678",
      tribeSlug: "matematica-pro",
    });

    expect(result).toEqual({
      settings: savedSettings,
      status: TRIBE_SUPPORT_SAVE_STATUS.updated,
    });
  });
});
