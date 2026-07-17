# Chemion Quest 開発構成（v3.7以降）

## 基本方針

公開用`index.html`は自動生成物です。直接編集せず、目的に応じて`config/`、`data/`、`src/`を変更します。

## 変更内容ごとの編集場所

| 変更したい内容 | 編集するファイル |
|---|---|
| バージョン、日付、更新説明 | `config/release.json` |
| 通常問題 | `data/basic-questions.json` |
| 難問、出典、Stage Tier | `data/hard-questions.json` |
| ユニット、敵、Stage、ゲーム設定 | `data/game-core.json` |
| UI、戦闘、学習、Firebase、更新処理 | `src/index.template.html` |
| オフラインキャッシュ | `src/sw.template.js` |
| README・引き継ぎ書式 | `src/*.template.md` |
| 自動検査 | `scripts/validate.mjs` |
| 出題分散試験 | `scripts/test-rotation.mjs` |
| GitHub Pages公開 | `.github/workflows/pages.yml` |

## 通常の開発手順

1. 対象の開発元ファイルを編集する。
2. `config/release.json`の版情報と説明を更新する。
3. `npm run build`で公開用ファイルを生成する。
4. `npm run validate`で検査する。
5. `npm run release`で配布フォルダー・ZIPを作る。

`npm run release`は1〜5のうち、生成・検査・配布物作成を一括で行います。

## 検査内容

- 生成物と開発元の同期
- 版表記・セーブバージョン
- HTML重複ID
- すべてのインラインJavaScriptとService Workerの構文
- 通常問題・難問の問題数、4択、正答番号、範囲、解説
- 難問のStage Tier・出典・ID重複
- 同一・近似・類題グループの出題分散
- Manifest、version.json、アイコン寸法、PWA資産
- 必須更新画面と「あとで」ボタン非存在

## 公開物と開発物

GitHub Pagesへは`.github/workflows/pages.yml`が次だけをコピーします。

- `index.html`
- `manifest.webmanifest`
- `version.json`
- `sw.js`
- `.nojekyll`
- `icons/*.png`

開発用JSONやテンプレートは公開サイトから直接配信されません。

## セーブ互換

`config/release.json`の`saveVersion`と`data/game-core.json`の`version`は必ず一致させます。ゲーム内容の整理だけではセーブバージョンを上げません。保存形式を変える場合だけ移行処理を追加し、両方を更新します。
