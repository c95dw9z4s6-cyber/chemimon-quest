# Chemion Quest v__APP_VERSION__

公開URL: https://c95dw9z4s6-cyber.github.io/chemimon-quest/

## __RELEASE_NAME__

__RELEASE_NOTES__

## 今後の開発で使うコマンド

```bash
npm run build
npm run validate
npm run release
```

- `npm run build` — 開発元データから公開用`index.html`、`sw.js`、`version.json`、文書を生成
- `npm run validate` — 生成同期、JavaScript構文、問題データ、出題分散、PWA資産を検査
- `npm run release` — buildとvalidateを実行し、`release/`へ配布用フォルダーとZIPを作成

版を変更する場合は、`config/release.json`の`version`、`releaseDate`、リリース名・説明を変更してから`npm run release`を実行します。通常問題は`data/basic-questions.json`、難問は`data/hard-questions.json`を編集します。生成済みの`index.html`を直接編集しないでください。

## GitHubへの公開

このフォルダーの中身を、フォルダー構成を保ったままリポジトリ直下へアップロードします。既にv3.6.1一式を置いている場合は、同名ファイルを上書きし、新しい`config/`、`data/`、`docs/`、`src/`、`package.json`、開発スクリプトも追加してください。

1. GitHubで`c95dw9z4s6-cyber/chemimon-quest`を開く。
2. **Add file → Upload files**で一式をアップロードする。
3. **Commit changes**を押す。
4. **Actions**で`Validate and deploy Chemion Quest`が緑になることを確認する。
5. 公開URLで`Chemion Quest v__APP_VERSION__`と表示されることを確認する。

## 公開対象

GitHub Pagesへ実際に配信されるのは、`index.html`、`manifest.webmanifest`、`version.json`、`sw.js`、`.nojekyll`、`icons/*.png`だけです。`data/`や`src/`などの開発用ファイルはリポジトリには保存されますが、公開物へは含めません。

## 維持仕様

- 内部セーブバージョン: __SAVE_VERSION__
- 基本問題: __BASIC_COUNT__問
- 難問: __HARD_COUNT__問
- Stage 1〜5、Firebase、匿名認証、ランキング、ニックネーム、学習機能を維持
- PWA、オフライン起動、必須アップデートを維持
- 同一問題30問、近似問題20問、類題グループ8問の出題分散を維持

## ファイル構成

- `config/release.json` — 版情報・問題数・リリース説明の唯一の基準
- `data/game-core.json` — 問題以外のゲーム設定
- `data/basic-questions.json` — 通常問題
- `data/hard-questions.json` — 難問
- `src/index.template.html` — ゲーム本体テンプレート
- `src/sw.template.js` — Service Workerテンプレート
- `scripts/build.mjs` — 公開用ファイル生成
- `scripts/validate.mjs` — 総合検査
- `scripts/release.mjs` — 配布物の一括生成
- `docs/ARCHITECTURE.md` — 修正箇所と開発手順
- `index.html`、`sw.js`、`version.json` — 自動生成される公開用ファイル
