# Research & Design Decisions

## Summary
- **Feature**: `anna-pick-bot`
- **Discovery Scope**: New Feature（グリーンフィールド）
- **Key Findings**:
  - Discord REST API に VC メンバー一覧取得エンドポイントが存在しない → セッションなしモード不可、ボタン参加表明方式で解決
  - Cloudflare 公式 Discord Bot テンプレートが存在し、Workers + KV の構成が確立されている
  - KV 無料枠の書き込み上限（1,000回/日）は部活規模では十分

## Research Log

### Discord REST API の Voice State 制約
- **Context**: HTTP Interactions Endpoint で VC メンバー一覧を取得できるか調査
- **Sources**: Discord API ドキュメント v10
- **Findings**:
  - `GET /guilds/{guild_id}/voice-states/{user_id}` — 個別ユーザーの VC 状態のみ取得可能
  - VC 内の全メンバーを一覧取得するエンドポイントは存在しない
  - Gateway（WebSocket）の `VOICE_STATE_UPDATE` イベントでのみ全体把握可能
- **Implications**: セッションなしモード（Req 2.5）は HTTP-only では実現不可。ボタン参加表明方式に一本化する

### Discord HTTP Interactions の応答フロー
- **Context**: スラッシュコマンドとボタンのレスポンス設計
- **Findings**:
  - 初回応答は 3 秒以内に返す必要がある
  - Deferred reply: type 5 で即応答 → `PATCH /webhooks/{app_id}/{token}/messages/@original` で更新
  - ボタン操作: type 3（MESSAGE_COMPONENT）で受信、type 7（UPDATE_MESSAGE）で親メッセージを編集
  - Interaction token は 15 分間有効
- **Implications**: セッション Embed のボタン更新には type 7 を使用。抽選結果は type 4 で新規メッセージとして送信

### discord-interactions パッケージ
- **Context**: 署名検証と型定義のライブラリ選定
- **Findings**:
  - `discord-interactions` v4.4.0: `verifyKey()` による Ed25519 署名検証、InteractionType/ResponseType enum
  - `discord-api-types` v0.38.x: discord.js チームが管理する包括的な TypeScript 型定義
  - Workers 環境では Express ミドルウェアは使えないため `verifyKey()` を直接使用
- **Implications**: `discord-interactions` を署名検証に、`discord-api-types` を型定義に併用

### Cloudflare Workers + KV
- **Context**: サーバーレス環境でのセッション状態管理
- **Findings**:
  - KV 無料枠: 読み取り 100,000回/日、書き込み 1,000回/日、ストレージ 1GB
  - `put()` に `expirationTtl` オプションで TTL 設定可能（セッション自動期限切れに利用）
  - `.dev.vars` でローカル開発時のシークレット管理
  - `wrangler secret put` でプロダクションシークレット管理（デプロイとは独立）
- **Implications**: セッションあたりの KV 書き込みは参加者数 + 抽選回数 + 作成/終了。部活規模（〜20人）なら日次上限に余裕あり

### GitHub Actions デプロイ
- **Context**: CI/CD パイプラインの構成
- **Findings**:
  - `cloudflare/wrangler-action@v3` が公式
  - 必要な secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
  - `wrangler secret` の値は CI から設定するものではなく、一度手動設定すれば永続する
- **Implications**: CI は build + test + deploy のみ。Discord/Cloudflare のシークレットは初回手動設定

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| Cloudflare Workers + KV | HTTP Interactions + KV セッション | サーバーレス無料、公式テンプレートあり | KV 書き込み上限 1,000/日、結果整合性 | 採用 |
| Workers + Durable Objects | Durable Objects でセッション管理 | 強い整合性、WebSocket 対応 | 有料プランが必要（$5/月〜） | 却下: 無料要件に反する |
| Gateway Bot + 無料 VPS | discord.js v14 + Gateway | VC メンバー一覧取得可能 | サーバー必要、無料 VPS は不安定 | 却下: サーバーレス要件に反する |

## Design Decisions

### Decision: セッションなしモードの廃止
- **Context**: Req 2.5「セッションが存在しない状態で `/anna_pick` を実行した場合、VC メンバーから直接抽選する」
- **Alternatives**:
  1. Gateway プロセスを別途用意して VC 状態を KV にキャッシュ → 複雑すぎる
  2. セッションなしモードを廃止し、常に `/anna_start` → ボタン参加表明 → `/anna_pick` のフローに統一
- **Selected**: 選択肢 2
- **Rationale**: HTTP-only では VC メンバー一覧を取得できないため。ボタン参加表明は「発表できる人だけ参加」というユーザー要件にも合致する
- **Trade-offs**: ワンコマンドで即抽選はできなくなるが、ユーザー体験としては参加表明フローの方がフェア
- **Follow-up**: requirements.md の Req 2.5 を修正する必要あり

### Decision: KV セッション TTL
- **Context**: セッション自動期限切れの実装方法
- **Selected**: KV の `expirationTtl` を使用（例: 3600秒 = 1時間）
- **Rationale**: 追加のタイマー処理不要で KV がネイティブに TTL をサポート

### Decision: ボタン更新方式
- **Context**: 参加表明時の Embed 更新方法
- **Selected**: Discord Interaction Response type 7（UPDATE_MESSAGE）で親メッセージを直接編集
- **Rationale**: 新規メッセージを送らず、元の Embed を更新することでチャンネルを汚さない

## Risks & Mitigations
- KV 書き込み上限 1,000/日 → 部活規模では問題なし。監視は不要だが README に注意書きを追加
- KV の結果整合性（eventual consistency）→ ボタン操作の間隔を考えると実用上問題なし
- 3 秒タイムアウト → KV 読み書き + 抽選ロジックは十分高速。deferReply は将来の演出追加時に必要

## References
- Discord API v10 ドキュメント: Interactions Endpoint
- Cloudflare Workers KV ドキュメント
- discord/cloudflare-sample-app (GitHub)
- discord-interactions npm v4.4.0
- discord-api-types npm v0.38.x
- cloudflare/wrangler-action@v3
