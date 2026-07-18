# v6.1 変更ファイル一覧

- `config/release.json`、`version.json`、`package.json`: version 6.1 / save 33 / scripts
- `config/features.json`: v6.1監査feature
- `data/game-core.json`: Stage 10 guide安全文とrelease表示（戦闘値は不変）
- `src/index.template.html`: TA UI、ranking UI、状態表示
- `src/scripts/game-runtime.js`: TA隔離、移行、BGM routing、Au・王水演出、性能・AudioNode管理
- `src/scripts/online-runtime.js`: 専用best ranking transaction、retry、表示
- `src/styles/core.css`: TA・ranking・Stage 10表示
- `src/sw.template.js`: V3 cache、v6.1 cache version
- `firestore.rules`、`firestore.indexes.json`、`firebase.json`、`.firebaserc`: Firebase対象指定
- `assets/audio/chemion-milestone-stage-bgm-v3.mp3`: 指定正式V3を無加工収録
- `scripts/*v61*`、ranking/audio/rules試験、baseline: 専用自動試験
- `scripts/build_release_package.py`、`verify_release_package.py`: V3を公開必須assetへ追加
- `index.html`、`sw.js`、`README.md`、`NEW_CHAT_HANDOFF.md`: 生成・引継ぎ成果物
- `chemion-release.zip`: 検査済み公開候補
- `docs/*V6_1*`ほか監査JSON/Markdown: 実装・試験証跡

Stage 1〜10のgameplay/economy定義、既存問題ID、Stage 1〜9 BGM assetは変更していません。
