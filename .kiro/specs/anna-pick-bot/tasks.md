# Implementation Plan

- [x] 1. プロジェクト基盤セットアップ
- [x] 1.1 Cloudflare Workers プロジェクト初期化
  - wrangler.toml, package.json, tsconfig.json (strict mode), vitest.config.ts を作成
  - npm dependencies: discord-interactions, discord-api-types をインストール
  - dev dependencies: wrangler, vitest, typescript を設定
  - KV namespace バインディング (SESSIONS) を wrangler.toml に定義
  - .gitignore に node_modules, .wrangler, .dev.vars, dist を追加
  - `npx wrangler dev` で Workers がローカル起動すること
  - _Requirements: 11.1_

- [x] 1.2 環境変数型定義とプロジェクト構成
  - src/config/env.ts に Env interface (DISCORD_PUBLIC_KEY, DISCORD_TOKEN, DISCORD_APPLICATION_ID, DISCORD_GUILD_ID, SESSIONS: KVNamespace) を定義
  - src/types/discord.ts に Discord Interaction 関連の共通型を定義
  - .env.example と .dev.vars.example に必要な環境変数一覧を記載
  - TypeScript strict mode でビルドが通ること
  - _Requirements: 11.1, 11.2_

- [x] 2. コアドメインロジック
- [x] 2.1 (P) ランダム抽選純粋関数
  - Fisher-Yates shuffle ベースで candidates から count 人を重複なしで選出する pickRandom&lt;T&gt; 関数を実装
  - 入力配列を変更しない（immutable）
  - count > candidates.length や count < 1 のケースでエラーを投げる
  - tests/pickRandom.test.ts: 1人選出、複数人選出、重複なし保証、入力非破壊、エラーケースのテストが全て通ること
  - _Requirements: 2.1, 2.2, 2.4_
  - _Boundary: pickRandom_

- [x] 2.2 (P) セッション型定義と SessionManager
  - src/session/types.ts に Session (participants: Record&lt;string, Participant&gt;), Participant 型を定義
  - src/session/sessionManager.ts に KV ベースの CRUD を実装: createSession, getSession, addParticipant, removeParticipant, markPicked, deleteSession
  - 各操作で expirationTtl: 3600 を設定し TTL をリセット
  - addParticipant は冪等設計（既存参加者の再追加は上書き、同時書き込みリスクの軽減）
  - removeParticipant で参加取り消し（トグル動作の片側）
  - markPicked で選出者 ID を pickedUserIds に追加
  - tests/sessionManager.test.ts: KV モックを使った CRUD テスト（作成・参加追加・参加取消・選出記録・TTL設定・削除）が全て通ること
  - _Requirements: 1.1, 1.2, 1.3, 3.1, 3.2, 4.1, 4.3_
  - _Boundary: SessionManager_

- [x] 2.3 (P) アンナちゃんキャラクターメッセージ
  - src/messages/annaMessages.ts に成功メッセージ、エラーメッセージ、セッション開始メッセージを定型テンプレート関数として定義
  - 1人抽選・複数人抽選のメッセージ
  - 各エラーパターン: VC未参加、参加者なし、count超過、全員選出済み、セッション不在、セッションなし、予期しないエラー
  - メンション形式 (&lt;@userId&gt;) を正しく含むこと
  - tests/messages.test.ts: 各メッセージ関数がメンション形式とキャラクター口調を含むテストが通ること
  - _Requirements: 7.1, 7.2, 7.3, 7.4_
  - _Boundary: annaMessages_

- [x] 2.4 (P) Discord REST API クライアント
  - src/discord/api.ts に以下を実装:
  - getVoiceState: GET /guilds/{guildId}/voice-states/{userId} を呼び出し、404 時は null を返す
  - editOriginalResponse: PATCH /webhooks/{appId}/{token}/messages/@original
  - createFollowup: POST /webhooks/{appId}/{token}
  - fetch API を使い、Authorization: Bot {token} ヘッダを設定
  - 各メソッドの型が discord-api-types と整合すること
  - _Requirements: 1.6, 10.2_
  - _Boundary: Discord REST Client_

