/**
 * Integration error-case tests
 *
 * Tests all error scenarios for /tyusen_start, /tyusen_pick, and /tyusen_end.
 * Uses the same Worker handler end-to-end approach as flow.test.ts.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 * Depends: 4.1, 4.2, 4.3, 4.4, 4.5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { InteractionType, InteractionResponseType } from "discord-api-types/v10";
import {
  errorNotInVoiceChannel,
  errorNoSession,
  errorAllPicked,
  errorCountTooLarge,
  errorNoSessionEnd,
} from "../../src/messages/annaMessages";

// ---------------------------------------------------------------------------
// Mock discord-interactions (must be before importing worker)
// ---------------------------------------------------------------------------
vi.mock("discord-interactions", () => ({
  verifyKey: vi.fn(),
}));

import worker from "../../src/index";
import { verifyKey } from "discord-interactions";

// ---------------------------------------------------------------------------
// KV mock (same as flow.test.ts)
// ---------------------------------------------------------------------------

function createKVMock(): KVNamespace {
  const store = new Map<string, string>();
  return {
    async get(key: string, options?: any): Promise<any> {
      const val = store.get(key);
      if (val === undefined) return null;
      if (typeof options === "string" && options === "json")
        return JSON.parse(val);
      if (typeof options === "object" && options?.type === "json")
        return JSON.parse(val);
      return val;
    },
    async put(key: string, value: string, _options?: any): Promise<void> {
      store.set(key, value);
    },
    async delete(key: string): Promise<void> {
      store.delete(key);
    },
    async list(): Promise<any> {
      return { keys: [], list_complete: true, cacheStatus: null };
    },
    async getWithMetadata(): Promise<any> {
      return { value: null, metadata: null, cacheStatus: null };
    },
  } as any;
}

// ---------------------------------------------------------------------------
// ExecutionContext mock
// ---------------------------------------------------------------------------

function createExecutionContext(): ExecutionContext & {
  drain: () => Promise<void>;
} {
  const promises: Promise<any>[] = [];
  return {
    waitUntil: vi.fn((p: Promise<any>) => {
      promises.push(p);
    }),
    passThroughOnException: vi.fn(),
    drain: () => Promise.all(promises).then(() => {}),
  } as any;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DISCORD_BASE = "https://discord.com/api/v10";
const GUILD_ID = "guild-err";
const CHANNEL_ID = "channel-err";
const USER_ID = "user-err";
const INTERACTION_TOKEN = "err-token";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEnv(kv: KVNamespace) {
  return {
    DISCORD_PUBLIC_KEY: "test-public-key",
    DISCORD_TOKEN: "test-bot-token",
    DISCORD_APPLICATION_ID: "test-app-id",
    DISCORD_GUILD_ID: GUILD_ID,
    SESSIONS: kv,
  };
}

function createPostRequest(body: object): Request {
  return new Request("https://bot.example.com/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Signature-Ed25519": "valid-sig",
      "X-Signature-Timestamp": "12345",
    },
    body: JSON.stringify(body),
  });
}

function stubDiscordOk(mock: ReturnType<typeof vi.fn>, body: any = {}) {
  mock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status: 200 }),
  );
}

function stubDiscord404(mock: ReturnType<typeof vi.fn>) {
  mock.mockResolvedValueOnce(new Response("Not Found", { status: 404 }));
}

/** Helper to extract the followup body from the last fetch call */
function getLastFollowupBody(
  fetchMock: ReturnType<typeof vi.fn>,
): Record<string, any> {
  const calls = fetchMock.mock.calls;
  const lastCall = calls[calls.length - 1];
  return JSON.parse(lastCall[1]?.body as string);
}

