import { describe, it, expect } from "vitest";

describe("project setup", () => {
  it("TypeScript strict mode is enabled", async () => {
    const fs = await import("node:fs");
    const tsconfig = JSON.parse(
      fs.readFileSync("tsconfig.json", "utf-8"),
    );
    expect(tsconfig.compilerOptions.strict).toBe(true);
  });

  it("worker module exports a fetch handler", async () => {
    const mod = await import("../src/index");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default.fetch).toBe("function");
  });
});
