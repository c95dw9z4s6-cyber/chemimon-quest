# Chemion Quest 新チャット引き継ぎメモ

## 現在の最新版

- バージョン: v3.7
- リリース名: 開発効率化アップデート
- 公開URL: `https://c95dw9z4s6-cyber.github.io/chemimon-quest/`
- 内部セーブバージョン: 27
- 基本問題: 320問
- 難問: 182問

## v3.7の主要変更

- 通常問題、難問、ゲーム設定をdataフォルダーのJSONへ分離しました。
- config/release.jsonの1か所を基準に、ゲーム画面、version.json、Service Worker、README、引き継ぎ文書へ版情報を自動反映します。
- npm run releaseで、生成・構文検査・問題検査・出題分散試験・配布フォルダー・ZIP作成まで一括実行します。
- 生成済みファイルと開発元データの不一致をGitHub Actionsで検出し、検査に失敗した版は公開しません。
- ゲーム内容、基本問題320問、難問182問、内部セーブバージョン27、Firebase、ランキング、PWA、必須更新を維持しました。

## 開発元の基準

`index.html`は生成物です。次回以降は、以下を基準に編集してください。

- 版情報・更新説明: `config/release.json`
- 通常問題: `data/basic-questions.json`
- 難問: `data/hard-questions.json`
- 問題以外のゲーム設定: `data/game-core.json`
- HTML・JavaScript・CSS: `src/index.template.html`
- Service Worker: `src/sw.template.js`

編集後は`npm run release`を実行します。生成済み`index.html`だけを直接修正すると、`npm run validate`とGitHub Actionsが不一致として停止します。

## 維持するゲーム仕様

- Firebase、匿名認証、ランキング、ニックネーム、公開要望
- Stage 1〜5、研究カード、飛行型、二段階BOSS
- 専用倍速試験、ポーズ、中断保存、セーブコード
- 学習記録、練習、復習、段階ヒント、習熟度
- 同一問題30問、近似問題20問、同じ類題グループ8問の出題分散
- 難問の出典表示、化学式直後の句点分離
- PWA、オフライン起動、5分ごとの更新確認、必須アップデート
- localStorageとセーブコードの既存互換

## 必須検査

1. `npm run build`
2. `npm run validate`
3. `npm run release`
4. `release/`内のZIP破損確認
5. 公開後にSafariまたはChromeで版表示、セーブ、ランキング、必須更新を確認

## 次回の依頼文

> Chemion Quest v3.7の続きです。添付した一式ZIPを最新版の基準にしてください。NEW_CHAT_HANDOFF.mdを維持し、指定した次版を実装してください。生成済みindex.htmlを直接編集せず、config・data・srcを編集してnpm run releaseを実行し、検査済みのindex.html、一式ZIP、READMEをください。
