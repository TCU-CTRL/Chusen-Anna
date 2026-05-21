/**
 * Integration flow test
 *
 * Tests the full Worker handler end-to-end with mocked Discord API (fetch)
 * and in-memory KV. Simulates actual Discord interaction requests.
 *
 * Scenario: signature verification → /anna_start → button click → /anna_pick → /anna_end
 *
 * Requirements: 10.1, 10.2, 11.3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  InteractionType,
  InteractionResponseType,
  ComponentType,
} from "discord-api-types/v10";

// ---------------------------------------------------------------------------
// Mock discord-interactions (must be before importing worker)
// ---------------------------------------------------------------------------
vi.mock("discord-interactions", () => ({
  verifyKey: vi.fn(),
}));

import worker from "../../src/index";
import { verifyKey } from "discord-interactions";

// ---------------------------------------------------------------------------
// KV mock
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
// ExecutionContext mock that captures and can drain waitUntil promises
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
const GUILD_ID = "guild-integration";
const CHANNEL_ID = "channel-integration";
const USER_ID = "user-integration";
const USER_DISPLAY = "IntegrationUser";
const INTERACTION_TOKEN = "integration-token";

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

/** Stub a successful Discord API response for any URL. */
function stubDiscordOk(mock: ReturnType<typeof vi.fn>, body: any = {}) {
  mock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status: 200 }),
  );
}

/** Stub a Discord 404 (e.g. user not in voice). */
function stubDiscord404(mock: ReturnType<typeof vi.fn>) {
  mock.mockResolvedValueOnce(new Response("Not Found", { status: 404 }));
}

// ---------------------------------------------------------------------------
// Integration tests
// ---------------------------------------------------------------------------

