# Chemion Quest 開発構成（v4.6）

## 基本方針

公開用`index.html`は自動生成物です。直接編集せず、`config/`、`data/`、`src/`を変更します。v4.0で開発元を分割し、v4.1でボス出現演出、v4.2で二段階BOSSの形態移行、v4.3で化学相性と反応表記の監査層を追加し、v4.4で要望管理・飛行表示・Stage 5実績・再生産クールタイムの回帰修正を追加し、v4.45で要望管理を全ユーザー方式へ変更し、v4.5で半反応式・飛行型調整・Stage 6を追加しました。

## 編集場所

| 変更内容 | ファイル |
|---|---|
| 版情報・更新説明 | `config/release.json` |
| 必須機能一覧 | `config/features.json` |
| ゲーム設定・ユニット・敵・Stage | `data/game-core.json` |
| 基本・難問・実戦問題 | `data/*.json` |
| HTML構造・遊び方 | `src/index.template.html` |
| 戦闘・相性・反応演出 | `src/scripts/game-runtime.js` |
| CSS | `src/styles/*.css` |
| Firebase・ランキング | `src/scripts/online-runtime.js` |
| PWA | `src/scripts/pwa-runtime.js` |
| 総合検査 | `scripts/validate.mjs` |
| 化学監査 | `scripts/audit-chemistry.mjs` |
| 機能監査 | `scripts/audit-features.mjs` |
| 問題品質監査 | `scripts/audit-questions.mjs` |

## v4.3の相性データ

`chemistryClass`は酸・塩基・酸化還元などの実際の分類、`chemistryLabel`は画面表示、`affinityTarget`は遊離相性の対象を表します。

- `weak_acid_conjugate_base`: 弱酸の塩に由来する陰イオン
- `weak_base_conjugate_acid`: 弱塩基の塩に由来する陽イオン
- `liberationReaction`: 攻撃時に表示する平衡・反応式
- `projectileLabel`: 戦闘中の飛翔表示。Stage 3だから一律`e⁻`にはしません。

相性判定は次だけです。

- 味方の強酸 → `weak_acid_conjugate_base`: 1.4倍
- 味方の強塩基 → `weak_base_conjugate_acid`: 1.4倍
- その他: 1.0倍

弱酸・弱塩基そのものは「遊離」の対象ではありません。

## v4.3で修正した主な化学表現

- CH₃COOH敵をCH₃COO⁻「酢酸イオン」へ変更
- NH₃敵をNH₄⁺「アンモニウムイオン」へ変更
- 炭酸BOSSをHCO₃⁻「炭酸水素イオン」へ変更
- Stage 3 BOSSをClO⁻からCl⁻への還元半反応へ変更
- H₂O₂ BOSSを弱酸扱いから酸化還元属性へ変更
- SO₄²⁻、I⁻、Cl⁻を弱塩基扱いしない
- Al(OH)₃を両性、CO₂・SO₂を酸性酸化物として表示
- Na₂CO₃を強塩基ユニットとして扱っていた箇所をBa(OH)₂へ置換
- Stage 3の全攻撃を一律`e⁻`で表示する処理を廃止
- 難問12問の単位・用語が壊れた解説を修正

詳細は`docs/CHEMISTRY_AUDIT.md`を参照してください。

## 開発・検査

```bash
npm run build
npm run validate
npm run audit:chemistry
npm run test:browser
npm run release
```

`npm run validate`は生成同期、JavaScript構文、770問、数値選択肢、出題分散、機能回帰、化学監査をまとめて実行します。

## セーブ互換

内部セーブバージョンは31のままです。v4.3は静的なユニット・敵データと表示ロジックの変更であり、コイン、解放、強化、Stage、実績、学習記録、実戦問題記録を維持します。

## 公開物

GitHub Pagesで配信する主なファイルは`index.html`、`manifest.webmanifest`、`version.json`、`sw.js`、`.nojekyll`、`icons/*.png`です。開発用JSON・分割ソース・監査文書もリポジトリへ保存します。

## v4.45の要望管理

- 匿名認証を含むログイン済みの全ユーザーが、すべての要望の状態変更と削除を行えます。
- `requestAdmins`コレクションと管理者ID設定は使用しません。
- 更新可能なフィールドは`status`、`implementedAt`、`implementedBy`だけです。
- 削除は元に戻せないため、ゲーム内で確認画面を表示します。

## v4.4の戦闘表示・進行修正

- 飛行型の描画Y座標へ`FLYING_EXTRA_RENDER_OFFSET = 42`を追加しました。
- Stage 5クリア実績は`stage5Clears`を専用指標とし、旧セーブでは`highestStageCleared >= 5`から補完します。
- 再生産は`summonCooldownRemaining()`を表示と召喚判定の共通基準とし、0.1秒周期でボタン状態を同期します。


## v4.5 Stage 6・半反応式

- `data/game-core.json`へ`stage6`を追加しました。
- Stage 6の全敵は`weak_acid_conjugate_base`を持ち、第5ユニットは`strong_acid`です。
- BOSS召集は`bossSummonInterval`、`bossSummonWarning`、`bossSummonCount`、`bossSummonPool`でデータ駆動します。
- 飛行型の`selfDamagePerSecond`をデータ・処理・表示から削除しました。
- 半反応式は基本40問・難問30問を追加し、基本520問・難問280問です。


## v4.6 Stage 7

- `data/game-core.json`へ`stage7`を追加しました。
- Stage 7の全敵は`weak_base_conjugate_acid`を持ち、第5ユニットは`strong_base`です。
- Stage 6とStage 7のBOSS召集表示を、敵の遊離対象に応じて弱酸／弱塩基へ切り替える共通処理にしました。
- `highestStageCleared >= 6`の旧セーブは、Stage 7を自動解放します。
