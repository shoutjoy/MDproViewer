/* AI Chat - persistent floating multi-turn chat for LM Studio and AI Studio. */
(function (root) {
  'use strict';

  var ENABLED_KEY = 'ss_ai_chat_enabled';
  var PROVIDER_KEY = 'ss_ai_chat_provider';
  var GEMINI_MODEL_KEY = 'ss_ai_chat_gemini_model';
  var RESPONSE_MODE_KEY = 'ss_ai_chat_response_mode';
  var ACADEMIC_SEARCH_KEY = 'ss_ai_chat_academic_search_enabled';
  var ACADEMIC_COUNT_KEY = 'ss_ai_chat_academic_search_count';
  var PROVIDER_CONTROLS_KEY = 'ss_ai_chat_provider_controls_open';
  var HISTORY_KEY = 'ss_ai_chat_history_v1';
  var LAYOUT_KEY = 'ss_ai_chat_layout';
  var POPUP_RECT_KEY = 'ss_ai_chat_popup_rect';
  var DOCK_WIDTH_KEY = 'ss_ai_chat_dock_width';
  var CURRENT_CONVERSATION_KEY = 'ss_ai_chat_current_conversation_id';
  var MIGRATION_KEY = 'ss_ai_chat_idb_migrated_v1';
  var CHAT_DB_NAME = 'md_viewer_ai_chat';
  var CHAT_DB_VERSION = 1;
  var CONVERSATION_STORE = 'conversations';
  var MAX_STORED_MESSAGES = 100;
  var MAX_CONTEXT_MESSAGES = 30;
  var DOCK_HISTORY_MIN_WIDTH = 680;
  var DEFAULT_GEMINI_MODELS = [
    'gemini-3.5-flash',
    'gemini-3.1-pro-preview',
    'gemini-3-flash-preview',
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-2.5-flash-lite',
    'gemini-3.1-flash-lite-image',
    'gemini-3.1-flash-image',
    'gemini-3-pro-image',
    'gemini-2.5-flash-image'
  ];

  var state = {
    enabled: false,
    open: false,
    running: false,
    provider: 'lmstudio',
    providerControlsOpen: false,
    responseMode: 'quick',
    academicSearchEnabled: false,
    academicSearchCount: 10,
    geminiModel: 'gemini-3.5-flash',
    lmModel: '',
    messages: [],
    layout: 'popup',
    conversationId: '',
    conversationTitle: '새 대화',
    conversationCreatedAt: 0,
    conversations: [],
    db: null,
    dbReady: false,
    storageInitializing: true
  };
  var thinkingTimer = null;
  var thinkingStartedAt = 0;
  var thinkingProgress = 0;
  var saveTimer = null;
  var academicAbortController = null;
  var documentSelectionBuffer = '';

  function storageGet(key, fallback) {
    try {
      var value = localStorage.getItem(key);
      return value == null ? fallback : value;
    } catch (e) { return fallback; }
  }

  function storageSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) {}
  }

  function getBridge() {
    if (!root.AIChatBridge) throw new Error('AI Chat 연결 모듈이 준비되지 않았습니다. 앱을 새로고침하세요.');
    return root.AIChatBridge;
  }

  function loadLegacyHistory() {
    try {
      var parsed = JSON.parse(storageGet(HISTORY_KEY, '[]'));
      if (!Array.isArray(parsed)) return [];
      var messages = parsed.filter(function (item) {
        return item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string';
      }).slice(-MAX_STORED_MESSAGES);
      messages.forEach(function (message, index) {
        if (!message.error) return;
        for (var i = index - 1; i >= 0; i--) {
          if (messages[i].role === 'user') {
            messages[i].failed = true;
            break;
          }
        }
      });
      return messages;
    } catch (e) { return []; }
  }

  function saveHistory() {
    scheduleConversationSave();
  }

  function newId() {
    if (root.crypto && typeof root.crypto.randomUUID === 'function') return root.crypto.randomUUID();
    return 'chat-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
  }

  function requestPromise(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error('IndexedDB 요청에 실패했습니다.')); };
    });
  }

  function openChatDb() {
    return new Promise(function (resolve, reject) {
      if (!root.indexedDB) return reject(new Error('이 브라우저는 IndexedDB를 지원하지 않습니다.'));
      var request = root.indexedDB.open(CHAT_DB_NAME, CHAT_DB_VERSION);
      request.onupgradeneeded = function () {
        var db = request.result;
        if (!db.objectStoreNames.contains(CONVERSATION_STORE)) {
          var store = db.createObjectStore(CONVERSATION_STORE, { keyPath: 'id' });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error('AI Chat 저장소를 열지 못했습니다.')); };
    });
  }

  function conversationStore(mode) {
    return state.db.transaction(CONVERSATION_STORE, mode || 'readonly').objectStore(CONVERSATION_STORE);
  }

  function titleFromMessages(messages) {
    var first = (messages || []).find(function (message) { return message.role === 'user' && String(message.content || '').trim(); });
    if (!first) return '새 대화';
    var value = String(first.content).replace(/\s+/g, ' ').trim();
    return value.length > 34 ? value.slice(0, 34) + '…' : value;
  }

  function currentConversationRecord() {
    var now = Date.now();
    if (!state.conversationId) state.conversationId = newId();
    if (!state.conversationCreatedAt) state.conversationCreatedAt = now;
    state.conversationTitle = titleFromMessages(state.messages);
    return {
      id: state.conversationId,
      title: state.conversationTitle,
      createdAt: state.conversationCreatedAt,
      updatedAt: now,
      provider: state.provider,
      responseMode: state.responseMode,
      academicSearchEnabled: state.academicSearchEnabled,
      academicSearchCount: state.academicSearchCount,
      geminiModel: state.geminiModel,
      messages: state.messages.slice(-MAX_STORED_MESSAGES)
    };
  }

  async function saveConversationNow() {
    if (!state.dbReady || !state.db || !state.conversationId) return;
    var record = currentConversationRecord();
    await requestPromise(conversationStore('readwrite').put(record));
    storageSet(CURRENT_CONVERSATION_KEY, record.id);
    var index = state.conversations.findIndex(function (item) { return item.id === record.id; });
    if (index >= 0) state.conversations[index] = record;
    else state.conversations.push(record);
    state.conversations.sort(function (a, b) { return Number(b.updatedAt || 0) - Number(a.updatedAt || 0); });
    renderConversationHistory();
  }

  function scheduleConversationSave() {
    if (!state.dbReady) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = null;
      saveConversationNow().catch(function () { setStatus('대화 기록을 저장하지 못했습니다.', 'error'); });
    }, 120);
  }

  async function loadAllConversations() {
    var records = await requestPromise(conversationStore('readonly').getAll());
    return (Array.isArray(records) ? records : []).sort(function (a, b) {
      return Number(b.updatedAt || 0) - Number(a.updatedAt || 0);
    });
  }

  function applyConversation(record) {
    state.conversationId = record && record.id ? record.id : newId();
    state.conversationCreatedAt = record && record.createdAt ? record.createdAt : Date.now();
    state.conversationTitle = record && record.title ? record.title : '새 대화';
    state.messages = record && Array.isArray(record.messages) ? record.messages.slice(-MAX_STORED_MESSAGES) : [];
    state.messages.forEach(function (message) {
      if (!message || message.role !== 'assistant' || message.error || message.checklist) return;
      var sections = parseAssistantSections(message.content);
      if (sections.checklist) {
        message.content = sections.answer;
        message.checklist = sections.checklist;
      }
    });
    if (record && record.provider) state.provider = record.provider === 'aistudio' ? 'aistudio' : 'lmstudio';
    if (record && record.responseMode) state.responseMode = record.responseMode === 'reasoning' ? 'reasoning' : 'quick';
    if (record && typeof record.academicSearchEnabled === 'boolean') state.academicSearchEnabled = record.academicSearchEnabled;
    if (record && Number(record.academicSearchCount)) state.academicSearchCount = normalizeAcademicCount(record.academicSearchCount);
    if (record && record.geminiModel) state.geminiModel = record.geminiModel;
    storageSet(CURRENT_CONVERSATION_KEY, state.conversationId);
    storageSet(PROVIDER_KEY, state.provider);
    storageSet(RESPONSE_MODE_KEY, state.responseMode);
    storageSet(ACADEMIC_SEARCH_KEY, state.academicSearchEnabled ? '1' : '0');
    storageSet(ACADEMIC_COUNT_KEY, String(state.academicSearchCount));
    storageSet(GEMINI_MODEL_KEY, state.geminiModel);
    updateProviderUI();
    setResponseMode(state.responseMode);
    updateAcademicSearchUI();
    renderMessages();
    renderConversationHistory();
  }

  async function initializeConversationStore() {
    try {
      state.db = await openChatDb();
      state.dbReady = true;
      state.conversations = await loadAllConversations();
      if (storageGet(MIGRATION_KEY, '0') !== '1') {
        var legacy = loadLegacyHistory();
        if (legacy.length) {
          var migrated = {
            id: newId(), title: titleFromMessages(legacy), createdAt: Date.now(), updatedAt: Date.now(),
            provider: state.provider, responseMode: state.responseMode,
            academicSearchEnabled: state.academicSearchEnabled, academicSearchCount: state.academicSearchCount,
            geminiModel: state.geminiModel,
            messages: legacy
          };
          await requestPromise(conversationStore('readwrite').put(migrated));
          state.conversations.unshift(migrated);
          storageSet(CURRENT_CONVERSATION_KEY, migrated.id);
        }
        storageSet(MIGRATION_KEY, '1');
        try { localStorage.removeItem(HISTORY_KEY); } catch (e) {}
      }
      var currentId = storageGet(CURRENT_CONVERSATION_KEY, '');
      var current = state.conversations.find(function (item) { return item.id === currentId; }) || state.conversations[0];
      if (!current) {
        current = {
          id: newId(), title: '새 대화', createdAt: Date.now(), updatedAt: Date.now(),
          provider: state.provider, responseMode: state.responseMode,
          academicSearchEnabled: state.academicSearchEnabled, academicSearchCount: state.academicSearchCount,
          geminiModel: state.geminiModel, messages: []
        };
        state.conversations = [current];
        await requestPromise(conversationStore('readwrite').put(current));
      }
      applyConversation(current);
    } catch (error) {
      state.dbReady = false;
      state.messages = loadLegacyHistory();
      renderMessages();
      setStatus('IndexedDB를 열지 못해 현재 세션에서만 대화를 유지합니다.', 'error');
    } finally {
      state.storageInitializing = false;
      setRunning(state.running);
    }
  }

  function createUI() {
    if (document.getElementById('ai-chat-launcher')) return;
    var launcher = document.createElement('button');
    launcher.type = 'button';
    launcher.id = 'ai-chat-launcher';
    launcher.className = 'ai-chat-launcher';
    launcher.title = 'AI Chat 열기';
    launcher.setAttribute('aria-label', 'AI Chat 열기');
    launcher.innerHTML = '<span class="ai-chat-launcher-icon" aria-hidden="true">AI</span><span class="ai-chat-launcher-label">Chat</span>';

    var panel = document.createElement('section');
    panel.id = 'ai-chat-panel';
    panel.className = 'ai-chat-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'AI Chat');
    panel.setAttribute('aria-hidden', 'true');
    panel.innerHTML = ''
      + '<header class="ai-chat-header">'
      + '  <div><strong>AI Chat</strong><span id="ai-chat-header-model">연결 확인 전</span></div>'
      + '  <div class="ai-chat-header-actions">'
      + '    <button type="button" id="ai-chat-new" class="ai-chat-icon-action" title="새 대화" aria-label="새 대화">'
      + '      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span class="ai-chat-action-label">새 대화</span>'
      + '    </button>'
      + '    <button type="button" id="ai-chat-copy-all" class="ai-chat-icon-action" aria-label="대화 전체 복사">'
      + '      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg><span class="ai-chat-action-label">복사</span>'
      + '    </button>'
      + '    <button type="button" id="ai-chat-save-all" class="ai-chat-icon-action" aria-label="대화 전체 Markdown 저장">'
      + '      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 20h14"/></svg><span class="ai-chat-action-label">저장</span>'
      + '    </button>'
      + '    <div class="ai-chat-layout-menu-wrap">'
      + '      <button type="button" id="ai-chat-layout-menu-button" class="ai-chat-icon-action" title="창 배치 변경" aria-label="창 배치 변경" aria-expanded="false">'
      + '        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16M15 12h6"/></svg><span class="ai-chat-action-label">배치</span><span class="ai-chat-menu-caret">▾</span>'
      + '      </button>'
      + '      <div id="ai-chat-layout-menu" class="ai-chat-layout-menu" role="menu">'
      + '        <button type="button" data-ai-chat-layout="popup" role="menuitem">팝업</button>'
      + '        <button type="button" data-ai-chat-layout="dock" role="menuitem">Dock · 우측 사이드바</button>'
      + '        <button type="button" data-ai-chat-layout="fullscreen" role="menuitem">전체화면 · 기록 보기</button>'
      + '      </div>'
      + '    </div>'
      + '    <button type="button" id="ai-chat-close" title="닫기" aria-label="AI Chat 닫기">×</button>'
      + '  </div>'
      + '</header>'
      + '<div class="ai-chat-shell">'
      + '  <aside class="ai-chat-history-sidebar" aria-label="대화 기록">'
      + '    <div class="ai-chat-history-head"><strong>대화 기록</strong><button type="button" id="ai-chat-history-new">＋</button></div>'
      + '    <div id="ai-chat-history-list" class="ai-chat-history-list"></div>'
      + '  </aside>'
      + '  <div class="ai-chat-main">'
      + '    <button type="button" id="ai-chat-provider-toggle" class="ai-chat-provider-toggle" aria-expanded="false">'
      + '      <span id="ai-chat-provider-chevron" aria-hidden="true">▸</span><span id="ai-chat-provider-summary">AI 공급자 · 연결 확인 전</span><small id="ai-chat-provider-toggle-label">설정</small>'
      + '    </button>'
      + '    <div id="ai-chat-provider-controls" class="ai-chat-provider-controls collapsed">'
      + '      <div class="ai-chat-provider-row">'
      + '        <label>AI 공급자<select id="ai-chat-provider"><option value="lmstudio">LM Studio</option><option value="aistudio">AI Studio (Gemini)</option></select></label>'
      + '        <label>모델<select id="ai-chat-model"></select></label>'
      + '        <button type="button" id="ai-chat-refresh-model" title="현재 모델 새로고침">↻</button>'
      + '      </div>'
      + '    </div>'
      + '    <div id="ai-chat-status" class="ai-chat-status" role="status" aria-live="polite"></div>'
      + '    <div id="ai-chat-messages" class="ai-chat-messages"></div>'
      + '    <div class="ai-chat-composer">'
      + '      <textarea id="ai-chat-input" rows="3" placeholder="질문을 입력하세요. Enter 전송 · Shift+Enter 줄바꿈"></textarea>'
      + '      <div class="ai-chat-mode-row" role="group" aria-label="응답 모드">'
      + '        <span>응답 모드</span>'
      + '        <button type="button" data-ai-chat-mode="quick">⚡ 즉시응답</button>'
      + '        <button type="button" data-ai-chat-mode="reasoning">🧠 추론</button>'
      + '        <button type="button" id="ai-chat-academic-toggle" class="ai-chat-academic-toggle" aria-pressed="false">🔎 학술검색</button>'
      + '        <label id="ai-chat-academic-count-wrap" class="ai-chat-academic-count-wrap">결과 <select id="ai-chat-academic-count" aria-label="학술검색 결과 수"><option value="5">5개</option><option value="10">10개</option><option value="20">20개</option><option value="30">30개</option><option value="50">50개</option></select></label>'
      + '        <small id="ai-chat-mode-help"></small>'
      + '      </div>'
      + '      <div class="ai-chat-compose-actions">'
      + '        <span>대화 내용은 IndexedDB에 저장됩니다.</span>'
      + '        <button type="button" id="ai-chat-import-selection" class="ai-chat-import-selection" aria-label="문서 선택 내용을 AI Chat 입력창으로 가져오기" data-tooltip="문서에서 내용을 선택한 뒤 Ctrl+Alt+L을 누르거나 이 버튼을 클릭하세요.">↙ 선택 가져오기</button>'
      + '        <button type="button" id="ai-chat-stop" class="ai-chat-stop" disabled>중지</button>'
      + '        <button type="button" id="ai-chat-send" class="ai-chat-send">전송</button>'
      + '      </div>'
      + '    </div>'
      + '  </div>'
      + '</div>';

    var dockSlot = document.createElement('div');
    dockSlot.id = 'ai-chat-dock-slot';
    dockSlot.className = 'ai-chat-dock-slot order-4 shrink-0';
    dockSlot.innerHTML = '<div id="ai-chat-dock-resizer" class="ai-chat-dock-resizer" title="드래그하여 Dock 너비 조절"></div>';
    var rightSidebar = document.getElementById('ai-right-sidebar-wrap');
    if (rightSidebar && rightSidebar.parentElement) rightSidebar.parentElement.appendChild(dockSlot);

    document.body.appendChild(launcher);
    document.body.appendChild(panel);

    launcher.addEventListener('click', function () { setOpen(!state.open); });
    document.getElementById('ai-chat-close').addEventListener('click', function () { setOpen(false); });
    document.getElementById('ai-chat-new').addEventListener('click', startNewChat);
    document.getElementById('ai-chat-history-new').addEventListener('click', startNewChat);
    document.getElementById('ai-chat-copy-all').addEventListener('click', copyConversation);
    document.getElementById('ai-chat-save-all').addEventListener('click', saveConversationMarkdown);
    document.getElementById('ai-chat-send').addEventListener('click', sendMessage);
    document.getElementById('ai-chat-stop').addEventListener('click', stopMessage);
    var importSelectionButton = document.getElementById('ai-chat-import-selection');
    importSelectionButton.addEventListener('mousedown', function (event) {
      documentSelectionBuffer = readDocumentSelectionText();
      event.preventDefault();
    });
    importSelectionButton.addEventListener('click', importDocumentSelectionToChat);
    document.getElementById('ai-chat-refresh-model').addEventListener('click', function () { refreshModels(false); });
    document.getElementById('ai-chat-provider-toggle').addEventListener('click', function () {
      setProviderControlsOpen(!state.providerControlsOpen);
    });
    document.getElementById('ai-chat-layout-menu-button').addEventListener('click', function (event) {
      event.stopPropagation();
      toggleLayoutMenu();
    });
    var layoutButtons = panel.querySelectorAll('[data-ai-chat-layout]');
    for (var layoutIndex = 0; layoutIndex < layoutButtons.length; layoutIndex++) {
      layoutButtons[layoutIndex].addEventListener('click', function () {
        setLayout(this.getAttribute('data-ai-chat-layout'));
      });
    }
    var modeButtons = panel.querySelectorAll('[data-ai-chat-mode]');
    for (var modeIndex = 0; modeIndex < modeButtons.length; modeIndex++) {
      modeButtons[modeIndex].addEventListener('click', function () {
        setResponseMode(this.getAttribute('data-ai-chat-mode'));
      });
    }
    document.getElementById('ai-chat-academic-toggle').addEventListener('click', function () {
      setAcademicSearchEnabled(!state.academicSearchEnabled);
    });
    document.getElementById('ai-chat-academic-count').addEventListener('change', function (event) {
      state.academicSearchCount = normalizeAcademicCount(event.target.value);
      storageSet(ACADEMIC_COUNT_KEY, String(state.academicSearchCount));
      updateAcademicSearchUI();
      saveHistory();
    });
    document.getElementById('ai-chat-provider').addEventListener('change', function (event) {
      state.provider = event.target.value === 'aistudio' ? 'aistudio' : 'lmstudio';
      storageSet(PROVIDER_KEY, state.provider);
      updateProviderUI();
      refreshModels(false);
      saveHistory();
    });
    document.getElementById('ai-chat-model').addEventListener('change', function (event) {
      if (state.provider !== 'aistudio') return;
      state.geminiModel = event.target.value || DEFAULT_GEMINI_MODELS[0];
      storageSet(GEMINI_MODEL_KEY, state.geminiModel);
      updateHeaderModel();
      updateModelModeUI();
      saveHistory();
    });
    document.getElementById('ai-chat-input').addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        sendMessage();
      }
    });
    setupPopupDrag(panel);
    setupDockResize(dockSlot);
    document.addEventListener('click', function (event) {
      if (!event.target.closest('.ai-chat-layout-menu-wrap')) closeLayoutMenu();
    });
    root.addEventListener('resize', function () {
      clampPopupToViewport();
      updateDockHistoryVisibility();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && state.open && state.layout === 'fullscreen') setLayout('popup');
      if (event.ctrlKey && event.altKey && !event.shiftKey && !event.metaKey && String(event.key || '').toLowerCase() === 'l') {
        moveDocumentSelectionToChat(event);
      }
    });
  }

  function closeLayoutMenu() {
    var menu = document.getElementById('ai-chat-layout-menu');
    var button = document.getElementById('ai-chat-layout-menu-button');
    if (menu) menu.classList.remove('open');
    if (button) button.setAttribute('aria-expanded', 'false');
  }

  function toggleLayoutMenu() {
    var menu = document.getElementById('ai-chat-layout-menu');
    var button = document.getElementById('ai-chat-layout-menu-button');
    if (!menu) return;
    var open = !menu.classList.contains('open');
    menu.classList.toggle('open', open);
    if (button) button.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function readPopupRect() {
    try {
      var value = JSON.parse(storageGet(POPUP_RECT_KEY, 'null'));
      return value && Number.isFinite(value.left) && Number.isFinite(value.top) ? value : null;
    } catch (e) { return null; }
  }

  function savePopupRect() {
    var panel = document.getElementById('ai-chat-panel');
    if (!panel || state.layout !== 'popup') return;
    var rect = panel.getBoundingClientRect();
    storageSet(POPUP_RECT_KEY, JSON.stringify({
      left: Math.round(rect.left), top: Math.round(rect.top),
      width: Math.round(rect.width), height: Math.round(rect.height)
    }));
  }

  function applyPopupRect() {
    var panel = document.getElementById('ai-chat-panel');
    if (!panel || state.layout !== 'popup') return;
    var saved = readPopupRect();
    if (!saved) {
      panel.style.left = '';
      panel.style.top = '';
      panel.style.right = '';
      panel.style.bottom = '';
      panel.style.width = '';
      panel.style.height = '';
      return;
    }
    var minWidth = Math.min(340, root.innerWidth - 12);
    var minHeight = Math.min(360, root.innerHeight - 12);
    var width = Math.max(minWidth, Math.min(saved.width || 410, root.innerWidth - 12));
    var height = Math.max(minHeight, Math.min(saved.height || 650, root.innerHeight - 12));
    var left = Math.max(6, Math.min(saved.left, root.innerWidth - width - 6));
    var top = Math.max(6, Math.min(saved.top, root.innerHeight - height - 6));
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panel.style.width = width + 'px';
    panel.style.height = height + 'px';
  }

  function clampPopupToViewport() {
    if (state.layout !== 'popup') return;
    var panel = document.getElementById('ai-chat-panel');
    if (!panel || !state.open) return;
    var rect = panel.getBoundingClientRect();
    var width = Math.min(rect.width, root.innerWidth - 12);
    var height = Math.min(rect.height, root.innerHeight - 12);
    panel.style.width = Math.max(Math.min(340, root.innerWidth - 12), width) + 'px';
    panel.style.height = Math.max(Math.min(360, root.innerHeight - 12), height) + 'px';
    panel.style.left = Math.max(6, Math.min(rect.left, root.innerWidth - width - 6)) + 'px';
    panel.style.top = Math.max(6, Math.min(rect.top, root.innerHeight - height - 6)) + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    savePopupRect();
  }

  function updateLayoutButtons() {
    var buttons = document.querySelectorAll('#ai-chat-panel [data-ai-chat-layout]');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].classList.toggle('active', buttons[i].getAttribute('data-ai-chat-layout') === state.layout);
    }
  }

  function syncLayoutVisibility() {
    var slot = document.getElementById('ai-chat-dock-slot');
    if (slot) slot.classList.toggle('active', state.open && state.enabled && state.layout === 'dock');
    document.body.classList.toggle('ai-chat-fullscreen-open', state.open && state.layout === 'fullscreen');
  }

  function updateDockHistoryVisibility(widthOverride) {
    var panel = document.getElementById('ai-chat-panel');
    var slot = document.getElementById('ai-chat-dock-slot');
    if (!panel) return;
    var width = Number(widthOverride);
    if (!Number.isFinite(width) && slot) width = slot.getBoundingClientRect().width;
    panel.classList.toggle('dock-history-visible', state.layout === 'dock' && width >= DOCK_HISTORY_MIN_WIDTH);
  }

  function setLayout(layout) {
    layout = layout === 'dock' || layout === 'fullscreen' ? layout : 'popup';
    var panel = document.getElementById('ai-chat-panel');
    var slot = document.getElementById('ai-chat-dock-slot');
    if (!panel) return;
    if (state.layout === 'popup' && state.open) savePopupRect();
    state.layout = layout;
    storageSet(LAYOUT_KEY, layout);
    panel.classList.remove('layout-popup', 'layout-dock', 'layout-fullscreen');
    panel.classList.add('layout-' + layout);
    if (layout === 'dock' && slot) {
      slot.appendChild(panel);
      panel.removeAttribute('style');
      var savedDockWidth = Number(storageGet(DOCK_WIDTH_KEY, ''));
      if (Number.isFinite(savedDockWidth) && savedDockWidth >= 340) {
        slot.style.width = Math.min(savedDockWidth, root.innerWidth * 0.7) + 'px';
      }
    } else {
      document.body.appendChild(panel);
      panel.removeAttribute('style');
      if (layout === 'popup') applyPopupRect();
    }
    closeLayoutMenu();
    updateLayoutButtons();
    syncLayoutVisibility();
    renderConversationHistory();
    setTimeout(updateDockHistoryVisibility, 0);
    setTimeout(function () {
      var input = document.getElementById('ai-chat-input');
      if (state.open && input) input.focus();
    }, 0);
  }

  function setupPopupDrag(panel) {
    var header = panel.querySelector('.ai-chat-header');
    if (!header) return;
    header.addEventListener('pointerdown', function (event) {
      if (state.layout !== 'popup' || event.button !== 0 || event.target.closest('button, select, input, textarea, .ai-chat-layout-menu')) return;
      var rect = panel.getBoundingClientRect();
      var offsetX = event.clientX - rect.left;
      var offsetY = event.clientY - rect.top;
      panel.style.left = rect.left + 'px';
      panel.style.top = rect.top + 'px';
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      panel.classList.add('dragging');
      header.setPointerCapture(event.pointerId);
      function move(moveEvent) {
        var left = Math.max(4, Math.min(moveEvent.clientX - offsetX, root.innerWidth - panel.offsetWidth - 4));
        var top = Math.max(4, Math.min(moveEvent.clientY - offsetY, root.innerHeight - panel.offsetHeight - 4));
        panel.style.left = left + 'px';
        panel.style.top = top + 'px';
      }
      function finish() {
        panel.classList.remove('dragging');
        header.removeEventListener('pointermove', move);
        header.removeEventListener('pointerup', finish);
        header.removeEventListener('pointercancel', finish);
        savePopupRect();
      }
      header.addEventListener('pointermove', move);
      header.addEventListener('pointerup', finish);
      header.addEventListener('pointercancel', finish);
      event.preventDefault();
    });
    panel.addEventListener('pointerup', function () {
      if (state.layout === 'popup') setTimeout(savePopupRect, 0);
    });
  }

  function setupDockResize(slot) {
    var handle = document.getElementById('ai-chat-dock-resizer');
    if (!handle || !slot) return;
    handle.addEventListener('pointerdown', function (event) {
      if (state.layout !== 'dock') return;
      var startX = event.clientX;
      var startWidth = slot.getBoundingClientRect().width;
      handle.setPointerCapture(event.pointerId);
      function move(moveEvent) {
        var width = Math.max(340, Math.min(startWidth + startX - moveEvent.clientX, root.innerWidth * 0.7));
        slot.style.width = Math.round(width) + 'px';
        updateDockHistoryVisibility(width);
      }
      function finish() {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', finish);
        handle.removeEventListener('pointercancel', finish);
        storageSet(DOCK_WIDTH_KEY, String(Math.round(slot.getBoundingClientRect().width)));
        updateDockHistoryVisibility();
      }
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', finish);
      handle.addEventListener('pointercancel', finish);
      event.preventDefault();
    });
    updateDockHistoryVisibility(slot.getBoundingClientRect().width);
  }

  function setStatus(message, kind) {
    var el = document.getElementById('ai-chat-status');
    if (!el) return;
    el.textContent = message || '';
    el.className = 'ai-chat-status' + (kind ? ' ' + kind : '');
  }

  function getThinkingStage(elapsedSeconds) {
    if (state.provider === 'aistudio' && isGeminiImageModel(state.geminiModel)) {
      if (elapsedSeconds < 2) return 'Nano Banana에 연결하는 중';
      if (elapsedSeconds < 8) return '이미지 구성을 준비하는 중';
      if (elapsedSeconds < 30) return '이미지를 생성하는 중';
      return '생성 이미지를 마무리하는 중';
    }
    if (state.responseMode === 'quick') {
      if (elapsedSeconds < 1.5) return 'AI 서버와 연결하는 중';
      if (elapsedSeconds < 4) return '대화 문맥을 확인하는 중';
      if (elapsedSeconds < 15) return '즉시 답변을 생성하는 중';
      return '응답을 마무리하는 중';
    }
    if (elapsedSeconds < 1.5) return 'AI 서버와 연결하는 중';
    if (elapsedSeconds < 4) return '대화 문맥을 읽는 중';
    if (elapsedSeconds < 12) return '답변을 고민하는 중';
    return '응답 내용을 정리하는 중';
  }

  function updateThinkingProgress() {
    if (!state.running) return;
    var elapsed = Math.max(0, (Date.now() - thinkingStartedAt) / 1000);
    thinkingProgress = Math.min(94, Math.max(thinkingProgress, 8 + Math.log1p(elapsed) * 22));
    var stage = getThinkingStage(elapsed);
    var stageEl = document.getElementById('ai-chat-thinking-stage');
    var elapsedEl = document.getElementById('ai-chat-thinking-elapsed');
    var bar = document.getElementById('ai-chat-thinking-progress');
    if (stageEl) stageEl.textContent = stage;
    if (elapsedEl) elapsedEl.textContent = Math.floor(elapsed) + '초';
    if (bar) bar.style.width = thinkingProgress.toFixed(1) + '%';
    setStatus(stage + ' · ' + Math.floor(elapsed) + '초', 'loading');
  }

  function startThinkingProgress() {
    if (thinkingTimer) clearInterval(thinkingTimer);
    thinkingStartedAt = Date.now();
    thinkingProgress = 8;
    updateThinkingProgress();
    thinkingTimer = setInterval(updateThinkingProgress, 300);
  }

  function stopThinkingProgress() {
    if (thinkingTimer) clearInterval(thinkingTimer);
    thinkingTimer = null;
    thinkingProgress = 0;
  }

  function setEnabled(enabled) {
    state.enabled = !!enabled;
    storageSet(ENABLED_KEY, state.enabled ? '1' : '0');
    var checkbox = document.getElementById('ai-chat-enabled');
    if (checkbox) checkbox.checked = state.enabled;
    var launcher = document.getElementById('ai-chat-launcher');
    if (launcher) launcher.classList.toggle('enabled', state.enabled);
    if (!state.enabled) {
      if (state.running) stopMessage();
      setOpen(false);
    }
    syncLayoutVisibility();
  }

  function setProviderControlsOpen(open) {
    state.providerControlsOpen = !!open;
    storageSet(PROVIDER_CONTROLS_KEY, state.providerControlsOpen ? '1' : '0');
    var controls = document.getElementById('ai-chat-provider-controls');
    var toggle = document.getElementById('ai-chat-provider-toggle');
    var chevron = document.getElementById('ai-chat-provider-chevron');
    var label = document.getElementById('ai-chat-provider-toggle-label');
    if (controls) controls.classList.toggle('collapsed', !state.providerControlsOpen);
    if (toggle) toggle.setAttribute('aria-expanded', state.providerControlsOpen ? 'true' : 'false');
    if (chevron) chevron.textContent = state.providerControlsOpen ? '▾' : '▸';
    if (label) label.textContent = state.providerControlsOpen ? '접기' : '설정';
  }

  function updateProviderSummary() {
    var summary = document.getElementById('ai-chat-provider-summary');
    if (!summary) return;
    if (state.provider === 'lmstudio') {
      summary.textContent = 'AI 공급자 · LM Studio · ' + (state.lmModel || '로드 모델 확인 필요');
    } else {
      summary.textContent = 'AI 공급자 · AI Studio · ' + geminiModelLabel(state.geminiModel);
    }
  }

  function normalizeAcademicCount(value) {
    var count = Number(value) || 10;
    return Math.max(1, Math.min(50, Math.round(count)));
  }

  function updateModeHelp() {
    var help = document.getElementById('ai-chat-mode-help');
    if (!help) return;
    if (isGeminiImageModel(state.geminiModel) && state.provider === 'aistudio') {
      help.textContent = '이미지 생성 모델 · 설명을 입력하면 채팅에 이미지 표시';
      return;
    }
    if (state.academicSearchEnabled) {
      help.textContent = 'OpenAlex → Crossref · 초록 근거 ' + state.academicSearchCount + '건 우선';
      return;
    }
    help.textContent = state.responseMode === 'reasoning'
      ? '추론 ON · 긴 답변 · 최대 5분 대기'
      : '추론 OFF · 간결한 답변 · 최대 60초 대기';
  }

  function updateAcademicSearchUI() {
    var button = document.getElementById('ai-chat-academic-toggle');
    var countWrap = document.getElementById('ai-chat-academic-count-wrap');
    var countSelect = document.getElementById('ai-chat-academic-count');
    var imageModel = state.provider === 'aistudio' && isGeminiImageModel(state.geminiModel);
    if (button) {
      button.classList.toggle('active', state.academicSearchEnabled);
      button.setAttribute('aria-pressed', state.academicSearchEnabled ? 'true' : 'false');
      button.disabled = state.running || imageModel;
    }
    if (countWrap) countWrap.classList.toggle('visible', state.academicSearchEnabled && !imageModel);
    if (countSelect) {
      countSelect.value = String(state.academicSearchCount);
      countSelect.disabled = state.running || imageModel;
    }
    updateModeHelp();
  }

  function setAcademicSearchEnabled(enabled) {
    state.academicSearchEnabled = !!enabled;
    storageSet(ACADEMIC_SEARCH_KEY, state.academicSearchEnabled ? '1' : '0');
    updateAcademicSearchUI();
    updateHeaderModel();
    saveHistory();
  }

  function moveDocumentSelectionToChat(event) {
    if (!state.enabled) return;
    var selected = readDocumentSelectionText();
    event.preventDefault();
    setOpen(true);
    putDocumentSelectionInComposer(selected);
  }

  function readDocumentSelectionText() {
    var selected = '';
    if (root.getSelection) {
      try { selected = String(root.getSelection().toString() || ''); } catch (e) {}
    }
    if (selected.trim()) return selected;
    try {
      var bridge = getBridge();
      if (typeof bridge.getSelectedDocumentText === 'function') selected = String(bridge.getSelectedDocumentText() || '');
    } catch (error) {
      selected = '';
    }
    return selected;
  }

  function putDocumentSelectionInComposer(selected) {
    if (!selected.trim()) {
      setStatus('문서에서 AI Chat으로 보낼 영역을 먼저 선택하세요.', 'error');
      return;
    }
    setTimeout(function () {
      var input = document.getElementById('ai-chat-input');
      if (!input) return;
      input.value = selected.trim();
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
      setStatus('선택한 문서 내용을 AI Chat 입력창으로 가져왔습니다.', 'ok');
    }, 0);
  }

  function importDocumentSelectionToChat() {
    var selected = documentSelectionBuffer || readDocumentSelectionText();
    documentSelectionBuffer = '';
    putDocumentSelectionInComposer(selected);
  }

  function setResponseMode(mode) {
    state.responseMode = mode === 'reasoning' ? 'reasoning' : 'quick';
    storageSet(RESPONSE_MODE_KEY, state.responseMode);
    var buttons = document.querySelectorAll('#ai-chat-panel [data-ai-chat-mode]');
    for (var i = 0; i < buttons.length; i++) {
      var active = buttons[i].getAttribute('data-ai-chat-mode') === state.responseMode;
      buttons[i].classList.toggle('active', active);
      buttons[i].setAttribute('aria-pressed', active ? 'true' : 'false');
    }
    updateModeHelp();
    updateHeaderModel();
    saveHistory();
  }

  function setOpen(open) {
    if (!open && state.open && state.layout === 'popup') savePopupRect();
    state.open = !!open && state.enabled;
    var panel = document.getElementById('ai-chat-panel');
    var launcher = document.getElementById('ai-chat-launcher');
    if (panel) {
      panel.classList.toggle('open', state.open);
      panel.setAttribute('aria-hidden', state.open ? 'false' : 'true');
    }
    if (launcher) launcher.classList.toggle('active', state.open);
    syncLayoutVisibility();
    setTimeout(updateDockHistoryVisibility, 0);
    if (state.open) {
      if (state.layout === 'popup') applyPopupRect();
      renderMessages();
      refreshModels(true);
      setTimeout(function () {
        var input = document.getElementById('ai-chat-input');
        if (input) input.focus();
      }, 0);
    }
  }

  function setRunning(running) {
    state.running = !!running;
    var send = document.getElementById('ai-chat-send');
    var stop = document.getElementById('ai-chat-stop');
    var input = document.getElementById('ai-chat-input');
    var provider = document.getElementById('ai-chat-provider');
    var model = document.getElementById('ai-chat-model');
    var refresh = document.getElementById('ai-chat-refresh-model');
    var importSelection = document.getElementById('ai-chat-import-selection');
    var academicToggle = document.getElementById('ai-chat-academic-toggle');
    var academicCount = document.getElementById('ai-chat-academic-count');
    var modeButtons = document.querySelectorAll('#ai-chat-panel [data-ai-chat-mode]');
    if (send) send.disabled = state.running || state.storageInitializing;
    if (stop) stop.disabled = !state.running;
    if (input) input.disabled = state.running || state.storageInitializing;
    if (provider) provider.disabled = state.running;
    if (model) model.disabled = state.running || state.provider === 'lmstudio';
    if (refresh) refresh.disabled = state.running;
    if (importSelection) importSelection.disabled = state.running || state.storageInitializing;
    var imageModel = state.provider === 'aistudio' && isGeminiImageModel(state.geminiModel);
    for (var i = 0; i < modeButtons.length; i++) modeButtons[i].disabled = state.running || imageModel;
    if (academicToggle) academicToggle.disabled = state.running || imageModel;
    if (academicCount) academicCount.disabled = state.running || imageModel;
  }

  function updateHeaderModel() {
    var header = document.getElementById('ai-chat-header-model');
    if (!header) return;
    header.textContent = state.provider === 'lmstudio'
      ? (state.lmModel ? 'LM Studio · ' + state.lmModel : 'LM Studio · 로드 모델 확인 필요')
      : 'AI Studio · ' + state.geminiModel;
    header.textContent += state.provider === 'aistudio' && isGeminiImageModel(state.geminiModel)
      ? ' · 이미지 생성'
      : (state.responseMode === 'reasoning' ? ' · 추론' : ' · 즉시응답');
    if (state.academicSearchEnabled && !(state.provider === 'aistudio' && isGeminiImageModel(state.geminiModel))) {
      header.textContent += ' · 학술검색';
    }
    updateProviderSummary();
  }

  function isGeminiImageModel(model) {
    return /(?:^|-)image(?:-|$)/i.test(String(model || ''));
  }

  function geminiModelLabel(model) {
    var labels = {
      'gemini-3.5-flash': 'Gemini 3.5 Flash',
      'gemini-3.1-pro-preview': 'Gemini 3.1 Pro Preview',
      'gemini-3-flash-preview': 'Gemini 3 Flash Preview',
      'gemini-2.5-flash': 'Gemini 2.5 Flash',
      'gemini-2.5-pro': 'Gemini 2.5 Pro',
      'gemini-2.5-flash-lite': 'Gemini 2.5 Flash Lite',
      'gemini-3.1-flash-lite-image': '🍌 Nano Banana 2 Lite · 이미지',
      'gemini-3.1-flash-image': '🍌 Nano Banana 2 · 이미지',
      'gemini-3-pro-image': '🍌 Nano Banana Pro · 이미지',
      'gemini-2.5-flash-image': '🍌 Nano Banana · 이미지'
    };
    return labels[model] ? labels[model] + ' · ' + model : model;
  }

  function updateModelModeUI() {
    var imageModel = state.provider === 'aistudio' && isGeminiImageModel(state.geminiModel);
    var panel = document.getElementById('ai-chat-panel');
    var input = document.getElementById('ai-chat-input');
    var buttons = document.querySelectorAll('#ai-chat-panel [data-ai-chat-mode]');
    if (panel) panel.classList.toggle('image-model-selected', imageModel);
    if (input) input.placeholder = imageModel
      ? '생성할 이미지를 설명하세요. Enter 생성 · Shift+Enter 줄바꿈'
      : '질문을 입력하세요. Enter 전송 · Shift+Enter 줄바꿈';
    for (var i = 0; i < buttons.length; i++) buttons[i].disabled = state.running || imageModel;
    updateAcademicSearchUI();
  }

  function setModelOptions(models, selected, disabled) {
    var select = document.getElementById('ai-chat-model');
    if (!select) return;
    var values = Array.from(new Set((Array.isArray(models) ? models : []).map(String).filter(Boolean)));
    select.innerHTML = '';
    if (!values.length) {
      var empty = document.createElement('option');
      empty.value = '';
      empty.textContent = disabled ? '현재 로드된 모델 없음' : '모델 목록 없음';
      select.appendChild(empty);
    } else {
      values.forEach(function (model, index) {
        var option = document.createElement('option');
        option.value = model;
        option.textContent = disabled && index === 0 ? model + ' (자동 사용)' : geminiModelLabel(model);
        select.appendChild(option);
      });
      select.value = values.indexOf(selected) >= 0 ? selected : values[0];
    }
    select.disabled = !!disabled;
  }

  function updateProviderUI() {
    var provider = document.getElementById('ai-chat-provider');
    if (provider) provider.value = state.provider;
    if (state.provider === 'lmstudio') {
      setModelOptions(state.lmModel ? [state.lmModel] : [], state.lmModel, true);
    } else {
      var cached = DEFAULT_GEMINI_MODELS;
      try { cached = getBridge().getCachedGeminiModels(); } catch (e) {}
      if (!cached || !cached.length) cached = DEFAULT_GEMINI_MODELS;
      setModelOptions(cached, state.geminiModel, false);
      var model = document.getElementById('ai-chat-model');
      if (model && model.value) {
        state.geminiModel = model.value;
        storageSet(GEMINI_MODEL_KEY, state.geminiModel);
      }
    }
    updateHeaderModel();
    updateModelModeUI();
  }

  async function refreshModels(silent) {
    if (!state.open && silent) return;
    var requestedProvider = state.provider;
    try {
      var bridge = getBridge();
      if (!silent) setStatus('모델 정보를 확인하는 중...', 'loading');
      if (state.provider === 'lmstudio') {
        var lm = await bridge.refreshLMStudioModels();
        if (state.provider !== requestedProvider) return;
        state.lmModel = lm && lm.model ? lm.model : '';
        setModelOptions(lm && lm.models ? lm.models : [], state.lmModel, true);
        setStatus(state.lmModel ? '현재 LM Studio 로드 모델을 자동으로 사용합니다.' : 'LM Studio에 로드된 LLM이 없습니다.', state.lmModel ? 'ok' : 'error');
      } else {
        var models = silent ? bridge.getCachedGeminiModels() : await bridge.refreshGeminiModels();
        if (state.provider !== requestedProvider) return;
        if (!models || !models.length) models = DEFAULT_GEMINI_MODELS;
        setModelOptions(models, state.geminiModel, false);
        var modelSelect = document.getElementById('ai-chat-model');
        if (modelSelect && modelSelect.value) state.geminiModel = modelSelect.value;
        storageSet(GEMINI_MODEL_KEY, state.geminiModel);
        setStatus(isGeminiImageModel(state.geminiModel)
          ? 'Nano Banana 이미지 모델입니다. 생성할 장면을 입력하세요.'
          : 'AI Studio API Key와 선택한 Gemini 텍스트 모델을 사용합니다.', 'ok');
      }
      updateHeaderModel();
      updateModelModeUI();
    } catch (error) {
      if (state.provider === 'lmstudio') {
        state.lmModel = '';
        setModelOptions([], '', true);
      }
      setStatus(error && error.message ? error.message : String(error), 'error');
      updateHeaderModel();
    }
  }

  function formatConversationDate(value) {
    try {
      return new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
    } catch (e) { return ''; }
  }

  function renderConversationHistory() {
    var list = document.getElementById('ai-chat-history-list');
    if (!list) return;
    list.innerHTML = '';
    if (!state.conversations.length) {
      var empty = document.createElement('p');
      empty.className = 'ai-chat-history-empty';
      empty.textContent = '저장된 대화가 없습니다.';
      list.appendChild(empty);
      return;
    }
    state.conversations.forEach(function (conversation) {
      var item = document.createElement('div');
      item.setAttribute('role', 'button');
      item.tabIndex = 0;
      item.className = 'ai-chat-history-item' + (conversation.id === state.conversationId ? ' active' : '');
      item.innerHTML = '<span class="ai-chat-history-title"></span><small></small><button type="button" class="ai-chat-history-delete" aria-label="대화 삭제" title="대화 삭제">×</button>';
      item.querySelector('.ai-chat-history-title').textContent = conversation.title || '새 대화';
      item.querySelector('small').textContent = formatConversationDate(conversation.updatedAt || conversation.createdAt);
      item.addEventListener('click', function (event) {
        if (event.target.closest('.ai-chat-history-delete')) {
          event.stopPropagation();
          deleteConversation(conversation.id);
          return;
        }
        selectConversation(conversation.id);
      });
      item.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectConversation(conversation.id);
        }
      });
      list.appendChild(item);
    });
  }

  async function selectConversation(id) {
    if (!state.dbReady || state.running || id === state.conversationId) return;
    try {
      await saveConversationNow();
      var record = await requestPromise(conversationStore('readonly').get(id));
      if (record) {
        applyConversation(record);
        setStatus('저장된 대화를 불러왔습니다.', 'ok');
      }
    } catch (error) {
      setStatus('대화를 불러오지 못했습니다.', 'error');
    }
  }

  async function deleteConversation(id) {
    if (!state.dbReady || state.running) return;
    var target = state.conversations.find(function (item) { return item.id === id; });
    if (!target || !root.confirm('“' + (target.title || '새 대화') + '” 기록을 삭제할까요?')) return;
    try {
      await requestPromise(conversationStore('readwrite').delete(id));
      state.conversations = state.conversations.filter(function (item) { return item.id !== id; });
      if (state.conversationId === id) {
        if (state.conversations.length) applyConversation(state.conversations[0]);
        else await createNewConversation(false);
      }
      renderConversationHistory();
    } catch (error) {
      setStatus('대화 기록을 삭제하지 못했습니다.', 'error');
    }
  }

  function parseAssistantSections(rawText) {
    var raw = String(rawText || '').trim();
    var checklist = '';
    var answer = raw;
    var remaining = raw;
    var checklistTag = raw.match(/\[CHECKLIST\]([\s\S]*?)\[\/CHECKLIST\]/i);
    var answerTag = raw.match(/\[ANSWER\]([\s\S]*?)\[\/ANSWER\]/i);
    if (checklistTag) {
      checklist = checklistTag[1].trim();
      remaining = remaining.replace(checklistTag[0], '').trim();
    }
    if (answerTag) answer = answerTag[1].trim();
    else if (checklistTag) answer = raw.replace(checklistTag[0], '').replace(/\[\/?ANSWER\]/gi, '').trim();
    if (!checklist) {
      var lines = raw.split(/\r?\n/);
      var headingIndex = lines.findIndex(function (line) {
        return /^\s*#{0,4}\s*(?:답변\s*)?체크리스트\s*:?\s*$/i.test(line);
      });
      if (headingIndex >= 0) {
        var checklistLines = [];
        var endIndex = headingIndex + 1;
        var hasListItem = false;
        for (; endIndex < lines.length; endIndex++) {
          var line = lines[endIndex];
          if (/^\s*#{0,4}\s*(?:최종\s*)?답변\s*:?\s*$/i.test(line)) break;
          if (!String(line).trim()) {
            if (checklistLines.length) break;
            continue;
          }
          if (/^\s*(?:\d+[.)]|[-*])\s+/.test(line)) {
            hasListItem = true;
            checklistLines.push(line);
            continue;
          }
          if (!hasListItem || !/^\s{2,}\S/.test(line)) break;
          checklistLines.push(line);
        }
        if (hasListItem) {
          checklist = checklistLines.join('\n').trim();
          var answerLines = lines.slice(0, headingIndex).concat(lines.slice(endIndex));
          answer = answerLines.join('\n').replace(/^\s*#{0,4}\s*(?:최종\s*)?답변\s*:?\s*/i, '').trim();
          remaining = answer;
        }
      }
    }
    return { answer: answer || raw, checklist: checklist, remaining: remaining };
  }

  function findQuestionForAnswer(messageIndex) {
    for (var i = messageIndex - 1; i >= 0; i--) {
      if (state.messages[i] && state.messages[i].role === 'user') return String(state.messages[i].content || '').trim();
    }
    return '';
  }

  function formatQuestionAnswer(question, answer) {
    return '## 질문\n\n' + String(question || '').trim() + '\n\n## 답변\n\n' + String(answer || '').trim();
  }

  function copyQuestionAnswer(messageIndex, message) {
    var question = findQuestionForAnswer(messageIndex);
    if (!question) return setStatus('연결된 질문을 찾지 못했습니다.', 'error');
    copyText(formatQuestionAnswer(question, message.content));
  }

  function putQuestionInComposer(text, sendImmediately) {
    if (state.running) return setStatus('현재 응답이 끝난 뒤 다시 시도하세요.', 'error');
    var input = document.getElementById('ai-chat-input');
    if (!input) return setStatus('AI Chat 입력창을 찾지 못했습니다.', 'error');
    input.value = String(text || '');
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    if (sendImmediately) {
      setStatus('같은 질문을 다시 전송합니다.', 'loading');
      sendMessage();
    } else {
      setStatus('질문을 입력창에 불러왔습니다. 수정한 뒤 전송하세요.', 'ok');
    }
  }

  function deleteQuestion(messageIndex, message) {
    if (state.running) return setStatus('현재 응답이 끝난 뒤 질문을 지울 수 있습니다.', 'error');
    var preview = String(message && message.content || '').replace(/\s+/g, ' ').trim();
    if (preview.length > 45) preview = preview.slice(0, 45) + '…';
    if (!root.confirm('“' + (preview || '이 질문') + '”과 연결된 AI 답변을 함께 지울까요?')) return;
    var deleteCount = 1;
    for (var i = messageIndex + 1; i < state.messages.length; i++) {
      if (!state.messages[i] || state.messages[i].role === 'user') break;
      deleteCount += 1;
    }
    state.messages.splice(messageIndex, deleteCount);
    state.conversationTitle = titleFromMessages(state.messages);
    saveHistory();
    renderMessages();
    setStatus('질문과 연결된 답변을 지웠습니다.', 'ok');
  }

  function createQuestionActions(message, messageIndex) {
    var actions = document.createElement('div');
    actions.className = 'ai-chat-question-actions';
    var copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = '질문 복사';
    copy.addEventListener('click', function () { copyText(message.content); });
    actions.appendChild(copy);
    var retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = '다시 질문';
    retry.title = '같은 질문을 새 요청으로 즉시 다시 전송';
    retry.disabled = state.running;
    retry.addEventListener('click', function () { putQuestionInComposer(message.content, true); });
    actions.appendChild(retry);
    var edit = document.createElement('button');
    edit.type = 'button';
    edit.textContent = '편집';
    edit.title = '질문을 입력창으로 불러와 수정';
    edit.disabled = state.running;
    edit.addEventListener('click', function () { putQuestionInComposer(message.content, false); });
    actions.appendChild(edit);
    var remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'ai-chat-question-delete';
    remove.textContent = '질문 지우기';
    remove.title = '이 질문과 연결된 AI 답변을 대화에서 삭제';
    remove.disabled = state.running;
    remove.addEventListener('click', function () { deleteQuestion(messageIndex, message); });
    actions.appendChild(remove);
    return actions;
  }

  function insertModeLabel(mode) {
    if (mode === 'replace') return '선택 영역에 대체 삽입';
    if (mode === 'line-below') return '현재 줄의 한 줄 아래에 삽입';
    return '커서 위치에 삽입';
  }

  function insertQuestionAnswer(messageIndex, message, mode) {
    var question = findQuestionForAnswer(messageIndex);
    if (!question) return setStatus('문서에 삽입할 질문을 찾지 못했습니다.', 'error');
    try {
      var bridge = getBridge();
      if (typeof bridge.insertIntoDocument !== 'function') throw new Error('문서 삽입 모듈이 준비되지 않았습니다.');
      bridge.insertIntoDocument(formatQuestionAnswer(question, message.content), mode || 'cursor');
      setStatus('질문과 답변을 ' + insertModeLabel(mode) + '했습니다.', 'ok');
    } catch (error) {
      setStatus(error && error.message ? error.message : '문서에 삽입하지 못했습니다.', 'error');
    }
  }

  function insertReasoningAndAnswer(message) {
    var reasoning = String(message && message.reasoning || '').trim();
    var answer = String(message && message.content || '').trim();
    if (!reasoning) return setStatus('문서에 삽입할 추론 내용이 없습니다.', 'error');
    if (!answer) return setStatus('문서에 삽입할 최종 답변이 없습니다.', 'error');
    try {
      var bridge = getBridge();
      if (typeof bridge.insertIntoDocument !== 'function') throw new Error('문서 삽입 모듈이 준비되지 않았습니다.');
      bridge.insertIntoDocument('## 모델의 생각/추론\n\n' + reasoning + '\n\n## 최종 답변\n\n' + answer, 'cursor');
      setStatus('추론과 최종 답변을 문서의 커서 위치에 삽입했습니다.', 'ok');
    } catch (error) {
      setStatus(error && error.message ? error.message : '추론과 답변을 문서에 삽입하지 못했습니다.', 'error');
    }
  }

  function saveGeneratedImage(image, index) {
    if (!image || !image.data) return setStatus('저장할 이미지 데이터가 없습니다.', 'error');
    var mimeType = String(image.mimeType || 'image/png');
    var extension = mimeType.indexOf('jpeg') >= 0 ? 'jpg' : (mimeType.split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '');
    var link = document.createElement('a');
    link.href = 'data:' + mimeType + ';base64,' + image.data;
    link.download = 'ai-chat-image-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + (index + 1) + '.' + extension;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setStatus('생성 이미지를 저장했습니다.', 'ok');
  }

  function academicResultsMarkdown(message) {
    var results = message && Array.isArray(message.academicSources) ? message.academicSources : [];
    try {
      if (root.AIChatAcademicSearch && typeof root.AIChatAcademicSearch.formatMarkdown === 'function') {
        return root.AIChatAcademicSearch.formatMarkdown(results, message.academicQuery || message.content || '');
      }
    } catch (e) {}
    return results.map(function (item, index) {
      return (index + 1) + '. ' + item.title + '\n' + (item.abstract || '초록 없음');
    }).join('\n\n');
  }

  function insertAcademicResults(message, mode) {
    try {
      var markdown = academicResultsMarkdown(message);
      if (!markdown.trim()) throw new Error('문서에 삽입할 학술검색 결과가 없습니다.');
      var bridge = getBridge();
      if (typeof bridge.insertIntoDocument !== 'function') throw new Error('문서 삽입 모듈이 준비되지 않았습니다.');
      bridge.insertIntoDocument(markdown, mode || 'cursor');
      setStatus('학술검색 결과를 ' + insertModeLabel(mode) + '했습니다.', 'ok');
    } catch (error) {
      setStatus(error && error.message ? error.message : '학술검색 결과를 문서에 삽입하지 못했습니다.', 'error');
    }
  }

  function renderAcademicSources(message) {
    var results = Array.isArray(message && message.academicSources) ? message.academicSources : [];
    if (!results.length) return null;
    var section = document.createElement('section');
    section.className = 'ai-chat-academic-results';
    var head = document.createElement('div');
    head.className = 'ai-chat-academic-head';
    var title = document.createElement('strong');
    title.textContent = '공개 학술검색 근거 ' + results.length + '건';
    head.appendChild(title);
    var copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = '검색결과 복사';
    copy.addEventListener('click', function () { copyText(academicResultsMarkdown(message)); });
    head.appendChild(copy);
    section.appendChild(head);
    var note = document.createElement('p');
    note.textContent = 'OpenAlex/Crossref 초록을 AI 답변보다 먼저 수집했습니다. AI는 아래 근거만 사용해 주장 중심으로 종합합니다.';
    section.appendChild(note);
    if (Array.isArray(message.academicWarnings) && message.academicWarnings.length) {
      var warning = document.createElement('p');
      warning.className = 'ai-chat-academic-warning';
      warning.textContent = '일부 검색원 경고: ' + message.academicWarnings.join(' / ');
      section.appendChild(warning);
    }
    var list = document.createElement('div');
    list.className = 'ai-chat-academic-list';
    results.forEach(function (source, index) {
      var item = document.createElement('article');
      var sourceTitle = document.createElement(source.url ? 'a' : 'strong');
      sourceTitle.textContent = (index + 1) + '. ' + (source.title || '제목 없음');
      if (source.url) {
        sourceTitle.href = source.url;
        sourceTitle.target = '_blank';
        sourceTitle.rel = 'noopener noreferrer';
      }
      item.appendChild(sourceTitle);
      var meta = document.createElement('span');
      meta.textContent = (source.authorLabel || '저자 미상') + ' (' + (source.year || 'n.d.') + ')' + (source.journal ? ' · ' + source.journal : '') + (source.doi ? ' · DOI ' + source.doi : '') + ' · ' + (source.sources || []).join(' + ');
      item.appendChild(meta);
      var abstractDetails = document.createElement('details');
      var abstractSummary = document.createElement('summary');
      abstractSummary.textContent = source.abstract ? '초록 보기' : '초록 제공 안 됨';
      var abstract = document.createElement('p');
      abstract.textContent = source.abstract || '공개 메타데이터에서 초록을 제공하지 않습니다.';
      abstractDetails.appendChild(abstractSummary);
      abstractDetails.appendChild(abstract);
      item.appendChild(abstractDetails);
      list.appendChild(item);
    });
    section.appendChild(list);
    var footer = document.createElement('div');
    footer.className = 'ai-chat-academic-footer';
    var footerLabel = document.createElement('span');
    footerLabel.textContent = '문서에 삽입';
    footer.appendChild(footerLabel);
    [
      { mode: 'replace', label: '대체 삽입' },
      { mode: 'cursor', label: '커서 위치' },
      { mode: 'line-below', label: '한 줄 아래' }
    ].forEach(function (option) {
      var button = document.createElement('button');
      button.type = 'button';
      button.textContent = option.label;
      button.title = '학술검색 결과 전체를 ' + option.label + ' 방식으로 문서에 삽입';
      button.addEventListener('click', function () { insertAcademicResults(message, option.mode); });
      footer.appendChild(button);
    });
    section.appendChild(footer);
    return section;
  }

  function renderMessages() {
    var list = document.getElementById('ai-chat-messages');
    if (!list) return;
    list.innerHTML = '';
    if (!state.messages.length) {
      var empty = document.createElement('div');
      empty.className = 'ai-chat-empty';
      empty.innerHTML = '<strong>무엇이든 물어보세요.</strong><span>ScholarAI와 별개의 일반 대화입니다.</span>';
      list.appendChild(empty);
    } else {
      state.messages.forEach(function (message, messageIndex) {
        var item = document.createElement('article');
        item.className = 'ai-chat-message ' + message.role + (message.error ? ' error' : '') + (message.failed ? ' failed' : '');
        if (message.role === 'user' && Array.isArray(message.academicSources) && message.academicSources.length) {
          item.classList.add('has-academic-sources');
        }
        var meta = document.createElement('div');
        meta.className = 'ai-chat-message-meta';
        var name = document.createElement('span');
        name.textContent = message.role === 'user' ? '나' : 'AI';
        meta.appendChild(name);
        if (message.role === 'user' && message.failed) {
          var failed = document.createElement('span');
          failed.className = 'ai-chat-failed-label';
          failed.textContent = '처리 실패 · 다음 문맥에서 제외';
          meta.appendChild(failed);
        }
        if (message.role === 'assistant') {
          var actions = document.createElement('div');
          actions.className = 'ai-chat-message-actions';
          var copy = document.createElement('button');
          copy.type = 'button';
          copy.textContent = '답변 복사';
          copy.addEventListener('click', function () { copyText(message.content); });
          actions.appendChild(copy);
          var copyQa = document.createElement('button');
          copyQa.type = 'button';
          copyQa.textContent = 'Q&A 복사';
          copyQa.title = '이 답변과 연결된 질문을 함께 복사';
          copyQa.addEventListener('click', function () { copyQuestionAnswer(messageIndex, message); });
          actions.appendChild(copyQa);
          if (!message.error && !(Array.isArray(message.images) && message.images.length)) {
            if (message.reasoning) {
              var insertReasoning = document.createElement('button');
              insertReasoning.type = 'button';
              insertReasoning.textContent = '추론+응답 삽입';
              insertReasoning.title = '모델의 생각/추론과 최종 답변을 현재 문서에 삽입';
              insertReasoning.addEventListener('click', function () { insertReasoningAndAnswer(message); });
              actions.appendChild(insertReasoning);
            }
            var insertWrap = document.createElement('details');
            insertWrap.className = 'ai-chat-insert-wrap';
            var insertSummary = document.createElement('summary');
            insertSummary.textContent = '문서에 넣기 ▾';
            insertSummary.title = '질문과 답변을 문서에 넣는 방법 선택';
            insertWrap.appendChild(insertSummary);
            var insertMenu = document.createElement('div');
            insertMenu.className = 'ai-chat-insert-menu';
            [
              { mode: 'replace', label: '대체 삽입', title: '선택한 내용을 질문과 답변으로 대체합니다.' },
              { mode: 'cursor', label: '커서 위치에 삽입', title: '현재 커서 위치에 질문과 답변을 삽입합니다.' },
              { mode: 'line-below', label: '한 줄 아래 삽입', title: '커서가 있는 줄 바로 아래에 질문과 답변을 삽입합니다.' }
            ].forEach(function (option) {
              var insertOption = document.createElement('button');
              insertOption.type = 'button';
              insertOption.textContent = option.label;
              insertOption.title = option.title;
              insertOption.addEventListener('click', function () {
                insertWrap.open = false;
                insertQuestionAnswer(messageIndex, message, option.mode);
              });
              insertMenu.appendChild(insertOption);
            });
            insertWrap.appendChild(insertMenu);
            actions.appendChild(insertWrap);
          }
          if (Array.isArray(message.images) && message.images.length) {
            var saveImageButton = document.createElement('button');
            saveImageButton.type = 'button';
            saveImageButton.textContent = '이미지 저장';
            saveImageButton.addEventListener('click', function () { saveGeneratedImage(message.images[0], 0); });
            actions.appendChild(saveImageButton);
          }
        }
        var content = document.createElement('div');
        content.className = 'ai-chat-message-content';
        content.textContent = message.content;
        item.appendChild(meta);
        if (message.role === 'assistant' && message.checklist) {
          var checklist = document.createElement('section');
          checklist.className = 'ai-chat-checklist';
          var checklistHead = document.createElement('div');
          checklistHead.innerHTML = '<strong>답변 체크리스트</strong>';
          var checklistCopy = document.createElement('button');
          checklistCopy.type = 'button';
          checklistCopy.textContent = '체크리스트 복사';
          checklistCopy.addEventListener('click', function () { copyText(message.checklist); });
          checklistHead.appendChild(checklistCopy);
          var checklistBody = document.createElement('div');
          checklistBody.textContent = message.checklist;
          checklist.appendChild(checklistHead);
          checklist.appendChild(checklistBody);
          item.appendChild(checklist);
        }
        if (message.role === 'assistant' && message.reasoning) {
          var reasoning = document.createElement('details');
          reasoning.className = 'ai-chat-reasoning';
          reasoning.open = true;
          var summary = document.createElement('summary');
          summary.textContent = '모델의 생각/추론';
          var reasoningBody = document.createElement('div');
          reasoningBody.className = 'ai-chat-reasoning-content';
          reasoningBody.textContent = message.reasoning;
          reasoning.appendChild(summary);
          reasoning.appendChild(reasoningBody);
          item.appendChild(reasoning);
        }
        if (message.role === 'assistant') {
          var answerLabel = document.createElement('div');
          answerLabel.className = 'ai-chat-answer-label';
          answerLabel.textContent = Array.isArray(message.images) && message.images.length ? '이미지 생성 결과' : '최종 답변';
          item.appendChild(answerLabel);
        }
        item.appendChild(content);
        if (message.role === 'user') item.appendChild(createQuestionActions(message, messageIndex));
        if (message.role === 'user' && Array.isArray(message.academicSources) && message.academicSources.length) {
          var academicSources = renderAcademicSources(message);
          if (academicSources) item.appendChild(academicSources);
        }
        if (message.role === 'assistant' && Array.isArray(message.images) && message.images.length) {
          var gallery = document.createElement('div');
          gallery.className = 'ai-chat-image-gallery';
          message.images.forEach(function (image, imageIndex) {
            if (!image || !image.data) return;
            var figure = document.createElement('figure');
            var generated = document.createElement('img');
            generated.src = 'data:' + String(image.mimeType || 'image/png') + ';base64,' + image.data;
            generated.alt = 'AI가 생성한 이미지 ' + (imageIndex + 1);
            generated.loading = 'lazy';
            var save = document.createElement('button');
            save.type = 'button';
            save.textContent = '이미지 ' + (imageIndex + 1) + ' 저장';
            save.addEventListener('click', function () { saveGeneratedImage(image, imageIndex); });
            figure.appendChild(generated);
            figure.appendChild(save);
            gallery.appendChild(figure);
          });
          item.appendChild(gallery);
        }
        if (message.role === 'assistant' && actions) item.appendChild(actions);
        list.appendChild(item);
      });
    }
    if (state.running) {
      var thinking = document.createElement('article');
      thinking.className = 'ai-chat-thinking';
      thinking.innerHTML = ''
        + '<div class="ai-chat-thinking-head">'
        + '  <span class="ai-chat-thinking-orb" aria-hidden="true"></span>'
        + '  <strong id="ai-chat-thinking-stage">답변을 준비하는 중</strong>'
        + '  <span class="ai-chat-thinking-dots" aria-hidden="true"><i></i><i></i><i></i></span>'
        + '  <span id="ai-chat-thinking-elapsed" class="ai-chat-thinking-elapsed">0초</span>'
        + '</div>'
        + '<div class="ai-chat-thinking-track"><span id="ai-chat-thinking-progress" style="width:' + thinkingProgress + '%"></span></div>'
        + '<small>진행바는 실제 완료율이 아니라 응답 대기 상태를 나타냅니다.</small>';
      list.appendChild(thinking);
      updateThinkingProgress();
    }
    list.scrollTop = list.scrollHeight;
  }

  function copyText(text) {
    function legacyCopy() {
      var area = document.createElement('textarea');
      area.value = text || '';
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      var copied = false;
      try { copied = document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(area);
      setStatus(copied ? '클립보드에 복사했습니다.' : '복사하지 못했습니다.', copied ? 'ok' : 'error');
    }
    if (!navigator.clipboard || !navigator.clipboard.writeText) return legacyCopy();
    navigator.clipboard.writeText(text || '').then(function () {
      setStatus('클립보드에 복사했습니다.', 'ok');
    }).catch(legacyCopy);
  }

  function copyConversation() {
    if (!state.messages.length) return setStatus('복사할 대화가 없습니다.', 'error');
    copyText(state.messages.map(function (message) {
      var reasoning = message.reasoning ? '\n\n[모델의 생각/추론]\n' + message.reasoning : '';
      var checklist = message.checklist ? '\n\n[답변 체크리스트]\n' + message.checklist : '';
      var images = Array.isArray(message.images) && message.images.length ? '\n\n[생성 이미지 ' + message.images.length + '개]' : '';
      return (message.role === 'user' ? '나' : 'AI') + ':\n' + message.content + checklist + reasoning + images;
    }).join('\n\n'));
  }

  function conversationMarkdown() {
    var currentTitle = titleFromMessages(state.messages);
    var lines = [
      '# AI Chat 대화',
      '',
      '- 대화 제목: ' + currentTitle,
      '- 저장 시각: ' + new Date().toLocaleString('ko-KR'),
      '- AI 공급자: ' + (state.provider === 'lmstudio' ? 'LM Studio' : 'AI Studio (Gemini)'),
      '- 모델: ' + (state.provider === 'lmstudio' ? (state.lmModel || '확인되지 않음') : state.geminiModel),
      '- 응답 모드: ' + (state.responseMode === 'reasoning' ? '추론' : '즉시응답'),
      ''
    ];
    var questionNumber = 0;
    var answerNumber = 0;
    state.messages.forEach(function (message) {
      if (!message) return;
      if (message.role === 'user') {
        questionNumber += 1;
        lines.push('## 질문 ' + questionNumber, '', String(message.content || '').trim(), '');
        if (message.failed) lines.push('> 처리 실패 또는 중지된 질문', '');
        if (Array.isArray(message.academicSources) && message.academicSources.length) {
          lines.push(academicResultsMarkdown(message), '');
        }
        return;
      }
      answerNumber += 1;
      lines.push('## 답변 ' + answerNumber, '');
      if (message.checklist) lines.push('### 답변 체크리스트', '', String(message.checklist).trim(), '');
      if (message.reasoning) lines.push('### 모델의 생각/추론', '', String(message.reasoning).trim(), '');
      lines.push('### 최종 답변', '', String(message.content || '').trim(), '');
      if (Array.isArray(message.images) && message.images.length) {
        lines.push('> 생성 이미지 ' + message.images.length + '개는 AI Chat 대화 저장소에 보관되어 있습니다.', '');
      }
    });
    return lines.join('\n').replace(/\n{4,}/g, '\n\n\n').trim() + '\n';
  }

  function saveConversationMarkdown() {
    if (!state.messages.length) return setStatus('저장할 대화가 없습니다.', 'error');
    try {
      var markdown = conversationMarkdown();
      var title = String(titleFromMessages(state.messages) || 'AI-Chat')
        .replace(/[\\/:*?"<>|]+/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 60) || 'AI-Chat';
      var stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      var blob = new Blob(['\uFEFF', markdown], { type: 'text/markdown;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = title + '-' + stamp + '.md';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      setStatus('대화 전체를 Markdown 파일로 저장했습니다.', 'ok');
    } catch (error) {
      setStatus(error && error.message ? error.message : '대화를 저장하지 못했습니다.', 'error');
    }
  }

  async function createNewConversation(showStatus) {
    if (state.running) stopMessage();
    var record = {
      id: newId(), title: '새 대화', createdAt: Date.now(), updatedAt: Date.now(),
      provider: state.provider, responseMode: state.responseMode,
      academicSearchEnabled: state.academicSearchEnabled, academicSearchCount: state.academicSearchCount,
      geminiModel: state.geminiModel, messages: []
    };
    if (state.dbReady) {
      await requestPromise(conversationStore('readwrite').put(record));
      state.conversations.unshift(record);
    }
    applyConversation(record);
    if (showStatus !== false) setStatus('새 대화를 시작했습니다.', 'ok');
  }

  async function startNewChat() {
    if (state.running) return;
    try {
      await saveConversationNow();
      await createNewConversation(true);
    } catch (error) {
      setStatus('새 대화를 만들지 못했습니다.', 'error');
    }
  }

  function contextMessages() {
    var messages = state.messages.filter(function (message) { return !message.error && !message.failed; }).slice(-MAX_CONTEXT_MESSAGES);
    while (messages.length && messages[0].role !== 'user') messages.shift();
    return messages.map(function (message) {
      return { role: message.role, content: message.content };
    });
  }

  function academicSystemInstruction(evidenceText) {
    return [
      'You are an academic evidence-synthesis assistant. Respond in Korean.',
      'The VERIFIED PUBLIC ACADEMIC SEARCH RESULTS below were retrieved from OpenAlex and/or Crossref before this AI request.',
      'Use only the supplied records and abstracts for evidence-backed claims, authors, years, journal names, DOI values, and citations. Never fabricate or complete missing bibliographic facts.',
      'Do not organize the answer paper-by-paper and do not merely repeat the search-result list.',
      'Read the abstracts, extract their actual claims, findings, directions of association, conditions, limitations, and non-significant or contrary results.',
      'Group the synthesis by claims/results. For every supported or opposing statement, attach an author-year citation such as Kim과 Lee(2024) or (Kim & Lee, 2024).',
      'Required final-answer structure:',
      '1. 검색 근거의 범위와 한계',
      '2. 초록에서 추출한 전체 핵심 주장 목록 + 각 주장에 인용',
      '3. 같은 방향의 주장과 이를 함께 지지하는 연구 인용',
      '4. 다른·반대·조건부·비유의한 주장과 인용',
      '5. 주장 간 관계를 통합한 종합 해석',
      'If an abstract does not support a claim, say 근거 부족. Distinguish metadata-only information from abstract-supported findings.',
      'Before the final answer, return a short checklist. Return exactly: [CHECKLIST] numbered checklist [/CHECKLIST] [ANSWER] structured synthesis [/ANSWER].',
      '',
      'VERIFIED PUBLIC ACADEMIC SEARCH RESULTS:',
      evidenceText
    ].join('\n');
  }

  async function sendMessage() {
    if (state.running || state.storageInitializing) return;
    var input = document.getElementById('ai-chat-input');
    var text = input ? String(input.value || '').trim() : '';
    if (!text) return;
    var pendingUser = { role: 'user', content: text, createdAt: Date.now(), failed: false };
    state.messages.push(pendingUser);
    state.messages = state.messages.slice(-MAX_STORED_MESSAGES);
    if (input) input.value = '';
    saveHistory();
    setRunning(true);
    startThinkingProgress();
    renderMessages();
    try {
      var academicSearchActive = state.academicSearchEnabled && !(state.provider === 'aistudio' && isGeminiImageModel(state.geminiModel));
      var academicEvidence = '';
      if (academicSearchActive) {
        if (!root.AIChatAcademicSearch || typeof root.AIChatAcademicSearch.search !== 'function') {
          throw new Error('공개 학술검색 모듈이 준비되지 않았습니다. 앱을 새로고침하세요.');
        }
        academicAbortController = new AbortController();
        var academicSearch = await root.AIChatAcademicSearch.search(text, state.academicSearchCount, {
          signal: academicAbortController.signal,
          onProgress: function (progress) { setStatus(progress, 'loading'); }
        });
        academicAbortController = null;
        pendingUser.academicQuery = text;
        pendingUser.academicSources = academicSearch.results;
        pendingUser.academicWarnings = academicSearch.warnings || [];
        academicEvidence = root.AIChatAcademicSearch.formatEvidence(academicSearch.results);
        saveHistory();
        renderMessages();
        setStatus('초록 근거 ' + academicSearch.results.length + '건 수집 완료 · AI가 주장별로 종합하는 중...', 'loading');
      }
      var result = await getBridge().complete({
        provider: state.provider,
        model: state.provider === 'aistudio' ? state.geminiModel : null,
        mode: state.responseMode,
        academicSearch: academicSearchActive,
        messages: contextMessages(),
        systemInstruction: academicSearchActive
          ? academicSystemInstruction(academicEvidence)
          : 'You are a helpful conversational assistant. Respond in Korean unless the user asks for another language. Preserve context from earlier messages. Before the final answer, make a short checklist that shows how you understood the request, what the answer should include, and the requested length/tone. Return exactly this structure: [CHECKLIST] numbered checklist [/CHECKLIST] [ANSWER] final answer only [/ANSWER]. Do not put the checklist inside the final answer.'
      });
      var answer = result && result.text != null ? String(result.text) : '';
      if (!answer) throw new Error('AI 응답이 비어 있습니다.');
      var sections = parseAssistantSections(answer);
      var reasoningText = result && result.reasoning ? String(result.reasoning) : '';
      if (!sections.checklist && reasoningText) {
        var reasoningSections = parseAssistantSections(reasoningText);
        if (reasoningSections.checklist) {
          sections.checklist = reasoningSections.checklist;
          reasoningText = reasoningSections.remaining
            .replace(/\[\/?ANSWER\]/gi, '')
            .replace(/^\s*#{0,4}\s*(?:최종\s*)?답변\s*:?\s*/i, '')
            .trim();
        }
      }
      state.messages.push({
        role: 'assistant',
        content: sections.answer,
        checklist: sections.checklist,
        reasoning: reasoningText,
        images: result && Array.isArray(result.images) ? result.images : [],
        createdAt: Date.now(),
        provider: result.provider,
        model: result.model
      });
      if (result.provider === 'lmstudio' && result.model) state.lmModel = result.model;
      setStatus((result.images && result.images.length ? '이미지 생성 완료 · ' + result.images.length + '개 · ' : '응답 완료 · ') + (result.model || result.provider || ''), 'ok');
    } catch (error) {
      var message = error && error.message ? error.message : String(error);
      if ((error && error.name === 'AbortError') || /abort|중지/i.test(message)) {
        pendingUser.failed = true;
        setStatus('응답 생성을 중지했습니다.', '');
      } else {
        pendingUser.failed = true;
        state.messages.push({ role: 'assistant', content: '오류: ' + message, createdAt: Date.now(), error: true });
        setStatus(message, 'error');
      }
    } finally {
      academicAbortController = null;
      stopThinkingProgress();
      setRunning(false);
      state.messages = state.messages.slice(-MAX_STORED_MESSAGES);
      saveHistory();
      renderMessages();
      updateHeaderModel();
      if (input) input.focus();
    }
  }

  function stopMessage() {
    if (state.running) setStatus('응답 중지를 요청하는 중...', 'loading');
    if (academicAbortController) academicAbortController.abort();
    try { getBridge().abort(); } catch (e) {}
  }

  function init() {
    createUI();
    state.provider = storageGet(PROVIDER_KEY, 'lmstudio') === 'aistudio' ? 'aistudio' : 'lmstudio';
    state.providerControlsOpen = storageGet(PROVIDER_CONTROLS_KEY, '0') === '1';
    state.responseMode = storageGet(RESPONSE_MODE_KEY, 'quick') === 'reasoning' ? 'reasoning' : 'quick';
    state.academicSearchEnabled = storageGet(ACADEMIC_SEARCH_KEY, '0') === '1';
    state.academicSearchCount = normalizeAcademicCount(storageGet(ACADEMIC_COUNT_KEY, '10'));
    state.geminiModel = storageGet(GEMINI_MODEL_KEY, DEFAULT_GEMINI_MODELS[0]);
    state.layout = storageGet(LAYOUT_KEY, 'popup');
    if (state.layout !== 'dock' && state.layout !== 'fullscreen') state.layout = 'popup';
    state.enabled = storageGet(ENABLED_KEY, '0') === '1';
    updateProviderUI();
    setProviderControlsOpen(state.providerControlsOpen);
    setResponseMode(state.responseMode);
    updateAcademicSearchUI();
    renderMessages();
    setLayout(state.layout);
    setEnabled(state.enabled);
    setRunning(false);
    initializeConversationStore();
    var checkbox = document.getElementById('ai-chat-enabled');
    if (checkbox && !checkbox._aiChatBound) {
      checkbox._aiChatBound = true;
      checkbox.addEventListener('change', function () { setEnabled(checkbox.checked); });
    }
  }

  root.AIChat = Object.freeze({
    init: init,
    setEnabled: setEnabled,
    isEnabled: function () { return state.enabled; },
    open: function () { setOpen(true); },
    close: function () { setOpen(false); }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})(window);
