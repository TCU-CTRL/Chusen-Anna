import { verifyKey } from "discord-interactions";
import { InteractionType, InteractionResponseType } from "discord-api-types/v10";
import type { APIInteraction } from "discord-api-types/v10";
import type { Env } from "./config/env";
import { registerCommand, registerComponent, routeInteraction } from "./router";
import { createJsonResponse } from "./utils/response";
import { handleAnnaStart } from "./commands/annaStart";
import { handleAnnaPick } from "./commands/annaPick";
import { handleAnnaEnd } from "./commands/annaEnd";
import { handleJoinButton } from "./components/joinButton";

// Register command handlers
registerCommand("anna_start", handleAnnaStart);
registerCommand("anna_pick", handleAnnaPick);
registerCommand("anna_end", handleAnnaEnd);

// Register component handlers
registerComponent("anna_join", handleJoinButton);

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
