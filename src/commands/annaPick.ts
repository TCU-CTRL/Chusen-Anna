/**
 * /tyusen_pick コマンドハンドラ
 *
 * セッション取得 → 未選出参加者抽出 → 抽選 → 記録 → 結果 Embed 送信
 *
 * Requirements: 2.1, 2.2, 2.3, 2.5, 3.1, 3.2, 3.3, 8.2, 8.3, 8.5, 9.1, 9.2, 9.3
 */

import type { APIChatInputApplicationCommandInteraction } from "discord-api-types/v10";
import type { APIInteraction } from "../types/discord";
import type { Env } from "../config/env";
import type { Participant } from "../session/types";
import { createDeferredResponse } from "../utils/response";
import { createFollowup, getChannelName } from "../discord/api";
import { getSession, markPicked } from "../session/sessionManager";
import { pickRandom } from "../utils/pickRandom";
import { buildPickResultEmbed } from "../embeds/pickResultEmbed";
import {
  errorNoSession,
  errorAllPicked,
  errorCountTooLarge,
} from "../messages/annaMessages";

export async function handleAnnaPick(
  interaction: APIInteraction,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const cmd = interaction as APIChatInputApplicationCommandInteraction;
  const guildId = cmd.guild_id!;
  const channelId = cmd.channel_id!;
  const interactionToken = cmd.token;

  // Extract count option (default 1)
  const options = (cmd.data as any).options as
    | Array<{ name: string; type: number; value: any }>
    | undefined;
  const countOption = options?.find((o) => o.name === "count");
  const count = countOption ? (countOption.value as number) : 1;
  const timeOption = options?.find((o) => o.name === "time");
  const timeOverride = timeOption ? (timeOption.value as number) : undefined;

  ctx.waitUntil(
    (async () => {
      // 1. Get session
      const session = await getSession(env.SESSIONS, guildId, channelId);

      if (session === null) {
        await createFollowup(
          env.DISCORD_TOKEN,
          env.DISCORD_APPLICATION_ID,
          interactionToken,
          {
            content: errorNoSession(),
            flags: 64,
          },
        );
        return;
      }

      // 2. Get unpicked participants
      const pickedSet = new Set(session.pickedUserIds);
      const unpicked: Participant[] = Object.values(session.participants).filter(
        (p) => !pickedSet.has(p.userId),
      );

      // 3. All picked?
      if (unpicked.length === 0) {
        await createFollowup(
          env.DISCORD_TOKEN,
          env.DISCORD_APPLICATION_ID,
          interactionToken,
          {
            content: errorAllPicked(),
            flags: 64,
          },
        );
        return;
      }

      // 4. Count exceeds available?
      if (count > unpicked.length) {
        await createFollowup(
          env.DISCORD_TOKEN,
          env.DISCORD_APPLICATION_ID,
          interactionToken,
          {
            content: errorCountTooLarge(unpicked.length),
            flags: 64,
          },
        );
        return;
      }

      // 5. Pick random participants
      const picked = pickRandom(unpicked, count);

      // 6. Mark picked in session
      const pickedIds = picked.map((p) => p.userId);
      await markPicked(env.SESSIONS, guildId, channelId, pickedIds);

      // 7. Get VC channel name
      const vcName = session.voiceChannelId
        ? await getChannelName(env.DISCORD_TOKEN, session.voiceChannelId)
        : "VC";

      // 8. Build result embed (time: pick-level override > session default)
      const timeMinutes = timeOverride ?? session.defaultTimeMinutes;
      const embed = buildPickResultEmbed(picked, session, vcName, timeMinutes);

      // 8. Send followup with embed
      await createFollowup(
        env.DISCORD_TOKEN,
        env.DISCORD_APPLICATION_ID,
        interactionToken,
        { embeds: [embed] },
      );
    })(),
  );

  return createDeferredResponse();
}
