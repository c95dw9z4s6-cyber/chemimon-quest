# Chemion Quest 新チャット引き継ぎメモ

## 現在の最新版

- バージョン: v6.0
- リリース名: 黄金王・Au反応区
- 公開URL: `https://c95dw9z4s6-cyber.github.io/chemimon-quest/`
- 内部セーブバージョン: 32
- 基本問題: 620問
- 難問: 340問
- 実戦問題: 8大問・40小問

## v6.0の主要変更

- Stage 10「黄金王・Au反応区」を追加しました。Au撃破が専用の勝利条件です。
- HNO₃ 1体とHCl 3体を近距離で維持して王水を調製できます。王水は独立Lv.1〜10です。
- Auの低反応性、Feの物理攻撃、王水の時間分割6ヒット、V16 loopを実装しました。
- v5.95以前の保存をセーブ形式32へ移行し、Stage 1〜9、学習記録、ゲストアシストを維持します。

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
- 通常Stage BGM: `assets/audio/chemion-normal-bgm.mp3`
- 難関Stage BGM: `assets/audio/chemion-difficult-bgm.mp3`

編集後は`npm run release`を実行します。生成済み`index.html`を直接修正しません。v5.2以降のGitHub Pagesは、検査済み`chemion-release.zip`だけを空の公開領域へ展開して公開します。

## 維持するゲーム仕様

- Firebase、匿名認証、ランキング、ニックネーム、公開要望（ログイン済みの全ユーザーが状態変更・削除可能）
- Stage 1〜9、研究カード、飛行型（表示＋42px）、二段階BOSS
- 通常Stage／5の倍数Stageの自動BGM切替、独立BGM設定・音量、非表示時自動停止、オフライン再生
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
6. `npm run test:package`で単一公開ZIPの拒否試験を確認
7. 公開後にSafariまたはChromeで版表示、旧セーブ移行、ランキング、必須更新を確認

## 次回の依頼文

> Chemion Quest v6.0の続きです。添付した一式ZIPを最新版の基準にしてください。NEW_CHAT_HANDOFF.mdと監査仕様を維持し、指定した次版を実装してください。生成済みindex.htmlを直接編集せず、config・data・srcを編集してnpm run releaseを実行し、検査済みのindex.html、一式ZIP、README、監査レポートをください。


## v4.5

- 基本520問・難問280問。追加70問は半反応式。
- 飛行型の時間経過自傷は廃止。
- Stage 6「弱酸遊離区」を追加。敵は弱酸由来100％、第5ユニットは強酸。
- Stage 6 BOSSは予告後に弱酸由来イオンを召集。
- ゲーム内履歴へv3.8〜v4.45を補完。


## v4.6

- Stage 7「弱塩基遊離区」を追加。
- 敵は弱塩基由来陽イオン100％、第5ユニットはKOH（強塩基）。
- BOSS N₂H₅⁺は予告後に弱塩基由来イオンを召集。
- Stage 6クリア済みセーブからStage 7を自動解放。


## v5.0

- Stage 8「蓄積急襲区」を追加。
- Wave 10のO₃ BOSSは第二形態なし・HP420・速度60。出現時に戦闘を停止し、全味方を消去してから通常BOSS演出後に再開。
- Energy上限強化をLv.12・最大265へ拡張。Lv.3で130となり、125以上の蓄積攻略が可能。
- Stage 7クリア済み旧セーブからStage 8を自動解放。

- Stage 8の全味方消去時は召喚クールタイムも0へ戻るため、蓄積Energyから直ちに再展開できます。


## v5.1

- 設定と学習記録画面から、学習データだけを初期化できます。
- 正誤回数、習熟度、問題ごとの復習予定、間違い復習、直近出題履歴を削除します。
- コイン、Stage進行、解放、強化、実績、実戦問題の初回報酬記録は維持します。
- 誤操作防止のため「初期化する」の確認語入力が必要です。


## v5.2

- GitHub Pagesの公開元を、リポジトリ内の多数ファイルから単一の`chemion-release.zip`へ変更。
- v5.2への初回移行では`.github/workflows/pages.yml`、`scripts/verify_release_package.py`、`chemion-release.zip`の3ファイルを同じコミットで配置する。
- v5.3以降は原則`chemion-release.zip`だけを置き換える。
- Actionsは空の領域へ展開し、ファイル一覧、SHA-256、サイズ、危険なパス、版整合性を確認してからPagesへ公開する。
- 失敗したコミットは公開されないため、正常な旧版が維持される。
- 通常曲は5の倍数以外、難関曲はStage 5・10・15など5の倍数で使用する。Stage 10はAu出現後に専用曲へ切り替える。

