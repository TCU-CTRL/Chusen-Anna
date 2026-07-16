/**
 * アンナちゃんキャラクターメッセージ
 *
 * 抽選結果・エラー・セッション開始のメッセージテンプレート関数。
 * Discord メンション形式 (<@userId>) を使用。
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4
 */

// ---------------------------------------------------------------------------
// Success messages
// ---------------------------------------------------------------------------

/** 1人抽選の成功メッセージ */
export function successMessageSingle(userId: string): string {
  return (
    "🎲 抽選アンナちゃんの出番です！\n" +
    `どきどき……今回選ばれたのは、<@${userId}> さんです！\n` +
    "発表よろしくお願いします！"
  );
}

/** 複数人抽選の成功メッセージ */
export function successMessageMultiple(userIds: string[]): string {
  const mentions = userIds.map((id) => `<@${id}> さん`).join("、");
  return (
    "🎲 抽選アンナちゃんの出番です！\n" +
    `今回選ばれたのは、${mentions}です！\n` +
    "順番に発表よろしくお願いします！"
  );
}

/** 早め発表の告知メッセージ（公開） */
export function earlyPresentMessage(userId: string): string {
  return (
    "🙋 早めに発表したい人がいるみたいです！\n" +
    `<@${userId}> さん、先に発表よろしくお願いします！`
  );
}

// ---------------------------------------------------------------------------
// Error messages
// ---------------------------------------------------------------------------

/** VC 未参加エラー */
export function errorNotInVoiceChannel(): string {
  return (
    "あれれ？ VCに入っている人が見つかりませんでした。\n" +
    "VCに参加してから `/tyusen_pick` を実行してください。"
  );
}

/** 参加表明者なしエラー */
export function errorNoEligibleMembers(): string {
  return (
    "抽選できるメンバーがいませんでした。\n" +
    "Bot以外のメンバーがVCにいるか確認してください。"
  );
}

/** count 超過エラー */
export function errorCountTooLarge(availableCount: number): string {
  return (
    "その人数はちょっと多いみたいです。\n" +
    `今の抽選対象は ${availableCount} 人です。`
  );
}

/** 全員選出済みエラー */
export function errorAllPicked(): string {
  return (
    "全員がもう選出済みです！\n" +
    "新しいセッションを `/tyusen_start` で始めてください。"
  );
}

/** /tyusen_pick 時のセッション不在エラー */
export function errorNoSession(): string {
  return (
    "まだセッションが始まっていないみたいです。\n" +
    "まず `/tyusen_start` でセッションを開始してください。"
  );
}

/** 早め発表: すでに選出済みエラー */
export function errorAlreadyPresenting(): string {
  return "あなたはすでに発表対象になっています。順番をお待ちください。";
}

/** /tyusen_end 時のセッション不在エラー */
export function errorNoSessionEnd(): string {
  return "現在アクティブなセッションがありません。";
}

/** 予期しないエラー */
export function errorUnexpected(): string {
  return (
    "ごめんなさい、抽選中にエラーが起きました。\n" +
    "少し時間を置いてもう一度試してください。"
  );
}

// ---------------------------------------------------------------------------
// Session messages
// ---------------------------------------------------------------------------

/** セッション開始メッセージ (/tyusen_start Embed 用) */
export function sessionStartMessage(): string {
  return "アンナちゃんの抽選タイム！参加する人はボタンを押してね！";
}
