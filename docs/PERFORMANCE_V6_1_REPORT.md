# v6.1 性能試験報告

- 通常Stage 10 render target: 60 FPS
- 低電力Stage 10 render target: 30 FPS
- 8体代表編成＋Au形成の60 frame直接計測: 平均12.88 ms/frame、最大75.50 ms、処理能力換算77.65 FPS
- 低電力60 frame直接計測: 平均1.34 ms/frame、最大8.70 ms、処理能力換算747.20 FPS
- heap増加参考値: 通常約0.04 MB、低電力約0.57 MB
- 再入場: combat effect 0、impact 0、projectile 0、旧AudioNode 0

自動試験環境では`requestAnimationFrame`が非表示・headless schedulingの影響で抑制されるため、合否は実際の戦闘更新＋Canvas描画のframe処理時間で判定し、scheduler値は参考としてJSONへ併記しました。

320/375/390 px、縦横、PC、iPhone Safari/PWA相当、Android Chrome相当、reduced motionで横overflowなしを確認しました。実機SafariそのものではなくChrome engineのviewport/user-agent相当試験です。
