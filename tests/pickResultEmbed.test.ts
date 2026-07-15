import { describe, it, expect } from "vitest";
import { buildPickResultEmbed } from "../src/embeds/pickResultEmbed";
import type { Participant, Session } from "../src/session/types";

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    guildId: "g1",
    channelId: "c1",
    creatorId: "creator1",
    createdAt: "2026-05-20T10:00:00.000Z",
    participants: {},
    pickedUserIds: [],
    messageId: "m1",
    ...overrides,
  };
}

function makeParticipant(userId: string, displayName: string): Participant {
  return { userId, displayName, joinedAt: "2026-05-20T10:01:00.000Z" };
}

describe("buildPickResultEmbed", () => {
  // --- title ---
  it("has title 🎲 抽選アンナちゃん 結果発表", () => {
    const picked = [makeParticipant("u1", "Alice")];
    const session = makeSession({
      participants: { u1: picked[0] },
    });
    const embed = buildPickResultEmbed(picked, session, "General");
    expect(embed.title).toBe("🎲 抽選アンナちゃん 結果発表");
  });

  // --- description: single pick ---
  it("uses successMessageSingle for 1 person", () => {
    const picked = [makeParticipant("u1", "Alice")];
    const session = makeSession({
      participants: { u1: picked[0] },
    });
    const embed = buildPickResultEmbed(picked, session, "General");
    expect(embed.description).toContain("<@u1>");
    expect(embed.description).toContain("抽選アンナちゃんの出番です");
    // Single message does NOT contain 順番に
    expect(embed.description).not.toContain("順番に");
  });

  // --- description: multiple pick ---
  it("uses successMessageMultiple for 2+ people", () => {
    const p1 = makeParticipant("u1", "Alice");
    const p2 = makeParticipant("u2", "Bob");
    const picked = [p1, p2];
    const session = makeSession({
      participants: { u1: p1, u2: p2, u3: makeParticipant("u3", "Carol") },
    });
    const embed = buildPickResultEmbed(picked, session, "General");
    expect(embed.description).toContain("<@u1>");
    expect(embed.description).toContain("<@u2>");
    expect(embed.description).toContain("順番に");
  });

  // --- fields: VC name ---
  it("includes VC name field", () => {
    const picked = [makeParticipant("u1", "Alice")];
    const session = makeSession({
      participants: { u1: picked[0] },
    });
    const embed = buildPickResultEmbed(picked, session, "雑談VC");
    const fields = embed.fields ?? [];
    const vcField = fields.find((f) => f.name.includes("VC"));
    expect(vcField).toBeDefined();
    expect(vcField!.value).toBe("雑談VC");
  });

  // --- fields: participant count ---
  it("includes participant count field", () => {
    const p1 = makeParticipant("u1", "Alice");
    const p2 = makeParticipant("u2", "Bob");
    const p3 = makeParticipant("u3", "Carol");
    const picked = [p1];
    const session = makeSession({
      participants: { u1: p1, u2: p2, u3: p3 },
    });
    const embed = buildPickResultEmbed(picked, session, "General");
    const fields = embed.fields ?? [];
    const countField = fields.find(
      (f) => f.name.includes("参加表明人数") || f.name.includes("抽選対象人数"),
    );
    expect(countField).toBeDefined();
    expect(countField!.value).toContain("3");
  });

  // --- fields: picked count ---
  it("includes picked count field", () => {
    const p1 = makeParticipant("u1", "Alice");
    const p2 = makeParticipant("u2", "Bob");
    const picked = [p1, p2];
    const session = makeSession({
      participants: { u1: p1, u2: p2 },
    });
    const embed = buildPickResultEmbed(picked, session, "General");
    const fields = embed.fields ?? [];
    const pickedField = fields.find((f) => f.name.includes("抽選人数"));
    expect(pickedField).toBeDefined();
    expect(pickedField!.value).toContain("2");
  });

  // --- footer ---
  it("has footer text 抽選アンナちゃん", () => {
    const picked = [makeParticipant("u1", "Alice")];
    const session = makeSession({
      participants: { u1: picked[0] },
    });
    const embed = buildPickResultEmbed(picked, session, "General");
    expect(embed.footer?.text).toBe("抽選アンナちゃん");
  });

  // --- timestamp ---
  it("has ISO 8601 timestamp", () => {
    const picked = [makeParticipant("u1", "Alice")];
    const session = makeSession({
      participants: { u1: picked[0] },
    });
    const embed = buildPickResultEmbed(picked, session, "General");
    expect(embed.timestamp).toBeDefined();
    // Should be a valid ISO 8601 string
    expect(() => new Date(embed.timestamp!)).not.toThrow();
    expect(new Date(embed.timestamp!).toISOString()).toBe(embed.timestamp);
  });
});
