import { InteractionType } from "discord-api-types/v10";
import type { APIInteraction, APIChatInputApplicationCommandInteraction, APIMessageComponentInteraction } from "discord-api-types/v10";
import type { Env } from "./config/env";
import type { InteractionHandler } from "./types/discord";
import { createEphemeralErrorResponse } from "./utils/response";

/**
 * Registry of command handlers keyed by command name.
 */
const commandHandlers = new Map<string, InteractionHandler>();

/**
 * Registry of component handlers keyed by custom_id prefix.
 */
const componentHandlers = new Map<string, InteractionHandler>();

/**
 * Register a handler for an application command.
 */
export function registerCommand(
  name: string,
  handler: InteractionHandler,
): void {
  commandHandlers.set(name, handler);
}

/**
 * Register a handler for a message component interaction.
 */
export function registerComponent(
  customId: string,
  handler: InteractionHandler,
): void {
  componentHandlers.set(customId, handler);
}

/**
 * Route an interaction to the appropriate handler based on
 * InteractionType and command name or custom_id.
 */
export async function routeInteraction(
  interaction: APIInteraction,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  switch (interaction.type) {
    case InteractionType.ApplicationCommand: {
      const cmd = interaction as APIChatInputApplicationCommandInteraction;
      const handler = commandHandlers.get(cmd.data.name);
      if (!handler) {
        return createEphemeralErrorResponse(
          `Unknown command: ${cmd.data.name}`,
        );
      }
      return handler(interaction, env, ctx);
    }

    case InteractionType.MessageComponent: {
      const comp = interaction as APIMessageComponentInteraction;
      const handler = componentHandlers.get(comp.data.custom_id);
      if (!handler) {
        return createEphemeralErrorResponse(
          `Unknown component: ${comp.data.custom_id}`,
        );
      }
      return handler(interaction, env, ctx);
    }

    default:
      return createEphemeralErrorResponse("Unsupported interaction type");
  }
}
