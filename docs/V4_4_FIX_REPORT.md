# Chemion Quest v4.4 修正レポート

## 要望一覧

- 投稿者本人は自分の要望を「実装済み／検討中」へ切り替え、削除可能。
- `requestAdmins/{uid}`に`enabled: true`がある管理者は全要望を管理可能。
- Firestoreルールは変更可能フィールドを`status`、`implementedAt`、`implementedBy`に限定。

## 飛行表示

- 全飛行エンティティの描画Y座標を従来から42px上へ移動。
- 攻撃判定、レーン、射程、当たり判定の中心計算は描画Yと同期。

## Stage 5実績

- `stage5_clear`は`stage5Clears >= 1`で判定。
- `highestStageCleared >= 5`の旧セーブは`stage5Clears`を最低1へ補完。

## 再生産クールタイム

- 残り0.05秒以下を即時0へ正規化。
- 0.1秒ごとにボタンの表示、被せ表示、召喚可能状態を更新。
- 表示とクリック時判定は同じ`summonCooldownRemaining()`を使用。
