# v6.1 本番スモーク報告

状態: `合格`

公開前バックアップ`production-before-v6.1`は正式v6.0コミット`0f9d6e9496d381d8110de586c84eae59412ca1e5`を指します。v6.1候補`207db17062ebc0166dbb0c9ce9f104757f3dbdaf`のGitHub Pages workflowと、Firebaseの`firestore:rules,firestore:indexes`限定deployは成功しました。

本番スモーク結果:

- `[合格]` 公開URLのversion 6.1、save version 33
- `[合格]` index、version.json、sw.js、V3、V16、manifestのHTTP 200
- `[合格]` V3・V16の本番配信SHA-256が正式値と一致
- `[合格]` PWAのv6.0旧cacheを除去し、v6.1 shell/runtime cacheへ更新
- `[合格]` v6.1 PWAのオフライン再起動
- `[合格]` Stage 10起動とタイムアタック解放状態
- `[合格]` ブラウザpage errorなし
- `[合格]` 専用ランキングの本番公開read HTTP 200
- `[合格]` 本番テスト記録を送信していない

初期のスモーク試行では、検査側がsave versionをアプリversionとして比較したこと、戻り値のないテスト補助関数をboolean判定したこと、テスト用JavaScript式の構文誤りにより検査コードが停止しました。いずれも製品の不合格ではなく、正式な状態キーと期待値へ修正した確定スモークは全項目合格しています。このためロールバックは実行していません。
