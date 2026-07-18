# Chemion Quest v6.0 次チャット引継ぎ

## 正式基準

- 正式リポジトリ: `https://github.com/c95dw9z4s6-cyber/chemimon-quest`
- 公開URL: `https://c95dw9z4s6-cyber.github.io/chemimon-quest/`
- 正式版タグ: `v6.0`
- 公開前バックアップタグ: `production-before-v6.0`
- 内部セーブ形式: 32
- v6.0の実装基準: 正式v5.95 + Stage 10／王水／Au

## v6.0で実装済み

- Stage 10「黄金王・Au反応区」全10 Wave。
- HNO₃ 1体 + HCl 3体からの王水調製。
- 王水の独立Lv1〜10強化、時間分割6ヒット、Au初接触演出。
- Auの低反応性、物理二種、護衛召喚、Au撃破勝利。
- Stage 10専用BGM V16とPWAオフライン対応。
- v5.95・v5.0セーブから形式32への直接移行。
- Stage 1〜9、既存経済、ゲストアシストの維持。

## 次回作業の原則

- 次版の確定仕様だけを実装し、別チャットの暗黙の会話は推測しません。
- v6.1以降の参考情報は、その版の確定仕様として改めて提示されるまで実装しません。
- 編集前に本番URL、`main`、正式タグが一致することを確認します。
- 作業ブランチで実装し、必須テスト合格後だけバックアップタグ、main、Pagesの順に更新します。
- Firebaseは差分のあるサービスだけを対象指定し、差分がなければデプロイしません。
- 公開後スモークテスト失敗時は、追加承認を待たず公開前タグへロールバックします。

## 主要資料

- `docs/IMPLEMENTATION_REPORT_V6_0.md`
- `docs/CHEMISTRY_AUDIT_V6_0.md`
- `docs/DIFFICULTY_REPORT_V6_0.md`
- `docs/STAGE1_9_REGRESSION_V6_0.md`
- `docs/STAGE10_TEST_RESULTS.json`
- `docs/STAGE10_DIFFICULTY_RESULTS.json`
- `docs/BROWSER_STAGE10_RESULTS.json`

## 次回の開始指示例

> Chemion Questの次版を実装し、本番公開まで進めてください。正式なv6.0タグを唯一の実装ベースとし、このチャットに貼る確定仕様だけを実装してください。既存セーブ、Stage 1〜10、学習記録、ゲストアシスト、PWAを維持し、必須テスト合格後は恒久運用ルールに従って公開してください。
