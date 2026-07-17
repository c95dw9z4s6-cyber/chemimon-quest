# Chemion Quest 新チャット引き継ぎメモ

## 現在の最新版

- バージョン: v__APP_VERSION__
- リリース名: __RELEASE_NAME__
- 公開URL: `https://c95dw9z4s6-cyber.github.io/chemimon-quest/`
- 内部セーブバージョン: __SAVE_VERSION__
- 基本問題: __BASIC_COUNT__問
- 難問: __HARD_COUNT__問

## v__APP_VERSION__の主要変更

__RELEASE_NOTES__

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

> Chemion Quest v__APP_VERSION__の続きです。添付した一式ZIPを最新版の基準にしてください。NEW_CHAT_HANDOFF.mdを維持し、指定した次版を実装してください。生成済みindex.htmlを直接編集せず、config・data・srcを編集してnpm run releaseを実行し、検査済みのindex.html、一式ZIP、READMEをください。
