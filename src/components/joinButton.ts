/**
 * 参加ボタンハンドラ
 *
 * 2 種類の参加ボタンを処理する。
 * - handleJoinButton (custom_id "tyusen_join"):
 *     セッション開始 Embed 上のボタン。参加/離脱をトグルし、
 *     UPDATE_MESSAGE (type 7) で親メッセージの Embed を更新する。
 * - handleJoinButtonPick (custom_id "tyusen_join_pick"):
 *     抽選結果メッセージ上のボタン。参加/離脱をトグルするが、
 *     結果 Embed を上書きしないよう ephemeral メッセージで本人にだけ返す。
 *
 * Requirements: 1.2, 1.3, 1.4, 5.1, 5.2, 5.3
 */

import { InteractionResponseType } from "discord-api-types/v10";
import type { APIMessageComponentInteraction } from "discord-api-types/v10";
import type { APIInteraction } from "../types/discord";
import type { Env } from "../config/env";
import type { Session } from "../session/types";
import {
  createJsonResponse,
  createEphemeralErrorResponse,
  createEphemeralResponse,
} from "../utils/response";
import { getSession, addParticipant, removeParticipant } from "../session/sessionManager";
import { buildSessionEmbed } from "../embeds/sessionEmbed";

// ---------------------------------------------------------------------------
// 共通トグル処理
// ---------------------------------------------------------------------------

type ToggleResult =
  | { ok: true; session: Session; joined: boolean }
  | { ok: false; message: string };

/**
 * 参加/離脱のトグルを行い、更新後のセッションを返す。
 * Bot チェックとセッション存在チェックを含む。
 */
async function toggleParticipation(
  comp: APIMessageComponentInteraction,
  env: Env,
): Promise<ToggleResult> {
  const user = comp.member!.user;

  // Bot チェック
  if (user.bot) {
    return { ok: false, message: "Bot アカウントは参加できません。" };
  }

  const guildId = comp.guild_id!;
  const channelId = comp.channel_id!;
  const userId = user.id;
  const displayName = user.global_name ?? user.username;

  // セッション存在チェック
  const session = await getSession(env.SESSIONS, guildId, channelId);
  if (session === null) {
    return { ok: false, message: "セッションが見つかりません。" };
  }

  // トグル動作: 参加済みなら離脱、未参加なら参加
  const isParticipant = userId in session.participants;
  const updatedSession = isParticipant
    ? await removeParticipant(env.SESSIONS, guildId, channelId, userId)
    : await addParticipant(env.SESSIONS, guildId, channelId, userId, displayName);

  return { ok: true, session: updatedSession, joined: !isParticipant };
}

// ---------------------------------------------------------------------------
// tyusen_join: 開始 Embed 上のボタン（メッセージをその場更新）
// ---------------------------------------------------------------------------

export async function handleJoinButton(
  interaction: APIInteraction,
  env: Env,
  _ctx: ExecutionContext,
): Promise<Response> {
  const comp = interaction as APIMessageComponentInteraction;

  const result = await toggleParticipation(comp, env);
  if (!result.ok) {
    return createEphemeralErrorResponse(result.message);
  }

  // 更新済み Embed を生成して UPDATE_MESSAGE で返す
  const { embeds, components } = buildSessionEmbed(result.session);

  return createJsonResponse({
    type: InteractionResponseType.UpdateMessage,
    data: {
      embeds,
      components,
    },
  });
}

// ---------------------------------------------------------------------------
// tyusen_join_pick: 抽選結果メッセージ上のボタン（結果を上書きしない）
// ---------------------------------------------------------------------------

export async function handleJoinButtonPick(
  interaction: APIInteraction,
  env: Env,
  _ctx: ExecutionContext,
): Promise<Response> {
  const comp = interaction as APIMessageComponentInteraction;

  const result = await toggleParticipation(comp, env);
  if (!result.ok) {
    return createEphemeralErrorResponse(result.message);
  }

  // 結果 Embed を上書きせず、本人にだけ ephemeral でフィードバックする
  const message = result.joined
    ? "✅ 参加しました！次の抽選対象になります。"
    : "👋 参加を取り消しました。";

  return createEphemeralResponse(message);
}