- [x] 3. プレゼンテーション層
- [x] 3.1 (P) セッション Embed 生成
  - src/embeds/sessionEmbed.ts に buildSessionEmbed と buildSessionSummaryEmbed を実装
  - buildSessionEmbed: 参加者一覧（選出済み・未選出を区別）、「参加する」ボタン (custom_id: "anna_join") + ActionRow を含む Embed + Components を返す
  - buildSessionSummaryEmbed: セッション終了時の結果サマリー Embed を返す
  - フッター「抽選アンナちゃん」とタイムスタンプを含む
  - annaMessages からキャラクターメッセージを取得して Embed に反映
  - _Requirements: 1.4, 3.4, 6.4, 6.5, 7.3_
  - _Boundary: sessionEmbed_
  - _Depends: 2.2, 2.3_

- [x] 3.2 (P) 抽選結果 Embed 生成
  - src/embeds/pickResultEmbed.ts に buildPickResultEmbed を実装
  - 選ばれたメンバーをメンション付きで description に表示
  - 1人抽選と複数人抽選でメッセージを分ける（annaMessages を使用）
  - fields: 対象VC名、参加表明人数、抽選人数を含む
  - フッター「抽選アンナちゃん」とタイムスタンプを含む
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 7.1_
  - _Boundary: pickResultEmbed_
  - _Depends: 2.3_

- [x] 4. インタラクションハンドラ
- [x] 4.1 Worker エントリポイントとルーター
  - src/index.ts: fetch ハンドラで discord-interactions の verifyKey() による署名検証を実行
  - PING (type 1) に PONG で即応答
  - それ以外を src/router.ts に委譲
  - src/router.ts: InteractionType (APPLICATION_COMMAND / MESSAGE_COMPONENT) と command name / custom_id に基づいてハンドラ関数を振り分け
  - 署名検証失敗時に 401 を返すこと
  - 不明なコマンド / custom_id に対してエラーレスポンスを返すこと
  - Deferred reply ヘルパー: type 5 (DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE) レスポンスを返すユーティリティ関数を用意し、VC チェックや KV 操作を含むハンドラで利用可能にする
  - _Requirements: 11.3, 10.2_

- [x] 4.2 (P) /anna_start コマンドハンドラ
  - src/commands/annaStart.ts を実装
  - deferReply (type 5) で即応答 → Discord REST Client で VC 参加チェック → SessionManager でセッション作成 → sessionEmbed で Embed + ボタン生成 → createFollowup で送信
  - VC 未参加時: ephemeral エラーメッセージ (flags: 64)
  - 同一チャンネルに既存セッションがある場合は既存セッションを終了して新規作成
  - セッション Embed にボタン (custom_id: "anna_join") が表示されること
  - _Requirements: 1.1, 1.5, 1.6, 8.1, 8.5_
  - _Depends: 2.2, 2.4, 3.1, 4.1_
  - _Boundary: annaStart_

- [x] 4.3 (P) /anna_pick コマンドハンドラ
  - src/commands/annaPick.ts を実装
  - deferReply (type 5) で即応答 → SessionManager でセッション取得 → 未選出参加者を抽出 → pickRandom で抽選 → markPicked で記録 → pickResultEmbed で結果 Embed → createFollowup で送信
  - count オプション: 整数、デフォルト 1、最小 1
  - セッションなし: ephemeral で /anna_start 案内
  - 参加者なし: ephemeral でエラー
  - count > 未選出者数: ephemeral で現在の可能人数を表示
  - 全員選出済み: ephemeral で通知
  - 抽選結果 Embed がチャンネルに表示されること
  - _Requirements: 2.1, 2.2, 2.3, 2.5, 3.1, 3.2, 3.3, 8.2, 8.3, 8.5, 9.1, 9.2, 9.3_
  - _Depends: 2.1, 2.2, 2.4, 3.2, 4.1_
  - _Boundary: annaPick_

