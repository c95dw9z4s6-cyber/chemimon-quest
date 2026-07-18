# Chemion Quest v6.1 実装報告

作成日: 2026-07-19 JST

## 結論

正式v6.0コミット`0f9d6e9496d381d8110de586c84eae59412ca1e5`だけを基準に、v6.1のローカル実装、公開候補ZIP、静的試験、ブラウザ試験、Firestore emulator試験を完了しました。

本番公開は未実行です。Firebase CLI v15.24.0で`login:list`と`projects:list`を確認したところ認証済みアカウントがなく、仕様の公開停止条件に該当しました。`production-before-v6.1`、main更新、Pages更新、Firebase deploy、正式`v6.1`タグは作成していません。

## 実装内容

- 通常Stage 10クリア後に解放される、通常セーブと分離したStage 10タイムアタック。
- `performance.now()`による計測、走行ID、異常値・reload・background・error・guest assist・test状態の公式無効化。
- `stage10TimeAttack/{uid}`に各プレイヤー最速1件だけを保持する専用ランキング。
- Wave 1〜9の正式V3、Au形成完了後の正式V16 loop、同時再生・不要restart防止。
- Au形成、重量移動、金塊圧撃、金箔展開、王水調製、王水移動、Au専用6段階反応。
- 60 FPS目標、低電力30 FPS、reduced motion、粒子削減、Stage再入場時の一時AudioNode停止・解放。
- save version 33への冪等移行。v6.0の通常進行・学習・設定・王水・guest assistを保持。

## 対象外の維持

Stage 11以降、Pt希少敵、通常変異体、新調製物、装備、クリティカル、レア研究カード、Stage間素材、対人戦、マルチ要素は実装していません。

## 検証結果

- validate: 620 basic / 340 hard / 8 mock exams / 40 subquestions
- feature audit: 40/40
- Stage 10既存: 35/35、ブラウザ26/26
- v6.1 Stage 10: 43/43、ブラウザ23/23
- TA ranking: 11/11
- Firestore rules emulator: 8/8
- 音源hash・全PCM decode: 2/2
- 全画面ブラウザsmoke: 合格（初回5秒待機の環境揺らぎを再現後、演出待機上限を10秒へ補強して再合格）
- 公開ZIP: 13 files、build `12052dc62a73342eb63b`、拒否試験合格

詳細は`V6_1_REQUIREMENTS_CHECKLIST.md`と各専用レポートを参照してください。
