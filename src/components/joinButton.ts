/**
 * 参加ボタンハンドラ (anna_join)
 *
 * custom_id "anna_join" の MESSAGE_COMPONENT インタラクションを処理する。
 * - Bot アカウントを拒否
 * - セッション存在チェック
 * - 参加/離脱のトグル動作
 * - UPDATE_MESSAGE (type 7) で親メッセージの Embed を更新
 *
 * Requirements: 1.2, 1.3, 1.4, 5.1, 5.2, 5.3
 */

import { InteractionResponseType } from "discord-api-types/v10";
import type { APIMessageComponentInteraction } from "discord-api-types/v10";
import type { APIInteraction } from "../types/discord";
import type { Env } from "../config/env";
import { createJsonResponse, createEphemeralErrorResponse } from "../utils/response";
import { getSession, addParticipant, removeParticipant } from "../session/sessionManager";
import { buildSessionEmbed } from "../embeds/sessionEmbed";

export async function handleJoinButton(
  interaction: APIInteraction,
  env: Env,
  _ctx: ExecutionContext,
): Promise<Response> {
  const comp = interaction as APIMessageComponentInteraction;
  const user = comp.member!.user;

  // 1. Bot チェック
  if (user.bot) {
    return createEphemeralErrorResponse("Bot アカウントは参加できません。");
  }

  const guildId = comp.guild_id!;
  const channelId = comp.channel_id!;
  const userId = user.id;
  const displayName = user.global_name ?? user.username;

  // 2. セッション存在チェック
  const session = await getSession(env.SESSIONS, guildId, channelId);
  if (session === null) {
    return createEphemeralErrorResponse("セッションが見つかりません。");
  }

  // 3. トグル動作: 参加済みなら離脱、未参加なら参加
  const isParticipant = userId in session.participants;
  const updatedSession = isParticipant
    ? await removeParticipant(env.SESSIONS, guildId, channelId, userId)
    : await addParticipant(env.SESSIONS, guildId, channelId, userId, displayName);

  // 4. 更新済み Embed を生成して UPDATE_MESSAGE で返す
  const { embeds, components } = buildSessionEmbed(updatedSession);

  return createJsonResponse({
    type: InteractionResponseType.UpdateMessage,
    data: {
      embeds,
      components,
    },
  });
}
