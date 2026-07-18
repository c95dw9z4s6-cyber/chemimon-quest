# v6.1 Stage 1〜10回帰報告

`scripts/stage1-10-v6.0-baseline.json`へ正式v6.0のStage 1〜10、economy、既存3音源のSHA-256を固定し、v6.1と比較しました。

- Stage 1〜10 gameplay定義: 全hash一致
- economy: hash一致
- 通常BGM、難Stage BGM、正式V16: hash一致
- Stage 1〜9 BGM割当: 変更なし
- Stage 5: 変更なし
- Stage 10通常難易度simulation: 合格
- 既存Stage 10 tests: 35/35、browser 26/26
- 全画面browser smoke: 合格

v6.1で変えたのはStage 10の表示・TA隔離・BGM routing・演出であり、敵、味方、Wave、報酬、価格、戦闘balance定義は変えていません。
