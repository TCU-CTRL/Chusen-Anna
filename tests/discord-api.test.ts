import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getVoiceState, editOriginalResponse, createFollowup } from "../src/discord/api";

const DISCORD_BASE = "https://discord.com/api/v10";
const BOT_TOKEN = "test-bot-token";

describe("Discord REST API client", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("getVoiceState", () => {
    it("calls GET /guilds/{guildId}/voice-states/{userId} with correct auth header", async () => {
      const mockResponse = {
        channel_id: "ch-123",
        user_id: "user-1",
        session_id: "sess-1",
        deaf: false,
        mute: false,
        self_deaf: false,
        self_mute: false,
        self_video: false,
        suppress: false,
        request_to_speak_timestamp: null,
      };
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 200 }),
      );

      const result = await getVoiceState(BOT_TOKEN, "guild-1", "user-1");

      expect(globalThis.fetch).toHaveBeenCalledWith(
        `${DISCORD_BASE}/guilds/guild-1/voice-states/user-1`,
        {
          headers: {
            Authorization: `Bot ${BOT_TOKEN}`,
          },
        },
      );
      expect(result).toEqual(mockResponse);
    });

    it("returns null when the API responds with 404", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response("Not Found", { status: 404 }),
      );

      const result = await getVoiceState(BOT_TOKEN, "guild-1", "unknown-user");
      expect(result).toBeNull();
    });

    it("throws on non-404 error responses", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response("Internal Server Error", { status: 500 }),
      );

      await expect(
        getVoiceState(BOT_TOKEN, "guild-1", "user-1"),
      ).rejects.toThrow();
    });
  });

  describe("editOriginalResponse", () => {
    it("calls PATCH /webhooks/{appId}/{token}/messages/@original with JSON body", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify({}), { status: 200 }),
      );

      const body = { content: "Updated message" };
      await editOriginalResponse(BOT_TOKEN, "app-1", "token-abc", body);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        `${DISCORD_BASE}/webhooks/app-1/token-abc/messages/@original`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bot ${BOT_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
      );
    });

    it("throws on error responses", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response("Bad Request", { status: 400 }),
      );

      await expect(
        editOriginalResponse(BOT_TOKEN, "app-1", "token-abc", {
          content: "test",
        }),
      ).rejects.toThrow();
    });
  });

  describe("createFollowup", () => {
    it("calls POST /webhooks/{appId}/{token} with JSON body", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify({}), { status: 200 }),
      );

      const body = { content: "Follow-up message" };
      await createFollowup(BOT_TOKEN, "app-1", "token-abc", body);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        `${DISCORD_BASE}/webhooks/app-1/token-abc`,
        {
          method: "POST",
          headers: {
            Authorization: `Bot ${BOT_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
      );
    });

    it("throws on error responses", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response("Forbidden", { status: 403 }),
      );

      await expect(
        createFollowup(BOT_TOKEN, "app-1", "token-abc", { content: "test" }),
      ).rejects.toThrow();
    });
  });
});
