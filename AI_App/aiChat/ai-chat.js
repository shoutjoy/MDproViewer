/* AI Chat - persistent floating multi-turn chat for LM Studio and AI Studio. */
(function (root) {
  'use strict';

  var ENABLED_KEY = 'ss_ai_chat_enabled';
  var PROVIDER_KEY = 'ss_ai_chat_provider';
  var GEMINI_MODEL_KEY = 'ss_ai_chat_gemini_model';
  var RESPONSE_MODE_KEY = 'ss_ai_chat_response_mode';
  var SHOW_REASONING_KEY = 'ss_ai_chat_show_reasoning';
  var ACADEMIC_SEARCH_KEY = 'ss_ai_chat_academic_search_enabled';
  var ACADEMIC_COUNT_KEY = 'ss_ai_chat_academic_search_count';
  var PROVIDER_CONTROLS_KEY = 'ss_ai_chat_provider_controls_open';
  var HISTORY_KEY = 'ss_ai_chat_history_v1';
  var LAYOUT_KEY = 'ss_ai_chat_layout';
  var POPUP_RECT_KEY = 'ss_ai_chat_popup_rect';
  var DOCK_WIDTH_KEY = 'ss_ai_chat_dock_width';
  var LAUNCHER_POSITION_KEY = 'ss_ai_chat_launcher_position';
  var CURRENT_CONVERSATION_KEY = 'ss_ai_chat_current_conversation_id';
  var MIGRATION_KEY = 'ss_ai_chat_idb_migrated_v1';
  var CHAT_DB_NAME = 'md_viewer_ai_chat';
  var CHAT_DB_VERSION = 1;
  var CONVERSATION_STORE = 'conversations';
  var MAX_STORED_MESSAGES = 100;
  var MAX_CONTEXT_MESSAGES = 100;
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
    showReasoning: false,
    academicSearchEnabled: false,
    academicSearchCount: 10,
    geminiModel: 'gemini-3.5-flash',
    lmModel: '',
    lmContextLength: 0,
    messages: [],
    layout: 'popup',
    conversationId: '',
    conversationTitle: '새 대화',
    conversationCreatedAt: 0,
    conversations: [],
    historyVisibilityOverride: null,
    db: null,
    dbReady: false,
    storageInitializing: true
  };
  var thinkingTimer = null;
  var thinkingStartedAt = 0;
  var thinkingProgress = 0;
  var liveStream = null;
  var liveStreamRenderPending = false;
  var liveStreamLastRenderAt = 0;
  var saveTimer = null;
  var academicAbortController = null;
  var documentSelectionBuffer = '';
  var suppressLauncherClick = false;

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
      showReasoning: state.showReasoning,
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
    state.messages.forEach(function (message, messageIndex) {
      if (!message || message.role !== 'assistant' || message.error) return;
      sanitizeAssistantMessage(message);
      if (!message.checklist && !message.academicTotalParts) {
        var sections = parseAssistantSections(message.content);
        if (sections.checklist) {
          message.content = sections.answer;
          message.checklist = sections.checklist;
        } else if (messageIndex > 0 && Array.isArray(state.messages[messageIndex - 1].academicSources)) {
          message.content = sections.answer;
          message.checklist = buildAcademicChecklist(sections.answer);
        }
      }
      var sourceMessage = findSourceUserMessage(messageIndex);
      var academicMessage = !!(sourceMessage && Array.isArray(sourceMessage.academicSources) && sourceMessage.academicSources.length);
      if (academicMessage) {
        var visibleAcademic = extractVisibleAnswerBody(message.content, true);
        message.content = normalizeAcademicAnswer(visibleAcademic.body, sourceMessage.academicSources);
        message.reasoning = '';
        message.checklist = message.academicTotalParts ? '' : (message.content ? buildAcademicChecklist(message.content) : '');
        if (visibleAcademic.notice) {
          message.notice = visibleAcademic.notice;
          message.continuationAvailable = true;
        }
      }
      if (typeof message.continuationAvailable !== 'boolean') {
        message.continuationAvailable = shouldOfferContinuation(message, null, academicMessage);
      }
    });
    if (record && record.provider) state.provider = record.provider === 'aistudio' ? 'aistudio' : 'lmstudio';
    if (record && record.responseMode) state.responseMode = record.responseMode === 'reasoning' ? 'reasoning' : 'quick';
    if (record && typeof record.showReasoning === 'boolean') state.showReasoning = record.showReasoning;
    if (record && typeof record.academicSearchEnabled === 'boolean') state.academicSearchEnabled = record.academicSearchEnabled;
    if (record && Number(record.academicSearchCount)) state.academicSearchCount = normalizeAcademicCount(record.academicSearchCount);
    if (record && record.geminiModel) state.geminiModel = record.geminiModel;
    storageSet(CURRENT_CONVERSATION_KEY, state.conversationId);
    storageSet(PROVIDER_KEY, state.provider);
    storageSet(RESPONSE_MODE_KEY, state.responseMode);
    storageSet(SHOW_REASONING_KEY, state.showReasoning ? '1' : '0');
    storageSet(ACADEMIC_SEARCH_KEY, state.academicSearchEnabled ? '1' : '0');
    storageSet(ACADEMIC_COUNT_KEY, String(state.academicSearchCount));
    storageSet(GEMINI_MODEL_KEY, state.geminiModel);
    updateProviderUI();
    setResponseMode(state.responseMode);
    setShowReasoning(state.showReasoning);
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
            provider: state.provider, responseMode: state.responseMode, showReasoning: state.showReasoning,
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
          provider: state.provider, responseMode: state.responseMode, showReasoning: state.showReasoning,
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
      + '    <button type="button" id="ai-chat-history-toggle" class="ai-chat-icon-action" title="왼쪽 대화 기록 열기" aria-label="왼쪽 대화 기록 열기" aria-expanded="false">'
      + '      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M5.5 8h1M5.5 12h1M5.5 16h1"/></svg><span class="ai-chat-action-label">기록</span>'
      + '    </button>'
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
      + '        <label class="ai-chat-reasoning-toggle" title="모델은 그대로 추론하며, 이 설정은 반환된 추론 내용을 채팅에 표시·저장할지만 결정합니다."><input type="checkbox" id="ai-chat-show-reasoning"><span>추론 내용 표시</span></label>'
      + '        <button type="button" id="ai-chat-academic-toggle" class="ai-chat-academic-toggle" aria-pressed="false">🔎 학술검색</button>'
      + '        <label id="ai-chat-academic-count-wrap" class="ai-chat-academic-count-wrap" title="목록에서 선택하거나 더블클릭하여 1~50 사이 숫자를 직접 입력하세요.">결과 <select id="ai-chat-academic-count" aria-label="학술검색 결과 수"><option value="5">5개</option><option value="10">10개</option><option value="20">20개</option><option value="30">30개</option><option value="50">50개</option></select><input id="ai-chat-academic-count-input" type="number" min="1" max="50" step="1" inputmode="numeric" aria-label="학술검색 결과 수 직접 입력" hidden></label>'
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

    launcher.addEventListener('click', function () {
      if (suppressLauncherClick) return;
      setOpen(!state.open);
    });
    setupLauncherDrag(launcher);
    document.getElementById('ai-chat-close').addEventListener('click', function () { setOpen(false); });
    document.getElementById('ai-chat-history-toggle').addEventListener('click', toggleHistorySidebar);
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
    document.getElementById('ai-chat-show-reasoning').addEventListener('change', function (event) {
      setShowReasoning(event.target.checked);
    });
    document.getElementById('ai-chat-academic-toggle').addEventListener('click', function () {
      setAcademicSearchEnabled(!state.academicSearchEnabled);
    });
    document.getElementById('ai-chat-academic-count').addEventListener('change', function (event) {
      setAcademicSearchCount(event.target.value, false);
    });
    document.getElementById('ai-chat-academic-count-wrap').addEventListener('dblclick', function (event) {
      if (event.target && event.target.id === 'ai-chat-academic-count-input') return;
      event.preventDefault();
      beginAcademicCountEdit();
    });
    document.getElementById('ai-chat-academic-count-input').addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        finishAcademicCountEdit(true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        finishAcademicCountEdit(false);
      }
    });
    document.getElementById('ai-chat-academic-count-input').addEventListener('blur', function () {
      finishAcademicCountEdit(true);
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
      clampLauncherToViewport();
      updateDockHistoryVisibility();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && state.open && state.layout === 'fullscreen') setLayout('popup');
      if (event.ctrlKey && event.altKey && !event.shiftKey && !event.metaKey && String(event.key || '').toLowerCase() === 'l') {
        moveDocumentSelectionToChat(event);
      }
    });
  }

  function readLauncherPosition() {
    try {
      var value = JSON.parse(storageGet(LAUNCHER_POSITION_KEY, 'null'));
      if (!value || !Number.isFinite(Number(value.left)) || !Number.isFinite(Number(value.top))) return null;
      return { left: Number(value.left), top: Number(value.top) };
    } catch (e) { return null; }
  }

  function applyLauncherPosition() {
    var launcher = document.getElementById('ai-chat-launcher');
    var saved = readLauncherPosition();
    if (!launcher || !saved) return;
    launcher.style.left = saved.left + 'px';
    launcher.style.top = saved.top + 'px';
    launcher.style.right = 'auto';
    launcher.style.bottom = 'auto';
    clampLauncherToViewport();
  }

  function clampLauncherToViewport() {
    var launcher = document.getElementById('ai-chat-launcher');
    if (!launcher || !launcher.style.left || !launcher.style.top) return;
    var width = launcher.offsetWidth || 68;
    var height = launcher.offsetHeight || 50;
    var left = Math.max(6, Math.min(parseFloat(launcher.style.left) || 6, root.innerWidth - width - 6));
    var top = Math.max(6, Math.min(parseFloat(launcher.style.top) || 6, root.innerHeight - height - 58));
    launcher.style.left = left + 'px';
    launcher.style.top = top + 'px';
    storageSet(LAUNCHER_POSITION_KEY, JSON.stringify({ left: Math.round(left), top: Math.round(top) }));
  }

  function setupLauncherDrag(launcher) {
    if (!launcher) return;
    applyLauncherPosition();
    launcher.addEventListener('pointerdown', function (event) {
      if (event.button !== 0) return;
      var rect = launcher.getBoundingClientRect();
      var startX = event.clientX;
      var startY = event.clientY;
      var startLeft = rect.left;
      var startTop = rect.top;
      var moved = false;
      launcher.setPointerCapture(event.pointerId);
      function move(moveEvent) {
        var dx = moveEvent.clientX - startX;
        var dy = moveEvent.clientY - startY;
        if (!moved && Math.hypot(dx, dy) < 4) return;
        moved = true;
        var left = Math.max(6, Math.min(startLeft + dx, root.innerWidth - launcher.offsetWidth - 6));
        var top = Math.max(6, Math.min(startTop + dy, root.innerHeight - launcher.offsetHeight - 58));
        launcher.style.left = Math.round(left) + 'px';
        launcher.style.top = Math.round(top) + 'px';
        launcher.style.right = 'auto';
        launcher.style.bottom = 'auto';
        launcher.classList.add('dragging');
      }
      function finish() {
        launcher.classList.remove('dragging');
        launcher.removeEventListener('pointermove', move);
        launcher.removeEventListener('pointerup', finish);
        launcher.removeEventListener('pointercancel', finish);
        if (moved) {
          suppressLauncherClick = true;
          clampLauncherToViewport();
          setTimeout(function () { suppressLauncherClick = false; }, 120);
        }
      }
      launcher.addEventListener('pointermove', move);
      launcher.addEventListener('pointerup', finish);
      launcher.addEventListener('pointercancel', finish);
      event.preventDefault();
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
    var automaticDockHistory = state.layout === 'dock' && width >= DOCK_HISTORY_MIN_WIDTH;
    panel.classList.toggle('dock-history-visible', automaticDockHistory);
    // Dock resizing keeps its original automatic behavior. Once the width
    // reaches the threshold, a previous manual close must not suppress it.
    if (automaticDockHistory && state.historyVisibilityOverride === false) {
      state.historyVisibilityOverride = null;
    }
    applyHistoryVisibilityOverride();
  }

  function isHistorySidebarVisible() {
    var sidebar = document.querySelector('#ai-chat-panel .ai-chat-history-sidebar');
    return !!sidebar && root.getComputedStyle(sidebar).display !== 'none';
  }

  function applyHistoryVisibilityOverride() {
    var panel = document.getElementById('ai-chat-panel');
    var button = document.getElementById('ai-chat-history-toggle');
    if (!panel) return;
    panel.classList.toggle('history-force-open', state.historyVisibilityOverride === true);
    panel.classList.toggle('history-force-closed', state.historyVisibilityOverride === false);
    var visible = isHistorySidebarVisible();
    if (button) {
      button.classList.toggle('active', visible);
      button.setAttribute('aria-expanded', visible ? 'true' : 'false');
      button.setAttribute('aria-label', visible ? '왼쪽 대화 기록 닫기' : '왼쪽 대화 기록 열기');
      button.title = visible ? '왼쪽 대화 기록 닫기' : '왼쪽 대화 기록 열기';
    }
  }

  function toggleHistorySidebar() {
    state.historyVisibilityOverride = !isHistorySidebarVisible();
    applyHistoryVisibilityOverride();
    if (state.historyVisibilityOverride) renderConversationHistory();
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
    applyHistoryVisibilityOverride();
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

  function estimateStreamTokens(value) {
    var text = String(value || '');
    var ascii = 0;
    var nonAscii = 0;
    for (var character of text) {
      if (character.charCodeAt(0) < 128) ascii += 1;
      else nonAscii += 1;
    }
    return Math.max(0, Math.ceil(ascii / 4 + nonAscii / 1.5));
  }

  function formatStreamNumber(value) {
    return Math.max(0, Math.round(Number(value) || 0)).toLocaleString('ko-KR');
  }

  function shouldFollowLiveStream(element) {
    if (!element) return false;
    return element.scrollHeight - element.scrollTop - element.clientHeight < 36;
  }

  function followLiveStreamEnd(element, enabled) {
    if (!element || !enabled) return;
    element.scrollTop = element.scrollHeight;
  }

  function updateLiveStreamDom() {
    liveStreamRenderPending = false;
    liveStreamLastRenderAt = Date.now();
    if (!state.running || !liveStream) return;
    var elapsed = Math.max(0, (Date.now() - thinkingStartedAt) / 1000);
    var estimatedReasoningTokens = estimateStreamTokens(liveStream.reasoning);
    var estimatedAnswerTokens = estimateStreamTokens(liveStream.answer);
    var estimatedTokens = estimatedReasoningTokens + estimatedAnswerTokens;
    var reasoningTokens = liveStream.hasExactStats ? liveStream.exactReasoningTokens : estimatedReasoningTokens;
    var answerTokens = liveStream.hasExactStats
      ? Math.max(0, liveStream.exactOutputTokens - liveStream.exactReasoningTokens)
      : estimatedAnswerTokens;
    var outputTokens = liveStream.hasExactStats ? liveStream.exactOutputTokens : estimatedTokens;
    var tokenRatio = liveStream.maxOutputTokens ? Math.min(1, outputTokens / liveStream.maxOutputTokens) : 0;
    if (liveStream.phase === 'generating') {
      liveStream.progress = Math.max(liveStream.progress, 35 + tokenRatio * 64);
    }
    var measuredTps = liveStream.tokensPerSecond;
    if (!measuredTps && liveStream.firstTokenAt && outputTokens) {
      measuredTps = outputTokens / Math.max(0.1, (Date.now() - liveStream.firstTokenAt) / 1000);
    }
    thinkingProgress = Math.max(0, Math.min(100, Number(liveStream.progress) || 0));
    var stageEl = document.getElementById('ai-chat-thinking-stage');
    var elapsedEl = document.getElementById('ai-chat-thinking-elapsed');
    var bar = document.getElementById('ai-chat-thinking-progress');
    var contextEl = document.getElementById('ai-chat-thinking-context');
    var reasoningTokensEl = document.getElementById('ai-chat-thinking-reasoning-tokens');
    var answerTokensEl = document.getElementById('ai-chat-thinking-answer-tokens');
    var outputEl = document.getElementById('ai-chat-thinking-output');
    var speedEl = document.getElementById('ai-chat-thinking-speed');
    var reasoningWrap = document.getElementById('ai-chat-live-reasoning');
    var reasoningBody = document.getElementById('ai-chat-live-reasoning-content');
    var answerWrap = document.getElementById('ai-chat-live-answer');
    var answerBody = document.getElementById('ai-chat-live-answer-content');
    var list = document.getElementById('ai-chat-messages');
    var followReasoning = shouldFollowLiveStream(reasoningBody);
    var followAnswer = shouldFollowLiveStream(answerBody);
    var followMessages = shouldFollowLiveStream(list);
    if (stageEl) stageEl.textContent = liveStream.stage;
    if (elapsedEl) elapsedEl.textContent = Math.floor(elapsed) + '초';
    if (bar) bar.style.width = thinkingProgress.toFixed(1) + '%';
    if (contextEl) {
      contextEl.textContent = liveStream.contextLength
        ? '컨텍스트 ' + formatStreamNumber(liveStream.estimatedInputTokens) + ' / ' + formatStreamNumber(liveStream.contextLength)
        : '컨텍스트 확인 중';
    }
    if (reasoningTokensEl) {
      reasoningTokensEl.textContent = '추론 ' + (liveStream.hasExactStats ? '' : '≈')
        + formatStreamNumber(reasoningTokens) + ' tok';
    }
    if (answerTokensEl) {
      answerTokensEl.textContent = '응답 ' + (liveStream.hasExactStats ? '' : '≈')
        + formatStreamNumber(answerTokens) + ' tok';
    }
    if (outputEl) {
      outputEl.textContent = '전체 ' + (liveStream.hasExactStats ? '' : '≈') + formatStreamNumber(outputTokens)
        + (liveStream.maxOutputTokens ? ' / ' + formatStreamNumber(liveStream.maxOutputTokens) : '') + ' tok';
    }
    if (speedEl) speedEl.textContent = measuredTps ? measuredTps.toFixed(1) + ' tok/s' : '첫 토큰 대기';
    var showLiveReasoning = state.responseMode === 'reasoning' && state.showReasoning;
    if (reasoningWrap) reasoningWrap.hidden = !showLiveReasoning;
    if (reasoningBody) {
      reasoningBody.classList.toggle('waiting', !liveStream.reasoning);
      reasoningBody.textContent = liveStream.reasoning || '첫 추론 토큰을 기다리는 중…';
      followLiveStreamEnd(reasoningBody, followReasoning && !!liveStream.reasoning);
    }
    if (answerWrap) answerWrap.hidden = false;
    if (answerBody) {
      answerBody.classList.toggle('waiting', !liveStream.answer);
      answerBody.textContent = liveStream.answer || (showLiveReasoning
        ? '추론이 끝난 뒤 첫 응답 토큰이 도착하면 여기에 바로 표시됩니다.'
        : '첫 응답 토큰을 기다리는 중…');
      followLiveStreamEnd(answerBody, followAnswer && !!liveStream.answer);
    }
    followLiveStreamEnd(list, followMessages);
    setStatus(liveStream.stage + ' · ' + Math.floor(elapsed) + '초 · ' + (measuredTps ? measuredTps.toFixed(1) + ' tok/s' : '첫 토큰 대기'), 'loading');
  }

  function scheduleLiveStreamRender(force) {
    if (force || Date.now() - liveStreamLastRenderAt >= 80) {
      updateLiveStreamDom();
      return;
    }
    if (liveStreamRenderPending) return;
    liveStreamRenderPending = true;
    var schedule = root.requestAnimationFrame || function (callback) { return setTimeout(callback, 16); };
    schedule(updateLiveStreamDom);
  }

  function handleStreamEvent(event) {
    if (!liveStream || !event || !event.type) return;
    var type = String(event.type);
    if (type === 'request.start') {
      liveStream.contextLength = Math.max(0, Number(event.context_length) || 0);
      liveStream.maxOutputTokens = Math.max(0, Number(event.max_output_tokens) || 0);
      liveStream.estimatedInputTokens = Math.max(0, Number(event.estimated_input_tokens) || 0);
      liveStream.stage = 'LM Studio에 요청을 전송하는 중';
      liveStream.progress = 2;
    } else if (type === 'transport.start') {
      liveStream.stage = 'LM Studio 실시간 스트림에 연결하는 중';
      liveStream.progress = Math.max(liveStream.progress, 3);
    } else if (type === 'chat.start') {
      liveStream.stage = '모델 연결 완료 · 문맥 처리 대기';
      liveStream.progress = Math.max(liveStream.progress, 5);
    } else if (type === 'model_load.start') {
      liveStream.stage = '모델을 메모리에 로드하는 중';
      liveStream.progress = 5;
    } else if (type === 'model_load.progress') {
      liveStream.stage = '모델 로드 ' + Math.round((Number(event.progress) || 0) * 100) + '%';
      liveStream.progress = 5 + Math.max(0, Math.min(1, Number(event.progress) || 0)) * 10;
    } else if (type === 'model_load.end') {
      liveStream.stage = '모델 로드 완료 · 문맥 처리 대기';
      liveStream.progress = 15;
    } else if (type === 'prompt_processing.start') {
      liveStream.stage = '대화 문맥을 처리하는 중';
      liveStream.progress = Math.max(liveStream.progress, 15);
    } else if (type === 'prompt_processing.progress') {
      liveStream.stage = '대화 문맥 처리 ' + Math.round((Number(event.progress) || 0) * 100) + '%';
      liveStream.progress = 15 + Math.max(0, Math.min(1, Number(event.progress) || 0)) * 20;
    } else if (type === 'prompt_processing.end') {
      liveStream.stage = '문맥 처리 완료 · 첫 추론 토큰 대기';
      liveStream.progress = Math.max(liveStream.progress, 35);
    } else if (type === 'reasoning.start') {
      liveStream.phase = 'generating';
      liveStream.stage = '실시간 추론 중';
      liveStream.progress = Math.max(liveStream.progress, 35);
    } else if (type === 'reasoning.delta') {
      if (!liveStream.firstTokenAt) liveStream.firstTokenAt = Date.now();
      liveStream.phase = 'generating';
      liveStream.stage = '실시간 추론 중';
      liveStream.reasoning += String(event.content || '');
    } else if (type === 'reasoning.end') {
      liveStream.stage = '추론 완료 · 답변 토큰 대기';
    } else if (type === 'message.start') {
      liveStream.phase = 'generating';
      liveStream.stage = '최종 답변을 실시간 생성하는 중';
    } else if (type === 'message.delta') {
      if (!liveStream.firstTokenAt) liveStream.firstTokenAt = Date.now();
      liveStream.phase = 'generating';
      liveStream.stage = '최종 답변을 실시간 생성하는 중';
      liveStream.answer += String(event.content || '');
    } else if (type === 'message.end') {
      liveStream.stage = '답변 생성 완료 · 통계를 확인하는 중';
    } else if (type === 'chat.end') {
      var stats = event.result && event.result.stats ? event.result.stats : {};
      liveStream.exactOutputTokens = Math.max(0, Number(stats.total_output_tokens) || 0);
      liveStream.exactReasoningTokens = Math.max(0, Number(stats.reasoning_output_tokens) || 0);
      liveStream.hasExactStats = true;
      liveStream.tokensPerSecond = Math.max(0, Number(stats.tokens_per_second) || 0);
      liveStream.stage = '응답 완료';
      liveStream.progress = 100;
      liveStream.phase = 'complete';
    } else if (type === 'error') {
      liveStream.stage = 'LM Studio 스트리밍 오류 확인 중';
    }
    scheduleLiveStreamRender(type !== 'reasoning.delta' && type !== 'message.delta');
  }

  function updateThinkingProgress() {
    if (!state.running) return;
    if (liveStream && liveStream.stage === 'LM Studio 연결 중') {
      liveStream.stage = getThinkingStage(Math.max(0, (Date.now() - thinkingStartedAt) / 1000));
    }
    updateLiveStreamDom();
  }

  function startThinkingProgress() {
    if (thinkingTimer) clearInterval(thinkingTimer);
    thinkingStartedAt = Date.now();
    thinkingProgress = 2;
    liveStream = {
      phase: 'connecting',
      stage: 'LM Studio 연결 중',
      progress: 2,
      contextLength: state.lmContextLength || 0,
      maxOutputTokens: 0,
      estimatedInputTokens: 0,
      exactOutputTokens: 0,
      exactReasoningTokens: 0,
      hasExactStats: false,
      tokensPerSecond: 0,
      firstTokenAt: 0,
      reasoning: '',
      answer: ''
    };
    updateThinkingProgress();
    thinkingTimer = setInterval(updateThinkingProgress, 300);
  }

  function stopThinkingProgress() {
    if (thinkingTimer) clearInterval(thinkingTimer);
    thinkingTimer = null;
    thinkingProgress = 0;
    liveStream = null;
    liveStreamRenderPending = false;
    liveStreamLastRenderAt = 0;
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

  function syncAcademicCountSelect() {
    var select = document.getElementById('ai-chat-academic-count');
    if (!select) return;
    var value = String(state.academicSearchCount);
    var custom = select.querySelector('option[data-ai-chat-custom-count]');
    var standard = Array.prototype.some.call(select.options, function (option) {
      return !option.hasAttribute('data-ai-chat-custom-count') && option.value === value;
    });
    if (standard && custom) {
      custom.remove();
      custom = null;
    } else if (!standard) {
      if (!custom) {
        custom = document.createElement('option');
        custom.setAttribute('data-ai-chat-custom-count', 'true');
        select.appendChild(custom);
      }
      custom.value = value;
      custom.textContent = value + '개 · 직접 입력';
    }
    select.value = value;
  }

  function setAcademicSearchCount(value, announce) {
    state.academicSearchCount = normalizeAcademicCount(value);
    storageSet(ACADEMIC_COUNT_KEY, String(state.academicSearchCount));
    updateAcademicSearchUI();
    saveHistory();
    if (announce) setStatus('학술검색 결과 수를 ' + state.academicSearchCount + '개로 설정했습니다.', 'ok');
  }

  function beginAcademicCountEdit() {
    var wrap = document.getElementById('ai-chat-academic-count-wrap');
    var input = document.getElementById('ai-chat-academic-count-input');
    var imageModel = state.provider === 'aistudio' && isGeminiImageModel(state.geminiModel);
    if (!wrap || !input || state.running || imageModel || !state.academicSearchEnabled) return;
    wrap.classList.add('editing');
    input.hidden = false;
    input.disabled = false;
    input.value = String(state.academicSearchCount);
    input.focus();
    input.select();
  }

  function finishAcademicCountEdit(commit) {
    var wrap = document.getElementById('ai-chat-academic-count-wrap');
    var input = document.getElementById('ai-chat-academic-count-input');
    if (!wrap || !input || !wrap.classList.contains('editing')) return;
    var value = input.value;
    wrap.classList.remove('editing');
    input.hidden = true;
    if (commit && String(value).trim()) setAcademicSearchCount(value, true);
    else {
      input.value = String(state.academicSearchCount);
      syncAcademicCountSelect();
    }
    var select = document.getElementById('ai-chat-academic-count');
    if (select && document.activeElement === input) select.focus();
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
    var contextInfo = state.provider === 'lmstudio' && state.lmContextLength
      ? ' · 컨텍스트 ' + Number(state.lmContextLength).toLocaleString('ko-KR') + '토큰'
      : '';
    var reasoningInfo = state.responseMode === 'reasoning'
      ? (state.showReasoning ? '추론 ON · 실시간 추론 표시' : '추론 ON · 추론 내용 숨김')
      : '추론 OFF';
    help.textContent = state.responseMode === 'reasoning'
      ? reasoningInfo + contextInfo + ' · 최대 5분 대기'
      : reasoningInfo + ' · 빠른 답변';
  }

  function updateAcademicSearchUI() {
    var button = document.getElementById('ai-chat-academic-toggle');
    var countWrap = document.getElementById('ai-chat-academic-count-wrap');
    var countSelect = document.getElementById('ai-chat-academic-count');
    var countInput = document.getElementById('ai-chat-academic-count-input');
    var imageModel = state.provider === 'aistudio' && isGeminiImageModel(state.geminiModel);
    if (button) {
      button.classList.toggle('active', state.academicSearchEnabled);
      button.setAttribute('aria-pressed', state.academicSearchEnabled ? 'true' : 'false');
      button.disabled = state.running || imageModel;
    }
    if (countWrap) countWrap.classList.toggle('visible', state.academicSearchEnabled && !imageModel);
    if (countSelect) {
      syncAcademicCountSelect();
      countSelect.disabled = state.running || imageModel;
    }
    if (countInput) countInput.disabled = state.running || imageModel;
    if (countWrap && (!state.academicSearchEnabled || imageModel)) {
      countWrap.classList.remove('editing');
      if (countInput) countInput.hidden = true;
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
    if (state.responseMode === 'reasoning' && !state.showReasoning) {
      state.showReasoning = true;
      storageSet(SHOW_REASONING_KEY, '1');
      var reasoningCheckbox = document.getElementById('ai-chat-show-reasoning');
      if (reasoningCheckbox) reasoningCheckbox.checked = true;
    }
    var buttons = document.querySelectorAll('#ai-chat-panel [data-ai-chat-mode]');
    for (var i = 0; i < buttons.length; i++) {
      var active = buttons[i].getAttribute('data-ai-chat-mode') === state.responseMode;
      buttons[i].classList.toggle('active', active);
      buttons[i].setAttribute('aria-pressed', active ? 'true' : 'false');
    }
    updateModeHelp();
    updateHeaderModel();
    renderMessages();
    saveHistory();
  }

  function setShowReasoning(show) {
    state.showReasoning = !!show;
    storageSet(SHOW_REASONING_KEY, state.showReasoning ? '1' : '0');
    var checkbox = document.getElementById('ai-chat-show-reasoning');
    if (checkbox) checkbox.checked = state.showReasoning;
    updateModeHelp();
    updateHeaderModel();
    renderMessages();
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
    var academicCountInput = document.getElementById('ai-chat-academic-count-input');
    var showReasoning = document.getElementById('ai-chat-show-reasoning');
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
    if (showReasoning) showReasoning.disabled = state.running || imageModel;
    if (academicToggle) academicToggle.disabled = state.running || imageModel;
    if (academicCount) academicCount.disabled = state.running || imageModel;
    if (academicCountInput) academicCountInput.disabled = state.running || imageModel;
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
    if (state.responseMode === 'reasoning' && !state.showReasoning && !(state.provider === 'aistudio' && isGeminiImageModel(state.geminiModel))) {
      header.textContent += ' · 내용 숨김';
    }
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
    var showReasoning = document.getElementById('ai-chat-show-reasoning');
    var buttons = document.querySelectorAll('#ai-chat-panel [data-ai-chat-mode]');
    if (panel) panel.classList.toggle('image-model-selected', imageModel);
    if (input) input.placeholder = imageModel
      ? '생성할 이미지를 설명하세요. Enter 생성 · Shift+Enter 줄바꿈'
      : '질문을 입력하세요. Enter 전송 · Shift+Enter 줄바꿈';
    for (var i = 0; i < buttons.length; i++) buttons[i].disabled = state.running || imageModel;
    if (showReasoning) showReasoning.disabled = state.running || imageModel;
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
        state.lmContextLength = Math.max(0, Number(lm && lm.contextLength) || 0);
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
        state.lmContextLength = 0;
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
    // Recover responses that reached the output limit before closing the tags.
    // This also repairs already-saved academic answers on the next load.
    if (!checklistTag || !answerTag) {
      var checklistOpen = raw.search(/\[CHECKLIST\]/i);
      var answerOpen = raw.search(/\[ANSWER\]/i);
      if (!checklist && checklistOpen >= 0 && answerOpen > checklistOpen) {
        checklist = raw.slice(checklistOpen + '[CHECKLIST]'.length, answerOpen)
          .replace(/\[\/CHECKLIST\]/gi, '').trim();
      }
      if (!answerTag && answerOpen >= 0) {
        answer = raw.slice(answerOpen + '[ANSWER]'.length)
          .replace(/\[\/ANSWER\]/gi, '').trim();
        remaining = answer;
      }
    }
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

  var ACADEMIC_CHECKLIST = [
    ['검색 근거의 범위와 한계', /검색\s*근거|자료.*범위|범위와\s*한계|연구.*한계/i],
    ['전체 핵심 주장과 인용', /핵심\s*주장|주장.*결과|주장\s*목록/i],
    ['같은 방향의 주장과 연구 인용', /같은\s*방향|공통.*주장|일관.*결과|지지.*연구/i],
    ['다른·반대·조건부·비유의 주장', /다른.*(?:주장|결과|근거)|반대|조건부|비유의|상충|불일치/i],
    ['주장 간 관계의 종합 해석', /종합\s*해석|통합.*해석|종합문|전체.*종합/i]
  ];

  function academicChecklistFlags(answerText) {
    var answer = String(answerText || '');
    return ACADEMIC_CHECKLIST.map(function (item) { return item[1].test(answer); });
  }

  function academicPartChecklistIndexes(partNumber) {
    if (Number(partNumber) === 1) return [0, 1];
    if (Number(partNumber) === 2) return [2];
    if (Number(partNumber) === 3) return [3, 4];
    return [0, 1, 2, 3, 4];
  }

  function academicPartChecklistComplete(answerText, partNumber) {
    var flags = academicChecklistFlags(answerText);
    return academicPartChecklistIndexes(partNumber).every(function (index) { return flags[index]; });
  }

  function academicPartMissingItems(answerText, partNumber) {
    var flags = academicChecklistFlags(answerText);
    return academicPartChecklistIndexes(partNumber).filter(function (index) {
      return !flags[index];
    }).map(function (index) {
      return (index + 1) + '. ' + ACADEMIC_CHECKLIST[index][0];
    });
  }

  function buildAcademicChecklist(answerText) {
    var flags = academicChecklistFlags(answerText);
    return ACADEMIC_CHECKLIST.map(function (item, index) {
      return (index + 1) + '. ' + item[0] + ' 포함 여부: ' + (flags[index] ? '예' : '아니오');
    }).join('\n');
  }

  function stripUnknownAuthorPlaceholders(value) {
    return String(value || '')
      .replace(/\(\s*(?:(?:저자\s*미상|Unknown author)\s*,?\s*(?:\d{4}|n\.d\.)\s*;?\s*)+\)/gi, '')
      .replace(/(?:저자\s*미상|Unknown author)\s*,?\s*(?:\d{4}|n\.d\.)\s*;?\s*/gi, '')
      .replace(/\(\s*;\s*/g, '(')
      .replace(/;\s*\)/g, ')')
      .replace(/\(\s*\)/g, '')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }

  function normalizeAcademicCitationTypography(value) {
    return String(value || '').replace(/([A-Za-z가-힣])\s*&\s*([A-Za-z가-힣])(?=[^()\n]{0,80},\s*(?:18|19|20)\d{2}[a-z]?\b)/g, '$1 & $2');
  }

  function normalizeAcademicWritingRegister(value) {
    return String(value || '')
      .replace(/하였습니다/g, '하였다')
      .replace(/했습니다/g, '했다')
      .replace(/되었습니다/g, '되었다')
      .replace(/됐습니다/g, '됐다')
      .replace(/있었습니다/g, '있었다')
      .replace(/없었습니다/g, '없었다')
      .replace(/이었습니다/g, '이었다')
      .replace(/였습니다/g, '였다')
      .replace(/았습니다/g, '았다')
      .replace(/었습니다/g, '었다')
      .replace(/있습니다/g, '있다')
      .replace(/없습니다/g, '없다')
      .replace(/입니다/g, '이다')
      .replace(/합니다/g, '한다')
      .replace(/됩니다/g, '된다')
      .replace(/납니다/g, '난다')
      .replace(/봅니다/g, '본다');
  }

  function academicSourceCitation(item) {
    var authors = item && Array.isArray(item.authors) ? item.authors.filter(Boolean) : [];
    var author = String(item && item.authorLabel || '').trim();
    var year = Number(item && item.year);
    if (!authors.length || !author || !Number.isFinite(year)) return null;
    return {
      parenthetical: author + ', ' + year,
      narrative: author + ' (' + year + ')'
    };
  }

  function replaceAcademicSourceMarkers(value, sources) {
    var text = String(value || '');
    var items = Array.isArray(sources) ? sources : [];
    function citationAt(number) {
      var index = Number(number) - 1;
      return index >= 0 && index < items.length ? academicSourceCitation(items[index]) : null;
    }
    text = text.replace(/\b(?:S|SOURCE)\s*(\d+)\s*(에\s*따르면|에서는|에서|은|는|이|가|의\s*연구(?:는|가)?)/gi, function (match, number, suffix) {
      var citation = citationAt(number);
      return citation ? citation.narrative + suffix : '해당 연구' + suffix;
    });
    text = text.replace(/[\[(]\s*(?:(?:S|SOURCE)\s*\d+\s*(?:[,;]\s*)?)+[\])]/gi, function (match) {
      var seen = Object.create(null);
      var citations = (match.match(/\d+/g) || []).map(function (number) {
        var citation = citationAt(number);
        if (!citation || seen[citation.parenthetical]) return '';
        seen[citation.parenthetical] = true;
        return citation.parenthetical;
      }).filter(Boolean);
      return citations.length ? '(' + citations.join('; ') + ')' : '';
    });
    text = text.replace(/\b(?:S|SOURCE)\s*(\d+)\b/gi, function (match, number) {
      var citation = citationAt(number);
      return citation ? '(' + citation.parenthetical + ')' : '';
    });
    var adjacentCitations = /\(([^()\n]+,\s*(?:18|19|20)\d{2}[a-z]?)\)\s*[,;]\s*\(([^()\n]+,\s*(?:18|19|20)\d{2}[a-z]?)\)/g;
    while (adjacentCitations.test(text)) {
      text = text.replace(adjacentCitations, '($1; $2)');
      adjacentCitations.lastIndex = 0;
    }
    return text
      .replace(/\[\s*\]/g, '')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .trim();
  }

  function normalizeAcademicAnswer(value, sources) {
    var cited = replaceAcademicSourceMarkers(value, sources);
    return normalizeAcademicCitationTypography(normalizeAcademicWritingRegister(stripUnknownAuthorPlaceholders(cited)));
  }

  function extractModelStatus(value) {
    var raw = String(value || '').trim();
    var found = false;
    var marker = /모델이\s*추론\s*내용만\s*반환하고\s*최종\s*답변을\s*생성하지\s*못했습니다\.?\s*(?:(?:출력\s*토큰\s*설정|Max\s*tokens?\s*값)\s*을?\s*늘려\s*다시\s*시도하세요\.?)?/gi;
    var cleaned = raw.replace(marker, function () {
      found = true;
      return ' ';
    }).replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
    if (!found) return { answer: raw, notice: '' };
    return {
      answer: cleaned,
      notice: '모델이 추론 내용만 반환하여 최종 답변이 생성되지 않았습니다. 기존 답변은 그대로 유지됩니다. 아래의 “이어서 작성”을 누르면 추가 답변을 새로 생성합니다. 같은 현상이 반복되면 설정에서 Max tokens 값을 늘려 주세요.'
    };
  }

  function sanitizeAssistantMessage(message) {
    if (!message || message.role !== 'assistant') return message;
    var detectedStatus = false;
    ['content', 'reasoning', 'checklist'].forEach(function (field) {
      if (!message[field]) return;
      var status = extractModelStatus(message[field]);
      message[field] = status.answer;
      if (status.notice) {
        detectedStatus = true;
        if (!message.notice) message.notice = status.notice;
      }
    });
    if (detectedStatus) message.continuationAvailable = true;
    return message;
  }

  function normalizeRepeatedText(value) {
    return String(value || '').toLowerCase()
      .replace(/^[ \t]*#{1,6}[ \t]*/gm, '')
      .replace(/[>*_`~\-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function repeatedWordCoverage(previousText, candidateText) {
    var previousWords = normalizeRepeatedText(previousText).split(/\s+/).filter(function (word) { return word.length >= 2; });
    var candidateWords = normalizeRepeatedText(candidateText).split(/\s+/).filter(function (word) { return word.length >= 2; });
    if (candidateWords.length < 12 || !previousWords.length) return 0;
    var previousSet = Object.create(null);
    previousWords.forEach(function (word) { previousSet[word] = true; });
    var candidateSet = Object.create(null);
    candidateWords.forEach(function (word) { candidateSet[word] = true; });
    var uniqueWords = Object.keys(candidateSet);
    var repeated = uniqueWords.filter(function (word) { return previousSet[word]; }).length;
    return uniqueWords.length ? repeated / uniqueWords.length : 0;
  }

  function repeatedPhraseCoverage(previousText, candidateText) {
    var previousWords = normalizeRepeatedText(previousText).split(/\s+/).filter(Boolean);
    var candidateWords = normalizeRepeatedText(candidateText).split(/\s+/).filter(Boolean);
    if (candidateWords.length < 10 || previousWords.length < 10) return 0;
    var previousPairs = Object.create(null);
    for (var i = 0; i < previousWords.length - 1; i++) previousPairs[previousWords[i] + ' ' + previousWords[i + 1]] = true;
    var pairCount = 0;
    var repeated = 0;
    for (var j = 0; j < candidateWords.length - 1; j++) {
      pairCount += 1;
      if (previousPairs[candidateWords[j] + ' ' + candidateWords[j + 1]]) repeated += 1;
    }
    return pairCount ? repeated / pairCount : 0;
  }

  function removeRepeatedContinuation(previousText, continuationText, strictAcademic) {
    var previous = String(previousText || '').trim();
    var addition = String(continuationText || '').trim()
      .replace(/^\s*(?:원래\s*)?(?:질문|요청)\s*[:：][^\n]*(?:\n+|$)/i, '');
    if (!addition) return '';
    if (previous && addition.indexOf(previous) === 0) addition = addition.slice(previous.length).trim();
    var normalizedPrevious = normalizeRepeatedText(previous);
    var seenParagraphs = Object.create(null);
    var paragraphs = addition.split(/\n\s*\n/).filter(function (paragraph) { return !!paragraph.trim(); });
    var unique = paragraphs.filter(function (paragraph) {
      var normalized = normalizeRepeatedText(paragraph);
      if (!normalized) return false;
      if (seenParagraphs[normalized]) return false;
      seenParagraphs[normalized] = true;
      if (normalized.length >= 8 && normalizedPrevious.indexOf(normalized) >= 0) return false;
      if (normalized.length < 30) return true;
      if (repeatedPhraseCoverage(previous, paragraph) >= (strictAcademic ? 0.38 : 0.62)) return false;
      return repeatedWordCoverage(previous, paragraph) < (strictAcademic ? 0.72 : 0.78);
    });
    addition = unique.join('\n\n').trim();
    var maxOverlap = Math.min(previous.length, addition.length, 1200);
    for (var size = maxOverlap; size >= 40; size--) {
      if (previous.slice(-size) === addition.slice(0, size)) {
        addition = addition.slice(size).trim();
        break;
      }
    }
    return addition;
  }

  function extractContinuationBody(value) {
    return extractVisibleAnswerBody(String(value || '').replace(/^\s*\[CONTINUATION\]\s*/i, ''), true);
  }

  function academicReasoningOnlyNotice() {
    return '모델이 실제 본문 대신 추론·작업 계획만 반환했습니다. 이 내용은 답변에 포함하지 않았습니다. “이어서 작성”을 누르면 같은 분할 파트의 한국어 본문만 다시 요청합니다.';
  }

  function extractVisibleAnswerBody(value, academicSearch) {
    var rawText = String(value || '').trim();
    if (academicSearch && /^\s*<(?:think|analysis|reasoning)>/i.test(rawText) && !/<\/(?:think|analysis|reasoning)>/i.test(rawText)) {
      return { body: '', notice: academicReasoningOnlyNotice() };
    }
    var text = rawText
      .replace(/<think>[\s\S]*?<\/think>/gi, ' ')
      .replace(/<(?:analysis|reasoning)>[\s\S]*?<\/(?:analysis|reasoning)>/gi, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (!text || !academicSearch) return { body: text, notice: '' };
    var academicHeadingMatch = text.match(/(?:^|\n|\)\s*\*?)\s*(#{1,6}\s*(?:\d+[.)]\s*)?(?:검색\s*근거|핵심\s*주장|같은\s*방향|다른\s*(?:방향|결과)|반대|조건부|비유의|종합\s*해석))/m);
    if (academicHeadingMatch) {
      var academicHeadingIndex = academicHeadingMatch.index + academicHeadingMatch[0].indexOf(academicHeadingMatch[1]);
      text = text.slice(academicHeadingIndex).replace(/^\s+/, '');
      return { body: text, notice: '' };
    }
    if (/^\s*(?:execution\s+plan|strategy|analysis|reasoning|approach|plan)\s*[:.]/i.test(text)) {
      var inlineAnswerBoundary = text.match(/\.\s*(?=[가-힣]{2})/);
      if (inlineAnswerBoundary && inlineAnswerBoundary.index < 700) {
        text = text.slice(inlineAnswerBoundary.index + inlineAnswerBoundary[0].length).trim();
      }
    }
    var lines = text.split(/\r?\n/);
    var planningPattern = /^\s*(?:#{1,6}\s*)?(?:[*-]\s*)?(?:\*{1,2}\s*)?(?:(?:the\s+user\s+(?:wants|asks|requested)|user\s+wants|i\s+(?:need|should|will|must)|we\s+(?:need|should|will|must))\b|(?:execution\s+plan|strategy|analysis|reasoning|approach|plan|objective|task|context|constraints?|missing\s+sections?|instructions?)\s*[:.]|(?:작업\s*지침\s*분석|분석\s*목표|출력\s*형식\s*준수|작성\s*범위\s*제한|검색\s*레코드\s*검토|주제\s*적합성\s*판단|핵심\s*주장\s*구성\s*전략|작성\s*초안\s*구성|검증\s*검색\s*레코드|이전\s*내용\s*검토|핵심\s*분석\s*대상|분석\s*전략|제약\s*사항|실행|결론)\s*[:：])/i;
    var planningStepPattern = /^\s*(?:\d+[.)]|[*-])\s*(?:\*{1,2}\s*)?(?:scan|identify|extract|group|compare|ensure|adhere|focus|write|use|check|review|complete|start|avoid|cite|출력\s*파트|포함할\s*내용|시작\s*문구|분석\s*요구사항|작성\s*범위|출력\s*형식|검색\s*근거|핵심\s*주장|작성\s*초안)\b/i;
    var selfCorrectionPattern = /^\s*(?:[*-]\s*)?\(?\s*self[- ]correction\b/i;
    var planningCount = lines.filter(function (line) {
      return planningPattern.test(line) || planningStepPattern.test(line) || selfCorrectionPattern.test(line);
    }).length;
    if (planningCount < 2 && !/^\s*(?:the user|user wants|i need|we need|execution\s+plan\s*:|strategy\s*:|analysis\s*:|reasoning\s*:|작업\s*지침\s*분석|분석\s*목표|출력\s*형식\s*준수|작성\s*범위\s*제한)/i.test(text)) {
      return { body: text, notice: '' };
    }
    var answerStart = -1;
    for (var i = 0; i < lines.length; i++) {
      var line = String(lines[i] || '').trim();
      if (!line || planningPattern.test(line) || planningStepPattern.test(line) || selfCorrectionPattern.test(line)) continue;
      if (/^\s*(?:\[ANSWER\]|(?:final\s+answer|최종\s*답변)\s*:)/i.test(line)) {
        answerStart = i;
        break;
      }
      if (/^\s*(?:#{1,6}\s*)?(?:\d+[.)]\s*)?(?:검색\s*근거|핵심\s*주장|같은\s*방향|다른\s*방향|반대|조건부|비유의|종합\s*해석)/.test(line)) {
        answerStart = i;
        break;
      }
      var koreanChars = (line.match(/[가-힣]/g) || []).length;
      var englishChars = (line.match(/[A-Za-z]/g) || []).length;
      if (koreanChars >= 24 && koreanChars > englishChars) {
        answerStart = i;
        break;
      }
    }
    if (answerStart >= 0) {
      var body = lines.slice(answerStart).join('\n')
        .replace(/^\s*(?:\[ANSWER\]|(?:final\s+answer|최종\s*답변)\s*:)\s*/i, '')
        .trim();
      return {
        body: body,
        notice: ''
      };
    }
    return {
      body: '',
      notice: academicReasoningOnlyNotice()
    };
  }

  function answerEndsCleanly(answerText) {
    var tail = String(answerText || '').trim().replace(/[\s*_`#>-]+$/g, '').trim();
    if (!tail) return true;
    if (/[.!?。！？…\])}"'’”]$/.test(tail)) return true;
    return /(?:이다|한다|있다|없다|된다|보인다|제시한다|확인된다|요약된다|마친다|완료한다|입니다|합니다|습니다|됩니다|있습니다|없습니다)$/.test(tail);
  }

  function shouldOfferContinuation(message, result, academicSearch) {
    if (!message || message.error || (Array.isArray(message.images) && message.images.length)) return false;
    var answer = String(message.content || '').trim();
    if (!answer) return !!message.notice;
    var finishReason = String(result && result.finishReason || '').toLowerCase();
    if (/length|max[_ -]?tokens?|token[_ -]?limit|context[_ -]?(?:length|limit)/.test(finishReason)) return true;
    if (academicSearch && /포함 여부:\s*아니오/.test(String(message.checklist || ''))) return true;
    return answer.length >= 240 && !answerEndsCleanly(answer);
  }

  function didHitOutputLimit(result) {
    var finishReason = String(result && result.finishReason || '').toLowerCase();
    return /length|max[_ -]?tokens?|token[_ -]?limit|context[_ -]?(?:length|limit)/.test(finishReason);
  }

  function academicPartTask(partNumber) {
    if (partNumber === 2) {
      return [
        '분할 답변 2/3에서 원래 체크리스트 3번만 작성하세요.',
        '첫 줄은 반드시 "## 2. 같은 방향의 주장과 연구 비교"로 시작하세요.',
        '같은 방향의 결과를 최대 3개 논점으로 묶고, 각 논점은 대표 연구의 실제 저자·연도를 제시한 근거 문장과 연구 간 관계·의미를 해석하는 문장으로 구성하세요.',
        '단순 연구 나열이 아니라 공통점, 차이, 적용 조건을 학술적으로 연결하되 인과관계가 확인되지 않은 결과는 관련성·연관성 수준으로 한정하세요.',
        '권장 분량은 한국어 550~800자이며 검색된 논문을 모두 나열하거나 일반 배경 설명을 덧붙이지 마세요.',
        '1/3의 검색 범위·핵심 주장, 3/3의 반대 결과·종합 결론은 반복하거나 미리 작성하지 마세요.'
      ].join(' ');
    }
    if (partNumber === 3) {
      return [
        '분할 답변 3/3에서 원래 체크리스트 4번과 5번만 작성하세요.',
        '첫 줄은 반드시 "## 3. 다른 결과와 종합 해석"으로 시작하세요.',
        '다른 방향·반대·조건부·비유의한 결과는 최대 3개만 대표 근거와 함께 분석하고, 선행 결과와 달라지는 조건이나 해석상의 한계를 명시하세요.',
        '종합 해석은 근거들의 관계, 적용 범위, 연구상 함의를 연결한 3~4문장으로 전체 답변을 끝내세요.',
        '권장 분량은 한국어 600~900자이며 이미 나온 같은 방향 주장이나 인용을 다시 요약하지 마세요.',
        '1/3과 2/3의 문장이나 인용 묶음을 다시 요약하지 말고 새로운 분석만 작성하세요.'
      ].join(' ');
    }
    return [
      '분할 답변 1/3에서 원래 체크리스트 1번과 2번만 작성하세요.',
      '첫 줄은 반드시 "## 1. 검색 근거의 범위와 핵심 주장"으로 시작하세요.',
      '검색 근거의 범위와 한계는 2~3문장으로 규정하고, 공개 초록에서 확인되는 핵심 주장만 3~5개 항목으로 정리하여 각 항목에 대표 저자·연도 인용을 붙이세요.',
      '각 핵심 주장은 결과를 단순 보고하는 데 그치지 말고 그 결과가 연구 질문에 갖는 의미나 적용 조건을 한 문장 덧붙여 분석하세요.',
      '권장 분량은 한국어 600~900자이며 논문별 소개, 장황한 배경 설명, 같은 의미의 재진술을 하지 마세요.',
      '같은 방향 연구의 상세 비교, 반대·조건부 결과, 최종 종합은 다음 파트에서 작성하므로 여기서는 작성하지 마세요.'
    ].join(' ');
  }

  function findSourceUserMessage(messageIndex) {
    for (var i = messageIndex - 1; i >= 0; i--) {
      if (state.messages[i] && state.messages[i].role === 'user') return state.messages[i];
    }
    return null;
  }

  function combinedAssistantContent(messageIndex) {
    var parts = [];
    for (var i = messageIndex; i >= 0; i--) {
      var message = state.messages[i];
      if (!message) continue;
      if (message.role === 'user') break;
      if (message.role === 'assistant' && !message.error && String(message.content || '').trim()) parts.unshift(String(message.content).trim());
    }
    return parts.join('\n\n');
  }

  async function continueAssistantAnswer(messageIndex) {
    if (state.running || state.storageInitializing) return;
    var target = state.messages[messageIndex];
    if (!target || target.role !== 'assistant' || target.error) return;
    var sourceUser = findSourceUserMessage(messageIndex);
    var academicSearch = !!(sourceUser && Array.isArray(sourceUser.academicSources) && sourceUser.academicSources.length);
    var originalStatus = extractModelStatus(combinedAssistantContent(messageIndex) || String(target.content || '').trim());
    var originalAnswer = originalStatus.answer;
    if (originalStatus.notice && !target.notice) target.notice = originalStatus.notice;
    var academicTotalParts = Number(target.academicTotalParts) || 0;
    var splitAcademic = academicSearch && academicTotalParts > 1;
    var currentPart = splitAcademic ? Math.max(1, Math.min(academicTotalParts, Number(target.academicPart) || 1)) : 0;
    var currentPartComplete = splitAcademic && target.academicPartComplete === true;
    var requestedPart = splitAcademic && currentPartComplete && currentPart < academicTotalParts ? currentPart + 1 : currentPart;
    var answerTail = originalAnswer.slice(splitAcademic ? (currentPartComplete ? -180 : -320) : -900);
    var continuationChecklist = academicSearch ? buildAcademicChecklist(originalAnswer) : String(target.checklist || '');
    var missingSections = continuationChecklist.split(/\r?\n/).filter(function (line) {
      return /포함 여부:\s*아니오/.test(line);
    }).map(function (line) {
      return line.replace(/^\s*\d+[.)]\s*/, '').replace(/\s*포함 여부:\s*아니오\s*$/, '');
    });
    var evidence = '';
    var continuationEvidenceProfile = null;
    if (academicSearch) {
      var continuationEvidencePlan = academicEvidencePlan(sourceUser.academicSources);
      evidence = continuationEvidencePlan.evidence;
      continuationEvidenceProfile = continuationEvidencePlan.profile;
    }
    var continuationPromptParts = splitAcademic
      ? [
          academicPartTask(requestedPart),
          requestedPart === currentPart && !currentPartComplete
            ? '이 파트에서 아직 충족하지 못한 체크리스트 항목만 보충하세요: ' + (academicPartMissingItems(originalAnswer, requestedPart).join(', ') || '마지막으로 끊긴 문장 완결') + '. 이미 충족한 항목은 다시 쓰지 마세요.'
            : '앞 파트의 체크리스트는 이미 완료되었습니다. 다음 파트에 지정된 새 체크리스트 항목만 작성하세요.',
          '이전 답변 끝부분(중복 방지용, 재출력 금지):\n' + answerTail,
          requestedPart === currentPart && !currentPartComplete
            ? '앞 문장을 되풀이하거나 바꾸어 쓰지 말고, 필요한 최소 1~3개의 한국어 완성 문장만 추가하세요.'
            : '질문, 체크리스트 자체, 작업 계획, 모델의 생각, 영어 지시사항, 이미 작성한 제목·문장·문단은 출력하지 마세요. 지정된 요약 분량에 도달하면 즉시 끝내세요.'
        ]
      : [
          missingSections.length ? '아직 작성하지 못한 항목: ' + missingSections.join(', ') : '이전 답변의 끊긴 문장과 남은 내용을 완결하세요.',
          '직전 답변의 마지막 연결 지점(이 내용 다음부터 작성하며 재출력하지 않음):\n' + answerTail,
          [
            '원래 사용자 요청과 직전 답변 전체는 바로 앞 대화 문맥에 제공되어 있습니다.',
            '직전 답변에서 이미 완성한 내용은 요약·반복·바꾸어 쓰지 말고, 그 이후에 아직 작성하지 않은 내용만 이어서 작성하세요.',
            '마지막 문장이 중간에 끊겼다면 그 문장을 자연스럽게 완결한 뒤 남은 항목을 모두 작성하세요.',
            '질문, 체크리스트, 분석 계획, 모델의 생각, 작업 설명, 영어 메타 문장은 출력하지 마세요.',
            '첫 글자부터 사용자에게 보여 줄 한국어 본문을 시작하고, 모든 남은 내용을 완성된 마지막 문장으로 끝내세요.'
          ].join(' ')
        ];
    var continuationPrompt = continuationPromptParts.join('\n\n');
    var continuationMessages = splitAcademic
      ? [{ role: 'user', content: continuationPrompt }]
      : [
          { role: 'user', content: String(sourceUser && sourceUser.content || '원래 사용자 요청') },
          { role: 'assistant', content: originalAnswer },
          { role: 'user', content: continuationPrompt }
        ];
    setRunning(true);
    startThinkingProgress();
    target.continuationAvailable = false;
    renderMessages();
    setStatus(splitAcademic ? '학술 분할 답변 ' + requestedPart + '/' + academicTotalParts + '을 작성하는 중...' : '이전 답변의 끊긴 지점부터 이어서 작성하는 중...', 'loading');
    try {
      var result = await getBridge().complete({
        provider: state.provider,
        model: state.provider === 'aistudio' ? state.geminiModel : null,
        mode: 'quick',
        academicSearch: academicSearch,
        continuation: true,
        splitAcademicResponse: splitAcademic,
        previousResponseId: null,
        messages: continuationMessages,
        onStreamEvent: state.provider === 'lmstudio' ? handleStreamEvent : undefined,
        systemInstruction: academicSearch
          ? academicContinuationInstruction(evidence, splitAcademic ? requestedPart : 0, continuationEvidenceProfile)
          : [
              '원래 사용자 요청과 직전 assistant 답변 전체를 대화 문맥으로 읽고, 직전 답변 바로 다음 내용만 한국어로 이어서 작성한다.',
              '이미 작성한 내용, 제목, 문장, 문단을 반복하거나 요약하지 않는다.',
              '내부 추론, 계획, 작업 설명, 체크리스트, "The user wants" 같은 메타 문장을 출력하지 않는다.',
              '첫 토큰부터 사용자에게 보여 줄 새 본문만 출력하고, 남은 요구사항을 충분히 작성한 뒤 완성된 문장으로 끝낸다.'
            ].join(' ')
      });
      var continuedRaw = result && result.text != null ? String(result.text) : '';
      var continuedStatus = extractModelStatus(continuedRaw);
      var continued = continuedStatus.answer ? parseAssistantSections(continuedStatus.answer).answer.trim() : '';
      var continuationBody = extractContinuationBody(continued);
      continued = continuationBody.body;
      if (continuationBody.notice && !continuedStatus.notice) continuedStatus.notice = continuationBody.notice;
      if (academicSearch) continued = normalizeAcademicAnswer(continued, sourceUser && sourceUser.academicSources);
      continued = removeRepeatedContinuation(originalAnswer, continued, academicSearch);
      if (!continued && !continuedStatus.notice) {
        continuedStatus.notice = '모델이 새 내용을 추가하지 않고 기존 답변을 반복했습니다. 기존 답변은 변경되지 않았습니다. “이어서 작성”을 다시 누르면 아직 작성되지 않은 내용만 요청합니다.';
      }
      var combinedAnswer = [originalAnswer, continued].filter(Boolean).join('\n\n');
      var additionalMessage = {
        role: 'assistant',
        content: continued,
        checklist: '',
        reasoning: '',
        notice: continuedStatus.notice,
        isContinuation: true,
        continuationCount: (Number(target.continuationCount) || 0) + 1,
        createdAt: Date.now(),
        provider: result.provider,
        model: result.model,
        usage: result.usage || null,
        contextLength: result.contextLength || null,
        maxOutputTokens: result.maxOutputTokens || null,
        responseId: result.responseId || null,
        academicPart: splitAcademic ? requestedPart : null,
        academicTotalParts: splitAcademic ? academicTotalParts : null,
        academicPartComplete: splitAcademic
          ? !!continued && !continuedStatus.notice && answerEndsCleanly(continued) && academicPartChecklistComplete(combinedAnswer, requestedPart)
          : null
      };
      var continuationProbe = {
        role: 'assistant',
        content: continued,
        checklist: academicSearch && combinedAnswer ? buildAcademicChecklist(combinedAnswer) : ''
      };
      additionalMessage.continuationAvailable = splitAcademic
        ? !!continuedStatus.notice || !additionalMessage.academicPartComplete || requestedPart < academicTotalParts
        : (continuedStatus.notice ? true : shouldOfferContinuation(continuationProbe, result, academicSearch));
      target.continuationAvailable = false;
      state.messages.push(additionalMessage);
      state.messages = state.messages.slice(-MAX_STORED_MESSAGES);
      setStatus(
        additionalMessage.continuationAvailable
          ? (splitAcademic ? '분할 답변 ' + requestedPart + '/' + academicTotalParts + '을 추가했습니다. 다음 내용이 남아 있습니다.' : '추가 답변을 만들었지만 계속 작성할 내용이 남아 있습니다.')
          : '기존 내용은 유지하고 추가 답변을 작성했습니다.',
        additionalMessage.continuationAvailable ? '' : 'ok'
      );
    } catch (error) {
      target.continuationAvailable = true;
      var message = error && error.message ? error.message : String(error);
      if ((error && error.name === 'AbortError') || /abort|중지/i.test(message)) setStatus('이어서 작성을 중지했습니다.', '');
      else setStatus(message, 'error');
    } finally {
      stopThinkingProgress();
      setRunning(false);
      saveHistory();
      renderMessages();
      updateHeaderModel();
    }
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

  function deleteAnswer(messageIndex, message) {
    if (state.running) return setStatus('현재 응답이 끝난 뒤 답변을 지울 수 있습니다.', 'error');
    if (!message || message.role !== 'assistant') return;
    var partLabel = message.academicPart && message.academicTotalParts
      ? '분할 답변 ' + message.academicPart + '/' + message.academicTotalParts
      : (message.isContinuation ? '이 추가 답변' : '이 답변');
    if (!root.confirm(partLabel + '만 대화에서 지울까요? 질문과 다른 답변은 유지됩니다.')) return;
    var wasLastAnswerForQuestion = !state.messages[messageIndex + 1] || state.messages[messageIndex + 1].role === 'user';
    state.messages.splice(messageIndex, 1);
    if (wasLastAnswerForQuestion) {
      for (var i = messageIndex - 1; i >= 0; i--) {
        if (!state.messages[i] || state.messages[i].role === 'user') break;
        if (state.messages[i].role === 'assistant' && !state.messages[i].error) {
          state.messages[i].continuationAvailable = true;
          break;
        }
      }
    }
    state.conversationTitle = titleFromMessages(state.messages);
    saveHistory();
    renderMessages();
    setStatus('선택한 AI 답변만 지웠습니다.', 'ok');
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
    if (mode === 'document-end') return '문서 맨 아래에 삽입';
    return '커서 위치에 삽입';
  }

  function insertQuestionAnswer(messageIndex, message, mode) {
    var answer = String(message && message.content || '').trim();
    if (!answer) return setStatus('문서에 삽입할 AI 답변이 없습니다.', 'error');
    try {
      var bridge = getBridge();
      if (typeof bridge.insertIntoDocument !== 'function') throw new Error('문서 삽입 모듈이 준비되지 않았습니다.');
      bridge.insertIntoDocument(answer, mode || 'cursor');
      setStatus('AI 답변만 ' + insertModeLabel(mode) + '했습니다.', 'ok');
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

  function generatedImageMarkdown(url, index) {
    return '![AI 생성 이미지 ' + (Number(index) + 1) + '](' + String(url || '').trim() + ')';
  }

  async function insertGeneratedImageIntoDocument(image, index, uploadToImgbb) {
    if (!image || !image.data) return setStatus('삽입할 이미지 데이터가 없습니다.', 'error');
    if (image._documentInsertBusy) return;
    var bridge = null;
    var savedUrlField = uploadToImgbb ? 'imgbbUrl' : 'documentUrl';
    image._documentInsertBusy = true;
    renderMessages();
    setStatus(uploadToImgbb ? '생성 이미지를 imgBB에 업로드하는 중...' : '생성 이미지를 문서용으로 내부 저장하는 중...', 'loading');
    try {
      bridge = getBridge();
      var imageUrl = String(image[savedUrlField] || '').trim();
      if (!imageUrl) {
        if (uploadToImgbb) {
          if (typeof bridge.uploadImageToImgbb !== 'function') throw new Error('imgBB 이미지 업로드 모듈이 준비되지 않았습니다.');
          imageUrl = await bridge.uploadImageToImgbb(image, index);
        } else {
          if (typeof bridge.saveImageForDocument !== 'function') throw new Error('문서용 이미지 저장 모듈이 준비되지 않았습니다.');
          imageUrl = await bridge.saveImageForDocument(image, index);
        }
        image[savedUrlField] = imageUrl;
      }
      if (typeof bridge.insertIntoDocument !== 'function') throw new Error('문서 삽입 모듈이 준비되지 않았습니다.');
      bridge.insertIntoDocument(generatedImageMarkdown(imageUrl, index), 'cursor');
      setStatus(
        uploadToImgbb
          ? 'imgBB 저장 주소를 이용해 이미지를 문서에 삽입했습니다.'
          : '생성 이미지를 내부 저장하고 문서에 삽입했습니다.',
        'ok'
      );
    } catch (error) {
      setStatus(error && error.message ? error.message : '생성 이미지를 문서에 삽입하지 못했습니다.', 'error');
    } finally {
      image._documentInsertBusy = false;
      saveHistory();
      renderMessages();
    }
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
      var knownSourceAuthors = Array.isArray(source.authors) && source.authors.some(function (author) { return !!String(author || '').trim(); });
      var authorAndYear = knownSourceAuthors
        ? source.authorLabel + ' (' + (source.year || 'n.d.') + ')'
        : (source.year ? String(source.year) : '');
      meta.textContent = [authorAndYear, source.journal, source.doi ? 'DOI ' + source.doi : '', (source.sources || []).join(' + ')]
        .filter(Boolean).join(' · ');
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
      { mode: 'line-below', label: '한 줄 아래' },
      { mode: 'document-end', label: '문서 맨 아래' }
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
        if (message && message.role === 'assistant') sanitizeAssistantMessage(message);
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
          if (!message.error && String(message.content || '').trim() && !(Array.isArray(message.images) && message.images.length)) {
            if (state.showReasoning && message.reasoning) {
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
            insertSummary.title = 'AI 답변만 문서에 넣는 방법 선택';
            insertWrap.appendChild(insertSummary);
            var insertMenu = document.createElement('div');
            insertMenu.className = 'ai-chat-insert-menu';
            [
              { mode: 'replace', label: '대체 삽입', title: '선택한 내용을 AI 답변으로 대체합니다.' },
              { mode: 'cursor', label: '커서 위치에 삽입', title: '현재 커서 위치에 AI 답변만 삽입합니다.' },
              { mode: 'line-below', label: '한 줄 아래 삽입', title: '커서가 있는 줄 바로 아래에 AI 답변만 삽입합니다.' },
              { mode: 'document-end', label: '문서 맨 아래에 삽입', title: 'AI 답변만 현재 문서의 맨 아래에 삽입합니다.' }
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
            var primaryImage = message.images[0];
            var saveImageButton = document.createElement('button');
            saveImageButton.type = 'button';
            saveImageButton.textContent = '이미지 저장';
            saveImageButton.disabled = state.running || !!primaryImage._documentInsertBusy;
            saveImageButton.addEventListener('click', function () { saveGeneratedImage(primaryImage, 0); });
            actions.appendChild(saveImageButton);
            var insertImageButton = document.createElement('button');
            insertImageButton.type = 'button';
            insertImageButton.textContent = '문서삽입';
            insertImageButton.title = '생성 이미지를 내부 이미지 DB에 저장한 뒤 현재 문서에 삽입';
            insertImageButton.disabled = state.running || !!primaryImage._documentInsertBusy;
            insertImageButton.addEventListener('click', function () { insertGeneratedImageIntoDocument(primaryImage, 0, false); });
            actions.appendChild(insertImageButton);
            var uploadInsertImageButton = document.createElement('button');
            uploadInsertImageButton.type = 'button';
            uploadInsertImageButton.textContent = '업로드 문서삽입';
            uploadInsertImageButton.title = 'imgBB에 업로드하고 저장된 직접 주소로 현재 문서에 삽입';
            uploadInsertImageButton.disabled = state.running || !!primaryImage._documentInsertBusy;
            uploadInsertImageButton.addEventListener('click', function () { insertGeneratedImageIntoDocument(primaryImage, 0, true); });
            actions.appendChild(uploadInsertImageButton);
          }
          var deleteAnswerButton = document.createElement('button');
          deleteAnswerButton.type = 'button';
          deleteAnswerButton.className = 'ai-chat-answer-delete';
          deleteAnswerButton.textContent = '답변 지우기';
          deleteAnswerButton.title = '이 AI 답변만 대화에서 삭제';
          deleteAnswerButton.disabled = state.running;
          deleteAnswerButton.addEventListener('click', function () { deleteAnswer(messageIndex, message); });
          actions.appendChild(deleteAnswerButton);
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
        if (message.role === 'assistant' && state.showReasoning && message.reasoning) {
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
        if (message.role === 'assistant' && (String(message.content || '').trim() || (Array.isArray(message.images) && message.images.length))) {
          var answerLabel = document.createElement('div');
          answerLabel.className = 'ai-chat-answer-label';
          answerLabel.textContent = Array.isArray(message.images) && message.images.length
            ? '이미지 생성 결과'
            : (message.academicPart && message.academicTotalParts
                ? (message.isContinuation ? '추가 답변 ' : '분할 답변 ') + message.academicPart + '/' + message.academicTotalParts
                : (message.isContinuation ? '추가 답변' : '최종 답변'));
          item.appendChild(answerLabel);
        }
        if (String(message.content || '').trim()) item.appendChild(content);
        if (message.role === 'assistant' && message.provider === 'lmstudio' && message.usage) {
          var usage = message.usage || {};
          var responseStatsParts = [];
          if (message.contextLength) {
            responseStatsParts.push('컨텍스트 ' + formatStreamNumber(usage.input_tokens) + ' / ' + formatStreamNumber(message.contextLength));
          }
          if (usage.total_output_tokens || message.maxOutputTokens) {
            responseStatsParts.push('출력 ' + formatStreamNumber(usage.total_output_tokens) + (message.maxOutputTokens ? ' / ' + formatStreamNumber(message.maxOutputTokens) : '') + ' tok');
          }
          if (usage.reasoning_output_tokens) responseStatsParts.push('추론 ' + formatStreamNumber(usage.reasoning_output_tokens) + ' tok');
          if (usage.tokens_per_second) responseStatsParts.push(Number(usage.tokens_per_second).toFixed(1) + ' tok/s');
          if (usage.time_to_first_token_seconds) responseStatsParts.push('첫 토큰 ' + Number(usage.time_to_first_token_seconds).toFixed(2) + '초');
          if (responseStatsParts.length) {
            var responseStats = document.createElement('div');
            responseStats.className = 'ai-chat-response-stats';
            responseStats.textContent = responseStatsParts.join(' · ');
            item.appendChild(responseStats);
          }
        }
        if (message.role === 'assistant' && message.notice) {
          var responseNotice = document.createElement('aside');
          responseNotice.className = 'ai-chat-response-notice';
          var responseNoticeTitle = document.createElement('strong');
          responseNoticeTitle.textContent = '안내 및 지시사항';
          var responseNoticeText = document.createElement('span');
          responseNoticeText.textContent = message.notice;
          responseNotice.appendChild(responseNoticeTitle);
          responseNotice.appendChild(responseNoticeText);
          item.appendChild(responseNotice);
        }
        if (message.role === 'assistant' && message.continuationAvailable) {
          var continuation = document.createElement('div');
          continuation.className = 'ai-chat-continuation';
          var continuationText = document.createElement('span');
          var hasNextAcademicPart = message.academicPartComplete === true
            && Number(message.academicPart) < Number(message.academicTotalParts);
          continuationText.textContent = hasNextAcademicPart
            ? '현재 분할 답변이 완성되었습니다. 다음 답변 ' + (Number(message.academicPart) + 1) + '/' + message.academicTotalParts + '을 작성할까요?'
            : (message.academicTotalParts
                ? '분할 답변 ' + message.academicPart + '/' + message.academicTotalParts + '이 출력 제한으로 중단되었습니다. 이 파트의 새 내용만 이어서 작성할까요?'
                : '답변이 끝나기 전에 내용이 끊긴 것 같습니다. 이어서 할까요?');
          continuation.appendChild(continuationText);
          var continueButton = document.createElement('button');
          continueButton.type = 'button';
          continueButton.textContent = hasNextAcademicPart ? '다음 답변 작성' : '이어서 작성';
          continueButton.disabled = state.running;
          continueButton.addEventListener('click', function () { continueAssistantAnswer(messageIndex); });
          continuation.appendChild(continueButton);
          var dismissContinuation = document.createElement('button');
          dismissContinuation.type = 'button';
          dismissContinuation.className = 'secondary';
          dismissContinuation.textContent = '여기서 마침';
          dismissContinuation.disabled = state.running;
          dismissContinuation.addEventListener('click', function () {
            message.continuationAvailable = false;
            saveHistory();
            renderMessages();
          });
          continuation.appendChild(dismissContinuation);
          item.appendChild(continuation);
        }
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
            save.disabled = state.running || !!image._documentInsertBusy;
            save.addEventListener('click', function () { saveGeneratedImage(image, imageIndex); });
            var insertImage = document.createElement('button');
            insertImage.type = 'button';
            insertImage.textContent = '문서삽입';
            insertImage.title = '내부 이미지 DB에 저장한 뒤 현재 문서에 삽입';
            insertImage.disabled = state.running || !!image._documentInsertBusy;
            insertImage.addEventListener('click', function () { insertGeneratedImageIntoDocument(image, imageIndex, false); });
            var uploadInsertImage = document.createElement('button');
            uploadInsertImage.type = 'button';
            uploadInsertImage.textContent = image.imgbbUrl ? '업로드 주소로 문서삽입' : '업로드 문서삽입';
            uploadInsertImage.title = image.imgbbUrl
              ? '저장된 imgBB 직접 주소를 재사용해 현재 문서에 삽입'
              : 'imgBB에 업로드하고 직접 주소로 현재 문서에 삽입';
            uploadInsertImage.disabled = state.running || !!image._documentInsertBusy;
            uploadInsertImage.addEventListener('click', function () { insertGeneratedImageIntoDocument(image, imageIndex, true); });
            var imageActions = document.createElement('div');
            imageActions.className = 'ai-chat-generated-image-actions';
            figure.appendChild(generated);
            imageActions.appendChild(save);
            imageActions.appendChild(insertImage);
            imageActions.appendChild(uploadInsertImage);
            figure.appendChild(imageActions);
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
        + '<div class="ai-chat-thinking-metrics">'
        + '  <span id="ai-chat-thinking-context">컨텍스트 확인 중</span>'
        + '  <span id="ai-chat-thinking-reasoning-tokens">추론 ≈0 tok</span>'
        + '  <span id="ai-chat-thinking-answer-tokens">응답 ≈0 tok</span>'
        + '  <span id="ai-chat-thinking-output">전체 ≈0 tok</span>'
        + '  <span id="ai-chat-thinking-speed">첫 토큰 대기</span>'
        + '</div>'
        + '<section id="ai-chat-live-reasoning" class="ai-chat-live-stream reasoning" hidden>'
        + '  <strong>실시간 추론</strong>'
        + '  <div id="ai-chat-live-reasoning-content" aria-live="polite"></div>'
        + '</section>'
        + '<section id="ai-chat-live-answer" class="ai-chat-live-stream answer">'
        + '  <strong>실시간 답변</strong>'
        + '  <div id="ai-chat-live-answer-content" aria-live="polite"></div>'
        + '</section>'
        + '<small>LM Studio 이벤트와 출력 토큰 사용량을 실시간으로 측정합니다.</small>';
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
      var reasoning = state.showReasoning && message.reasoning ? '\n\n[모델의 생각/추론]\n' + message.reasoning : '';
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
      '- 추론 내용 표시: ' + (state.showReasoning ? '함' : '안 함'),
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
      if (state.showReasoning && message.reasoning) lines.push('### 모델의 생각/추론', '', String(message.reasoning).trim(), '');
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
      provider: state.provider, responseMode: state.responseMode, showReasoning: state.showReasoning,
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

  function estimateAcademicTextTokens(value) {
    var text = String(value || '');
    var ascii = 0;
    var nonAscii = 0;
    for (var i = 0; i < text.length; i++) {
      if (text.charCodeAt(i) < 128) ascii += 1;
      else nonAscii += 1;
    }
    return Math.ceil(ascii / 4 + nonAscii / 1.5 + 24);
  }

  function academicEvidenceProfile(results) {
    var items = Array.isArray(results) ? results : [];
    var fullEvidence = root.AIChatAcademicSearch.formatEvidence(items);
    var abstractCount = 0;
    var abstractChars = 0;
    items.forEach(function (item) {
      var abstract = String(item && item.abstract || '').trim();
      if (!abstract) return;
      abstractCount += 1;
      abstractChars += abstract.length;
    });
    return {
      count: items.length,
      abstractCount: abstractCount,
      abstractChars: abstractChars,
      fullEvidence: fullEvidence,
      fullEvidenceTokens: estimateAcademicTextTokens(fullEvidence)
    };
  }

  function academicEvidencePlan(results) {
    var profile = academicEvidenceProfile(results);
    if (state.provider !== 'lmstudio') {
      return { profile: profile, split: false, evidence: profile.fullEvidence, compact: false };
    }
    var contextLength = Math.max(0, Number(state.lmContextLength) || 0);
    var smallEvidence = profile.count <= 10 || (profile.abstractCount <= 10 && profile.abstractChars <= 16000);
    var requiredTokens = profile.fullEvidenceTokens + 3600;
    var split = !smallEvidence && (contextLength
      ? requiredTokens > Math.floor(contextLength * 0.9)
      : profile.fullEvidenceTokens > 8000);
    var mustCompact = contextLength
      ? requiredTokens > Math.floor(contextLength * 0.9)
      : profile.fullEvidenceTokens > 8000;
    if (!mustCompact) {
      return { profile: profile, split: split, evidence: profile.fullEvidence, compact: false };
    }
    var answerReserve = split ? 2500 : 3000;
    var contextCharBudget = contextLength
      ? Math.floor(Math.max(1400, contextLength - answerReserve) * 2.6)
      : 6500;
    var maxChars = Math.max(5000, contextCharBudget, profile.count * 215 + 250);
    var evidence = root.AIChatAcademicSearch.formatEvidence(results, {
      maxChars: maxChars,
      compact: true,
      includeAll: true
    });
    return { profile: profile, split: split, evidence: evidence, compact: true, maxChars: maxChars };
  }

  function academicSystemInstruction(evidenceText, partNumber, evidenceProfile) {
    var splitPart = Number(partNumber) || 0;
    var profile = evidenceProfile || {};
    var writingTask = splitPart ? academicPartTask(splitPart) : [
      '근거량에 맞춰 검색 범위와 한계, 핵심 주장, 같은 방향의 연구 비교, 다른·반대·조건부 결과, 종합 해석을 자연스럽게 완결한다.',
      '근거가 적으면 불필요하게 분량을 늘리거나 인위적으로 여러 파트로 나누지 말고 간결하게 작성한다.',
      '근거가 많으면 중요한 주장과 연구 간 관계를 충분히 설명하되 논문 목록을 그대로 반복하지 않는다.'
    ].join('\n');
    return [
      '역할: 아래 검증 학술검색 논문을 주장 중심으로 요약하는 연구자이다.',
      '문체: 한국어 학술적 평서체(-이다/-한다/-로 나타났다/-를 시사한다)만 사용한다.',
      '요약: 논문별 나열이 아니라 핵심 주장마다 근거, 연구 간 비교·조건, 제한적인 해석이나 함의를 연결한다. 관련성을 인과로 확대하지 않는다.',
      '근거: 아래 레코드의 인용(C), 제목(T), 공개 초록(X) 또는 같은 의미의 전체 필드만 사용한다. X가 없으면 결과 근거로 쓰지 않는다. 없는 사실·인용은 만들지 않는다.',
      '전체성: 제공된 ' + (Number(profile.count) || '전체') + '건의 레코드를 처음부터 끝까지 모두 검토한다. 상위 일부 레코드만 보고 결론을 내리지 않는다. 답변에서 모든 논문을 나열할 필요는 없지만 관련 연구를 빠뜨리지 않고 주제별 종합에 반영한다.',
      '인용 형식: 연구 결과를 서술하는 모든 주장·요약 문장에 해당 레코드의 C를 사용하여 실제 연구자와 연도를 표시한다. 한 연구는 (연구자, 연도), 여러 연구는 (연구자, 연도; 연구자, 연도) 형식으로 문장 안이나 문장 끝에 쓴다.',
      '인용 금지: S1, S2, [S1], SOURCE 1, 자료 1 같은 번호형 인용은 절대 출력하지 않는다. C가 인용 불가이면 그 레코드를 결과 주장의 근거로 사용하지 않는다. 없는 저자·연도·인용은 만들지 않는다.',
      '저자: 괄호 인용의 & 양쪽에는 공백을 둔다.',
      splitPart ? '현재 분할 범위:' : '작성 원칙:',
      writingTask,
      splitPart ? '이전·다음 파트의 내용을 반복하거나 미리 작성하지 않는다.' : '',
      '출력: 첫 토큰부터 사용자에게 보여 줄 한국어 학술 요약 본문만 작성한다. 분석 목표, 검색 레코드 검토 과정, 적합성 판정 목록, 작성 전략, 초안 계획, 자기 수정, 체크리스트, 지시 설명은 절대 출력하지 않는다.',
      '',
      '검증 검색 레코드:',
      evidenceText
    ].filter(Boolean).join('\n');
  }

  function academicContinuationInstruction(evidenceText, partNumber, evidenceProfile) {
    var splitPart = Number(partNumber) || 0;
    var recordCount = Number(evidenceProfile && evidenceProfile.count) || '전체';
    if (splitPart) {
      return [
        '검증 논문 요약의 미완료 파트만 이어 쓴다.',
        '한국어 학술체(-이다/-한다)로 근거와 제한적인 해석을 연결한다.',
        '아래 C/T/X 레코드 ' + recordCount + '건을 모두 검토하며 X 밖의 결과, 없는 저자·연도·인용을 만들지 않는다.',
        '연구 결과를 담은 모든 새 주장·요약 문장에는 C의 실제 (연구자, 연도) 인용을 붙인다. S1, S2, SOURCE 번호는 절대 쓰지 않는다.',
        '완료된 문장과 파트는 반복하지 않고 사용자 지시에 지정된 현재 파트만 작성한다.',
        '첫 토큰부터 새 한국어 본문만 작성한다. 분석 목표, 레코드 검토, 추론, 계획, 체크리스트, 자기 수정, 지시 설명은 출력하지 않는다.',
        '',
        '검증 검색 레코드:',
        evidenceText
      ].join('\n');
    }
    return [
      '검증 논문 요약에서 아직 작성하지 않은 내용만 한국어 학술체(-이다/-한다)로 이어 쓴다.',
      '아래 검색 근거 ' + recordCount + '건을 모두 검토하고 완료된 문장·체크리스트·질문을 반복하지 않는다.',
      '없는 저자·연도·인용을 만들지 않으며 추론이나 계획을 출력하지 않는다.',
      '연구 결과를 담은 모든 새 주장·요약 문장에는 C의 실제 (연구자, 연도) 인용을 붙인다. S1, S2, SOURCE 번호는 절대 쓰지 않는다.',
      '첫 토큰부터 새 한국어 본문만 작성하며 분석 목표, 레코드 검토, 작성 전략, 자기 수정은 출력하지 않는다.',
      '',
      '검증 검색 레코드:',
      evidenceText
    ].join('\n');
  }

  async function translateAcademicSearchQuery(query) {
    var result = await getBridge().complete({
      provider: state.provider,
      model: state.provider === 'aistudio' ? state.geminiModel : null,
      mode: 'quick',
      academicSearch: false,
      messages: [{ role: 'user', content: String(query || '') }],
      systemInstruction: [
        'Convert the Korean research topic into concise English scholarly database search keywords.',
        'Preserve the core constructs and named services or products.',
        'Return only one line containing 3 to 8 English keywords or a short noun phrase.',
        'Do not answer the topic, explain, number, quote, or add labels.'
      ].join(' ')
    });
    var text = result && result.text != null ? String(result.text) : '';
    var parsed = parseAssistantSections(text);
    var value = String(parsed.answer || text)
      .replace(/<think>[\s\S]*?<\/think>/gi, ' ')
      .replace(/\[\/?(?:CHECKLIST|ANSWER)\]/gi, ' ')
      .replace(/^(?:english|keywords?|search\s*(?:query|terms?))\s*:\s*/i, '')
      .replace(/[`"“”]/g, ' ')
      .split(/\r?\n/)[0]
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 300);
    if (!/[A-Za-z]/.test(value)) throw new Error('AI가 유효한 영문 검색어를 반환하지 않았습니다.');
    return value;
  }

  function isAcademicResummaryRequest(value) {
    var text = String(value || '').trim().replace(/[.!?。！？]+$/g, '').replace(/\s+/g, ' ');
    if (!text || text.length > 70) return false;
    return /^(?:(?:위|앞서|기존|검색된|찾은)\s*(?:논문|자료|검색\s*결과)(?:을|를)?\s*)?(?:다시\s*)?(?:학술적으로\s*)?(?:요약|정리|종합)(?:해\s*줘|해주세요|해\s*주세요|해라|하라|해|하여\s*줘|하여\s*주세요)?$/i.test(text);
  }

  function findReusableAcademicSearch() {
    for (var i = state.messages.length - 2; i >= 0; i--) {
      var message = state.messages[i];
      if (message && message.role === 'user' && Array.isArray(message.academicSources) && message.academicSources.length) return message;
    }
    return null;
  }

  function academicModelInput(userText, academicQuery, splitPart, reusedSources, evidenceProfile) {
    var query = String(academicQuery || userText || '').trim();
    var profile = evidenceProfile || {};
    return [
      '연구 주제: ' + query,
      '작업: 시스템에 제공된 검증 학술검색 논문만 사용하여 주장 중심의 학술 요약을 작성하라.',
      '검토 대상: 검색 레코드 ' + (Number(profile.count) || 0) + '건, 공개 초록 ' + (Number(profile.abstractCount) || 0) + '건. 제공된 레코드를 끝까지 모두 검토하라.',
      splitPart ? '자료량이 컨텍스트 예산을 초과하여 자동 분할되었다. 현재는 분할 답변 1/3만 작성하라.' : '자료량이 한 번의 답변 범위이므로 분할하지 말고 완결된 학술 요약을 작성하라.',
      reusedSources ? '직전 검색 논문을 재사용하여 새 문장으로 다시 요약하되 근거 밖의 내용을 추가하지 마라.' : ''
    ].filter(Boolean).join('\n');
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
      var splitAcademicResponse = false;
      var academicEvidence = '';
      var academicProfile = null;
      if (academicSearchActive) {
        if (!root.AIChatAcademicSearch || typeof root.AIChatAcademicSearch.search !== 'function') {
          throw new Error('공개 학술검색 모듈이 준비되지 않았습니다. 앱을 새로고침하세요.');
        }
        var resummaryRequested = isAcademicResummaryRequest(text);
        var reusableAcademic = resummaryRequested ? findReusableAcademicSearch() : null;
        if (resummaryRequested && !reusableAcademic) {
          throw new Error('다시 요약할 이전 학술검색 논문이 없습니다. 먼저 구체적인 연구 주제로 학술검색을 실행하세요.');
        }
        var academicSearch;
        if (reusableAcademic) {
          academicSearch = {
            results: reusableAcademic.academicSources.slice(),
            warnings: Array.isArray(reusableAcademic.academicWarnings) ? reusableAcademic.academicWarnings.slice() : [],
            abstractCount: reusableAcademic.academicSources.filter(function (item) { return !!String(item && item.abstract || '').trim(); }).length
          };
          pendingUser.academicQuery = String(reusableAcademic.academicQuery || reusableAcademic.content || '').trim();
          setStatus('직전 학술검색 논문 ' + academicSearch.results.length + '건을 재사용하여 다시 요약하는 중...', 'loading');
        } else {
          academicAbortController = new AbortController();
          academicSearch = await root.AIChatAcademicSearch.search(text, state.academicSearchCount, {
            signal: academicAbortController.signal,
            onProgress: function (progress) { setStatus(progress, 'loading'); },
            translateQuery: translateAcademicSearchQuery
          });
          academicAbortController = null;
          pendingUser.academicQuery = text;
        }
        pendingUser.academicSources = academicSearch.results;
        pendingUser.academicWarnings = academicSearch.warnings || [];
        var evidencePlan = academicEvidencePlan(academicSearch.results);
        academicProfile = evidencePlan.profile;
        splitAcademicResponse = evidencePlan.split;
        academicEvidence = evidencePlan.evidence;
        pendingUser.academicEvidenceProfile = {
          count: academicProfile.count,
          abstractCount: academicProfile.abstractCount,
          abstractChars: academicProfile.abstractChars,
          estimatedTokens: academicProfile.fullEvidenceTokens,
          compact: !!evidencePlan.compact,
          split: splitAcademicResponse
        };
        saveHistory();
        renderMessages();
        var academicAbstractCount = Number.isFinite(Number(academicSearch.abstractCount))
          ? Number(academicSearch.abstractCount)
          : academicSearch.results.filter(function (item) { return !!String(item && item.abstract || '').trim(); }).length;
        setStatus(
          (reusableAcademic ? '기존 검색 근거 재사용' : '검색 근거 수집 완료')
          + ' · ' + academicSearch.results.length + '건 · 공개 초록 ' + academicAbstractCount + '건'
          + (splitAcademicResponse ? ' · 근거량 초과로 자동 분할' : ' · 한 번에 완결 요약')
          + ' · AI 요약 중...',
          'loading'
        );
      }
      var result = await getBridge().complete({
        provider: state.provider,
        model: state.provider === 'aistudio' ? state.geminiModel : null,
        mode: academicSearchActive ? 'quick' : state.responseMode,
        academicSearch: academicSearchActive,
        splitAcademicResponse: splitAcademicResponse,
        academicEvidenceCount: academicProfile ? academicProfile.count : 0,
        academicEvidenceTokens: academicProfile ? academicProfile.fullEvidenceTokens : 0,
        retainForContinuation: true,
        messages: academicSearchActive
          ? [{ role: 'user', content: academicModelInput(text, pendingUser.academicQuery, splitAcademicResponse ? 1 : 0, !!reusableAcademic, academicProfile) }]
          : contextMessages(),
        onStreamEvent: state.provider === 'lmstudio' ? handleStreamEvent : undefined,
        systemInstruction: academicSearchActive
          ? academicSystemInstruction(academicEvidence, splitAcademicResponse ? 1 : 0, academicProfile)
          : [
              'You are a capable conversational assistant. Answer in Korean unless the user requests another language.',
              'This is a continuous multi-turn conversation. Use the previous conversation as context for every new message.',
              'Resolve follow-up references such as "위 질문", "그것", "그중", "두 번째", "더 자세히", and "계속" from the previous user and assistant messages instead of asking the user to repeat them.',
              'When the latest request changes or corrects an earlier request, follow the latest request while preserving still-relevant context.',
              'Follow the requested format, tone, and length precisely. Give a complete, accurate, polished final answer with all requested code or details.',
              'Return only the answer intended for the user; never expose internal reasoning, planning, checklists, or meta-commentary.'
            ].join(' ')
      });
      var answer = result && result.text != null ? String(result.text) : '';
      var responseStatus = extractModelStatus(answer);
      var reasoningStatus = extractModelStatus(result && result.reasoning ? String(result.reasoning) : '');
      if (reasoningStatus.notice && !responseStatus.notice) responseStatus.notice = reasoningStatus.notice;
      var reasoningText = reasoningStatus.answer;
      if (!responseStatus.answer && !responseStatus.notice && !reasoningText) throw new Error('AI 응답이 비어 있습니다.');
      var sections = responseStatus.answer
        ? parseAssistantSections(responseStatus.answer)
        : { answer: '', checklist: '', remaining: '' };
      if (academicSearchActive) {
        var visibleAcademicAnswer = extractVisibleAnswerBody(sections.answer, true);
        sections.answer = normalizeAcademicAnswer(visibleAcademicAnswer.body, pendingUser.academicSources);
        if (visibleAcademicAnswer.notice && !responseStatus.notice) responseStatus.notice = visibleAcademicAnswer.notice;
        if (!sections.answer && reasoningText && !responseStatus.notice) responseStatus.notice = academicReasoningOnlyNotice();
        sections.checklist = splitAcademicResponse ? '' : (sections.answer ? buildAcademicChecklist(sections.answer) : '');
        reasoningText = '';
      }
      if (sections.checklist) sections.checklist = extractModelStatus(sections.checklist).answer;
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
      var assistantMessage = {
        role: 'assistant',
        content: sections.answer,
        checklist: sections.checklist,
        reasoning: state.showReasoning ? reasoningText : '',
        notice: responseStatus.notice,
        images: result && Array.isArray(result.images) ? result.images : [],
        createdAt: Date.now(),
        provider: result.provider,
        model: result.model,
        usage: result.usage || null,
        contextLength: result.contextLength || null,
        maxOutputTokens: result.maxOutputTokens || null,
        responseId: result.responseId || null,
        academicPart: splitAcademicResponse ? 1 : null,
        academicTotalParts: splitAcademicResponse ? 3 : null,
        academicPartComplete: splitAcademicResponse
          ? !!sections.answer && !responseStatus.notice && answerEndsCleanly(sections.answer) && academicPartChecklistComplete(sections.answer, 1)
          : null
      };
      assistantMessage.continuationAvailable = splitAcademicResponse
        ? true
        : shouldOfferContinuation(assistantMessage, result, academicSearchActive);
      state.messages.push(assistantMessage);
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
    state.showReasoning = storageGet(SHOW_REASONING_KEY, '0') === '1';
    state.academicSearchEnabled = storageGet(ACADEMIC_SEARCH_KEY, '0') === '1';
    state.academicSearchCount = normalizeAcademicCount(storageGet(ACADEMIC_COUNT_KEY, '10'));
    state.geminiModel = storageGet(GEMINI_MODEL_KEY, DEFAULT_GEMINI_MODELS[0]);
    state.layout = storageGet(LAYOUT_KEY, 'popup');
    if (state.layout !== 'dock' && state.layout !== 'fullscreen') state.layout = 'popup';
    state.enabled = storageGet(ENABLED_KEY, '0') === '1';
    updateProviderUI();
    setProviderControlsOpen(state.providerControlsOpen);
    setResponseMode(state.responseMode);
    setShowReasoning(state.showReasoning);
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
