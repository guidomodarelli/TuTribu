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
  },
  modulePathIgnorePatterns: GENERATED_WORKTREE_PATHS,
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  testEnvironment: "jest-environment-jsdom",
  testPathIgnorePatterns: IGNORED_TEST_PATHS,
  testTimeout: TEST_TIMEOUT_MS,
};

export default createJestConfig(customJestConfig);
