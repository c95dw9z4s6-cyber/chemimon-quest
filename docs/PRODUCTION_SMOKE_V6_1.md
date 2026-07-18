# v6.1 本番スモーク報告

状態: `NEEDS_APPROVAL / 未実行`

Firebase CLIが未認証のため、仕様どおり公開前に停止しました。main、GitHub Pages、Firebase、正式v6.1 tagは変更していません。

再開後の本番smoke項目:

- 公開URLのversion 6.1、save version 33、main commit一致
- index、version.json、sw.js、V3、V16、manifestのHTTP 200とSHA-256
- PWA旧cacheからの更新
- Stage 1起動、通常quiz、Stage選択、設定、既存save読込み
- Stage 10 TA lock/unlock表示、normal Stage 10 BGM V3
- 専用ranking読込み成功（本番test recordは作成しない）
- 通常rankingの継続

1件でも失敗した場合は`ROLLBACK_V6_1.md`に従い自動rollbackします。
