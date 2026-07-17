# Chemion Quest 新チャット引き継ぎメモ

## 現在の最新版

- バージョン: v3.6.1
- 基準ファイル: `index.html`
- 公開URL: `https://c95dw9z4s6-cyber.github.io/chemimon-quest/`
- 内部セーブバージョン: 27（v3.5と同じ）
- Firebase・匿名認証・ランキング・セーブ互換を維持すること
- `firestore.rules`は同梱済み。v3.6.1では変更なし

## v3.6.1の主要変更

- 更新通知の「あとで」を廃止。新版検出時は全画面ロックし、セーブ後に自動更新する。
- 更新準備中もゲーム操作は不可。失敗時は再試行のみ。
- 自動確認はオンライン中5分ごと、フォーカス復帰時は最短1分間隔。

- Web App Manifest、192px・512px・maskableアイコン、Apple Touch Iconを追加
- Service Workerによるオフライン起動を追加
- ナビゲーションはnetwork-first、失敗時にキャッシュ済み`index.html`へフォールバック
- キャッシュ名は`chemimon-quest-`接頭辞に限定し、同一GitHub Pagesオリジン上の他サイトのキャッシュを削除しない
- 新しいService Workerは待機し、ユーザーが「更新する」を押した場合だけ`SKIP_WAITING`を送る
- 更新時は可能な範囲で`saveGame({silent:true})`を呼んでから再読み込み
- `version.json`をno-storeで確認し、長時間起動中も1時間ごとに更新確認
- 設定に「アプリ・更新」を追加
- オフライン状態表示を追加
- GitHub Actionsで検査後にGitHub Pagesへ公開する`.github/workflows/pages.yml`を追加
- `scripts/validate.mjs`で版表記、重複HTML ID、全インラインJS構文、問題データ、PWA資産を検査

## v3.5までの維持仕様

- Stage 1〜5、Stage 3以降の研究カード、Stage 5難関ステージ
- 飛行型ユニット・敵・第二形態BOSS
- 専用倍速試験
- ポーズ、中断保存、ブラウザー再起動後の再開
- 効果音、操作チュートリアル、セーブコード
- 学習記録、練習、復習、段階ヒント、習熟度
- 基本問題320問・難問182問
- 同一問題30問、文章類似20問、同じ類題グループ8問の出題分散
- 難問の出典・参考資料表示
- 化学式直後の句点分離
- クリア後は場を初期化して第1ウェーブから再開

## PWA関連の重要仕様

- `sw.js`のURLは将来も変更せず、内容とキャッシュ名だけを更新する。
- インストール時に無条件の`skipWaiting()`を実行しない。
- `SKIP_WAITING`は更新通知のユーザー操作後だけ送る。
- `manifest.webmanifest`の`start_url`と`scope`はGitHub Pagesのプロジェクトサイト向けに`./`を維持する。
- PWA資産を変更したら`APP_SHELL`、manifest、`scripts/validate.mjs`も同期する。
- `version.json`のversionとHTML内`CURRENT_VERSION`を更新する。
- キャッシュ削除は`chemimon-quest-`で始まるものだけに限定する。
- Firebase CDNなどクロスオリジン通信をService Workerで独自キャッシュしない。

## 次回修正時の必須確認

1. この`index.html`を基準に編集し、既存機能を落とさない。
2. Firebase設定、匿名認証、ランキング、ニックネームを維持。
3. localStorageの既存セーブ互換とセーブコード互換を維持。
4. `node scripts/validate.mjs`を実行。
5. すべてのインライン`<script>`と`sw.js`の構文を確認。
6. 問題変更時は問題数、4択、正答番号、範囲、Stage Tier、出典、ID重複を検査。
7. 出題抽選変更時は通常問題・各Stage難問・人工類題プールで履歴テスト。
8. PWA変更時はmanifest JSON、アイコン寸法、Service Workerのprecacheパス、オフライン起動を確認。
9. 次版公開時は旧版を開いた状態から更新通知→保存→切替→再読み込みを実機確認。
10. ZIPを作り、`zipfile.testzip()`で破損確認。
11. 実ブラウザー・Firebase・実際のGitHub Actionsを未確認なら、その旨を明記。

## ユーザーへの納品形式

- `index.html`
- 一式ZIP（PWA資産とGitHub Actionsを含む）
- `README.md`
- Firestoreルール変更が必要な場合のみ変更点を明記

## 新チャット最初の依頼文

> Chemion Quest v3.6.1の続きです。添付したindex.htmlを最新版の基準にしてください。NEW_CHAT_HANDOFF.mdの仕様を維持し、私が指定した次のバージョンを実装してください。既存セーブ、Firebase、ランキング、学習機能、Stage 1〜5、出題分散、PWA、必須更新を壊さず、JavaScript構文・問題データ・PWA資産・ZIP破損を検査して、index.htmlとZIPとREADMEをください。
