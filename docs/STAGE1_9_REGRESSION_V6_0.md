# Chemion Quest v6.0 Stage 1〜9回帰レポート

作成日: 2026-07-18

## 基準

- v5.95正式コミット: `d5ebfc763010063961e2c1143bb9c4143eecf640`
- 基準版: v5.95
- 比較対象: Stage 1〜9定義と既存経済定義

## ハッシュ比較

| 対象 | SHA-256 | 結果 |
|---|---|---|
| Stage 1 | `5de396248b83bd7c94ca1042031741c8716a0960857f31542ed80e4b302ece8b` | 一致 |
| Stage 2 | `fb390293234c59289063a17d3a1fd4a06ef9f6c1c7d7105caf8b7382acadb500` | 一致 |
| Stage 3 | `c117d5ad75da9a4fc8fc1ad80ea8b27dc084f661271b0b2b2beec7d7d9ac35d1` | 一致 |
| Stage 4 | `50cf62c56867768fe547e2c086190b36b5f8c8c8c222ac57c11c2cc33a9f2637` | 一致 |
| Stage 5 | `2e3f5dd52a3d7a77af8fc562f7f14e55ef062f24f95e45c14f34d1257b4ab1e5` | 一致 |
| Stage 6 | `6523bbdc3ec6462f6b30264f2d9f162b655f8c0567da341660dd53a0ec69fdae` | 一致 |
| Stage 7 | `87b583fcc73d6cedd658cffd906daf38d357ae10ef158c660b61b1a06a7c4b9a` | 一致 |
| Stage 8 | `89c7ebceddf060195edd6eebcebdfa8ea49dd09b702d17c09724158ea863c3cd` | 一致 |
| Stage 9 | `1647ffeed4d0b7e7266a59195a059137c53c1b35d73306d8dcac85ad95378d79` | 一致 |
| 既存経済 | `4cea56d3993c8d94f3d8e95841aea090f7cbb28cfc7227c36d86de813572a28e` | 一致 |

## 機能回帰

- Stage 1〜9のWave、敵、味方、拠点HP、攻撃力、速度、距離、間隔、価格: 変更なし。
- ゲストアシストの保存・使用済み制限: 維持。
- 学習記録、復習、模試、実績、ランキング: 機能監査合格。
- 基本620問、難問340問、模試8大問40小問: 総数維持。
- v5.95形式31セーブ: 直接移行合格。
- v5.0系セーブ: 中間版を経由せず直接移行合格。
- v5.95 PWAキャッシュ: v6.0 shell/runtimeキャッシュへ更新合格。
- 公開ZIP: 旧版資産の混在なし。

## 判定

Stage 1〜9と既存経済はv5.95基準に完全一致し、必須回帰テストは合格です。
