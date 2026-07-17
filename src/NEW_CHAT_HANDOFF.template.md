# Chemion Quest 新チャット引き継ぎメモ

## 現在の最新版

- バージョン: v__APP_VERSION__
- リリース名: __RELEASE_NAME__
- 公開URL: `https://c95dw9z4s6-cyber.github.io/chemimon-quest/`
- 内部セーブバージョン: __SAVE_VERSION__
- 基本問題: __BASIC_COUNT__問
- 難問: __HARD_COUNT__問
- 実戦問題: __MOCK_COUNT__大問・__MOCK_QUESTION_COUNT__小問

## v__APP_VERSION__の主要変更

__RELEASE_NOTES__

## 開発元の基準

`index.html`は生成物です。次回以降は以下を編集してください。

- 版情報: `config/release.json`
- 必須機能一覧: `config/features.json`
- 通常問題: `data/basic-questions.json`
- 難問: `data/hard-questions.json`
- 実戦問題: `data/mock-exams.json`
- ゲーム設定・実績: `data/game-core.json`
- HTML構造: `src/index.template.html`
- CSS: `src/styles/*.css`
- 戦闘・クイズ・学習・セーブ: `src/scripts/game-runtime.js`
- Firebase・ランキング: `src/scripts/online-runtime.js`
- PWA・必須更新: `src/scripts/pwa-runtime.js`
- Service Worker: `src/sw.template.js`

編集後は`npm run release`を実行します。生成済み`index.html`を直接修正すると、GitHub Actionsが不一致として停止します。

## 維持するゲーム仕様

- Firebase、匿名認証、ランキング、ニックネーム、公開要望（ログイン済みの全ユーザーが状態変更・削除可能）
- Stage 1〜5、研究カード、飛行型（表示＋42px）、二段階BOSS
- 二段階BOSSは第1形態撃破時に全戦闘を停止し、専用変身演出後に通常BOSS出現演出を再度再生してから再開
- 専用倍速試験、誤答後30秒制限、ポーズからWave 1再開
- 学習記録、練習、復習、段階ヒント、習熟度
- 誤答12時間、正答3・7・14・30・45・60日の間隔反復
- 同一問題30問、近似問題20問、同じ類題グループ8問の出題分散
- 実戦問題8大問・40小問と次回バトル報酬
- 難問の出典表示、化学式直後の句点分離
- 中和は演出のみでダメージ倍率変化なし
- 強酸→弱酸由来陰イオン、強塩基→弱塩基由来陽イオンのみ遊離相性1.4倍
- 弱酸・弱塩基そのものは遊離相性の対象外。反応式は`liberationReaction`で管理
- PWA、オフライン起動、必須アップデート
- v3.95のセーブバージョン30を含む既存セーブ互換。Stage 5クリア済み旧セーブはstage5Clearsを自動補完

## 必須検査

1. `npm run build`
2. `npm run validate`
3. `npm run release`
4. `docs/IMPLEMENTATION_AUDIT.md`、`docs/QUESTION_QUALITY_REPORT.md`、`docs/CHEMISTRY_AUDIT.md`を確認
5. 配布ZIPを別フォルダーへ展開し、`npm run build:check`と`npm run validate`
6. 公開後にSafariまたはChromeで版表示、旧セーブ移行、ランキング、必須更新を確認

## 次回の依頼文

> Chemion Quest v__APP_VERSION__の続きです。添付した一式ZIPを最新版の基準にしてください。NEW_CHAT_HANDOFF.mdと監査仕様を維持し、指定した次版を実装してください。生成済みindex.htmlを直接編集せず、config・data・srcを編集してnpm run releaseを実行し、検査済みのindex.html、一式ZIP、README、監査レポートをください。
