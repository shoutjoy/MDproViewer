(function (global) {
  'use strict';

  const state = {
    installPrompt: null,
    registration: null,
    lastMessage: ''
  };

  function isStandalone() {
    return !!(global.matchMedia && global.matchMedia('(display-mode: standalone)').matches)
      || global.navigator.standalone === true;
  }

  function isSecurePwaContext() {
    return global.isSecureContext && /^https?:$/.test(global.location.protocol);
  }

  function serviceWorkerLabel() {
    if (!('serviceWorker' in navigator)) return '지원 안 함';
    if (!isSecurePwaContext()) return '보안 주소 필요';
    if (state.registration && state.registration.active) return '활성';
    if (state.registration) return '등록 중';
    return '미등록';
  }

  function installLabel() {
    if (isStandalone()) return '설치됨';
    if (state.installPrompt) return '설치 가능';
    if (!isSecurePwaContext()) return 'localhost/HTTPS 필요';
    return '브라우저 메뉴에서 설치';
  }

  function setMessage(message) {
    state.lastMessage = message || '';
    const element = document.getElementById('pwa-settings-message');
    if (element) element.textContent = state.lastMessage;
  }

  function updateUi() {
    const online = navigator.onLine;
    const installed = isStandalone();
    const badge = document.getElementById('pwa-settings-card-badge');
    const cardStatus = document.getElementById('pwa-settings-card-status');
    const installStatus = document.getElementById('pwa-install-status');
    const workerStatus = document.getElementById('pwa-worker-status');
    const networkStatus = document.getElementById('pwa-network-status');
    const installButton = document.getElementById('pwa-install-button');

    if (badge) badge.textContent = installed ? '설치됨' : (state.installPrompt ? '설치 가능' : 'PWA 준비됨');
    if (cardStatus) {
      cardStatus.textContent = installed
        ? '설치 앱으로 실행 중입니다.'
        : (isSecurePwaContext() ? '설치·오프라인·업데이트 상태를 관리할 수 있습니다.' : 'localhost 또는 HTTPS에서 PWA를 사용할 수 있습니다.');
    }
    if (installStatus) installStatus.textContent = installLabel();
    if (workerStatus) workerStatus.textContent = serviceWorkerLabel();
    if (networkStatus) networkStatus.textContent = online ? '온라인' : '오프라인';
    if (installButton) {
      installButton.disabled = installed || !state.installPrompt;
      installButton.textContent = installed ? '설치 완료' : '이 기기에 설치';
    }
  }

  function ensureModal() {
    let overlay = document.getElementById('pwa-settings-overlay');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'pwa-settings-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = [
      '<section class="pwa-settings-panel" role="dialog" aria-modal="true" aria-labelledby="pwa-settings-title">',
      '  <header class="pwa-settings-header">',
      '    <img class="pwa-settings-icon" src="./Apps/PWA/icons/icon.svg" alt="">',
      '    <div class="pwa-settings-heading"><h2 id="pwa-settings-title">PWA 앱 설정</h2><p>설치 · 오프라인 캐시 · 업데이트 관리</p></div>',
      '    <button type="button" class="pwa-settings-close" data-pwa-action="close" aria-label="PWA 설정 닫기">닫기</button>',
      '  </header>',
      '  <div class="pwa-settings-content">',
      '    <div class="pwa-settings-status-grid">',
      '      <div class="pwa-status-item"><span>앱 설치</span><strong id="pwa-install-status">확인 중</strong></div>',
      '      <div class="pwa-status-item"><span>오프라인 서비스</span><strong id="pwa-worker-status">확인 중</strong></div>',
      '      <div class="pwa-status-item"><span>네트워크</span><strong id="pwa-network-status">확인 중</strong></div>',
      '    </div>',
      '    <p class="pwa-settings-note">PWA 설치는 <b>localhost 또는 HTTPS</b> 주소에서 지원됩니다. file://로 연 경우 문서 편집은 가능하지만 설치와 오프라인 서비스는 활성화되지 않습니다.</p>',
      '    <div class="pwa-settings-actions">',
      '      <button id="pwa-install-button" type="button" class="pwa-action-button primary" data-pwa-action="install">이 기기에 설치</button>',
      '      <button type="button" class="pwa-action-button" data-pwa-action="update">업데이트 확인</button>',
      '      <button type="button" class="pwa-action-button" data-pwa-action="refresh-cache">오프라인 캐시 새로 만들기</button>',
      '      <button type="button" class="pwa-action-button danger" data-pwa-action="clear-cache">오프라인 캐시 지우기</button>',
      '    </div>',
      '    <p id="pwa-settings-message" aria-live="polite"></p>',
      '  </div>',
      '</section>'
    ].join('');
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (event) {
      const action = event.target && event.target.closest('[data-pwa-action]');
      if (event.target === overlay) closeSettings();
      if (!action) return;
      const name = action.getAttribute('data-pwa-action');
      if (name === 'close') closeSettings();
      if (name === 'install') promptInstall();
      if (name === 'update') checkForUpdate();
      if (name === 'refresh-cache') refreshCache();
      if (name === 'clear-cache') clearCache();
    });
    return overlay;
  }

  function openSettings() {
    const overlay = ensureModal();
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    setMessage(state.lastMessage || '현재 PWA 상태를 확인했습니다.');
    updateUi();
    const close = overlay.querySelector('.pwa-settings-close');
    if (close) close.focus();
  }

  function closeSettings() {
    const overlay = document.getElementById('pwa-settings-overlay');
    if (!overlay) return;
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
  }

  async function promptInstall() {
    if (!state.installPrompt) {
      setMessage(isStandalone() ? '이미 설치 앱으로 실행 중입니다.' : '현재 브라우저에서는 주소창 또는 브라우저 메뉴의 설치 기능을 사용해 주세요.');
      return;
    }
    const promptEvent = state.installPrompt;
    state.installPrompt = null;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    setMessage(choice && choice.outcome === 'accepted' ? '앱 설치를 시작했습니다.' : '앱 설치를 취소했습니다.');
    updateUi();
  }

  async function checkForUpdate() {
    if (!state.registration) {
      setMessage('서비스 워커가 아직 등록되지 않았습니다. localhost 또는 HTTPS 주소를 확인해 주세요.');
      return;
    }
    try {
      await state.registration.update();
      if (state.registration.waiting) {
        state.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        setMessage('새 버전을 적용하고 있습니다. 잠시 후 페이지를 새로고침해 주세요.');
      } else {
        setMessage('최신 버전을 사용하고 있습니다.');
      }
    } catch (error) {
      setMessage('업데이트 확인 실패: ' + (error && error.message ? error.message : error));
    }
  }

  async function pwaCacheKeys() {
    if (!('caches' in global)) return [];
    const keys = await caches.keys();
    return keys.filter(function (key) { return key.startsWith('md-viewer-pwa-'); });
  }

  async function clearCache() {
    try {
      const keys = await pwaCacheKeys();
      await Promise.all(keys.map(function (key) { return caches.delete(key); }));
      setMessage(keys.length ? '오프라인 캐시를 지웠습니다. 온라인 상태에서 다시 열면 필요한 파일이 저장됩니다.' : '지울 오프라인 캐시가 없습니다.');
    } catch (error) {
      setMessage('캐시 삭제 실패: ' + (error && error.message ? error.message : error));
    }
  }

  async function refreshCache() {
    const worker = navigator.serviceWorker && navigator.serviceWorker.controller;
    if (!worker) {
      setMessage('오프라인 서비스가 아직 활성화되지 않았습니다. 페이지를 한 번 새로고침한 뒤 다시 시도해 주세요.');
      return;
    }
    worker.postMessage({ type: 'REFRESH_PWA_CACHE' });
    setMessage('오프라인 캐시를 새로 만드는 중입니다.');
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || !isSecurePwaContext()) {
      updateUi();
      return;
    }
    try {
      const scriptUrl = document.currentScript && document.currentScript.src
        ? document.currentScript.src
        : new URL('./Apps/PWA/pwa-settings.js', document.baseURI).href;
      const workerUrl = new URL('../../service-worker.js', scriptUrl);
      const scopeUrl = new URL('../../', scriptUrl);
      state.registration = await navigator.serviceWorker.register(workerUrl.href, { scope: scopeUrl.pathname });
      state.registration.addEventListener('updatefound', function () {
        const installing = state.registration.installing;
        if (!installing) return;
        installing.addEventListener('statechange', function () {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            setMessage('새 버전이 준비되었습니다. 업데이트 확인을 눌러 적용하세요.');
          }
          updateUi();
        });
      });
      await navigator.serviceWorker.ready;
      updateUi();
    } catch (error) {
      setMessage('오프라인 서비스 등록 실패: ' + (error && error.message ? error.message : error));
      updateUi();
    }
  }

  global.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault();
    state.installPrompt = event;
    updateUi();
  });
  global.addEventListener('appinstalled', function () {
    state.installPrompt = null;
    setMessage('MD Viewer 설치가 완료되었습니다.');
    updateUi();
  });
  global.addEventListener('online', updateUi);
  global.addEventListener('offline', updateUi);
  global.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeSettings();
  });
  if (navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener('message', function (event) {
      if (event.data && event.data.type === 'PWA_CACHE_REFRESHED') {
        setMessage('오프라인 캐시를 새로 만들었습니다.');
      }
    });
  }

  global.openPwaSettings = openSettings;
  global.closePwaSettings = closeSettings;
  global.MdViewerPWA = Object.freeze({
    open: openSettings,
    close: closeSettings,
    update: checkForUpdate,
    refreshCache: refreshCache,
    getRegistration: function () { return state.registration; }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      updateUi();
      registerServiceWorker();
    }, { once: true });
  } else {
    updateUi();
    registerServiceWorker();
  }
})(window);
