import { SITEPING_PROJECT } from "@/src/modules/siteping/constants/siteping";

const SITEPING_ENVIRONMENT = {
  allowedEmails: "SITEPING_ALLOWED_EMAILS",
  enabled: "SITEPING_ENABLED",
  githubLabels: "SITEPING_GITHUB_LABELS",
  githubRepository: "SITEPING_GITHUB_REPOSITORY",
  githubToken: "SITEPING_GITHUB_TOKEN",
  projectName: "SITEPING_PROJECT_NAME",
} as const;

const SITEPING_ENVIRONMENT_DEFAULT = {
  githubLabels: ["siteping", "feedback"],
  githubRepository: "guidomodarelli/LaTribu",
} as const;

const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);
const LIST_SEPARATOR = ",";

function readList(value: string | undefined): string[] {
  return (value ?? "")
    .split(LIST_SEPARATOR)
    .map((item) => item.trim())
    .filter(Boolean);
}

function readBoolean(value: string | undefined): boolean {
  return ENABLED_VALUES.has((value ?? "").trim().toLowerCase());
}

export function getSitepingEnvironment() {
  return {
    allowedEmails: readList(process.env[SITEPING_ENVIRONMENT.allowedEmails]),
    enabled: readBoolean(process.env[SITEPING_ENVIRONMENT.enabled]),
    githubLabels:
      readList(process.env[SITEPING_ENVIRONMENT.githubLabels]).length > 0
        ? readList(process.env[SITEPING_ENVIRONMENT.githubLabels])
        : [...SITEPING_ENVIRONMENT_DEFAULT.githubLabels],
    githubRepository:
      process.env[SITEPING_ENVIRONMENT.githubRepository]?.trim() ||
      SITEPING_ENVIRONMENT_DEFAULT.githubRepository,
    githubToken: process.env[SITEPING_ENVIRONMENT.githubToken]?.trim() ?? "",
    projectName:
      process.env[SITEPING_ENVIRONMENT.projectName]?.trim() ||
      SITEPING_PROJECT.defaultName,
  };
}
