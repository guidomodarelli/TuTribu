import type { VideoProvider } from "@/src/modules/shared/domain/value-objects/video-provider";

export type Lesson = {
  courseModuleId: string;
  description: string | null;
  externalVideoId: string;
  id: string;
  isActive: boolean;
  sortOrder: number;
  title: string;
  videoProvider: VideoProvider;
};
