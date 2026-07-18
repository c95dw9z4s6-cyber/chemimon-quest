# v6.1 Stage 10タイムアタック報告

- 解放条件は通常Stage 10クリア。v6.0でクリア済みのsaveは移行時に自動解放します。
- 開始時はcoin 0、Lv1/XP0、Energy上限Lv1、全強化Lv1、王水未解放/Lv1、Wave 1の一時状態です。
- 通常save文字列と学習・復習・出題履歴を退避し、TA中の通常save書込みを拒否します。
- 問題・操作待ちを含め`performance.now()`で測り、Au撃破成立時に映像より先に時計を止めます。
- 中断・勝敗後は一時状態を破棄し通常saveを復元します。永続化するのはTA profileだけです。
- guest assistは一時的にOFFかつ操作不能。通常saveの`guestAssistUsed`は変えません。
- reload、10秒超background、save差替え、error、未処理rejection、異常時間、走行ID不一致、開発test状態は公式対象外です。
- 内部はms、表示は`m:ss.hh`。遅い走行はローカルbestを上書きしません。

静的43/43、ブラウザ23/23で、問題中timer進行、通常save不変、復帰、reload無効、v6.0移行を確認しました。
