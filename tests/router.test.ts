import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  routeInteraction,
  registerCommand,
  registerComponent,
} from "../src/router";
import { InteractionType, InteractionResponseType } from "discord-api-types/v10";
import type { APIInteraction } from "discord-api-types/v10";
import type { Env } from "../src/config/env";

const mockEnv = {
  DISCORD_PUBLIC_KEY: "test-key",
  DISCORD_TOKEN: "test-token",
  DISCORD_APPLICATION_ID: "test-app-id",
  DISCORD_GUILD_ID: "test-guild-id",
  SESSIONS: {} as KVNamespace,
} as Env;

const mockCtx = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
} as unknown as ExecutionContext;

function makeCommandInteraction(name: string): APIInteraction {
  return {
    type: InteractionType.ApplicationCommand,
    data: { name },
  } as unknown as APIInteraction;
}

function makeComponentInteraction(customId: string): APIInteraction {
  return {
    type: InteractionType.MessageComponent,
    data: { custom_id: customId },
  } as unknown as APIInteraction;
}

describe("Interaction Router", () => {
  beforeEach(() => {
    // Clear any previously registered handlers by re-importing would be ideal,
    // but we can register over existing entries for these tests.
  });

  describe("APPLICATION_COMMAND routing", () => {
    it("routes to registered command handler", async () => {
      const handler = vi.fn().mockResolvedValue(
        new Response("ok"),
      );
      registerCommand("test-cmd", handler);

      const interaction = makeCommandInteraction("test-cmd");
      const res = await routeInteraction(interaction, mockEnv, mockCtx);

      expect(handler).toHaveBeenCalledWith(interaction, mockEnv, mockCtx);
      expect(await res.text()).toBe("ok");
    });

    it("returns ephemeral error for unknown command", async () => {
      const interaction = makeCommandInteraction("nonexistent-cmd");
      const res = await routeInteraction(interaction, mockEnv, mockCtx);
      const json = await res.json();

      expect(json).toEqual({
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
          content: "Unknown command: nonexistent-cmd",
          flags: 64,
        },
      });
    });
  });

  describe("MESSAGE_COMPONENT routing", () => {
    it("routes to registered component handler", async () => {
      const handler = vi.fn().mockResolvedValue(
        new Response("component-ok"),
      );
      registerComponent("test-btn", handler);

      const interaction = makeComponentInteraction("test-btn");
      const res = await routeInteraction(interaction, mockEnv, mockCtx);

      expect(handler).toHaveBeenCalledWith(interaction, mockEnv, mockCtx);
      expect(await res.text()).toBe("component-ok");
    });

    it("returns ephemeral error for unknown custom_id", async () => {
      const interaction = makeComponentInteraction("unknown-btn");
      const res = await routeInteraction(interaction, mockEnv, mockCtx);
      const json = await res.json();

      expect(json).toEqual({
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
          content: "Unknown component: unknown-btn",
          flags: 64,
        },
      });
    });
  });

  describe("unsupported interaction type", () => {
    it("returns ephemeral error for unsupported types", async () => {
      const interaction = {
        type: 99,
      } as unknown as APIInteraction;

      const res = await routeInteraction(interaction, mockEnv, mockCtx);
      const json = await res.json();

      expect(json).toEqual({
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
          content: "Unsupported interaction type",
          flags: 64,
        },
      });
    });
  });
});
