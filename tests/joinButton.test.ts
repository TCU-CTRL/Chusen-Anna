import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleJoinButton, handleJoinButtonPick } from "../src/components/joinButton";
import { InteractionResponseType, InteractionType, ComponentType, ButtonStyle } from "discord-api-types/v10";
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

function makeJoinInteraction(overrides: Record<string, any> = {}): APIInteraction {
  return {
    type: InteractionType.MessageComponent,
    data: { custom_id: "tyusen_join", component_type: ComponentType.Button },
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

describe("handleJoinButton", () => {
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

  it("rejects bot accounts with ephemeral error", async () => {
    const interaction = makeJoinInteraction({
      member: {
        user: { id: "bot-1", bot: true, global_name: "BotUser", username: "botuser" },
      },
    });

    const res = await handleJoinButton(interaction, env, ctx);
    const json = await res.json();

    expect(json.type).toBe(InteractionResponseType.ChannelMessageWithSource);
    expect(json.data.flags).toBe(64); // EPHEMERAL
  });

  it("returns ephemeral error when no session exists", async () => {
    const interaction = makeJoinInteraction();

    const res = await handleJoinButton(interaction, env, ctx);
    const json = await res.json();

    expect(json.type).toBe(InteractionResponseType.ChannelMessageWithSource);
    expect(json.data.flags).toBe(64);
  });

  it("adds participant when user is not in session (toggle on)", async () => {
    // Pre-populate a session
    await kv.put("session:guild-1:channel-1", JSON.stringify(makeSession()));

    const interaction = makeJoinInteraction();
    const res = await handleJoinButton(interaction, env, ctx);
    const json = await res.json();

    // Should return UPDATE_MESSAGE (type 7)
    expect(json.type).toBe(7);
    expect(json.data.embeds).toBeDefined();
    expect(json.data.components).toBeDefined();

    // Verify participant was added to KV
    const session = await kv.get("session:guild-1:channel-1", { type: "json" });
    expect(session.participants["user-1"]).toBeDefined();
    expect(session.participants["user-1"].displayName).toBe("TestUser");
  });

  it("removes participant when user is already in session (toggle off)", async () => {
    // Pre-populate a session with user already participating
    const session = makeSession({
      participants: {
        "user-1": {
          userId: "user-1",
          displayName: "TestUser",
          joinedAt: new Date().toISOString(),
        },
      },
    });
    await kv.put("session:guild-1:channel-1", JSON.stringify(session));

    const interaction = makeJoinInteraction();
    const res = await handleJoinButton(interaction, env, ctx);
    const json = await res.json();

    // Should return UPDATE_MESSAGE (type 7)
    expect(json.type).toBe(7);

    // Verify participant was removed from KV
    const updated = await kv.get("session:guild-1:channel-1", { type: "json" });
    expect(updated.participants["user-1"]).toBeUndefined();
  });

  it("uses global_name as displayName, falling back to username", async () => {
    await kv.put("session:guild-1:channel-1", JSON.stringify(makeSession()));

    // User with global_name
    const interaction1 = makeJoinInteraction({
      member: {
        user: { id: "user-1", bot: false, global_name: "DisplayName", username: "rawuser" },
      },
    });
    await handleJoinButton(interaction1, env, ctx);
    let session = await kv.get("session:guild-1:channel-1", { type: "json" });
    expect(session.participants["user-1"].displayName).toBe("DisplayName");

    // Reset session for fallback test
    await kv.put("session:guild-1:channel-1", JSON.stringify(makeSession()));

    // User without global_name (null)
    const interaction2 = makeJoinInteraction({
      member: {
        user: { id: "user-2", bot: false, global_name: null, username: "fallbackuser" },
      },
    });
    await handleJoinButton(interaction2, env, ctx);
    session = await kv.get("session:guild-1:channel-1", { type: "json" });
    expect(session.participants["user-2"].displayName).toBe("fallbackuser");
  });

  it("returns updated embed with participant list reflecting the change", async () => {
    await kv.put("session:guild-1:channel-1", JSON.stringify(makeSession()));

    const interaction = makeJoinInteraction();
    const res = await handleJoinButton(interaction, env, ctx);
    const json = await res.json();

    // Embed should contain participant info
    const embed = json.data.embeds[0];
    const participantField = embed.fields.find((f: any) => f.name.includes("参加者一覧"));
    expect(participantField.value).toContain("TestUser");

    const countField = embed.fields.find((f: any) => f.name.includes("参加者数"));
    expect(countField.value).toContain("1");
  });

  it("returns components with tyusen_join button in UPDATE_MESSAGE response", async () => {
    await kv.put("session:guild-1:channel-1", JSON.stringify(makeSession()));

    const interaction = makeJoinInteraction();
    const res = await handleJoinButton(interaction, env, ctx);
    const json = await res.json();

    expect(json.type).toBe(7);
    const actionRow = json.data.components[0];
    expect(actionRow.type).toBe(ComponentType.ActionRow);
    expect(actionRow.components[0].custom_id).toBe("tyusen_join");
    expect(actionRow.components[0].style).toBe(ButtonStyle.Primary);
  });
});

describe("handleJoinButtonPick", () => {
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

  function makeJoinPickInteraction(overrides: Record<string, any> = {}): APIInteraction {
    return makeJoinInteraction({
      data: { custom_id: "tyusen_join_pick", component_type: ComponentType.Button },
      ...overrides,
    });
  }

  it("responds ephemerally without overwriting the pick message (no UPDATE_MESSAGE)", async () => {
    await kv.put("session:guild-1:channel-1", JSON.stringify(makeSession()));

    const interaction = makeJoinPickInteraction();
    const res = await handleJoinButtonPick(interaction, env, ctx);
    const json = await res.json();

    // Must be a fresh ephemeral message (type 4), NOT UPDATE_MESSAGE (type 7)
    expect(json.type).toBe(InteractionResponseType.ChannelMessageWithSource);
    expect(json.type).not.toBe(7);
    expect(json.data.flags).toBe(64); // EPHEMERAL
    // Must not carry embeds that would replace the pick result
    expect(json.data.embeds).toBeUndefined();
  });

  it("adds the participant on toggle-on and reports it", async () => {
    await kv.put("session:guild-1:channel-1", JSON.stringify(makeSession()));

    const interaction = makeJoinPickInteraction();
    const res = await handleJoinButtonPick(interaction, env, ctx);
    const json = await res.json();

    expect(json.data.content).toContain("参加");
    const session = await kv.get("session:guild-1:channel-1", { type: "json" });
    expect(session.participants["user-1"]).toBeDefined();
  });

  it("removes the participant on toggle-off", async () => {
    const session = makeSession({
      participants: {
        "user-1": { userId: "user-1", displayName: "TestUser", joinedAt: new Date().toISOString() },
      },
    });
    await kv.put("session:guild-1:channel-1", JSON.stringify(session));

    const interaction = makeJoinPickInteraction();
    const res = await handleJoinButtonPick(interaction, env, ctx);
    const json = await res.json();

    expect(json.data.flags).toBe(64);
    const updated = await kv.get("session:guild-1:channel-1", { type: "json" });
    expect(updated.participants["user-1"]).toBeUndefined();
  });

  it("rejects bot accounts with ephemeral error", async () => {
    const interaction = makeJoinPickInteraction({
      member: { user: { id: "bot-1", bot: true, global_name: "BotUser", username: "botuser" } },
    });

    const res = await handleJoinButtonPick(interaction, env, ctx);
    const json = await res.json();

    expect(json.type).toBe(InteractionResponseType.ChannelMessageWithSource);
    expect(json.data.flags).toBe(64);
  });

  it("returns ephemeral error when no session exists", async () => {
    const interaction = makeJoinPickInteraction();
    const res = await handleJoinButtonPick(interaction, env, ctx);
    const json = await res.json();

    expect(json.type).toBe(InteractionResponseType.ChannelMessageWithSource);
    expect(json.data.flags).toBe(64);
  });
});
