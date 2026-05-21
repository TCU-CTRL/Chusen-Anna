import { describe, it, expect } from "vitest";
import { pickRandom } from "../src/utils/pickRandom";

describe("pickRandom", () => {
  const candidates = ["Alice", "Bob", "Charlie", "Dave", "Eve"];

  it("selects exactly 1 person when count is 1", () => {
    const result = pickRandom(candidates, 1);
    expect(result).toHaveLength(1);
    expect(candidates).toContain(result[0]);
  });

  it("selects exactly count persons when count > 1", () => {
    const result = pickRandom(candidates, 3);
    expect(result).toHaveLength(3);
    for (const item of result) {
      expect(candidates).toContain(item);
    }
  });

  it("returns all candidates when count equals candidates.length", () => {
    const result = pickRandom(candidates, candidates.length);
    expect(result).toHaveLength(candidates.length);
    expect(new Set(result)).toEqual(new Set(candidates));
  });

  it("never returns duplicates", () => {
    // Run multiple times to increase confidence
    for (let i = 0; i < 50; i++) {
      const result = pickRandom(candidates, 3);
      const unique = new Set(result);
      expect(unique.size).toBe(result.length);
    }
  });

  it("does not mutate the input array", () => {
    const original = ["Alice", "Bob", "Charlie", "Dave", "Eve"];
    const input = [...original];
    pickRandom(input, 3);
    expect(input).toEqual(original);
  });

  it("throws when count > candidates.length", () => {
    expect(() => pickRandom(candidates, 10)).toThrow();
  });

  it("throws when count < 1", () => {
    expect(() => pickRandom(candidates, 0)).toThrow();
    expect(() => pickRandom(candidates, -1)).toThrow();
  });

  it("throws when count is not an integer", () => {
    expect(() => pickRandom(candidates, 1.5)).toThrow();
  });

  it("works with non-string types", () => {
    const nums = [1, 2, 3, 4, 5];
    const result = pickRandom(nums, 2);
    expect(result).toHaveLength(2);
    for (const item of result) {
      expect(nums).toContain(item);
    }
  });
});
