/**
 * /tyusen_start コマンドハンドラ
 *
 * VC 参加チェック → セッション作成 → Embed + ボタン送信
 *
 * Requirements: 1.1, 1.5, 1.6, 8.1, 8.5
 */

import type { APIChatInputApplicationCommandInteraction } from "discord-api-types/v10";
import type { APIInteraction } from "../types/discord";
import type { Env } from "../config/env";
import { createDeferredResponse } from "../utils/response";
import { getVoiceState, createFollowup } from "../discord/api";
import { createSession, getSession, deleteSession } from "../session/sessionManager";
import { buildSessionEmbed } from "../embeds/sessionEmbed";
import { errorNotInVoiceChannel } from "../messages/annaMessages";

export async function handleAnnaStart(
  interaction: APIInteraction,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const cmd = interaction as APIChatInputApplicationCommandInteraction;
  const guildId = cmd.guild_id!;
  const channelId = cmd.channel_id!;
  const userId = cmd.member!.user.id;
  const interactionToken = cmd.token;

  // Extract time option (optional, in minutes)
  const options = (cmd.data as any).options as
    | Array<{ name: string; type: number; value: any }>
    | undefined;
  const timeOption = options?.find((o) => o.name === "time");
  const timeMinutes = timeOption ? (timeOption.value as number) : undefined;

  ctx.waitUntil(
    (async () => {
      // 1. Check if user is in a voice channel
      const voiceState = await getVoiceState(env.DISCORD_TOKEN, guildId, userId);

      if (voiceState === null) {
        // User is not in VC — send ephemeral error
        await createFollowup(
          env.DISCORD_TOKEN,
          env.DISCORD_APPLICATION_ID,
          interactionToken,
          {
            content: errorNotInVoiceChannel(),
            flags: 64, // EPHEMERAL
          },
        );
        return;
      }

      // 2. Check for existing session and delete if present
      const existing = await getSession(env.SESSIONS, guildId, channelId);
      if (existing !== null) {
        await deleteSession(env.SESSIONS, guildId, channelId);
      }

      // 3. Create new session with VC channel ID
      const session = await createSession(env.SESSIONS, guildId, channelId, userId, timeMinutes, voiceState.channel_id!);

      // 4. Build embed with join button
      const { embeds, components } = buildSessionEmbed(session);

      // 5. Send followup message
      await createFollowup(
        env.DISCORD_TOKEN,
        env.DISCORD_APPLICATION_ID,
        interactionToken,
        { embeds, components },
      );
    })(),
  );

  // Return deferred response immediately
  return createDeferredResponse();
}
