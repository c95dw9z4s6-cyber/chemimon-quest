# v6.1 Firebase報告

## 変更

- Firestore rules: `stage10TimeAttack/{uid}`のowner create、public read、faster-only update、delete deny
- Firestore indexes: `bestMs ASC`＋`firstRegisteredAt ASC`
- Authentication方式: 既存匿名認証のまま
- Functions、Hosting、Storage、Auth設定、実データ: 変更なし

## 検証

Firebase CLI v15.24.0とFirestore emulator v1.21.0でrulesをcompileし、8/8の許可・拒否試験に合格しました。

## NEEDS_APPROVAL

CLIの`login:list`は認証済みアカウントなし、`projects:list --json`は認証失敗でした。このため本番deployは実行していません。再開時も対象なし`firebase deploy`は禁止し、次だけを実行します。

`firebase deploy --only firestore:rules,firestore:indexes --project chemion-quest`

Firestore実データの削除・変換はありません。
