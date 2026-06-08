import {
  createSitepingFeedback,
  deleteSitepingFeedback,
  getSitepingIdentity,
  listSitepingFeedback,
  updateSitepingFeedbackStatus,
} from "@/src/modules/siteping/application/use-cases/manage-siteping-feedback-use-cases";
import { getSitepingEnvironment } from "@/src/modules/siteping/infrastructure/environment/siteping-environment";
import type { GitHubIssuePublisher } from "@/src/modules/siteping/domain/repositories/github-issue-publisher";
import type { SitepingFeedbackRepository } from "@/src/modules/siteping/domain/repositories/siteping-feedback-repository";
import type { SitepingScreenshotStorage } from "@/src/modules/siteping/domain/repositories/siteping-screenshot-storage";

type SitepingModuleDependencies = {
  githubIssuePublisher: GitHubIssuePublisher;
  screenshotStorage: SitepingScreenshotStorage;
  sitepingFeedbackRepository: SitepingFeedbackRepository;
};

export function buildSitepingModule({
  githubIssuePublisher,
  screenshotStorage,
  sitepingFeedbackRepository,
}: SitepingModuleDependencies) {
  const environment = getSitepingEnvironment();

  return {
    useCases: {
      createFeedback: createSitepingFeedback({
        githubIssuePublisher,
        screenshotStorage,
        sitepingFeedbackRepository,
      }),
      deleteFeedback: deleteSitepingFeedback({
        githubIssuePublisher,
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
