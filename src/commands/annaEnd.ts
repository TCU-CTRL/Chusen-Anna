/**
 * /tyusen_end コマンドハンドラ
 *
 * セッション取得 → サマリー Embed 生成 → セッション削除 → type 4 で応答
 *
 * Requirements: 4.1, 4.2, 4.4, 8.5
 */

import type { APIChatInputApplicationCommandInteraction } from "discord-api-types/v10";
import type { APIInteraction } from "../types/discord";
import type { Env } from "../config/env";
import { createJsonResponse, createEphemeralErrorResponse } from "../utils/response";
import { getSession, deleteSession } from "../session/sessionManager";
import { buildSessionSummaryEmbed } from "../embeds/sessionEmbed";
import { errorNoSessionEnd } from "../messages/annaMessages";
import { InteractionResponseType } from "discord-api-types/v10";

export async function handleAnnaEnd(
  interaction: APIInteraction,
  env: Env,
  _ctx: ExecutionContext,
): Promise<Response> {
  const cmd = interaction as APIChatInputApplicationCommandInteraction;
  const guildId = cmd.guild_id!;
  const channelId = cmd.channel_id!;

  // 1. Check for existing session
  const session = await getSession(env.SESSIONS, guildId, channelId);

  if (session === null) {
    // No session: return ephemeral error
    return createEphemeralErrorResponse(errorNoSessionEnd());
  }

  // 2. Build summary embed before deleting
  const embed = buildSessionSummaryEmbed(session);

  // 3. Delete session
  await deleteSession(env.SESSIONS, guildId, channelId);

  // 4. Return type 4 with embed (visible to all)
  return createJsonResponse({
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      embeds: [embed],
    },
  });
}
