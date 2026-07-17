  (() => {
    'use strict';
    const CURRENT_VERSION = '__APP_VERSION__';
    const VERSION_CHECK_INTERVAL = 5 * 60 * 1000;
    const VERSION_FOCUS_MIN_INTERVAL = 60 * 1000;
    let registration = null;
    let waitingWorker = null;
    let deferredInstallPrompt = null;
    let reloadAfterControllerChange = false;
    let lastCheckAt = 0;
    let lastMessage = '';
    let mandatoryUpdateTimer = null;
    let updateRequired = false;

    const byId = (id) => document.getElementById(id);
    const updateBanner = byId('pwaUpdateBanner');
    const updateTitle = byId('pwaUpdateTitle');
    const updateText = byId('pwaUpdateText');
    const offlineBanner = byId('pwaOfflineBanner');

    function isInstalled() {
      return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
    }
    function platformHint() {
      const ua = navigator.userAgent || '';
      const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      if (ios && !isInstalled()) return '<b>iPhone・iPad</b><br>Safari下部の共有ボタン（□に↑）→「ホーム画面に追加」→「追加」を選んでください。プライベートブラウズではなく通常タブを使ってください。';
      if (/Android/i.test(ua) && !isInstalled()) return '<b>Android</b><br>Chromeのメニューから「アプリをインストール」または「ホーム画面に追加」を選んでください。追加ボタンが使える場合は、下のボタンからも実行できます。';
      return '<b>パソコン</b><br>Chrome・Edgeではアドレスバー右側のインストールボタン、Safariでは「ファイル」→「Dockに追加」など、ブラウザーの案内を使えます。';
    }
    function getState() {
      return {
        currentVersion: CURRENT_VERSION,
        installed: isInstalled(),
        installPromptReady: Boolean(deferredInstallPrompt),
        serviceWorkerSupported: 'serviceWorker' in navigator,
        controlled: Boolean(navigator.serviceWorker?.controller),
        online: navigator.onLine,
        platformHint: platformHint()
      };
    }
    function setMessage(message) {
      lastMessage = String(message || '');
      window.dispatchEvent(new CustomEvent('cq-pwa-status', { detail: { message: lastMessage, state: getState() } }));
      return lastMessage;
    }
    function updateConnectionUI() {
      if (!offlineBanner) return;
      offlineBanner.hidden = navigator.onLine;
      if (!navigator.onLine) setMessage('現在オフラインです。ゲーム本体は利用できますが、ランキングと要望には接続が必要です。');
    }
    function lockForRequiredUpdate(versionLabel = '', preparing = false) {
      updateRequired = true;
      document.body.classList.add('pwa-update-required');
      try { window.saveGame?.({ silent: true }); } catch (_) {}
      try { window.cqPauseOverlay?.(); } catch (_) {}
      if (!updateBanner) return;
      updateTitle.textContent = versionLabel ? `Chemion Quest v${versionLabel}への必須更新` : '必須アップデートがあります';
      updateText.textContent = preparing
        ? '最新版の更新ファイルを準備しています。準備が完了すると自動で切り替わります。'
        : '現在の進行を保存しました。旧版でのプレイを停止し、最新版へ自動的に切り替えます。';
      const button = byId('pwaUpdateNowBtn');
      if (button) {
        button.disabled = preparing;
        button.textContent = preparing ? '更新を準備中…' : '今すぐ更新する';
      }
      updateBanner.hidden = false;
    }
    function showUpdate(worker, versionLabel = '') {
      if (worker) waitingWorker = worker;
      lockForRequiredUpdate(versionLabel, false);
      setMessage('必須アップデートを検出しました。旧版の操作を停止し、最新版へ切り替えます。');
      clearTimeout(mandatoryUpdateTimer);
      mandatoryUpdateTimer = setTimeout(() => applyWaitingUpdate(), 1200);
    }
    function showUpdatePreparation(versionLabel = '') {
      lockForRequiredUpdate(versionLabel, true);
      setMessage('公開版の更新を検出しました。更新ファイルを準備しています。');
    }
    function observeInstalling(worker) {
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdate(registration?.waiting || worker);
      });
    }
    async function readPublishedVersion() {
      if (!navigator.onLine) return null;
      try {
        const response = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
        if (!response.ok) return null;
        const data = await response.json();
        return typeof data.version === 'string' ? data.version : null;
      } catch { return null; }
    }
    async function checkForUpdates({ manual = false } = {}) {
      if (!registration) {
        const message = '更新機能を準備中です。公開URLをSafariまたはChromeで開いてください。';
        return setMessage(message);
      }
      if (!navigator.onLine) return setMessage('オフラインのため最新版を確認できません。接続後にもう一度確認してください。');
      lastCheckAt = Date.now();
      try {
        const published = await readPublishedVersion();
        await registration.update();
        if (registration.waiting) {
          showUpdate(registration.waiting, published && published !== CURRENT_VERSION ? published : '');
          return setMessage('新しいバージョンの準備が完了しました。画面下の「更新する」を押してください。');
        }
        if (published && published !== CURRENT_VERSION) {
          showUpdatePreparation(published);
          setTimeout(async () => {
            try {
              await registration?.update();
              if (registration?.waiting) showUpdate(registration.waiting, published);
              else setTimeout(() => checkForUpdates(), 1800);
            } catch (_) {}
          }, 900);
          return lastMessage;
        }
        return setMessage(manual ? `v${CURRENT_VERSION}が現在の最新版です。` : '最新版です。');
      } catch (error) {
        console.warn('Chemion Quest update check failed', error);
        if (updateRequired) return setMessage('更新の準備に失敗しました。通信を確認し、この画面の「今すぐ更新する」を押してください。');
        return setMessage('最新版の確認に失敗しました。接続後にもう一度確認します。');
      }
    }
    async function requestInstall() {
      if (isInstalled()) return setMessage('すでにホーム画面からアプリとして起動しています。');
      if (!deferredInstallPrompt) return setMessage('このブラウザーでは画面内ボタンを使えません。上の説明どおり、Safariの共有ボタンまたはChromeのメニューから追加してください。');
      try {
        deferredInstallPrompt.prompt();
        const choice = await deferredInstallPrompt.userChoice;
        deferredInstallPrompt = null;
        if (choice?.outcome === 'accepted') return setMessage('ホーム画面への追加を開始しました。');
        return setMessage('ホーム画面への追加を取り消しました。');
      } catch {
        return setMessage('追加画面を開けませんでした。ブラウザーのメニューから追加してください。');
      }
    }
    async function refreshOfflineCache() {
      if (!registration) return setMessage('オフライン機能を準備中です。公開URLから再読み込みしてください。');
      if (!navigator.onLine) return setMessage('オフライン中は保存データを更新できません。通信接続後に実行してください。');
      try {
        const target = registration.active || navigator.serviceWorker.controller;
        target?.postMessage?.({ type: 'REFRESH_SHELL' });
        await registration.update();
        return setMessage('オフライン用のゲーム本体を更新しました。');
      } catch {
        return setMessage('オフライン用データを更新できませんでした。通常の再読み込みを試してください。');
      }
    }
    async function applyWaitingUpdate() {
      clearTimeout(mandatoryUpdateTimer);
      const button = byId('pwaUpdateNowBtn');
      if (button) { button.disabled = true; button.textContent = '更新中…'; }
      let worker = registration?.waiting || waitingWorker;
      if (!worker) {
        showUpdatePreparation();
        await checkForUpdates({ manual: true });
        worker = registration?.waiting || waitingWorker;
        if (!worker) {
          if (button) { button.disabled = false; button.textContent = '再試行する'; }
          updateText.textContent = '更新ファイルをまだ取得できません。通信を確認して「再試行する」を押してください。';
          return setMessage('更新ファイルを取得できませんでした。再試行してください。');
        }
      }
      try { window.saveGame?.({ silent: true }); } catch (_) {}
      reloadAfterControllerChange = true;
      updateText.textContent = 'セーブしました。最新版へ切り替えています…';
      worker.postMessage({ type: 'SKIP_WAITING' });
      setTimeout(() => { if (reloadAfterControllerChange) location.reload(); }, 4000);
      return setMessage('最新版へ切り替えています。');
    }
    async function registerServiceWorker() {
      if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) {
        setMessage('この開き方ではオフライン機能を利用できません。公開URLをSafariまたはChromeで開いてください。');
        return;
      }
      try {
        registration = await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
        if (registration.waiting) showUpdate(registration.waiting);
        observeInstalling(registration.installing);
        registration.addEventListener('updatefound', () => observeInstalling(registration.installing));
        setMessage(navigator.serviceWorker.controller ? 'オフライン起動の準備が完了しています。' : 'オフライン起動を準備しました。次回の起動から利用できます。');
        setTimeout(() => checkForUpdates(), 1600);
      } catch (error) {
        console.warn('Chemion Quest service worker registration failed', error);
        if (updateRequired) setMessage('必須更新を開始できませんでした。通信を確認して再読み込みしてください。');
        else setMessage('オフライン機能を開始できませんでした。オンラインでは通常どおり遊べます。');
      }
    }

    window.ChemionPWA = { getState, getLastMessage: () => lastMessage, checkForUpdates, requestInstall, refreshOfflineCache };
    window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); deferredInstallPrompt = event; setMessage('この端末ではホーム画面へ追加できます。'); });
    window.addEventListener('appinstalled', () => { deferredInstallPrompt = null; setMessage('ホーム画面への追加が完了しました。'); });
    window.addEventListener('online', () => { updateConnectionUI(); setTimeout(() => checkForUpdates(), 600); });
    window.addEventListener('offline', updateConnectionUI);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Date.now() - lastCheckAt > VERSION_FOCUS_MIN_INTERVAL) checkForUpdates();
    });
    navigator.serviceWorker?.addEventListener('controllerchange', () => {
      if (!reloadAfterControllerChange) return;
      reloadAfterControllerChange = false;
      location.reload();
    });
    byId('pwaUpdateNowBtn')?.addEventListener('click', applyWaitingUpdate);
    updateConnectionUI();
    window.addEventListener('load', registerServiceWorker, { once: true });
    setInterval(() => { if (navigator.onLine) checkForUpdates(); }, VERSION_CHECK_INTERVAL);
  })();
  
