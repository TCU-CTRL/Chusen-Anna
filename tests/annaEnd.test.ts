import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleAnnaEnd } from "../src/commands/annaEnd";
import { InteractionResponseType, InteractionType } from "discord-api-types/v10";
import type { APIInteraction } from "discord-api-types/v10";
import type { Env } from "../src/config/env";

// ---------------------------------------------------------------------------
// KV mock
// ---------------------------------------------------------------------------

function createKVMock(): KVNamespace & { _store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    _store: store,
    async get(key: string, options?: any): Promise<any> {
      const val = store.get(key);
      if (val === undefined) return null;
      if (typeof options === "string" && options === "json") return JSON.parse(val);
      if (typeof options === "object" && options?.type === "json") return JSON.parse(val);
      return val;
    },
    async put(key: string, value: string, _options?: any): Promise<void> {
      store.set(key, value);
    },
    async delete(key: string): Promise<void> {
      store.delete(key);
    },
    async list(): Promise<any> { return { keys: [], list_complete: true, cacheStatus: null }; },
    async getWithMetadata(): Promise<any> { return { value: null, metadata: null, cacheStatus: null }; },
  } as any;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAnnaEndInteraction(overrides: Record<string, any> = {}): APIInteraction {
  return {
    type: InteractionType.ApplicationCommand,
    data: { name: "tyusen_end" },
    guild_id: "guild-1",
    channel_id: "channel-1",
    token: "interaction-token-123",
    member: {
      user: { id: "user-1" },
    },
    ...overrides,
  } as unknown as APIInteraction;
}

function makeEnv(kv: KVNamespace): Env {
  return {
    DISCORD_PUBLIC_KEY: "test-key",
    DISCORD_TOKEN: "test-bot-token",
    DISCORD_APPLICATION_ID: "test-app-id",
    DISCORD_GUILD_ID: "test-guild-id",
    SESSIONS: kv,
  };
}

function makeSession(overrides: Record<string, any> = {}) {
  return {
    guildId: "guild-1",
    channelId: "channel-1",
    creatorId: "user-1",
    createdAt: new Date().toISOString(),
    participants: {
      "user-a": { userId: "user-a", displayName: "Alice", joinedAt: new Date().toISOString() },
      "user-b": { userId: "user-b", displayName: "Bob", joinedAt: new Date().toISOString() },
    },
    pickedUserIds: ["user-a"],
    messageId: "",
    ...overrides,
  };
}

describe("handleAnnaEnd", () => {
  let kv: ReturnType<typeof createKVMock>;
  let env: Env;
  let ctx: ExecutionContext;

  beforeEach(() => {
    kv = createKVMock();
    env = makeEnv(kv);
    ctx = {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
    } as unknown as ExecutionContext;
  });

  it("returns ephemeral error when no session exists", async () => {
    const interaction = makeAnnaEndInteraction();
    const res = await handleAnnaEnd(interaction, env, ctx);
    const json = await res.json();

    expect(json.type).toBe(InteractionResponseType.ChannelMessageWithSource);
    expect(json.data.flags).toBe(64); // EPHEMERAL
    expect(json.data.content).toBeTruthy();
  });

  it("returns summary embed and deletes session when session exists", async () => {
    // Pre-populate session
    const session = makeSession();
    await kv.put("session:guild-1:channel-1", JSON.stringify(session));

    const interaction = makeAnnaEndInteraction();
    const res = await handleAnnaEnd(interaction, env, ctx);
    const json = await res.json();

    // Should be type 4 (CHANNEL_MESSAGE_WITH_SOURCE) - visible to all
    expect(json.type).toBe(InteractionResponseType.ChannelMessageWithSource);

    // Should have embeds with summary
    expect(json.data.embeds).toBeDefined();
    expect(json.data.embeds).toHaveLength(1);
    const embed = json.data.embeds[0];
    expect(embed.title).toContain("結果発表");

    // Should NOT be ephemeral
    expect(json.data.flags).toBeUndefined();

    // Session should be deleted from KV
    const remaining = await kv.get("session:guild-1:channel-1", { type: "json" });
    expect(remaining).toBeNull();
  });

  it("summary embed includes picked member names", async () => {
    const session = makeSession({
      participants: {
        "user-x": { userId: "user-x", displayName: "Xander", joinedAt: new Date().toISOString() },
        "user-y": { userId: "user-y", displayName: "Yuki", joinedAt: new Date().toISOString() },
      },
      pickedUserIds: ["user-x", "user-y"],
    });
    await kv.put("session:guild-1:channel-1", JSON.stringify(session));

    const interaction = makeAnnaEndInteraction();
    const res = await handleAnnaEnd(interaction, env, ctx);
    const json = await res.json();

    const embed = json.data.embeds[0];
    const pickedField = embed.fields.find((f: any) => f.name.includes("選出メンバー"));
    expect(pickedField).toBeDefined();
    expect(pickedField.value).toContain("Xander");
    expect(pickedField.value).toContain("Yuki");
  });

  it("works with different guild/channel combinations", async () => {
    const session = makeSession({ guildId: "guild-2", channelId: "channel-2" });
    await kv.put("session:guild-2:channel-2", JSON.stringify(session));

    const interaction = makeAnnaEndInteraction({
      guild_id: "guild-2",
      channel_id: "channel-2",
    });
    const res = await handleAnnaEnd(interaction, env, ctx);
    const json = await res.json();

    expect(json.type).toBe(InteractionResponseType.ChannelMessageWithSource);
    expect(json.data.embeds).toHaveLength(1);

    // Session should be deleted
    const remaining = await kv.get("session:guild-2:channel-2", { type: "json" });
    expect(remaining).toBeNull();
  });
});