- [x] 4.4 (P) /anna_end コマンドハンドラ
  - src/commands/annaEnd.ts を実装
  - SessionManager でセッション取得 → buildSessionSummaryEmbed でサマリー生成 → セッション削除 → type 4 で応答
  - セッション不在: ephemeral でエラー
  - セッション終了サマリー（選出者リスト）がチャンネルに表示されること
  - _Requirements: 4.1, 4.2, 4.4, 8.5_
  - _Depends: 2.2, 3.1, 4.1_
  - _Boundary: annaEnd_

- [x] 4.5 (P) 参加ボタンハンドラ
  - src/components/joinButton.ts: custom_id "anna_join" に反応
  - interaction.member.user.bot チェックで Bot アカウントを拒否
  - SessionManager で参加状態を確認し、未参加なら addParticipant、参加済みなら removeParticipant（トグル動作）
  - buildSessionEmbed で更新済み Embed を生成 → type 7 (UPDATE_MESSAGE) で親メッセージを更新
  - Embed の参加者一覧がリアルタイムで更新されること
  - _Requirements: 1.2, 1.3, 1.4, 5.1, 5.2, 5.3_
  - _Depends: 2.2, 2.4, 3.1, 4.1_
  - _Boundary: joinButton_

- [x] 5. スクリプトと CI/CD
- [x] 5.1 (P) スラッシュコマンド登録スクリプト
  - scripts/register-commands.ts: PUT /applications/{appId}/guilds/{guildId}/commands で anna_start, anna_pick (count: integer option, min_value: 1), anna_end を一括登録
  - dotenv で .env からトークンを読み込み
  - npx tsx scripts/register-commands.ts で Discord API に登録が成功すること（200 レスポンス）
  - _Requirements: 13.1, 13.2_
  - _Boundary: register-commands_

- [x] 5.2 (P) GitHub Actions デプロイワークフロー
  - .github/workflows/deploy.yml を作成
  - トリガー: main ブランチへの push
  - ステップ: checkout → Node.js setup → npm ci → npm run build → npm test → wrangler deploy
  - secrets: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID を参照
  - ビルドまたはテスト失敗時にデプロイステップが実行されないこと
  - _Requirements: 12.1, 12.2, 12.3_
  - _Boundary: deploy.yml_

- [x] 6. バリデーション
- [x] 6.1 統合フローテスト
  - tests/integration/flow.test.ts を作成
  - Discord API (fetch) と KV をモックした状態で Worker 全体をテスト
  - テストシナリオ: 署名検証成功 → /anna_start (type 2) → ボタンクリック (type 3) → /anna_pick (type 2) → /anna_end (type 2) の一連フロー
  - 各ステップで正しい InteractionResponseType が返されること（type 5 deferred → followup、type 7 update、type 4 直接応答）
  - 署名検証失敗時に 401 が返ること
  - 全テストが通ること
  - _Requirements: 10.1, 10.2, 11.3_
  - _Depends: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 6.2 エラーケース網羅テスト
  - tests/integration/errors.test.ts を作成
  - 以下の全エラーパターンをテスト:
  - VC未参加で /anna_start → ephemeral VC参加案内メッセージ
  - セッションなしで /anna_pick → ephemeral /anna_start 案内メッセージ
  - 参加者0人で /anna_pick → ephemeral 参加呼びかけメッセージ
  - count > 未選出者数で /anna_pick → ephemeral 可能人数表示メッセージ
  - 全員選出済みで /anna_pick → ephemeral 全員選出済み通知メッセージ
  - セッション不在で /anna_end → ephemeral セッション不在メッセージ
  - KV 障害シミュレーションで予期しないエラー → ephemeral 再試行案内メッセージ
  - 全レスポンスが ephemeral (flags: 64) であること
  - 全テストが通ること
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
  - _Depends: 4.1, 4.2, 4.3, 4.4, 4.5_

## Implementation Notes
- errorNoEligibleMembers() は定義済みだが未使用。参加者0人のケースは errorAllPicked() で処理される（未選出者が0人と同じ扱い）
- errorUnexpected() は定義済みだが、コマンドハンドラに try/catch がない。KV 障害は未処理の例外として伝播する
