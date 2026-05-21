import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { handleAnnaStart } from "../src/commands/annaStart";
import { InteractionResponseType, InteractionType, ComponentType, ButtonStyle } from "discord-api-types/v10";
import type { APIInteraction } from "discord-api-types/v10";
import type { Env } from "../src/config/env";

// ---------------------------------------------------------------------------
// KV mock (same pattern as sessionManager.test.ts)
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

const DISCORD_BASE = "https://discord.com/api/v10";

function makeAnnaStartInteraction(overrides: Record<string, any> = {}): APIInteraction {
  return {
    type: InteractionType.ApplicationCommand,
    data: { name: "anna_start" },
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

describe("handleAnnaStart", () => {
  const originalFetch = globalThis.fetch;
  let kv: ReturnType<typeof createKVMock>;
  let env: Env;
  let ctx: ExecutionContext;
  let waitUntilPromises: Promise<void>[];

  beforeEach(() => {
    kv = createKVMock();
    env = makeEnv(kv);
    waitUntilPromises = [];
    ctx = {
      waitUntil: vi.fn((p: Promise<void>) => { waitUntilPromises.push(p); }),
      passThroughOnException: vi.fn(),
    } as unknown as ExecutionContext;
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // Helper to drain all waitUntil promises
  async function drainWaitUntil(): Promise<void> {
    await Promise.all(waitUntilPromises);
  }

  it("returns a deferred response (type 5) immediately", async () => {
    // Mock voice state check to return user in VC
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ channel_id: "vc-1", user_id: "user-1" }), { status: 200 }),
    );

    const interaction = makeAnnaStartInteraction();
    const res = await handleAnnaStart(interaction, env, ctx);
    const json = await res.json();

    expect(json).toEqual({
      type: InteractionResponseType.DeferredChannelMessageWithSource,
    });
    expect(ctx.waitUntil).toHaveBeenCalledOnce();

    await drainWaitUntil();
  });

  it("sends ephemeral error followup when user is not in VC (404 voice state)", async () => {
    // Mock voice state check to return 404 (not in VC)
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response("Not Found", { status: 404 }),
    );
    // Mock createFollowup call
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 }),
    );

    const interaction = makeAnnaStartInteraction();
    await handleAnnaStart(interaction, env, ctx);
    await drainWaitUntil();

    // Second fetch call should be the followup with ephemeral error
    const calls = vi.mocked(globalThis.fetch).mock.calls;
    expect(calls).toHaveLength(2);

    const [followupUrl, followupInit] = calls[1];
    expect(followupUrl).toBe(
      `${DISCORD_BASE}/webhooks/test-app-id/interaction-token-123`,
    );
    expect(followupInit?.method).toBe("POST");

    const followupBody = JSON.parse(followupInit?.body as string);
    expect(followupBody.flags).toBe(64); // EPHEMERAL
    expect(followupBody.content).toBeTruthy();
  });

  it("creates a session and sends embed with anna_join button when user is in VC", async () => {
    // Mock voice state check - user is in VC
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ channel_id: "vc-1", user_id: "user-1" }), { status: 200 }),
    );
    // Mock createFollowup call
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 }),
    );

    const interaction = makeAnnaStartInteraction();
    await handleAnnaStart(interaction, env, ctx);
    await drainWaitUntil();

    // Verify session was created in KV
    const session = await kv.get("session:guild-1:channel-1", { type: "json" });
    expect(session).not.toBeNull();
    expect(session.guildId).toBe("guild-1");
    expect(session.channelId).toBe("channel-1");
    expect(session.creatorId).toBe("user-1");

    // Verify followup was sent with embed and button
    const calls = vi.mocked(globalThis.fetch).mock.calls;
    expect(calls).toHaveLength(2);

    const [, followupInit] = calls[1];
    const followupBody = JSON.parse(followupInit?.body as string);

    // Should have embeds
    expect(followupBody.embeds).toBeDefined();
    expect(followupBody.embeds).toHaveLength(1);

    // Should have components with anna_join button
    expect(followupBody.components).toBeDefined();
    expect(followupBody.components).toHaveLength(1);
    const actionRow = followupBody.components[0];
    expect(actionRow.type).toBe(ComponentType.ActionRow);
    expect(actionRow.components[0].custom_id).toBe("anna_join");
    expect(actionRow.components[0].type).toBe(ComponentType.Button);
    expect(actionRow.components[0].style).toBe(ButtonStyle.Primary);
  });

  it("deletes existing session before creating a new one in the same channel", async () => {
    // Pre-populate an existing session
    const existingSession = {
      guildId: "guild-1",
      channelId: "channel-1",
      creatorId: "old-user",
      createdAt: new Date().toISOString(),
      participants: { "old-user": { userId: "old-user", displayName: "OldUser", joinedAt: new Date().toISOString() } },
      pickedUserIds: [],
      messageId: "",
    };
    await kv.put("session:guild-1:channel-1", JSON.stringify(existingSession));

    // Mock voice state check - user is in VC
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ channel_id: "vc-1", user_id: "user-1" }), { status: 200 }),
    );
    // Mock createFollowup call
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 }),
    );

    const interaction = makeAnnaStartInteraction();
    await handleAnnaStart(interaction, env, ctx);
    await drainWaitUntil();

    // Verify session was replaced (new creator, no participants)
    const session = await kv.get("session:guild-1:channel-1", { type: "json" });
    expect(session).not.toBeNull();
    expect(session.creatorId).toBe("user-1");
    expect(session.participants).toEqual({});
  });

  it("calls getVoiceState with correct guild_id and user_id", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ channel_id: "vc-1" }), { status: 200 }),
    );
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 }),
    );

    const interaction = makeAnnaStartInteraction({
      guild_id: "my-guild",
      member: { user: { id: "my-user" } },
    });
    await handleAnnaStart(interaction, env, ctx);
    await drainWaitUntil();

    const [voiceUrl] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(voiceUrl).toBe(
      `${DISCORD_BASE}/guilds/my-guild/voice-states/my-user`,
    );
  });
});
