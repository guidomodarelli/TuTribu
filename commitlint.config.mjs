const COMMIT_TYPES = [
  "build",
  "chore",
  "ci",
  "docs",
  "feat",
  "fix",
  "perf",
  "refactor",
  "revert",
  "style",
  "test",
];

const COMMIT_TYPE_PATTERN = COMMIT_TYPES.join("|");
const SEMVER_RELEASE_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z-.]+)?$/u;
const CONVENTIONAL_HEADER_PATTERN = new RegExp(
  `^(?:${COMMIT_TYPE_PATTERN})(?:\\([a-z0-9-]+\\))?!?: \\S.+$`,
  "u"
);
const LEGACY_REPOSITORY_HEADER_PATTERN = new RegExp(
  `^(?!(?:${COMMIT_TYPE_PATTERN})\\b)(?=.{10,72}$)\\S(?:.*\\S)?$`,
  "u"
);

function isRepositoryCommitHeader(header) {
  return (
    SEMVER_RELEASE_PATTERN.test(header) ||
    CONVENTIONAL_HEADER_PATTERN.test(header) ||
    LEGACY_REPOSITORY_HEADER_PATTERN.test(header)
  );
}

const commitlintConfig = {
  extends: ["@commitlint/config-conventional"],
  plugins: [
    {
      rules: {
        "repository-header-format": (parsed) => {
          const header = parsed.header ?? "";

          return [
            isRepositoryCommitHeader(header),
            "header must use a repository commit style: conventional type, semver release, or established imperative title",
          ];
        },
      },
    },
  ],
  rules: {
    "body-leading-blank": [1, "always"],
    "body-max-line-length": [0],
    "footer-leading-blank": [1, "always"],
    "header-max-length": [2, "always", 72],
    "repository-header-format": [2, "always"],
    "subject-case": [0],
    "subject-empty": [0],
    "type-empty": [0],
  },
};

export default commitlintConfig;
