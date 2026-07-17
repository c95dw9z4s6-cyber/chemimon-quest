# Chemion Quest v3.6.1

公開URL: https://c95dw9z4s6-cyber.github.io/chemimon-quest/

## v3.6.1の変更

- 更新通知の「あとで」を廃止しました。
- 新しい公開版を検出すると、戦闘と画面操作を停止する全画面の必須更新表示へ切り替わります。
- 検出時にローカルセーブを実行し、更新ファイルの準備完了後は約1.2秒で自動更新します。
- 自動更新に失敗した場合も旧版へ戻らず、「再試行する」だけを表示します。
- オンライン中の自動確認間隔を1時間から5分へ短縮しました。
- タブへ戻った際は、前回確認から1分以上経過していれば更新を確認します。
- 内部セーブバージョンは27のままで、v3.6以前の対応セーブと互換です。

## 重要な限界

これは通常利用者が旧版を継続することを防ぐ仕組みです。ただし、ブラウザー側だけで動くWebゲームなので、通信を完全に遮断する、JavaScriptを書き換える、開発者ツールで処理を止める利用者まで完全には防げません。ランキングの強い不正対策には、将来Firestoreルール、App Check、サーバー側検証も必要です。

## あなたが行う公開作業

現在のGitHubリポジトリには旧版の`index.html`しかないため、`index.html`だけではなく、このフォルダーの中身をすべてリポジトリ直下へ置いてください。

1. GitHubで `c95dw9z4s6-cyber/chemimon-quest` を開きます。
2. **Add file → Upload files** を押します。
3. このフォルダー内の次の項目を、フォルダー構成を保ったままアップロードします。
   - `.github/workflows/pages.yml`
   - `.nojekyll`
   - `index.html`
   - `manifest.webmanifest`
   - `version.json`
   - `sw.js`
   - `icons` フォルダー
   - `scripts` フォルダー
   - `README.md`
   - `NEW_CHAT_HANDOFF.md`
   - `firestore.rules`
4. 既存の`index.html`は新しい`index.html`で上書きします。
5. **Commit changes** を押し、`main`ブランチへ反映します。
6. **Settings → Pages → Build and deployment → Source** を **GitHub Actions** にします。
7. **Actions**タブを開き、`Validate and deploy Chemion Quest`が緑のチェックになることを確認します。
8. 公開URLを通常タブで開き、`Chemion Quest v3.6.1`と表示されることを確認します。
9. 以前に開いたことがある端末では、ページを一度再読み込みします。旧PWAを開いたままなら、必須更新画面が出て自動でv3.6.1へ切り替わることを確認します。

## 公開後の確認

- SafariとChromeの両方でv3.6.1が表示される。
- 新しい版を公開するテスト時に「あとで」が表示されない。
- 更新検出後、ゲーム画面を操作できない。
- セーブ後に自動再読み込みされる。
- Stage、ランキング、ニックネーム、要望、学習記録が維持される。
- Actionsが赤い場合は公開されないため、Actionsのエラー画面を保存して修正する。

## ファイル構成

- `index.html` — ゲーム本体
- `manifest.webmanifest` — PWA情報
- `sw.js` — オフラインキャッシュ・必須更新制御
- `version.json` — 公開版確認
- `icons/` — ホーム画面用アイコン
- `scripts/validate.mjs` — 公開前検査
- `.github/workflows/pages.yml` — 自動検査・GitHub Pages公開
- `firestore.rules` — Firebaseルール（今回は変更なし）
- `NEW_CHAT_HANDOFF.md` — 次回作業用引き継ぎ
