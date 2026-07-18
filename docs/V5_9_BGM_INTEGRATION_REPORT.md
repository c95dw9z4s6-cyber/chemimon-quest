# Chemion Quest v5.9 BGM刷新・統合監査レポート

## 実装内容

- 通常Stage曲を `assets/audio/chemion-normal-bgm.mp3` の新曲へ全面刷新。
- 難関Stage曲を `assets/audio/chemion-difficult-bgm.mp3` として追加。
- `currentStageDefinition().milestone` またはStage番号が5の倍数の場合に難関曲を選択。
- v5.9時点ではStage 5が難関曲、Stage 1〜4・6〜9が通常曲。
- Stage切替時は新しい曲の先頭へ戻す。
- BGM ON/OFF・音量・セーブコード移行・タブ非表示時停止は維持。
- 2曲をService Workerと検証付き `chemion-release.zip` に含める。

## v6.0へ残すもの

- Stage 10本体。
- Au出現後の専用ラスボスBGM。
- 王水調製とBOSS HPフェーズに応じた曲展開・切替。

## 互換性

- セーブバージョン31のまま。
- Stage 1〜9の戦闘値・難易度・報酬を変更しない。
- 基本620問、難問340問、実戦40小問を維持。

## Web実装方針

- 長尺BGMはHTMLMediaElementで再生する。
- ユーザー操作後に再生を開始し、自動再生制限へ対応する。
- `visibilitychange` で非表示時に停止し、不要なバックグラウンド再生を避ける。
- `preload=metadata` を維持し、初期読み込みで2曲を同時に強制取得しない。
