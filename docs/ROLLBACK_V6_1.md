# v6.1 ロールバック手順

公開前に現行production commitへ`production-before-v6.1`を作成・pushします。本番smoke失敗時は追加承認を待ちません。

1. `production-before-v6.1`が正式v6.0 production commitを指すことを再確認。
2. v6.1 main反映commitを`git revert`し、履歴を書き換えずmainへpush。
3. Pages workflow完了を待ち、version.jsonと主要asset hashがv6.0へ戻ったことを確認。
4. v6.0の`firestore.rules`を一時configから`--only firestore:rules`で復元。
5. v6.1追加indexは実データを削除しないため、緊急rollbackでは残置可。削除が必要なら破壊的変更として別承認。
6. 旧サイトのboot、save、通常ranking、PWAをsmoke。
7. 正式`v6.1`タグは作成しない。

現時点では未公開なのでrollback対象はありません。
