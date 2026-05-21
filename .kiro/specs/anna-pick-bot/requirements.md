# Requirements Document

## Introduction
Discord サーバー内のボイスチャンネル（VC）に現在参加しているメンバーの中から、部のマスコットキャラクター「アンナちゃん」がランダムに発表者・担当者を抽選して発表する Bot「抽選アンナちゃん」を開発する。ボタンによる参加表明とセッション管理により、発表可能なメンバーだけを対象に公平な抽選を提供する。途中参加者もボタンを押すことで抽選に加わることができる。

## Boundary Context
- **In scope**: セッション開始コマンド、ボタンによる参加表明、参加表明者からの抽選、Embed による結果表示、Bot アカウント除外、アンナちゃんキャラクターメッセージ、セッション状態管理、既選出者を除外した連続抽選、セッション終了、スラッシュコマンド登録スクリプト、CI/CD によるデプロイ自動化
- **Out of scope**: VC 入退室履歴の保存、出席管理、参加時間集計、自動リマインド、音声読み上げ、AI による動的文章生成、Web 管理画面、テキストベースのコマンド（Message Content Intent）、重み付き抽選（全員均等確率）
- **Adjacent expectations**: Discord REST API が VC メンバー一覧（Voice States）を提供すること。Discord Interactions Endpoint が HTTP POST でインタラクションを配信すること。Discord Message Components（ボタン）が動作すること。Cloudflare Workers が HTTP リクエストを処理できること。Cloudflare KV がセッション状態を保存できること。

## Requirements

### Requirement 1: セッション開始とボタンによる参加表明
**Objective:** As a VC 参加メンバー, I want `/anna_start` コマンドで抽選セッションを開始し、発表できるメンバーだけがボタンで参加表明したい, so that 発表できない人を除いた公平な抽選ができる

#### Acceptance Criteria
1. When ユーザーが `/anna_start` を実行した場合, the 抽選アンナちゃん shall 「参加する」ボタン付きの Embed メッセージをチャンネルに送信する
2. When メンバーが「参加する」ボタンを押した場合, the 抽選アンナちゃん shall そのメンバーを抽選対象として登録し、Embed の参加者一覧を更新する
3. When 既に参加表明済みのメンバーが再度ボタンを押した場合, the 抽選アンナちゃん shall 参加表明を取り消し、抽選対象から除外する（トグル動作）
4. The 抽選アンナちゃん shall 参加表明した人数と参加者名を Embed 上にリアルタイムで表示する
5. The 抽選アンナちゃん shall 途中で VC に参加したメンバーもボタンを押すことで抽選対象に加わることができるようにする
6. If ユーザーが VC に参加していない状態で `/anna_start` を実行した場合, the 抽選アンナちゃん shall VC に参加してからコマンドを実行するよう案内するメッセージを表示する

### Requirement 2: セッションからの抽選実行
**Objective:** As a VC 参加メンバー, I want セッション中に `/anna_pick` で参加表明者からランダムに抽選したい, so that 発表者や担当者を公平に決められる

#### Acceptance Criteria
1. While セッションが存在する場合, when ユーザーが `/anna_pick` を実行した場合, the 抽選アンナちゃん shall セッション内の参加表明者から 1 人をランダムに選出する
2. While セッションが存在する場合, when ユーザーが `/anna_pick count:N` を実行した場合, the 抽選アンナちゃん shall セッション内の参加表明者から重複なしで N 人をランダムに選出する
3. When `count` オプションが省略された場合, the 抽選アンナちゃん shall デフォルト値 1 として 1 人を抽選する
4. The 抽選アンナちゃん shall 抽選結果を毎回独立したランダム選出で決定する（前回の結果に依存しない）
5. If セッションが存在しない状態で `/anna_pick` を実行した場合, the 抽選アンナちゃん shall まず `/anna_start` でセッションを開始するよう案内するメッセージを表示する

### Requirement 3: 連続抽選と既選出者の管理
**Objective:** As a VC 参加メンバー, I want 一度選ばれた人を除外して次の抽選を行いたい, so that 全員が順番に担当できる

#### Acceptance Criteria
1. While セッションが存在する場合, the 抽選アンナちゃん shall 既に選出されたメンバーを記録する
2. When `/anna_pick` を連続で実行した場合, the 抽選アンナちゃん shall 既選出者を除外して未選出の参加表明者から抽選する
3. If すべての参加表明者が既に選出済みの場合, the 抽選アンナちゃん shall 全員選出済みであることを通知する
4. The 抽選アンナちゃん shall セッション Embed に「選出済み」と「未選出」のメンバーが区別できる表示を含める

### Requirement 4: セッション終了
**Objective:** As a VC 参加メンバー, I want セッションを明示的に終了したい, so that 不要なセッションが残らない

#### Acceptance Criteria
1. When ユーザーが `/anna_end` を実行した場合, the 抽選アンナちゃん shall 現在のセッションを終了し、セッションデータを削除する
2. When セッションが終了した場合, the 抽選アンナちゃん shall セッションの結果サマリー（誰が選ばれたか）を表示する
3. The 抽選アンナちゃん shall セッション開始から一定時間経過後にセッションを自動的に期限切れにする
4. If セッションが存在しない状態で `/anna_end` を実行した場合, the 抽選アンナちゃん shall セッションが存在しないことを通知する

### Requirement 5: 抽選対象のフィルタリング
**Objective:** As a VC 参加メンバー, I want Bot アカウントが抽選対象から除外されてほしい, so that 人間のメンバーだけが公平に抽選される

