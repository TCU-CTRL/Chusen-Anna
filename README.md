# Chusen-Anna (抽選アンナちゃん)

Discord のボイスチャンネル (VC) にいるメンバーの中から、発表者や担当者をランダムに抽選する Bot です。

部のマスコットキャラクター「アンナちゃん」が抽選してくれる体験を提供します。

## 背景

部活の Discord サーバーで LT 発表者や進捗報告の順番を決めるとき、毎回「誰がやる？」と聞くのは手間がかかり、公平性にも欠けます。

VC にいる全員を自動で対象にするのではなく、「発表できる人」だけがボタンで参加表明し、その中から公平に抽選する仕組みが欲しいという声から生まれました。

## 目的

- VC にいるメンバーがボタンで参加表明し、発表可能な人だけを対象に公平な抽選を行う
- 途中参加者もボタンを押すだけで抽選に加われる
- 一度選ばれた人を除外して連続抽選できる
- サーバー不要・無料で運用できる (Cloudflare Workers)

## 使い方

### コマンド一覧

| コマンド | 説明 |
|---------|------|
| `/tyusen_start` | 抽選セッションを開始。「参加する」ボタン付きの Embed を送信 |
| `/tyusen_start time:5` | 発表時間 5 分をデフォルト設定してセッション開始 |
| `/tyusen_pick` | 参加表明者から 1 人をランダムに抽選 |
| `/tyusen_pick count:3` | 参加表明者から 3 人を重複なしで抽選 |
| `/tyusen_pick time:3` | 発表時間 3 分を指定して抽選（セッションのデフォルトを上書き） |
| `/tyusen_end` | セッションを終了し、結果サマリーを表示 |

### 基本フロー

1. VC に参加する
2. テキストチャンネルで `/tyusen_start` を実行
3. 「参加する」ボタンを押して参加表明（もう一度押すと取り消し）
4. `/tyusen_pick` で抽選。結果が Embed で表示される
5. 続けて `/tyusen_pick` で次の人を抽選（選ばれた人は除外される）
6. `/tyusen_end` でセッション終了

### 発表時間の設定

- `/tyusen_start time:5` でセッション全体のデフォルト発表時間を設定
- `/tyusen_pick time:3` で個別の抽選ごとに上書き可能
- 抽選結果の Embed に発表時間と Discord のカウントダウン（相対タイムスタンプ）が表示される

## 技術スタック

| 項目 | 技術 |
|------|------|
| ランタイム | Cloudflare Workers (無料枠) |
| 言語 | TypeScript (strict mode) |
| ストレージ | Cloudflare KV (セッション状態、TTL 1 時間で自動削除) |
| Discord 連携 | HTTP Interactions Endpoint (Gateway 不使用) |
| テスト | Vitest (136 テスト) |
| CI/CD | GitHub Actions → wrangler deploy |

## 環境構築

### 前提条件

- Node.js 20 以上
- npm
- Cloudflare アカウント (無料)
- Discord Developer Portal で Application を作成済み

### 1. リポジトリのクローンと依存関係のインストール

```bash
git clone git@github.com:TCU-CTRL/Chusen-Anna.git
cd Chusen-Anna
npm ci
```

### 2. Cloudflare の設定

```bash
# Cloudflare にログイン
npx wrangler login

# KV Namespace を作成
npx wrangler kv namespace create SESSIONS
```

表示された `id` を `wrangler.toml` の `id` に設定してください。

### 3. Discord Developer Portal の設定

1. [Discord Developer Portal](https://discord.com/developers/applications) で Application を開く
2. **Bot** セクションで Token を取得
3. **General Information** から Public Key と Application ID をメモ
4. **OAuth2 → URL Generator** で Bot をサーバーに招待:
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions: `View Channels`, `Send Messages`, `Use Slash Commands`, `Read Message History`

### 4. 環境変数の設定

#### ローカル開発用 (.env)

```bash
cp .env.example .env
```

`.env` に値を記入:

```
DISCORD_TOKEN=your_bot_token
DISCORD_APPLICATION_ID=your_application_id
DISCORD_GUILD_ID=your_guild_id
DISCORD_PUBLIC_KEY=your_public_key
```

#### Cloudflare Workers 用 (シークレット)

```bash
npx wrangler secret put DISCORD_TOKEN
npx wrangler secret put DISCORD_APPLICATION_ID
npx wrangler secret put DISCORD_GUILD_ID
npx wrangler secret put DISCORD_PUBLIC_KEY
```

### 5. スラッシュコマンドの登録

```bash
npm run register
```

### 6. デプロイ

```bash
npm run deploy
```

表示された Worker URL (例: `https://tyusen-chan.xxx.workers.dev`) を Discord Developer Portal → **General Information** → **Interactions Endpoint URL** に設定してください。

### 7. GitHub Actions (CI/CD)

GitHub リポジトリの Settings → Secrets and variables → Actions に以下を設定:

| Secret 名 | 値 |
|-----------|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token (Edit Cloudflare Workers テンプレート) |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Account ID |

`main` ブランチへの push で自動ビルド・テスト・デプロイが実行されます。

### ローカル開発

```bash
npm run dev     # wrangler dev でローカル起動
npm run build   # TypeScript ビルド
npm test        # テスト実行
```

## よくあるエラー

| エラー | 原因 | 対処 |
|-------|------|------|
| Missing Access (403) | Bot がサーバーに招待されていない / GUILD_ID が間違い | OAuth2 URL で招待し直す / GUILD_ID を確認 |
| Unauthorized (401) | DISCORD_TOKEN が無効 | Developer Portal で Token を再生成 |
| Interactions Endpoint URL の保存失敗 | DISCORD_PUBLIC_KEY が間違い / Worker が起動していない | Public Key を確認 / `npm run deploy` を実行 |
| Bot が反応しない | Interactions Endpoint URL が未設定 | Worker URL を Developer Portal に設定 |
| VC にいるのにエラー | Bot に View Channels 権限がない | Bot の権限を確認 |

## ライセンス

MIT
