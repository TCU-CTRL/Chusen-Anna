/**
 * セッション Embed 生成
 *
 * buildSessionEmbed: セッション進行中の Embed + 参加ボタン Components を返す
 * buildSessionSummaryEmbed: セッション終了時の結果サマリー Embed を返す
 *
 * Requirements: 1.4, 3.4, 6.4, 6.5, 7.3
 */

import {
  type APIActionRowComponent,
  type APIButtonComponentWithCustomId,
  type APIEmbed,
  type APIEmbedField,
} from "discord-api-types/v10";
import type { Session } from "../session/types";
import { sessionStartMessage } from "../messages/annaMessages";
import { buildActionRow } from "../components/joinButtonRow";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SessionEmbedResult {
  embeds: APIEmbed[];
  components: APIActionRowComponent<APIButtonComponentWithCustomId>[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildParticipantsList(session: Session): string {
  const entries = Object.values(session.participants);
  if (entries.length === 0) {
    return "まだ誰も参加していません";
  }
  return entries
    .map((p) => {
      const picked = session.pickedUserIds.includes(p.userId);
      const icon = picked ? "✅" : "🙋";
      return `${icon} ${p.displayName}`;
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// buildSessionEmbed
// ---------------------------------------------------------------------------

/**
 * セッション進行中の Embed と ActionRow (参加ボタン) を生成する。
 */
export function buildSessionEmbed(session: Session): SessionEmbedResult {
  const participantCount = Object.keys(session.participants).length;

  const fields: APIEmbedField[] = [
    {
      name: "📋 参加者一覧",
      value: buildParticipantsList(session),
      inline: false,
    },
    {
      name: "👥 参加者数",
      value: `${participantCount} 人`,
      inline: true,
    },
  ];

  if (session.defaultTimeMinutes !== undefined && session.defaultTimeMinutes > 0) {
    fields.push({
      name: "⏱ 発表時間",
      value: `${session.defaultTimeMinutes} 分`,
      inline: true,
    });
  }

  const embed: APIEmbed = {
    title: "🎲 抽選アンナちゃん セッション",
    description: sessionStartMessage(),
    fields,
    footer: { text: "抽選アンナちゃん" },
    timestamp: session.createdAt,
    color: 0xffc0cb,
  };

  return {
    embeds: [embed],
    components: [buildActionRow()],
  };
}

// ---------------------------------------------------------------------------
// buildSessionSummaryEmbed
// ---------------------------------------------------------------------------

/**
 * セッション終了時の結果サマリー Embed を生成する。
 */
export function buildSessionSummaryEmbed(session: Session): APIEmbed {
  const participantCount = Object.keys(session.participants).length;
  const pickedCount = session.pickedUserIds.length;

  const pickedNames = session.pickedUserIds
    .map((id) => session.participants[id]?.displayName ?? id)
    .join("、");

  const fields: APIEmbedField[] = [
    {
      name: "🏆 選出メンバー",
      value: pickedNames || "なし",
      inline: false,
    },
    {
      name: "👥 抽選対象人数",
      value: `${participantCount} 人`,
      inline: true,
    },
    {
      name: "🎯 選出人数",
      value: `${pickedCount} 人`,
      inline: true,
    },
  ];

  return {
    title: "🎲 抽選アンナちゃん 結果発表",
    description: "抽選セッションが終了しました！おつかれさまでした！",
    fields,
    footer: { text: "抽選アンナちゃん" },
    timestamp: new Date().toISOString(),
    color: 0xffd700,
  };
}