#### Acceptance Criteria
1. The 抽選アンナちゃん shall 抽選対象から Bot 自身を除外する
2. The 抽選アンナちゃん shall 抽選対象から すべての Bot アカウントを除外する
3. The 抽選アンナちゃん shall ボタン操作を Bot アカウントから受け付けない

### Requirement 6: 抽選結果の Embed 表示
**Objective:** As a VC 参加メンバー, I want 抽選結果が見やすく表示されてほしい, so that 誰が選ばれたか一目で分かる

#### Acceptance Criteria
1. When 抽選が成功した場合, the 抽選アンナちゃん shall 結果を Discord Embed 形式で表示する
2. When 1 人が抽選された場合, the 抽選アンナちゃん shall 選ばれたメンバーをメンションつきで Embed の description に表示する
3. When 複数人が抽選された場合, the 抽選アンナちゃん shall 選ばれた全メンバーをメンションつきで Embed の description に表示する
4. The 抽選アンナちゃん shall Embed に対象 VC 名、参加表明人数、抽選人数をフィールドとして含める
5. The 抽選アンナちゃん shall Embed にフッター「抽選アンナちゃん」と抽選実行時刻のタイムスタンプを含める

### Requirement 7: アンナちゃんキャラクターメッセージ
**Objective:** As a VC 参加メンバー, I want アンナちゃんらしいメッセージで結果を伝えてほしい, so that 部活の雰囲気に合った楽しい抽選体験になる

#### Acceptance Criteria
1. When 抽選が成功した場合, the 抽選アンナちゃん shall アンナちゃんのキャラクターに沿った定型メッセージを Embed のタイトルおよび description に含める
2. When エラーが発生した場合, the 抽選アンナちゃん shall アンナちゃんのキャラクターに沿ったエラーメッセージを表示する
3. When セッションが開始された場合, the 抽選アンナちゃん shall アンナちゃんのキャラクターに沿った参加呼びかけメッセージを表示する
4. The 抽選アンナちゃん shall メッセージ内容を抽選結果の明確さを損なわない範囲で表現する

### Requirement 8: エラーハンドリング
**Objective:** As a VC 参加メンバー, I want エラー時に原因が分かるメッセージが表示されてほしい, so that 自分で対処できる

#### Acceptance Criteria
1. If ユーザーが VC に参加していない状態で `/anna_pick` をセッションなしで実行した場合, the 抽選アンナちゃん shall VC に参加してからコマンドを実行するよう案内するメッセージを表示する
2. If セッション内の参加表明者がいない場合, the 抽選アンナちゃん shall 参加表明者がいないことを伝えるメッセージを表示する
3. If `count` の値が抽選対象人数（未選出の参加表明者数）を超えている場合, the 抽選アンナちゃん shall 現在の抽選可能人数を伝え、人数を減らすよう案内するメッセージを表示する
4. If 予期しないエラーが発生した場合, the 抽選アンナちゃん shall 時間を置いて再試行するよう案内するメッセージを表示する
5. The 抽選アンナちゃん shall すべてのエラーメッセージをコマンド実行者にのみ見える形（ephemeral）で表示する

### Requirement 9: コマンドオプションのバリデーション
**Objective:** As a VC 参加メンバー, I want 不正な入力が適切に拒否されてほしい, so that 意図しない動作が起きない

#### Acceptance Criteria
1. The 抽選アンナちゃん shall `count` オプションを整数型として受け付ける
2. The 抽選アンナちゃん shall `count` の最小値を 1 とする
3. If `count` が 1 未満の値で指定された場合, the 抽選アンナちゃん shall エラーメッセージを表示する

### Requirement 10: 抽選演出の拡張性
**Objective:** As a 開発者, I want 将来的に抽選演出（考え中・どきどき・結果発表など）を追加しやすい設計にしてほしい, so that ユーザー体験を段階的に改善できる

#### Acceptance Criteria
1. The 抽選アンナちゃん shall 初期実装ではコマンド実行後すぐに結果を返す
2. The 抽選アンナちゃん shall Discord interaction のタイムアウトを回避するため、応答の遅延に対応した設計にする

### Requirement 11: セキュリティとシークレット管理
**Objective:** As a 運用者, I want 秘密情報がリポジトリに含まれないようにしたい, so that トークンの漏洩を防げる

#### Acceptance Criteria
1. The 抽選アンナちゃん shall Bot トークン、公開鍵、アプリケーション ID、ギルド ID をリポジトリ外で管理する
2. The 抽選アンナちゃん shall 必要なシークレットの一覧と設定手順を `.env.example` またはドキュメントで提供する
3. The 抽選アンナちゃん shall Discord からの HTTP リクエストの署名を検証し、不正なリクエストを拒否する

### Requirement 12: CI/CD によるデプロイ自動化
**Objective:** As a 開発者, I want main ブランチへの push で自動デプロイされてほしい, so that 手動デプロイの手間とミスを減らせる

#### Acceptance Criteria
1. When main ブランチに push された場合, the CI/CD shall ビルドとテストを実行する
2. When ビルドとテストが成功した場合, the CI/CD shall 自動的にデプロイを実行する
3. If ビルドまたはテストが失敗した場合, the CI/CD shall デプロイを実行せずに失敗を通知する

### Requirement 13: スラッシュコマンド登録
**Objective:** As a 運用者, I want スラッシュコマンドを Discord に登録する手段がほしい, so that Bot を初期セットアップできる

#### Acceptance Criteria
1. The 抽選アンナちゃん shall `/anna_start`、`/anna_pick`、`/anna_end` の全コマンドを Discord API に登録するためのスクリプトを提供する
2. The 抽選アンナちゃん shall コマンド登録スクリプトの実行手順をドキュメントに記載する
