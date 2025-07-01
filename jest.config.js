export const testEnvironment = "node";
export const roots = ["<rootDir>/tests"];
export const testMatch = ["**/*.test.ts"];
export const transform = {
  "^.+\\.tsx?$": "babel-jest",
};
export const setupFilesAfterEnv = ["<rootDir>/tests/setup.ts"];
export const testTimeout = 30000;
export const projects = [
  {
    displayName: "unit",
    testMatch: ["<rootDir>/tests/unit/**/*.test.ts"],
    testEnvironment: "node",
  },
  {
    displayName: "integration",
    testMatch: ["<rootDir>/tests/integration/**/*.test.ts"],
    testEnvironment: "node",
  },
];
