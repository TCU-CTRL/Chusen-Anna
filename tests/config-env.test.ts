import { describe, it, expect } from "vitest";

describe("src/config/env.ts", () => {
  it("exports Env interface that is importable", async () => {
    const mod = await import("../src/config/env");
    // Env is a TypeScript interface (erased at runtime),
    // so we just verify the module loads without error.
    expect(mod).toBeDefined();
  });
});

describe("src/types/discord.ts", () => {
  it("exports InteractionHandler type (module loads)", async () => {
    const mod = await import("../src/types/discord");
    expect(mod).toBeDefined();
  });
});
