/**
 * 抽選結果 Embed 生成
 *
 * buildPickResultEmbed: /tyusen_pick 実行時の抽選結果 Embed を返す
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 7.1
 */

import type { APIEmbed, APIEmbedField } from "discord-api-types/v10";
import type { Participant, Session } from "../session/types";
import {
  successMessageSingle,
  successMessageMultiple,
} from "../messages/annaMessages";

/**
 * 抽選結果の Embed を生成する。
 *
 * - 1人抽選: successMessageSingle を使用
 * - 複数人抽選: successMessageMultiple を使用
 */
export function buildPickResultEmbed(
  picked: Participant[],
  session: Session,
  vcName: string,
  timeMinutes?: number,
): APIEmbed {
  const description =
    picked.length === 1
      ? successMessageSingle(picked[0].userId)
      : successMessageMultiple(picked.map((p) => p.userId));

  const participantCount = Object.keys(session.participants).length;

  const fields: APIEmbedField[] = [
    {
      name: "🔊 対象VC",
      value: vcName,
      inline: true,
    },
    {
      name: "👥 参加表明人数",
      value: `${participantCount} 人`,
      inline: true,
    },
    {
      name: "🎯 抽選人数",
      value: `${picked.length} 人`,
      inline: true,
    },
  ];

  if (timeMinutes !== undefined && timeMinutes > 0) {
    const deadlineUnix = Math.floor(Date.now() / 1000) + timeMinutes * 60;
    fields.push({
      name: "⏱ 発表時間",
      value: `${timeMinutes} 分（終了予定: <t:${deadlineUnix}:R>）`,
      inline: true,
    });
  }

  return {
    title: "🎲 抽選アンナちゃん 結果発表",
    description,
    fields,
    footer: { text: "抽選アンナちゃん" },
    timestamp: new Date().toISOString(),
    color: 0xffd700,
  };
}
