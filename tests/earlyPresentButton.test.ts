import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleEarlyPresent } from "../src/components/earlyPresentButton";
import { InteractionResponseType, InteractionType, ComponentType } from "discord-api-types/v10";
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

function makeInteraction(overrides: Record<string, any> = {}): APIInteraction {
  return {
    type: InteractionType.MessageComponent,
    data: { custom_id: "tyusen_present_early", component_type: ComponentType.Button },
    guild_id: "guild-1",
    channel_id: "channel-1",
    member: {
      user: { id: "user-1", bot: false, global_name: "TestUser", username: "testuser" },
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
    creatorId: "creator-1",
    createdAt: new Date().toISOString(),
    participants: {},
    pickedUserIds: [],
    messageId: "msg-1",
    ...overrides,
  };
}

describe("handleEarlyPresent", () => {
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

  it("marks the presser as picked and announces publicly (not ephemeral, not UPDATE_MESSAGE)", async () => {
    const session = makeSession({
      participants: {
        "user-1": { userId: "user-1", displayName: "TestUser", joinedAt: new Date().toISOString() },
      },
    });
    await kv.put("session:guild-1:channel-1", JSON.stringify(session));

    const res = await handleEarlyPresent(makeInteraction(), env, ctx);
    const json = await res.json();

    // Public new message (type 4, no ephemeral flag), never overwrites the button message
    expect(json.type).toBe(InteractionResponseType.ChannelMessageWithSource);
    expect(json.type).not.toBe(7);
    expect(json.data.flags).toBeUndefined();
    expect(json.data.content).toContain("<@user-1>");

    // presser is now picked
    const updated = await kv.get("session:guild-1:channel-1", { type: "json" });
    expect(updated.pickedUserIds).toContain("user-1");
  });

  it("auto-joins a non-participant before marking them picked", async () => {
    await kv.put("session:guild-1:channel-1", JSON.stringify(makeSession()));

    const res = await handleEarlyPresent(makeInteraction(), env, ctx);
    const json = await res.json();
    expect(json.type).toBe(InteractionResponseType.ChannelMessageWithSource);

    const updated = await kv.get("session:guild-1:channel-1", { type: "json" });
    expect(updated.participants["user-1"]).toBeDefined();
    expect(updated.participants["user-1"].displayName).toBe("TestUser");
    expect(updated.pickedUserIds).toContain("user-1");
  });

  it("returns ephemeral error when the presser is already picked", async () => {
    const session = makeSession({
      participants: {
        "user-1": { userId: "user-1", displayName: "TestUser", joinedAt: new Date().toISOString() },
      },
      pickedUserIds: ["user-1"],
    });
    await kv.put("session:guild-1:channel-1", JSON.stringify(session));

    const res = await handleEarlyPresent(makeInteraction(), env, ctx);
    const json = await res.json();

    expect(json.type).toBe(InteractionResponseType.ChannelMessageWithSource);
    expect(json.data.flags).toBe(64); // EPHEMERAL

    // pickedUserIds unchanged (no duplicate)
    const updated = await kv.get("session:guild-1:channel-1", { type: "json" });
    expect(updated.pickedUserIds).toEqual(["user-1"]);
  });

  it("rejects bot accounts with ephemeral error", async () => {
    await kv.put("session:guild-1:channel-1", JSON.stringify(makeSession()));
    const interaction = makeInteraction({
      member: { user: { id: "bot-1", bot: true, global_name: "BotUser", username: "botuser" } },
    });

    const res = await handleEarlyPresent(interaction, env, ctx);
    const json = await res.json();

    expect(json.data.flags).toBe(64);
    const updated = await kv.get("session:guild-1:channel-1", { type: "json" });
    expect(updated.pickedUserIds).toEqual([]);
  });

  it("returns ephemeral error when no session exists", async () => {
    const res = await handleEarlyPresent(makeInteraction(), env, ctx);
    const json = await res.json();

    expect(json.type).toBe(InteractionResponseType.ChannelMessageWithSource);
    expect(json.data.flags).toBe(64);
  });
});
