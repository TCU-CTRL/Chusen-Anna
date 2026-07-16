/**
 * セッション操作ボタンの ActionRow ビルダー
 *
 * buildActionRow: 「参加する」ボタンと「早めに発表する」ボタンを持つ
 * ActionRow を返す。抽選のたびに再掲することで、チャットに埋もれても
 * 常に最新メッセージから参加/早め発表できるようにする。
 *
 * 参加ボタンの custom_id は使い分ける:
 * - "tyusen_join":      セッション開始 Embed 用（押すとメッセージをその場更新）
 * - "tyusen_join_pick": 抽選結果メッセージ用（押しても結果 Embed を上書きせず
 *                        ephemeral で参加/離脱を返す）
 *
 * 「早めに発表する」ボタンの custom_id は共通:
 * - "tyusen_present_early": 押した人を選出済みにして公開で先に発表を促す。
 *                           新規メッセージなので既存 Embed を上書きしない。
 */

import {
  ButtonStyle,
  ComponentType,
  type APIActionRowComponent,
  type APIButtonComponentWithCustomId,
} from "discord-api-types/v10";

export const JOIN_CUSTOM_ID = "tyusen_join";
export const JOIN_PICK_CUSTOM_ID = "tyusen_join_pick";
export const PRESENT_EARLY_CUSTOM_ID = "tyusen_present_early";

export function buildActionRow(
  joinCustomId: string = JOIN_CUSTOM_ID,
): APIActionRowComponent<APIButtonComponentWithCustomId> {
  const joinButton: APIButtonComponentWithCustomId = {
    type: ComponentType.Button,
    style: ButtonStyle.Primary,
    label: "参加する",
    custom_id: joinCustomId,
  };

  const earlyPresentButton: APIButtonComponentWithCustomId = {
    type: ComponentType.Button,
    style: ButtonStyle.Secondary,
    label: "早めに発表する",
    custom_id: PRESENT_EARLY_CUSTOM_ID,
  };

  return {
    type: ComponentType.ActionRow,
    components: [joinButton, earlyPresentButton],
  };
}
