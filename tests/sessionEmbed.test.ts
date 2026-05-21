import { describe, it, expect } from "vitest";
import {
  buildSessionEmbed,
  buildSessionSummaryEmbed,
} from "../src/embeds/sessionEmbed";
import { ButtonStyle, ComponentType } from "discord-api-types/v10";
import type { Session } from "../src/session/types";

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

describe("buildSessionEmbed", () => {
  it("returns embeds array with one embed", () => {
    const result = buildSessionEmbed(makeSession());
    expect(result.embeds).toHaveLength(1);
  });

  it("embed title contains session keyword", () => {
    const result = buildSessionEmbed(makeSession());
    expect(result.embeds[0].title).toContain("🎲");
    expect(result.embeds[0].title).toContain("抽選アンナちゃん");
  });

  it("embed description uses sessionStartMessage", () => {
    const result = buildSessionEmbed(makeSession());
    expect(result.embeds[0].description).toContain("アンナちゃん");
    expect(result.embeds[0].description).toContain("ボタン");
  });

  it("embed footer is 抽選アンナちゃん", () => {
    const result = buildSessionEmbed(makeSession());
    expect(result.embeds[0].footer?.text).toBe("抽選アンナちゃん");
  });

  it("embed has timestamp", () => {
    const session = makeSession({ createdAt: "2026-05-20T10:00:00.000Z" });
    const result = buildSessionEmbed(session);
    expect(result.embeds[0].timestamp).toBe("2026-05-20T10:00:00.000Z");
  });

  it("returns components with ActionRow containing join button", () => {
    const result = buildSessionEmbed(makeSession());
    expect(result.components).toHaveLength(1);
    const row = result.components[0];
    expect(row.type).toBe(ComponentType.ActionRow);
    expect(row.components).toHaveLength(1);
    const button = row.components[0];
    expect(button.type).toBe(ComponentType.Button);
    expect(button.style).toBe(ButtonStyle.Primary);
    expect(button.label).toBe("参加する");
    expect(button.custom_id).toBe("tyusen_join");
  });

  it("shows participants with 🙋 when not picked", () => {
    const session = makeSession({
      participants: {
        u1: { userId: "u1", displayName: "Alice", joinedAt: "2026-05-20T10:01:00.000Z" },
        u2: { userId: "u2", displayName: "Bob", joinedAt: "2026-05-20T10:02:00.000Z" },
      },
      pickedUserIds: [],
    });
    const result = buildSessionEmbed(session);
    const fields = result.embeds[0].fields ?? [];
    const participantsField = fields.find((f) => f.name.includes("参加者"));
    expect(participantsField).toBeDefined();
    expect(participantsField!.value).toContain("🙋");
    expect(participantsField!.value).toContain("Alice");
    expect(participantsField!.value).toContain("Bob");
  });

  it("shows ✅ for picked participants and 🙋 for unpicked", () => {
    const session = makeSession({
      participants: {
        u1: { userId: "u1", displayName: "Alice", joinedAt: "2026-05-20T10:01:00.000Z" },
        u2: { userId: "u2", displayName: "Bob", joinedAt: "2026-05-20T10:02:00.000Z" },
      },
      pickedUserIds: ["u1"],
    });
    const result = buildSessionEmbed(session);
    const fields = result.embeds[0].fields ?? [];
    const participantsField = fields.find((f) => f.name.includes("参加者"));
    expect(participantsField).toBeDefined();
    expect(participantsField!.value).toContain("✅ Alice");
    expect(participantsField!.value).toContain("🙋 Bob");
  });

  it("shows participant count in fields", () => {
    const session = makeSession({
      participants: {
        u1: { userId: "u1", displayName: "Alice", joinedAt: "2026-05-20T10:01:00.000Z" },
      },
    });
    const result = buildSessionEmbed(session);
    const fields = result.embeds[0].fields ?? [];
    const countField = fields.find((f) => f.name.includes("参加者数"));
    expect(countField).toBeDefined();
    expect(countField!.value).toContain("1");
  });

  it("handles empty participants gracefully", () => {
    const result = buildSessionEmbed(makeSession());
    const fields = result.embeds[0].fields ?? [];
    const participantsField = fields.find((f) => f.name.includes("参加者"));
    expect(participantsField).toBeDefined();
    expect(participantsField!.value).toContain("まだ誰も参加していません");
  });
});

describe("buildSessionSummaryEmbed", () => {
  it("returns an embed with result title", () => {
    const result = buildSessionSummaryEmbed(makeSession());
    expect(result.title).toContain("🎲");
    expect(result.title).toContain("結果発表");
  });

  it("has footer 抽選アンナちゃん", () => {
    const result = buildSessionSummaryEmbed(makeSession());
    expect(result.footer?.text).toBe("抽選アンナちゃん");
  });

  it("has timestamp", () => {
    const session = makeSession({ createdAt: "2026-05-20T10:00:00.000Z" });
    const result = buildSessionSummaryEmbed(session);
    expect(result.timestamp).toBeDefined();
  });

  it("shows picked users in fields", () => {
    const session = makeSession({
      participants: {
        u1: { userId: "u1", displayName: "Alice", joinedAt: "2026-05-20T10:01:00.000Z" },
        u2: { userId: "u2", displayName: "Bob", joinedAt: "2026-05-20T10:02:00.000Z" },
      },
      pickedUserIds: ["u1"],
    });
    const result = buildSessionSummaryEmbed(session);
    const fields = result.fields ?? [];
    const pickedField = fields.find((f) => f.name.includes("選出"));
    expect(pickedField).toBeDefined();
    expect(pickedField!.value).toContain("Alice");
  });

  it("shows total participant count", () => {
    const session = makeSession({
      participants: {
        u1: { userId: "u1", displayName: "Alice", joinedAt: "2026-05-20T10:01:00.000Z" },
        u2: { userId: "u2", displayName: "Bob", joinedAt: "2026-05-20T10:02:00.000Z" },
        u3: { userId: "u3", displayName: "Carol", joinedAt: "2026-05-20T10:03:00.000Z" },
      },
      pickedUserIds: ["u1"],
    });
    const result = buildSessionSummaryEmbed(session);
    const fields = result.fields ?? [];
    const countField = fields.find((f) => f.name.includes("参加者数") || f.name.includes("抽選対象人数"));
    expect(countField).toBeDefined();
    expect(countField!.value).toContain("3");
  });

  it("shows picked count", () => {
    const session = makeSession({
      participants: {
        u1: { userId: "u1", displayName: "Alice", joinedAt: "2026-05-20T10:01:00.000Z" },
        u2: { userId: "u2", displayName: "Bob", joinedAt: "2026-05-20T10:02:00.000Z" },
      },
      pickedUserIds: ["u1", "u2"],
    });
    const result = buildSessionSummaryEmbed(session);
    const fields = result.fields ?? [];
    const pickedCountField = fields.find((f) => f.name.includes("抽選人数") || f.name.includes("選出人数"));
    expect(pickedCountField).toBeDefined();
    expect(pickedCountField!.value).toContain("2");
  });

  it("includes character message", () => {
    const session = makeSession({
      participants: {
        u1: { userId: "u1", displayName: "Alice", joinedAt: "2026-05-20T10:01:00.000Z" },
      },
      pickedUserIds: ["u1"],
    });
    const result = buildSessionSummaryEmbed(session);
    // The description should contain character-flavored text
    expect(result.description).toBeDefined();
  });
});
