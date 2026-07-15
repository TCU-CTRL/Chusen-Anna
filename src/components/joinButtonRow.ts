/**
 * 参加ボタン ActionRow ビルダー
 *
 * buildJoinButtonRow: custom_id "tyusen_join" の参加ボタンを持つ ActionRow を返す。
 * セッション開始 Embed と抽選結果メッセージの両方で再利用し、
 * 参加ボタンがチャットに埋もれても常に最新メッセージから参加できるようにする。
 */

import {
  ButtonStyle,
  ComponentType,
  type APIActionRowComponent,
  type APIButtonComponentWithCustomId,
} from "discord-api-types/v10";

export function buildJoinButtonRow(): APIActionRowComponent<APIButtonComponentWithCustomId> {
  const joinButton: APIButtonComponentWithCustomId = {
    type: ComponentType.Button,
    style: ButtonStyle.Primary,
    label: "参加する",
    custom_id: "tyusen_join",
  };

  return {
    type: ComponentType.ActionRow,
    components: [joinButton],
  };
}
