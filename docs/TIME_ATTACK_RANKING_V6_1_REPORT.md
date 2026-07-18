# v6.1 タイムアタックランキング報告

- 専用collection: `stage10TimeAttack`
- document ID: Firebase匿名認証の`uid`。1人1documentです。
- 表示: nickname、順位、最速時間。内部UIDは表示しません。
- 更新: Firestore transactionで新規または現bestより速い場合だけ。遅い記録と同一runIdは変更しません。
- 順序: `bestMs ASC`、同値は`firstRegisteredAt ASC`。
- 同名別UIDは別人として保持します。
- `isTest=true`、`tester...`、`自動テスト`名は表示から除外します。
- 失敗時はpending submissionを端末に残し、online復帰・定期sync時に再送します。
- 通常rankingのcollection、送信可否、表示処理は変更していません。

純粋ロジック11/11、Firestore emulator 8/8で、owner create、public read、他人update拒否、遅いupdate拒否、速いupdate許可、duplicate拒否、delete拒否を確認しました。本番Firebase確認は再ログイン待ちです。
