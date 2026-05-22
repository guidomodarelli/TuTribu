import nextJest from "next/jest.js";

const createJestConfig = nextJest({
  dir: "./",
});

const TEST_TIMEOUT_MS = 15_000;

const customJestConfig = {
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  testEnvironment: "jest-environment-jsdom",
  testPathIgnorePatterns: ["<rootDir>/.next/", "<rootDir>/node_modules/", "<rootDir>/tests/e2e/"],
  testTimeout: TEST_TIMEOUT_MS,
};

export default createJestConfig(customJestConfig);
