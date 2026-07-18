# Chemion Quest v5.2 安全公開方式レポート

## 目的

GitHubで多数の公開ファイルを手作業で上書きした際に、一部だけ最新版・一部だけ旧版になる事故を防ぐ。

## 新しい公開単位

GitHub Pagesへ公開するファイルは、リポジトリ直下の`chemion-release.zip`だけを正本とする。ZIP内には公開用`site/`と`release-manifest.json`を収録する。

## Actionsでの検査

- ZIPパスの安全性、重複、シンボリックリンク、展開サイズを検査
- manifestに宣言されたファイルとZIP内の実ファイルが完全一致することを検査
- 全ファイルのSHA-256とバイト数を検査
- 欠落ファイルと、消し忘れに相当する未宣言の余分なファイルを拒否
- `release-manifest.json`、`version.json`、`index.html`、`sw.js`の版番号を照合
- PWAの必須ファイルとアイコンを確認
- 全検査後にだけ空の`_site`へ展開
- GitHub Pagesへは検査済み`_site`だけを1個のartifactとして渡す

## 失敗時

verify jobが失敗するためdeploy jobは開始されない。GitHub Pagesで現在公開中の正常版は置き換えられない。

## 更新手順

v5.2への初回移行では、workflow、検証器、単一公開ZIPの3ファイルを同じコミットで配置する。移行後の通常更新では、原則`chemion-release.zip`だけを置き換える。

## 回帰試験

自動試験では、正常ZIPの受理に加え、次の異常ZIPが拒否されることを確認する。

- index.htmlの1バイト改変
- Service Workerの欠落
- manifestにない古い余分なファイル
- `../`を含む危険なパス
- hashとbuild IDを合わせても版番号だけ異なる`version.json`

## キャッシュ

ゲーム本体のCSS・JavaScriptは`index.html`へ統合されているため、新旧の外部JS/CSSが混ざる構成ではない。Service Workerのshell/runtime cache名はアプリ版ごとに変わり、`version.json`はno-storeで確認する。
