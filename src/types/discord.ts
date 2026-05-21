import type {
  APIInteraction,
  APIInteractionResponse,
} from "discord-api-types/v10";
import type { Env } from "../config/env";

/**
 * Handler function invoked by the Interaction Router for each
 * matched command or component interaction.
 */
export type InteractionHandler = (
  interaction: APIInteraction,
  env: Env,
  ctx: ExecutionContext,
) => Promise<Response>;

// Re-export commonly used discord-api-types for convenience.
export type { APIInteraction, APIInteractionResponse };
