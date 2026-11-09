import { expect, test } from "vitest";

// Deliberately red: checks that branch protection blocks a PR with a failing test.
// This PR is closed without merging.
test("deliberately failing test", () => {
  expect(1 + 1).toBe(3);
});
