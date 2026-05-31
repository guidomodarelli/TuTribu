import type { SitepingFeedback } from "./siteping-feedback-repository";

export type GitHubIssuePublication = {
  issueNumber: number;
  issueUrl: string;
};

export type PublishGitHubIssueCommand = {
  feedback: SitepingFeedback;
  requestUrl: string;
};

export type GitHubIssuePublisher = {
  publish(command: PublishGitHubIssueCommand): Promise<GitHubIssuePublication>;
};

