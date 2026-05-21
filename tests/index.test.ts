import { describe, it, expect, vi, beforeEach } from "vitest";
import { InteractionType, InteractionResponseType } from "discord-api-types/v10";
import type { Env } from "../src/config/env";

// Mock discord-interactions before importing the module under test
vi.mock("discord-interactions", () => ({
  verifyKey: vi.fn(),
}));

// Mock router to isolate index.ts tests
vi.mock("../src/router", () => ({
  routeInteraction: vi.fn(),
  registerCommand: vi.fn(),
  registerComponent: vi.fn(),
}));

import worker from "../src/index";
import { verifyKey } from "discord-interactions";
import { routeInteraction } from "../src/router";

const mockEnv = {
  DISCORD_PUBLIC_KEY: "test-public-key",
  DISCORD_TOKEN: "test-token",
  DISCORD_APPLICATION_ID: "test-app-id",
  DISCORD_GUILD_ID: "test-guild-id",
  SESSIONS: {} as KVNamespace,
} as Env;

const mockCtx = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
} as unknown as ExecutionContext;

function createPostRequest(body: object): Request {
  const bodyStr = JSON.stringify(body);
  return new Request("https://example.com/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Signature-Ed25519": "test-signature",
      "X-Signature-Timestamp": "test-timestamp",
    },
    body: bodyStr,
  });
}

describe("Worker entry point (src/index.ts)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("signature verification", () => {
    it("returns 401 when signature headers are missing", async () => {
      const request = new Request("https://example.com/", {
        method: "POST",
        body: "{}",
      });

      const res = await worker.fetch(request, mockEnv, mockCtx);
      expect(res.status).toBe(401);
    });

    it("returns 401 when verifyKey returns false", async () => {
      vi.mocked(verifyKey).mockResolvedValue(false);

      const request = createPostRequest({ type: InteractionType.Ping });
      const res = await worker.fetch(request, mockEnv, mockCtx);

      expect(res.status).toBe(401);
      expect(verifyKey).toHaveBeenCalledWith(
        expect.any(String),
        "test-signature",
        "test-timestamp",
        "test-public-key",
      );
    });

    it("calls verifyKey with the raw body, signature, timestamp, and public key", async () => {
      vi.mocked(verifyKey).mockResolvedValue(true);

      const body = { type: InteractionType.Ping };
      const request = createPostRequest(body);
      await worker.fetch(request, mockEnv, mockCtx);

      expect(verifyKey).toHaveBeenCalledWith(
        JSON.stringify(body),
        "test-signature",
        "test-timestamp",
        "test-public-key",
      );
    });
  });

  describe("PING handling", () => {
    it("responds with PONG (type 1) for PING interaction", async () => {
      vi.mocked(verifyKey).mockResolvedValue(true);

      const request = createPostRequest({ type: InteractionType.Ping });
      const res = await worker.fetch(request, mockEnv, mockCtx);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({ type: InteractionResponseType.Pong });
    });
  });

  describe("routing delegation", () => {
    it("delegates non-PING interactions to routeInteraction", async () => {
      vi.mocked(verifyKey).mockResolvedValue(true);
      vi.mocked(routeInteraction).mockResolvedValue(
        new Response("routed"),
      );

      const body = {
        type: InteractionType.ApplicationCommand,
        data: { name: "test" },
      };
      const request = createPostRequest(body);
      const res = await worker.fetch(request, mockEnv, mockCtx);

      expect(routeInteraction).toHaveBeenCalledWith(
        body,
        mockEnv,
        mockCtx,
      );
      expect(await res.text()).toBe("routed");
    });
  });

  describe("HTTP method validation", () => {
    it("returns 405 for non-POST requests", async () => {
      const request = new Request("https://example.com/", {
        method: "GET",
      });

      const res = await worker.fetch(request, mockEnv, mockCtx);
      expect(res.status).toBe(405);
    });
  });
});
