import type { SitepingFeedback } from "./siteping-feedback-repository";

export type GitHubIssuePublication = {
  issueNumber: number;
  issueUrl: string;
};

export type PublishGitHubIssueCommand = {
  feedback: SitepingFeedback;
  requestUrl: string;
};

export type CloseGitHubIssueCommand = {
  feedbackId: string;
  issueNumber: number;
};

export type GitHubIssuePublisher = {
  close(command: CloseGitHubIssueCommand): Promise<void>;
  publish(command: PublishGitHubIssueCommand): Promise<GitHubIssuePublication>;
};
