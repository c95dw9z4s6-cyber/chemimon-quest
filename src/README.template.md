# Chemion Quest v__APP_VERSION__

公開URL: https://c95dw9z4s6-cyber.github.io/chemimon-quest/

## __RELEASE_NAME__

__RELEASE_NOTES__

## 問題数

- 基本問題: __BASIC_COUNT__問
- 難問: __HARD_COUNT__問
- 実戦問題: __MOCK_COUNT__大問・__MOCK_QUESTION_COUNT__小問
- 合計: 840問相当

## 開発コマンド

```bash
npm run build
npm run validate
npm run release
```

- `npm run build` — 分割された開発元から公開用`index.html`、`sw.js`、`version.json`、文書を生成
- `npm run validate` — 構文、全問題、問題品質、出題分散、過去機能、PWAを総合検査
- `npm run release` — buildとvalidateを実行し、`release/`へ配布フォルダーとZIPを作成
- `npm run audit` — 過去アップデートの必須機能を監査
- `npm run audit:questions` — 分野・問い方・正答位置・重複を分析
- `npm run audit:chemistry` — 遊離相性、反応式、正式名称、酸化還元BOSS、破損解説を監査
- `npm run test:features` — ポーズ再開、倍速制限、間隔反復、Stage 5実績、セーブ移行を回帰検査

生成済みの`index.html`を直接編集しないでください。

## GitHubへの公開

v4系ではファイル構成が増えているため、ZIP内の`chemion_v...`フォルダーの**中身全部**をリポジトリ直下へ上書き・追加します。

1. 現在のリポジトリを念のため`Code → Download ZIP`で保存する。
2. 最新版の一式ZIPを展開する。
3. GitHubの`c95dw9z4s6-cyber/chemimon-quest`で`Add file → Upload files`を開く。
4. ZIP内の`chemion_v...`フォルダーの中身を、フォルダー構成を保ってすべてアップロードする。
5. 同名ファイルは自動で上書きされる。先に全削除しない。
6. `.github/workflows/pages.yml`と`.nojekyll`が残っていることを確認する。
7. `Commit changes`を押す。
8. `Actions`の最新`Validate and deploy Chemion Quest`が緑になることを確認する。
9. 公開URLで`Chemion Quest v__APP_VERSION__`を確認する。
10. iPhone Safariで、旧セーブ読込、戦闘、ポーズ再開、倍速試験、実戦問題、ランキングを確認する。

途中のアップロード中にActionsが赤くなっても、全ファイルを入れ終えた最後の実行が緑なら問題ありません。

## 要望一覧の管理方式

v4.45以降では、匿名認証を含むログイン済みの全ユーザーが、すべての要望を「実装済み／検討中」へ変更し、削除できます。`requestAdmins`の登録や管理者IDの設定は不要です。

この権限変更を反映するため、GitHubへの通常更新に加えて、Firebase Consoleの`Firestore Database → ルール`で、同梱の`firestore.rules`を貼り付けて公開してください。削除は元に戻せないため、ゲーム内で確認画面を表示します。

## 維持仕様

- 内部セーブバージョン: __SAVE_VERSION__
- Stage 1〜8、Firebase、匿名認証、ランキング、ニックネーム、学習機能
- PWA、オフライン起動、必須アップデート
- 同一問題30問、近似問題20問、類題グループ8問の出題分散
- 長期記憶向けの間隔反復
- ポーズからWave 1再開、倍速試験の30秒制限
- 二段階BOSSの第1形態撃破後は、戦闘停止 → 専用変身演出 → BOSS出現演出再生 → 戦闘再開
- 強酸は弱酸由来陰イオン、強塩基は弱塩基由来陽イオンにのみ遊離相性1.4倍

## 主なファイル

- `config/release.json` — 版情報・期待問題数
- `config/features.json` — 過去機能監査一覧
- `data/*.json` — ゲーム・基本問題・難問・実戦問題
- `src/index.template.html` — HTML構造
- `src/styles/*.css` — CSS
- `src/scripts/*.js` — ゲーム・オンライン・PWA処理
- `scripts/*.mjs` — 生成・検査・監査・リリース
- `docs/IMPLEMENTATION_AUDIT.md` — 実装監査結果
- `docs/QUESTION_QUALITY_REPORT.md` — 問題品質レポート
- `docs/CHEMISTRY_AUDIT.md` — 化学相性・反応式・名称・問題解説の監査結果


## v4.5追加仕様

- 半反応式の基本40問・難問30問を追加しました。
- 飛行型の時間経過自傷ダメージを廃止しました。飛行高度・近接無効・対空弱点は維持します。
- Stage 6「弱酸遊離区」を追加しました。Stage 5クリア後に通常どおり解放されます。
- Stage 6の敵はすべて弱酸由来陰イオンで、第5ユニットの強酸が1.4倍です。
- Stage 6 BOSSは約20秒ごとに予告し、弱酸由来イオンを2〜3体召集します。
- ゲーム内アップデート履歴へv3.9〜v4.45の欠落分を追加しました。


## v4.6追加仕様

- Stage 7「弱塩基遊離区」を追加しました。Stage 6クリア後に通常どおり解放されます。
- Stage 7の敵はすべて弱塩基由来陽イオンで、第5ユニットKOHの強塩基が1.4倍です。
- Stage 7 BOSSは約20秒ごとに予告し、弱塩基由来イオンを2〜3体召集します。
- Stage 6をクリア済みの旧セーブは、読み込み時にStage 7を自動解放します。
- Firestoreルールはv4.45から変更していません。


## v5.0追加仕様

- Stage 8「蓄積急襲区」を追加しました。Stage 7クリア後に通常どおり解放されます。
- Wave 10のO₃ BOSSは第二形態なし・HP420・速度60です。Lv.MAX強襲型の速度50を上回ります。
- BOSS出現時は戦闘停止 → 全味方ユニット消去 → 黒いBOSS出現演出 → 戦闘再開の順で進みます。
- Energy上限はLv.12、最大265へ拡張しました。Lv.3で最大130となり、125以上を蓄えてBOSS後に再展開できます。
- Stage 7クリア済みの旧セーブはStage 8を自動解放します。
- Firestoreルールはv4.45から変更していません。

- Stage 8の全味方消去時は召喚クールタイムも0へ戻るため、蓄積Energyから直ちに再展開できます。
