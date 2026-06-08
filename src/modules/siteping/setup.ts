import {
  createSitepingFeedback,
  deleteSitepingFeedback,
  getSitepingIdentity,
  listSitepingFeedback,
  updateSitepingFeedbackStatus,
  type SitepingFeedbackLogger,
} from "@/src/modules/siteping/application/use-cases/manage-siteping-feedback-use-cases";
import { getSitepingEnvironment } from "@/src/modules/siteping/infrastructure/environment/siteping-environment";
import type { GitHubIssuePublisher } from "@/src/modules/siteping/domain/repositories/github-issue-publisher";
import type { SitepingFeedbackRepository } from "@/src/modules/siteping/domain/repositories/siteping-feedback-repository";
import type { SitepingScreenshotStorage } from "@/src/modules/siteping/domain/repositories/siteping-screenshot-storage";

type SitepingModuleDependencies = {
  githubIssuePublisher: GitHubIssuePublisher;
  logger?: SitepingFeedbackLogger;
  screenshotStorage: SitepingScreenshotStorage;
  sitepingFeedbackRepository: SitepingFeedbackRepository;
};

export function buildSitepingModule({
  githubIssuePublisher,
  logger,
  screenshotStorage,
  sitepingFeedbackRepository,
}: SitepingModuleDependencies) {
  const environment = getSitepingEnvironment();

  return {
    useCases: {
      createFeedback: createSitepingFeedback({
        githubIssuePublisher,
        logger,
        screenshotStorage,
        sitepingFeedbackRepository,
      }),
      deleteFeedback: deleteSitepingFeedback({
        githubIssuePublisher,
        screenshotStorage,
        sitepingFeedbackRepository,
      }),
      getIdentity: getSitepingIdentity({
        allowedEmails: environment.allowedEmails,
        enabled: environment.enabled,
        projectName: environment.projectName,
      }),
      listFeedback: listSitepingFeedback({
        sitepingFeedbackRepository,
      }),
      updateFeedbackStatus: updateSitepingFeedbackStatus({
        sitepingFeedbackRepository,
      }),
    },
  };
}