## v5.3

- Stage選択画面の各Stageへ攻略ボタンを追加。
- 敗北画面へ攻略導線と直前の敗北分析を追加。
- Stage 1〜8の特殊ルール、危険な敵、推奨役割、化学相性、BOSS対策、Energy目安を`data/game-core.json`の`stageGuides`で管理。
- `cumulativeStats.stage1Defeats`〜`stage8Defeats`を追加し、敗北回数に応じて段階式ヒントを表示。
- 攻略画面から再挑戦可能。セーブ形式は31のまま。


## v5.4

- Stage 9「近接反応・射程封鎖区」を追加。Stage 8クリア後に解放。
- `stage9.rules.disableRangedAllyAttacks`で遠距離攻撃を禁止し、`rangedAttack: true`の味方は解放後も召喚不可。
- 回復は攻撃ではないため、H₂Oの回復は使用可能。
- Mg・Al・Fe・H₂Oを主軸とし、Ag⁺はルール確認用の遠距離ユニット。
- BOSS BaSO₄は第二形態・召集なしの高耐久重装型。
- `stage9Clears`・`stage9Defeats`を追加し、Stage 8クリア済み旧セーブはStage 9を自動解放。
- セーブ形式31、既存840問、Stage 1〜8の戦闘値は変更なし。

## v5.5

- v5.9で通常Stage用120秒曲と5の倍数用96秒難関曲へ刷新し、Stage選択に応じて自動切替。
- `bgmAudio`は初回ユーザー操作後に再生し、タブ非表示時は停止。
- `chemionQuestBgmV1`と`chemionQuestBgmVolumeV1`でON/OFF・音量を保存。
- 効果音設定とは独立し、セーブコード移行にも含める。
- 公開ZIP・Service Workerキャッシュへ音源を含める。
- セーブ形式31、840問、Stage 1〜9の戦闘値は変更なし。

## v5.6

- 通常描画最大45fps、低電力モード最大30fps。
- DOMの戦闘UI更新は通常10fps、低電力5fps。
- 低電力時はパーティクル・発光・ぼかし・影・画面揺れを削減するが、戦闘計算は同一。
- `chemionQuestLowPowerV1`で保存し、セーブコードにも含める。
- ポーズ・クイズ・設定中は低頻度描画、非表示時は戦闘・描画・BGM停止。
- セーブ形式31、840問、Stage 1〜9の戦闘値は維持。

## v5.7

- 図鑑案は実装せず廃止しました。図鑑用のセーブ項目やコードは追加していません。
- 設定画面を「学習・プレイ」「音・表示」「セーブ・アカウント」「サポート・情報」「データ管理」の5分類へ整理しました。
- 音・表示だけを初期状態で開き、よく使う効果音・BGM・低電力をすぐ操作できます。
- 学習データ初期化とセーブ削除を注意領域へ分離しました。
- 既存機能、セーブ形式31、840問、Stage 1〜9の戦闘値は変更していません。

## v5.8

- Webで高校化学範囲と化学用語を確認し、基本100問・難問60問を独自作成しました。
- 基本620問・難問340問・実戦40小問の合計1000問相当へ拡充しました。
- 金属、不動態、H₂O₂、Au・Pt・王水、電子配置・軌道を重点化しました。
- 否定形の単一正解、選択肢重複、軌道の前提説明、参照根拠を自動監査します。
- Stage 1〜9、セーブ形式31、戦闘値、低電力モードは維持し、BGMのみStage別2曲へ刷新しました。

## v5.8〜v6.0 開発ロードマップ

詳細は `docs/ROADMAP_V5_3_TO_V6_0.md` を参照してください。

- v5.7：設定画面の整理【実装済み】
- v5.8：Stage 10学習準備・総問題数1000【実装済み】
- v5.9：BGM刷新・v6.0直前の統合監査【実装済み】
- v6.0：調製・王水・Stage 10「Au／金」

v5.8では既存840問相当に160問を追加し、基本620問・難問340問・実戦40小問の合計1000問相当としました。既存問題IDは変更していません。


## v6.1以降：Pt希少敵の確定仕様

- Stage 11以降、低確率でPt（白金）が出現する。v6.0のStage 10には出さない。
- Ptは通常攻撃から1ヒットにつき1ダメージだけ受ける。多段攻撃は全ヒットが各1ダメージとして通る。
- 王水だけは上限を無視して通常ダメージを与える。HCl・HNO₃単体は1ダメージのまま。
- 通常の変異体システムは先送りし、Ptは貴金属系希少敵という別枠にする。
