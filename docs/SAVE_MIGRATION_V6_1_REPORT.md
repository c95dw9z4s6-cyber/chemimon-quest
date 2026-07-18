# v6.1 セーブ移行報告

- save version: 32 → 33
- 追加領域: `progress.timeAttack`
- 初期値: unlockedはStage 10 clear実績から導出、local bestなし、pendingなし、走行中なし
- v6.0 Stage 10 clear済み: 自動unlock
- 未clear: lock維持
- 移行: normalize処理で冪等

coin、level/XP、Energy、unit解放・強化、Stage進行、Stage 10、王水Lv、実績、学習・復習、設定、BGM、nickname、ranking ID、guest assistを既存fieldのまま保持します。

ブラウザfixtureでv6.0 save version 32を直接読込み、33への移行、unlock、再読込み、通常save復元を確認しました。TA中の通常save書込みは拒否し、終了時は退避したsaveを復元します。
