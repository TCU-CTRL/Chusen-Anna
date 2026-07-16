import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { handleAnnaPick } from "../src/commands/annaPick";
import { InteractionResponseType, InteractionType, ApplicationCommandOptionType } from "discord-api-types/v10";
import type { APIInteraction } from "discord-api-types/v10";
import type { Env } from "../src/config/env";
import type { Session } from "../src/session/types";

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

const DISCORD_BASE = "https://discord.com/api/v10";

function makeAnnaPickInteraction(
  options: Array<{ name: string; type: number; value: any }> = [],
  overrides: Record<string, any> = {},
): APIInteraction {
  return {
    type: InteractionType.ApplicationCommand,
    data: { name: "tyusen_pick", options },
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

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    guildId: "guild-1",
    channelId: "channel-1",
    creatorId: "creator-1",
    createdAt: new Date().toISOString(),
    participants: {
      "user-a": { userId: "user-a", displayName: "UserA", joinedAt: new Date().toISOString() },
      "user-b": { userId: "user-b", displayName: "UserB", joinedAt: new Date().toISOString() },
      "user-c": { userId: "user-c", displayName: "UserC", joinedAt: new Date().toISOString() },
    },
    pickedUserIds: [],
    messageId: "",
    ...overrides,
  };
}

describe("handleAnnaPick", () => {
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

  async function drainWaitUntil(): Promise<void> {
    await Promise.all(waitUntilPromises);
  }

  it("returns a deferred response (type 5) immediately", async () => {
    const session = makeSession();
    await kv.put("session:guild-1:channel-1", JSON.stringify(session));
    // Mock createFollowup
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 }),
    );

    const interaction = makeAnnaPickInteraction();
    const res = await handleAnnaPick(interaction, env, ctx);
    const json = await res.json();

    expect(json).toEqual({
      type: InteractionResponseType.DeferredChannelMessageWithSource,
    });
    expect(ctx.waitUntil).toHaveBeenCalledOnce();

    await drainWaitUntil();
  });

  it("sends ephemeral error when no session exists", async () => {
    // Mock createFollowup
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 }),
    );

    const interaction = makeAnnaPickInteraction();
    await handleAnnaPick(interaction, env, ctx);
    await drainWaitUntil();

    const calls = vi.mocked(globalThis.fetch).mock.calls;
    expect(calls).toHaveLength(1);

    const [followupUrl, followupInit] = calls[0];
    expect(followupUrl).toBe(
      `${DISCORD_BASE}/webhooks/test-app-id/interaction-token-123`,
    );
    const body = JSON.parse(followupInit?.body as string);
    expect(body.flags).toBe(64);
    expect(body.content).toContain("/tyusen_start");
  });

  it("sends ephemeral error when all participants are already picked", async () => {
    const session = makeSession({
      pickedUserIds: ["user-a", "user-b", "user-c"],
    });
    await kv.put("session:guild-1:channel-1", JSON.stringify(session));

    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 }),
    );

    const interaction = makeAnnaPickInteraction();
    await handleAnnaPick(interaction, env, ctx);
    await drainWaitUntil();

    const calls = vi.mocked(globalThis.fetch).mock.calls;
    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0][1]?.body as string);
    expect(body.flags).toBe(64);
    expect(body.content).toContain("全員");
  });

  it("sends ephemeral error when count > unpicked participants", async () => {
    const session = makeSession({
      pickedUserIds: ["user-a"],
    });
    await kv.put("session:guild-1:channel-1", JSON.stringify(session));

    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 }),
    );

    const interaction = makeAnnaPickInteraction([
      { name: "count", type: ApplicationCommandOptionType.Integer, value: 5 },
    ]);
    await handleAnnaPick(interaction, env, ctx);
    await drainWaitUntil();

    const calls = vi.mocked(globalThis.fetch).mock.calls;
    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0][1]?.body as string);
    expect(body.flags).toBe(64);
    expect(body.content).toContain("2");
  });

  it("picks 1 participant by default and sends embed", async () => {
    const session = makeSession();
    await kv.put("session:guild-1:channel-1", JSON.stringify(session));

    // Mock createFollowup
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 }),
    );

    const interaction = makeAnnaPickInteraction();
    await handleAnnaPick(interaction, env, ctx);
    await drainWaitUntil();

    const calls = vi.mocked(globalThis.fetch).mock.calls;
    expect(calls).toHaveLength(1);

    const body = JSON.parse(calls[0][1]?.body as string);
    // Should NOT be ephemeral
    expect(body.flags).toBeUndefined();
    // Should have embeds
    expect(body.embeds).toBeDefined();
    expect(body.embeds).toHaveLength(1);
    expect(body.embeds[0].title).toContain("結果発表");
    // Should re-attach join (pick variant) + early-present buttons so they don't get buried
    expect(body.components).toBeDefined();
    expect(body.components[0].components[0].custom_id).toBe("tyusen_join_pick");
    expect(body.components[0].components[1].custom_id).toBe("tyusen_present_early");

    // Verify session was updated with picked user
    const updated = await kv.get("session:guild-1:channel-1", { type: "json" }) as Session;
    expect(updated.pickedUserIds).toHaveLength(1);
    expect(["user-a", "user-b", "user-c"]).toContain(updated.pickedUserIds[0]);
  });

  it("picks multiple participants when count option is provided", async () => {
    const session = makeSession();
    await kv.put("session:guild-1:channel-1", JSON.stringify(session));

    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 }),
    );

    const interaction = makeAnnaPickInteraction([
      { name: "count", type: ApplicationCommandOptionType.Integer, value: 2 },
    ]);
    await handleAnnaPick(interaction, env, ctx);
    await drainWaitUntil();

    const calls = vi.mocked(globalThis.fetch).mock.calls;
    const body = JSON.parse(calls[0][1]?.body as string);
    expect(body.embeds).toBeDefined();
    expect(body.embeds[0].title).toContain("結果発表");

    // Verify 2 users were picked
    const updated = await kv.get("session:guild-1:channel-1", { type: "json" }) as Session;
    expect(updated.pickedUserIds).toHaveLength(2);
  });

  it("only picks from unpicked participants", async () => {
    const session = makeSession({
      pickedUserIds: ["user-a", "user-b"],
    });
    await kv.put("session:guild-1:channel-1", JSON.stringify(session));

    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 }),
    );

    const interaction = makeAnnaPickInteraction();
    await handleAnnaPick(interaction, env, ctx);
    await drainWaitUntil();

    const updated = await kv.get("session:guild-1:channel-1", { type: "json" }) as Session;
    // user-a and user-b were already picked, so only user-c can be picked
    expect(updated.pickedUserIds).toHaveLength(3);
    expect(updated.pickedUserIds[2]).toBe("user-c");
  });

  it("sends ephemeral error when session has no participants", async () => {
    const session = makeSession({ participants: {} });
    await kv.put("session:guild-1:channel-1", JSON.stringify(session));

    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 }),
    );

    const interaction = makeAnnaPickInteraction();
    await handleAnnaPick(interaction, env, ctx);
    await drainWaitUntil();

    const calls = vi.mocked(globalThis.fetch).mock.calls;
    const body = JSON.parse(calls[0][1]?.body as string);
    expect(body.flags).toBe(64);
    expect(body.content).toContain("全員");
  });
});
