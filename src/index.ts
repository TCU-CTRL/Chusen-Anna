import { verifyKey } from "discord-interactions";
import { InteractionType, InteractionResponseType } from "discord-api-types/v10";
import type { APIInteraction } from "discord-api-types/v10";
import type { Env } from "./config/env";
import { registerCommand, registerComponent, routeInteraction } from "./router";
import { createJsonResponse } from "./utils/response";
import { handleAnnaStart } from "./commands/annaStart";
import { handleAnnaPick } from "./commands/annaPick";
import { handleAnnaEnd } from "./commands/annaEnd";
import { handleJoinButton, handleJoinButtonPick } from "./components/joinButton";
import { handleEarlyPresent } from "./components/earlyPresentButton";
import {
  JOIN_CUSTOM_ID,
  JOIN_PICK_CUSTOM_ID,
  PRESENT_EARLY_CUSTOM_ID,
} from "./components/joinButtonRow";

// Register command handlers
registerCommand("tyusen_start", handleAnnaStart);
registerCommand("tyusen_pick", handleAnnaPick);
registerCommand("tyusen_end", handleAnnaEnd);

// Register component handlers
registerComponent(JOIN_CUSTOM_ID, handleJoinButton);
registerComponent(JOIN_PICK_CUSTOM_ID, handleJoinButtonPick);
registerComponent(PRESENT_EARLY_CUSTOM_ID, handleEarlyPresent);

export type { Env };

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    // Only accept POST requests
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    // Read the raw body and signature headers
    const body = await request.text();
    const signature = request.headers.get("X-Signature-Ed25519");
    const timestamp = request.headers.get("X-Signature-Timestamp");

    if (!signature || !timestamp) {
      return new Response("Bad Request", { status: 401 });
    }

    // Verify Ed25519 signature using discord-interactions
    const isValid = await verifyKey(
      body,
      signature,
      timestamp,
      env.DISCORD_PUBLIC_KEY,
    );

    if (!isValid) {
      return new Response("Invalid request signature", { status: 401 });
    }

    // Parse the interaction
    const interaction: APIInteraction = JSON.parse(body);

    // Handle PING (type 1) with PONG
    if (interaction.type === InteractionType.Ping) {
      return createJsonResponse({
        type: InteractionResponseType.Pong,
      });
    }

    // Delegate to router for all other interaction types
    return routeInteraction(interaction, env, ctx);
  },
};
