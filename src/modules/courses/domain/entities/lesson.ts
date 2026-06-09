import type { VideoProvider } from "@/src/modules/shared/domain/value-objects/video-provider";
import type { LessonFile } from "@/src/modules/courses/domain/entities/lesson-file";

export type Lesson = {
  courseModuleId: string;
  description: string | null;
  externalVideoId: string;
  files?: LessonFile[];
  id: string;
  isActive: boolean;
  sortOrder: number;
  title: string;
  videoProvider: VideoProvider;
};