describe("Integration flow", () => {
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
  // 1. PING → PONG
  // -----------------------------------------------------------------------
  it("responds PONG (type 1) for a PING interaction", async () => {
    const ctx = createExecutionContext();
    const req = createPostRequest({ type: InteractionType.Ping });
    const res = await worker.fetch(req, env, ctx);

    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.type).toBe(InteractionResponseType.Pong);
  });

  // -----------------------------------------------------------------------
  // 2. /anna_start → type 5 deferred, then async followup
  // -----------------------------------------------------------------------
  it("/anna_start returns type 5 deferred and sends followup with embed+button", async () => {
    const ctx = createExecutionContext();

    // Discord API stubs: getVoiceState (user in VC) → createFollowup (ok)
    stubDiscordOk(fetchMock, { channel_id: "vc-1", user_id: USER_ID });
    stubDiscordOk(fetchMock);

    const req = createPostRequest({
      type: InteractionType.ApplicationCommand,
      data: { name: "anna_start" },
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

    // Drain the async work (waitUntil)
    await ctx.drain();

    // Verify Discord API calls
    const calls = fetchMock.mock.calls;
    // 1st call: getVoiceState
    expect(calls[0][0]).toBe(
      `${DISCORD_BASE}/guilds/${GUILD_ID}/voice-states/${USER_ID}`,
    );
    // 2nd call: createFollowup
    expect(calls[1][0]).toBe(
      `${DISCORD_BASE}/webhooks/test-app-id/${INTERACTION_TOKEN}`,
    );
    const followupBody = JSON.parse(calls[1][1]?.body as string);
    expect(followupBody.embeds).toBeDefined();
    expect(followupBody.components).toBeDefined();
    expect(followupBody.components[0].components[0].custom_id).toBe(
      "anna_join",
    );
  });

  // -----------------------------------------------------------------------
  // 3. Button click (anna_join) → type 7 UPDATE_MESSAGE
  // -----------------------------------------------------------------------
  it("anna_join button returns type 7 UPDATE_MESSAGE after joining", async () => {
    const ctx = createExecutionContext();

    // Pre-create a session via /anna_start flow
    // (use getVoiceState + createFollowup stubs)
    stubDiscordOk(fetchMock, { channel_id: "vc-1", user_id: USER_ID });
    stubDiscordOk(fetchMock);

    const startReq = createPostRequest({
      type: InteractionType.ApplicationCommand,
      data: { name: "anna_start" },
      guild_id: GUILD_ID,
      channel_id: CHANNEL_ID,
      token: INTERACTION_TOKEN,
      member: { user: { id: USER_ID } },
    });
    await worker.fetch(startReq, env, ctx);
    await ctx.drain();

    // Now simulate button click
    const btnCtx = createExecutionContext();
    const btnReq = createPostRequest({
      type: InteractionType.MessageComponent,
      data: { custom_id: "anna_join", component_type: ComponentType.Button },
      guild_id: GUILD_ID,
      channel_id: CHANNEL_ID,
      token: "btn-token",
      member: {
        user: {
          id: "joiner-1",
          username: "JoinerOne",
          global_name: "Joiner One",
          bot: false,
        },
      },
    });

    const res = await worker.fetch(btnReq, env, btnCtx);
    const json = (await res.json()) as any;

    expect(json.type).toBe(InteractionResponseType.UpdateMessage);
    expect(json.data.embeds).toBeDefined();
    expect(json.data.components).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // 4. /anna_pick → type 5 deferred, then followup with pick result
  // -----------------------------------------------------------------------
  it("/anna_pick returns type 5 deferred and sends pick result followup", async () => {
    const ctx = createExecutionContext();

    // Step 1: /anna_start to create session
    stubDiscordOk(fetchMock, { channel_id: "vc-1", user_id: USER_ID });
    stubDiscordOk(fetchMock);

    const startReq = createPostRequest({
      type: InteractionType.ApplicationCommand,
      data: { name: "anna_start" },
      guild_id: GUILD_ID,
      channel_id: CHANNEL_ID,
      token: INTERACTION_TOKEN,
      member: { user: { id: USER_ID } },
    });
    await worker.fetch(startReq, env, ctx);
    await ctx.drain();

    // Step 2: Add a participant via button click
    const btnCtx = createExecutionContext();
    const btnReq = createPostRequest({
      type: InteractionType.MessageComponent,
      data: { custom_id: "anna_join", component_type: ComponentType.Button },
      guild_id: GUILD_ID,
      channel_id: CHANNEL_ID,
      token: "btn-token",
      member: {
        user: {
          id: "participant-1",
          username: "Participant1",
          global_name: "Participant One",
          bot: false,
        },
      },
    });
    await worker.fetch(btnReq, env, btnCtx);

    // Step 3: /anna_pick
    const pickCtx = createExecutionContext();
    // Stub createFollowup for pick result
    stubDiscordOk(fetchMock);

    const pickReq = createPostRequest({
      type: InteractionType.ApplicationCommand,
      data: { name: "anna_pick", options: [{ name: "count", type: 4, value: 1 }] },
      guild_id: GUILD_ID,
      channel_id: CHANNEL_ID,
      token: "pick-token",
      member: { user: { id: USER_ID } },
    });

    const res = await worker.fetch(pickReq, env, pickCtx);
    const json = (await res.json()) as any;
    expect(json.type).toBe(
      InteractionResponseType.DeferredChannelMessageWithSource,
    );

    await pickCtx.drain();

    // Verify createFollowup was called with an embed (pick result)
    const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    expect(lastCall[0]).toBe(
      `${DISCORD_BASE}/webhooks/test-app-id/pick-token`,
    );
    const body = JSON.parse(lastCall[1]?.body as string);
    expect(body.embeds).toBeDefined();
    expect(body.embeds.length).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // 5. /anna_end → type 4 with summary embed
  // -----------------------------------------------------------------------
  it("/anna_end returns type 4 ChannelMessageWithSource with summary embed", async () => {
    const ctx = createExecutionContext();

    // Step 1: /anna_start to create session
    stubDiscordOk(fetchMock, { channel_id: "vc-1", user_id: USER_ID });
    stubDiscordOk(fetchMock);

    const startReq = createPostRequest({
      type: InteractionType.ApplicationCommand,
      data: { name: "anna_start" },
      guild_id: GUILD_ID,
      channel_id: CHANNEL_ID,
      token: INTERACTION_TOKEN,
      member: { user: { id: USER_ID } },
    });
    await worker.fetch(startReq, env, ctx);
    await ctx.drain();

    // Step 2: /anna_end
    const endCtx = createExecutionContext();
    const endReq = createPostRequest({
      type: InteractionType.ApplicationCommand,
      data: { name: "anna_end" },
      guild_id: GUILD_ID,
      channel_id: CHANNEL_ID,
      token: "end-token",
      member: { user: { id: USER_ID } },
    });

    const res = await worker.fetch(endReq, env, endCtx);
    const json = (await res.json()) as any;

    expect(json.type).toBe(InteractionResponseType.ChannelMessageWithSource);
    expect(json.data.embeds).toBeDefined();
    expect(json.data.embeds.length).toBeGreaterThan(0);

    // Session should be deleted
    const session = await (kv as any).get(
      `session:${GUILD_ID}:${CHANNEL_ID}`,
      { type: "json" },
    );
    expect(session).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 6. Invalid signature → 401
  // -----------------------------------------------------------------------
  it("returns 401 when signature verification fails", async () => {
    vi.mocked(verifyKey).mockResolvedValue(false);

    const ctx = createExecutionContext();
    const req = createPostRequest({ type: InteractionType.Ping });
    const res = await worker.fetch(req, env, ctx);

    expect(res.status).toBe(401);
  });

  // -----------------------------------------------------------------------
  // Full sequential flow
  // -----------------------------------------------------------------------
  it("full flow: start → join → pick → end", async () => {
    // --- /anna_start ---
    const startCtx = createExecutionContext();
    stubDiscordOk(fetchMock, { channel_id: "vc-1", user_id: USER_ID });
    stubDiscordOk(fetchMock); // followup

    const startReq = createPostRequest({
      type: InteractionType.ApplicationCommand,
      data: { name: "anna_start" },
      guild_id: GUILD_ID,
      channel_id: CHANNEL_ID,
      token: "start-token",
      member: { user: { id: USER_ID } },
    });
    const startRes = await worker.fetch(startReq, env, startCtx);
    expect(((await startRes.json()) as any).type).toBe(
      InteractionResponseType.DeferredChannelMessageWithSource,
    );
    await startCtx.drain();

    // --- Button join (2 users) ---
    for (const [uid, uname] of [
      ["user-a", "Alice"],
      ["user-b", "Bob"],
    ] as const) {
      const btnCtx = createExecutionContext();
      const btnReq = createPostRequest({
        type: InteractionType.MessageComponent,
        data: { custom_id: "anna_join", component_type: ComponentType.Button },
        guild_id: GUILD_ID,
        channel_id: CHANNEL_ID,
        token: `btn-token-${uid}`,
        member: {
          user: { id: uid, username: uname, global_name: uname, bot: false },
        },
      });
      const btnRes = await worker.fetch(btnReq, env, btnCtx);
      expect(((await btnRes.json()) as any).type).toBe(
        InteractionResponseType.UpdateMessage,
      );
    }

    // --- /anna_pick (count=1) ---
    const pickCtx = createExecutionContext();
    stubDiscordOk(fetchMock); // followup

    const pickReq = createPostRequest({
      type: InteractionType.ApplicationCommand,
      data: {
        name: "anna_pick",
        options: [{ name: "count", type: 4, value: 1 }],
      },
      guild_id: GUILD_ID,
      channel_id: CHANNEL_ID,
      token: "pick-token",
      member: { user: { id: USER_ID } },
    });
    const pickRes = await worker.fetch(pickReq, env, pickCtx);
    expect(((await pickRes.json()) as any).type).toBe(
      InteractionResponseType.DeferredChannelMessageWithSource,
    );
    await pickCtx.drain();

    // Verify pick result embed was sent
    const pickFollowup = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    const pickBody = JSON.parse(pickFollowup[1]?.body as string);
    expect(pickBody.embeds).toHaveLength(1);

    // --- /anna_end ---
    const endCtx = createExecutionContext();
    const endReq = createPostRequest({
      type: InteractionType.ApplicationCommand,
      data: { name: "anna_end" },
      guild_id: GUILD_ID,
      channel_id: CHANNEL_ID,
      token: "end-token",
      member: { user: { id: USER_ID } },
    });
    const endRes = await worker.fetch(endReq, env, endCtx);
    const endJson = (await endRes.json()) as any;

    expect(endJson.type).toBe(InteractionResponseType.ChannelMessageWithSource);
    expect(endJson.data.embeds).toHaveLength(1);

    // Session should be gone
    const session = await (kv as any).get(
      `session:${GUILD_ID}:${CHANNEL_ID}`,
      { type: "json" },
    );
    expect(session).toBeNull();
  });
});
