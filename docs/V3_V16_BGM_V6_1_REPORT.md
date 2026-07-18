# v6.1 V3・V16・BGM報告

- V3: `assets/audio/chemion-milestone-stage-bgm-v3.mp3`
- V16: `assets/audio/chemion-stage10-au-boss-v16-loop.mp3`
- Wave 1〜9: 難易度によらずV3
- Au形成開始: V3を短くduck
- Au形成完了: V3を止めてV16 loopを開始
- quiz、王水調製、初接触、小overlay: 同じtrack・同じ再生位置を維持
- Stage離脱・TA復帰: 移動先の既存BGMへ復帰
- PWA cacheと公開ZIP: V3/V16の両方を収録

Stage 1〜9の既存BGM file hashと割当はv6.0 baseline一致です。Stage 5はv6.1では変更しておらず、V3化はv6.5予定です。

音源のbytes、container時間、PCM decode、SHA-256は`AUDIO_V61_RESULTS.json`に記録しました。
