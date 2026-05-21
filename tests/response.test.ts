import { describe, it, expect } from "vitest";
import {
  createJsonResponse,
  createDeferredResponse,
  createEphemeralErrorResponse,
} from "../src/utils/response";
import { InteractionResponseType } from "discord-api-types/v10";

describe("Response utilities", () => {
  describe("createJsonResponse", () => {
    it("returns a Response with JSON content-type and status 200 by default", async () => {
      const body = { type: InteractionResponseType.Pong };
      const res = createJsonResponse(body);

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("application/json");
      expect(await res.json()).toEqual(body);
    });

    it("accepts a custom status code", () => {
      const res = createJsonResponse(
        { type: InteractionResponseType.Pong },
        201,
      );
      expect(res.status).toBe(201);
    });
  });

  describe("createDeferredResponse", () => {
    it("returns a type 5 DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE response", async () => {
      const res = createDeferredResponse();
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toEqual({
        type: InteractionResponseType.DeferredChannelMessageWithSource,
      });
    });
  });

  describe("createEphemeralErrorResponse", () => {
    it("returns a type 4 response with ephemeral flag (64)", async () => {
      const res = createEphemeralErrorResponse("Something went wrong");
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toEqual({
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
          content: "Something went wrong",
          flags: 64,
        },
      });
    });
  });
});
