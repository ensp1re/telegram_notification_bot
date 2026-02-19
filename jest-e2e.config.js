/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: ".",
  testRegex: ".*\\.e2e-spec\\.ts$",
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      { tsconfig: { esModuleInterop: true, strict: false } },
    ],
  },
  testEnvironment: "node",
};
