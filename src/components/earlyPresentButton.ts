/**
 * 早め発表ボタンハンドラ (custom_id "tyusen_present_early")
 *
 * 抽選を待たずに先に発表したい人向けのボタン。押した人を
 * - （未参加なら自動で参加させたうえで）選出済みとしてマークし、抽選プールから外す
 * - 公開メッセージで先に発表するよう告知する（新規メッセージなので既存 Embed を上書きしない）
 * すでに選出済みの人が押した場合は ephemeral でエラーを返す。
 *
 * Requirements: 2.1, 2.5, 5.1, 5.2, 5.3
 */

import type { APIMessageComponentInteraction } from "discord-api-types/v10";
import type { APIInteraction } from "../types/discord";
import type { Env } from "../config/env";
import {
  createEphemeralErrorResponse,
  createPublicResponse,
} from "../utils/response";
import {
  getSession,
  addParticipant,
  markPicked,
} from "../session/sessionManager";
import { earlyPresentMessage, errorAlreadyPresenting } from "../messages/annaMessages";

export async function handleEarlyPresent(
  interaction: APIInteraction,
  env: Env,
  _ctx: ExecutionContext,
): Promise<Response> {
  const comp = interaction as APIMessageComponentInteraction;
  const user = comp.member!.user;

  // 1. Bot チェック
  if (user.bot) {
    return createEphemeralErrorResponse("Bot アカウントは発表できません。");
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

  // 3. すでに選出済みなら二重発表を防ぐ
  if (session.pickedUserIds.includes(userId)) {
    return createEphemeralErrorResponse(errorAlreadyPresenting());
  }

  // 4. 未参加なら自動で参加させる（発表する＝参加とみなす）
  if (!(userId in session.participants)) {
    await addParticipant(env.SESSIONS, guildId, channelId, userId, displayName);
  }

  // 5. 選出済みとしてマークし、以降の抽選対象から外す
  await markPicked(env.SESSIONS, guildId, channelId, [userId]);

  // 6. 公開メッセージで先に発表を促す（既存 Embed は上書きしない）
  return createPublicResponse(earlyPresentMessage(userId));
}
