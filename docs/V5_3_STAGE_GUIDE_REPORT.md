# Chemion Quest v5.3 Stage攻略情報 実装レポート

## 実装内容

- Stage選択画面のStage 1〜8に攻略ボタンを追加。
- 敗北画面へ攻略情報ボタンを追加。
- Stage特殊ルール、危険な敵、推奨役割、化学相性、BOSS対策、Energy・強化目安をデータ化。
- Stage別敗北回数を保存し、0回・1回・3回以上の段階式ヒントを表示。
- 直前のWave、味方撃破数、拠点被害、Stage 8のBOSS到達状況を使う簡易敗北分析を追加。
- 攻略画面から同じStageへ直接再挑戦する導線を追加。

## 互換性

- 内部セーブバージョンは31のまま。
- 旧セーブに敗北回数がない場合は0回として補完。
- 基本520問、難問280問、実戦8大問・40小問を維持。
- Stage 1〜8のユニット、敵、Wave、戦闘バランス、化学相性は変更なし。

## 検査

- `npm run build:check`
- `npm run validate`
- `npm run audit`
- `npm run audit:questions`
- `npm run audit:chemistry`
- `npm run test:features`
- `npm run test:rotation`
- `npm run test:browser`
- `npm run verify:package`
- `npm run test:package`

ブラウザ試験では、Stage 6の攻略ボタンからモーダルを開き、弱酸の遊離情報、初回ヒント、閉じる操作を確認する。