/** Helper to seed a session directly in KV */
async function seedSession(
  kv: KVNamespace,
  participants: Record<string, { userId: string; displayName: string; joinedAt: string }>,
  pickedUserIds: string[] = [],
): Promise<void> {
  const session = {
    guildId: GUILD_ID,
    channelId: CHANNEL_ID,
    creatorId: USER_ID,
    createdAt: new Date().toISOString(),
    participants,
    pickedUserIds,
    messageId: "",
  };
  await kv.put(
    `session:${GUILD_ID}:${CHANNEL_ID}`,
    JSON.stringify(session),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Error cases", () => {
  const originalFetch = globalThis.fetch;
  let kv: KVNamespace;
  let env: ReturnType<typeof makeEnv>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    kv = createKVMock();
    env = makeEnv(kv);
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
    vi.mocked(verifyKey).mockResolvedValue(true);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // -----------------------------------------------------------------------
  // /tyusen_start: VC 未参加 → ephemeral VC参加案内
  // -----------------------------------------------------------------------
  it("/tyusen_start with user not in VC sends ephemeral VC error via followup", async () => {
    const ctx = createExecutionContext();

    // getVoiceState returns 404 (user not in VC)
    stubDiscord404(fetchMock);
    // createFollowup succeeds
    stubDiscordOk(fetchMock);

    const req = createPostRequest({
      type: InteractionType.ApplicationCommand,
      data: { name: "tyusen_start" },
      guild_id: GUILD_ID,
      channel_id: CHANNEL_ID,
      token: INTERACTION_TOKEN,
      member: { user: { id: USER_ID } },
    });

    const res = await worker.fetch(req, env, ctx);
    const json = (await res.json()) as any;

    // Initial response is type 5 (deferred)
    expect(json.type).toBe(
      InteractionResponseType.DeferredChannelMessageWithSource,
    );

    await ctx.drain();

    // Verify followup was sent with ephemeral VC error
    const followupBody = getLastFollowupBody(fetchMock);
    expect(followupBody.content).toBe(errorNotInVoiceChannel());
    expect(followupBody.flags).toBe(64);
  });

  // -----------------------------------------------------------------------
  // /tyusen_pick: セッションなし → ephemeral /tyusen_start 案内
  // -----------------------------------------------------------------------
  it("/tyusen_pick with no session sends ephemeral no-session error via followup", async () => {
    const ctx = createExecutionContext();

    // No session in KV — createFollowup succeeds
    stubDiscordOk(fetchMock);

    const req = createPostRequest({
      type: InteractionType.ApplicationCommand,
      data: { name: "tyusen_pick", options: [{ name: "count", type: 4, value: 1 }] },
      guild_id: GUILD_ID,
      channel_id: CHANNEL_ID,
      token: INTERACTION_TOKEN,
      member: { user: { id: USER_ID } },
    });

    const res = await worker.fetch(req, env, ctx);
    const json = (await res.json()) as any;
    expect(json.type).toBe(
      InteractionResponseType.DeferredChannelMessageWithSource,
    );

    await ctx.drain();

    const followupBody = getLastFollowupBody(fetchMock);
    expect(followupBody.content).toBe(errorNoSession());
    expect(followupBody.flags).toBe(64);
  });

  // -----------------------------------------------------------------------
  // /tyusen_pick: 参加者0人 → ephemeral 全員選出済みメッセージ
  // (Code path: empty participants → unpicked.length === 0 → errorAllPicked)
  // -----------------------------------------------------------------------
  it("/tyusen_pick with 0 participants sends ephemeral all-picked error via followup", async () => {
    const ctx = createExecutionContext();

    // Seed session with empty participants
    await seedSession(kv, {});

    // createFollowup succeeds
    stubDiscordOk(fetchMock);

    const req = createPostRequest({
      type: InteractionType.ApplicationCommand,
      data: { name: "tyusen_pick", options: [{ name: "count", type: 4, value: 1 }] },
      guild_id: GUILD_ID,
      channel_id: CHANNEL_ID,
      token: INTERACTION_TOKEN,
      member: { user: { id: USER_ID } },
    });

    const res = await worker.fetch(req, env, ctx);
    const json = (await res.json()) as any;
    expect(json.type).toBe(
      InteractionResponseType.DeferredChannelMessageWithSource,
    );

    await ctx.drain();

    const followupBody = getLastFollowupBody(fetchMock);
    expect(followupBody.content).toBe(errorAllPicked());
    expect(followupBody.flags).toBe(64);
  });

  // -----------------------------------------------------------------------
  // /tyusen_pick: count > 未選出者数 → ephemeral 可能人数表示
  // -----------------------------------------------------------------------
  it("/tyusen_pick with count > available sends ephemeral count-too-large error via followup", async () => {
    const ctx = createExecutionContext();

    // Seed session with 2 participants
    await seedSession(kv, {
      "p1": { userId: "p1", displayName: "Player1", joinedAt: new Date().toISOString() },
      "p2": { userId: "p2", displayName: "Player2", joinedAt: new Date().toISOString() },
    });

    // createFollowup succeeds
    stubDiscordOk(fetchMock);

    const req = createPostRequest({
      type: InteractionType.ApplicationCommand,
      data: { name: "tyusen_pick", options: [{ name: "count", type: 4, value: 5 }] },
      guild_id: GUILD_ID,
      channel_id: CHANNEL_ID,
      token: INTERACTION_TOKEN,
      member: { user: { id: USER_ID } },
    });

    const res = await worker.fetch(req, env, ctx);
    const json = (await res.json()) as any;
    expect(json.type).toBe(
      InteractionResponseType.DeferredChannelMessageWithSource,
    );

    await ctx.drain();

    const followupBody = getLastFollowupBody(fetchMock);
    expect(followupBody.content).toBe(errorCountTooLarge(2));
    expect(followupBody.flags).toBe(64);
  });

  // -----------------------------------------------------------------------
  // /tyusen_pick: 全員選出済み → ephemeral 全員選出済み通知
  // -----------------------------------------------------------------------
  it("/tyusen_pick with all participants already picked sends ephemeral all-picked error via followup", async () => {
    const ctx = createExecutionContext();

    // Seed session with 2 participants, both already picked
    await seedSession(
      kv,
      {
        "p1": { userId: "p1", displayName: "Player1", joinedAt: new Date().toISOString() },
        "p2": { userId: "p2", displayName: "Player2", joinedAt: new Date().toISOString() },
      },
      ["p1", "p2"],
    );

    // createFollowup succeeds
    stubDiscordOk(fetchMock);

    const req = createPostRequest({
      type: InteractionType.ApplicationCommand,
      data: { name: "tyusen_pick", options: [{ name: "count", type: 4, value: 1 }] },
      guild_id: GUILD_ID,
      channel_id: CHANNEL_ID,
      token: INTERACTION_TOKEN,
      member: { user: { id: USER_ID } },
    });

    const res = await worker.fetch(req, env, ctx);
    const json = (await res.json()) as any;
    expect(json.type).toBe(
      InteractionResponseType.DeferredChannelMessageWithSource,
    );

    await ctx.drain();

    const followupBody = getLastFollowupBody(fetchMock);
    expect(followupBody.content).toBe(errorAllPicked());
    expect(followupBody.flags).toBe(64);
  });

  // -----------------------------------------------------------------------
  // /tyusen_end: セッション不在 → ephemeral セッション不在メッセージ
  // -----------------------------------------------------------------------
  it("/tyusen_end with no session returns ephemeral no-session error", async () => {
    const ctx = createExecutionContext();

    // No session in KV
    const req = createPostRequest({
      type: InteractionType.ApplicationCommand,
      data: { name: "tyusen_end" },
      guild_id: GUILD_ID,
      channel_id: CHANNEL_ID,
      token: INTERACTION_TOKEN,
      member: { user: { id: USER_ID } },
    });

    const res = await worker.fetch(req, env, ctx);
    const json = (await res.json()) as any;

    // /tyusen_end returns type 4 directly (not deferred)
    expect(json.type).toBe(InteractionResponseType.ChannelMessageWithSource);
    expect(json.data.content).toBe(errorNoSessionEnd());
    expect(json.data.flags).toBe(64);
  });

  // -----------------------------------------------------------------------
  // KV 障害シミュレーション → エラー伝播
  // /tyusen_end は同期ハンドラのため、KV.get が throw すると
  // ハンドラ自体が throw し、Worker ランタイムがエラーを返す。
  // -----------------------------------------------------------------------
  it("/tyusen_end with KV failure propagates as unhandled error", async () => {
    const ctx = createExecutionContext();

    // Create a KV mock that throws on get
    const brokenKv = {
      ...createKVMock(),
      get: vi.fn().mockRejectedValue(new Error("KV service unavailable")),
    } as any;
    const brokenEnv = makeEnv(brokenKv);

    const req = createPostRequest({
      type: InteractionType.ApplicationCommand,
      data: { name: "tyusen_end" },
      guild_id: GUILD_ID,
      channel_id: CHANNEL_ID,
      token: INTERACTION_TOKEN,
      member: { user: { id: USER_ID } },
    });

    // The handler throws because there's no try/catch around getSession
    await expect(worker.fetch(req, brokenEnv, ctx)).rejects.toThrow(
      "KV service unavailable",
    );
  });
});
