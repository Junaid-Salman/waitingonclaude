import { expect, test } from "vitest";

test("runs on Node 22 or later", () => {
  expect(Number(process.versions.node.split(".")[0])).toBeGreaterThanOrEqual(22);
});
