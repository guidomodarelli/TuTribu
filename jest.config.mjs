import nextJest from "next/jest.js";

const createJestConfig = nextJest({
  dir: "./",
});

const TEST_TIMEOUT_MS = 30_000;
const GENERATED_WORKTREE_PATHS = ["<rootDir>/.claude/"];
const IGNORED_TEST_PATHS = [
  "<rootDir>/.next/",
  "<rootDir>/node_modules/",
  "<rootDir>/tests/e2e/",
  ...GENERATED_WORKTREE_PATHS,
];

const customJestConfig = {
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    // files-sdk publishes ESM-only conditional exports ("import" with no
    // "require" condition), which Jest's CJS resolver cannot resolve. Map the
    // specifiers to the dist files and let the transform below convert them.
    "^files-sdk$": "<rootDir>/node_modules/files-sdk/dist/index.js",
    "^files-sdk/r2$": "<rootDir>/node_modules/files-sdk/dist/r2/index.js",
  },
  modulePathIgnorePatterns: GENERATED_WORKTREE_PATHS,
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  testEnvironment: "jest-environment-jsdom",
  testPathIgnorePatterns: IGNORED_TEST_PATHS,
  testTimeout: TEST_TIMEOUT_MS,
  // The transform exception for files-sdk's ESM dist comes from
  // `transpilePackages` in next.config.ts, which next/jest folds into its own
  // transformIgnorePatterns (a custom override here would only be appended
  // after next/jest's blanket node_modules ignore and never apply).
};

export default createJestConfig(customJestConfig);
