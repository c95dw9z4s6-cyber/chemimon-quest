# v6.1 Firebase報告

## 変更

- Firestore rules: `stage10TimeAttack/{uid}`のowner create、public read、faster-only update、delete deny
- Firestore indexes: `bestMs ASC`＋`firstRegisteredAt ASC`
- Authentication方式: 既存匿名認証のまま
- Functions、Hosting、Storage、Auth設定、実データ: 変更なし

## 検証

Firebase CLI v15.24.0とFirestore emulator v1.21.0でrulesをcompileし、8/8の許可・拒否試験に合格しました。

## 本番公開

Firebase CLI v15.24.0で再認証し、対象プロジェクト`chemion-quest`を確認しました。次の対象限定deployだけを実行し、Rulesのcompile、Rules release、Indexes deployがすべて成功しました。

`firebase deploy --only firestore:rules,firestore:indexes --project chemion-quest`

無条件の`firebase deploy`、Hosting、Functions、Storage、Auth変更は実行していません。Firestore実データの削除・変換もありません。本番の`stage10TimeAttack`公開readはHTTP 200を確認しましたが、スモーク試験から本番ランキング記録は送信していません。
