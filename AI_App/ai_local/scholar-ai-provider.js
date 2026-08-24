/*
 * ScholarAIProvider - AI Studio / LM Studio / Ollama / DeepSeek / OpenAI text provider adapter.
 * Requires AI_App/ai_local/local-ai.js when LM Studio is used.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ScholarAIProvider = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var PROVIDER_KEY = 'ss_scholar_ai_provider';
  var AISTUDIO_MODEL_KEY = 'ss_scholar_ai_model';
  var DEEPSEEK_MODEL_KEY = 'ss_scholar_ai_deepseek_model';
  var OPENAI_MODEL_KEY = 'ss_scholar_ai_openai_model';
  var OLLAMA_MODEL_KEY = 'ss_scholar_ai_ollama_model';
  var DEFAULT_PROVIDER = 'auto';
  var DEFAULT_AISTUDIO_MODEL = 'gemini-2.5-pro';
  var DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-flash';
  var DEFAULT_OPENAI_MODEL = 'gpt-5.6-sol';

  function storageOrDefault(storage) {
    var target = storage || (root && root.localStorage);
    if (!target || typeof target.getItem !== 'function' || typeof target.setItem !== 'function') {
      throw new Error('ScholarAI 설정 저장소를 사용할 수 없습니다.');
    }
    return target;
  }

  function normalizeProvider(value) {
    var provider = String(value || '').toLowerCase();
    if (provider === 'lmstudio' || provider === 'aistudio' || provider === 'ollama' || provider === 'deepseek' || provider === 'openai' || provider === 'auto') return provider;
    return DEFAULT_PROVIDER;
  }

  function requireLocalAI() {
    var localAI = root && root.LocalAI;
    if (!localAI || typeof localAI.createClient !== 'function') {
      throw new Error('LocalAI가 로드되지 않았습니다. AI_App/ai_local/local-ai.js를 먼저 불러오세요.');
    }
    return localAI;
  }

  function isAbortError(error) {
    var message = error && error.message ? String(error.message) : String(error || '');
    return !!(error && error.name === 'AbortError') || /aborted|aborterror/i.test(message);
  }

  function friendlyError(error, provider) {
    if (isAbortError(error)) return error;
    var message = error && error.message ? String(error.message) : String(error || '알 수 없는 오류');
    if (provider === 'lmstudio') {
      if (/failed to fetch|networkerror|load failed|network request failed/i.test(message)) {
        return new Error('LM Studio에 연결할 수 없습니다. Local Server 실행, Base URL/포트 및 CORS 설정을 확인하세요.');
      }
      if (/401|403|unauthorized|forbidden/i.test(message)) {
        return new Error('LM Studio 인증에 실패했습니다. API Key 설정을 확인하세요.');
      }
      if (/404|model.*not found|unknown model|invalid model/i.test(message)) {
        return new Error('선택한 LM Studio 모델을 사용할 수 없습니다. 모델을 로드한 뒤 목록을 새로고침하세요.');
      }
    }
    if (provider === 'deepseek') {
      if (/402|insufficient balance|잔액.*부족/i.test(message)) {
        return new Error('DeepSeek API는 연결되었지만 잔액이 부족합니다. DeepSeek 잔액을 충전한 뒤 다시 시도하세요.');
      }
      if (/401|authentication|unauthorized/i.test(message)) {
        return new Error('DeepSeek 인증에 실패했습니다. 설정에 저장한 API 키를 확인하세요.');
      }
      if (/429|rate limit/i.test(message)) {
        return new Error('DeepSeek 요청 한도를 초과했습니다. 잠시 후 다시 시도하세요.');
      }
    }
    if (provider === 'openai') {
      if (/401|authentication|unauthorized|invalid.*api.*key/i.test(message)) {
        return new Error('OpenAI 인증에 실패했습니다. 설정에 저장한 API 키를 확인하세요.');
      }
      if (/429.*(?:quota|billing)|insufficient_quota|사용 한도|결제 잔액/i.test(message)) {
        return new Error('OpenAI API 사용 한도 또는 결제 잔액이 부족합니다. Platform의 API 결제 설정을 확인하세요.');
      }
      if (/429|rate limit/i.test(message)) {
        return new Error('OpenAI 요청 한도를 초과했습니다. 잠시 후 다시 시도하세요.');
      }
    }
    return error instanceof Error ? error : new Error(message);
  }

  function create(options) {
    options = options || {};
    var storage = storageOrDefault(options.storage);
    var callAIStudio = options.callAIStudio;
    var callDeepseek = options.callDeepseek;
    var callOpenAI = options.callOpenAI;
    var callOllama = options.callOllama;
    var activeController = null;

    function getProvider() {
      return normalizeProvider(storage.getItem(PROVIDER_KEY));
    }

    function setProvider(provider) {
      var next = normalizeProvider(provider);
      storage.setItem(PROVIDER_KEY, next);
      return next;
    }

    function getLMStudioConfig() {
      return requireLocalAI().loadConfig(storage);
    }

    function saveLMStudioConfig(patch) {
      var localAI = requireLocalAI();
      var current = localAI.loadConfig(storage);
      return localAI.saveConfig(Object.assign({}, current, patch || {}), storage);
    }

    function getModel(provider) {
      var selectedProvider = normalizeProvider(provider || getProvider());
      if (selectedProvider === 'auto') selectedProvider = isLMStudioConfigured() ? 'lmstudio' : 'aistudio';
      if (selectedProvider === 'lmstudio') return getLMStudioConfig().model || '';
      if (selectedProvider === 'aistudio') return storage.getItem(AISTUDIO_MODEL_KEY) || DEFAULT_AISTUDIO_MODEL;
      if (selectedProvider === 'ollama') return storage.getItem(OLLAMA_MODEL_KEY) || '';
      if (selectedProvider === 'deepseek') return storage.getItem(DEEPSEEK_MODEL_KEY) || DEFAULT_DEEPSEEK_MODEL;
      if (selectedProvider === 'openai') return storage.getItem(OPENAI_MODEL_KEY) || DEFAULT_OPENAI_MODEL;
      return storage.getItem(AISTUDIO_MODEL_KEY) || DEFAULT_AISTUDIO_MODEL;
    }

    function setModel(model, provider) {
      var selectedProvider = normalizeProvider(provider || getProvider());
      if (selectedProvider === 'auto') selectedProvider = 'lmstudio';
      var value = String(model || '').trim();
      if (selectedProvider === 'lmstudio') {
        saveLMStudioConfig({ model: value });
      } else if (selectedProvider === 'aistudio') {
        storage.setItem(AISTUDIO_MODEL_KEY, value || DEFAULT_AISTUDIO_MODEL);
      } else if (selectedProvider === 'ollama') {
        storage.setItem(OLLAMA_MODEL_KEY, value);
      } else if (selectedProvider === 'deepseek') {
        storage.setItem(DEEPSEEK_MODEL_KEY, value || DEFAULT_DEEPSEEK_MODEL);
      } else if (selectedProvider === 'openai') {
        storage.setItem(OPENAI_MODEL_KEY, value || DEFAULT_OPENAI_MODEL);
      } else {
        storage.setItem(AISTUDIO_MODEL_KEY, value || DEFAULT_AISTUDIO_MODEL);
      }
      return value;
    }

    function makeLMStudioClient(configPatch) {
      var localAI = requireLocalAI();
      return localAI.createClient(Object.assign({}, getLMStudioConfig(), configPatch || {}));
    }

    function isLMStudioConfigured() {
      var localAI = requireLocalAI();
      var raw = storage.getItem(localAI.storageKey);
      if (!raw) return false;
      try {
        var parsed = JSON.parse(raw);
        return !!(parsed && String(parsed.baseUrl || '').trim());
      } catch (e) {
        return false;
      }
    }

  function isAIStudioConfigured() {
    return !!String(storage.getItem('ss_gemini_api_key') || '').trim();
  }

  function isDeepSeekConfigured() {
    return !!String(storage.getItem('ss_deepseek_api_key') || '').trim();
  }

  function isOpenAIConfigured() {
    return !!String(storage.getItem('ss_openai_api_key') || '').trim();
  }

  function isOllamaConfigured() {
    return !!String(storage.getItem('ss_ollama_base_url') || 'http://127.0.0.1:11434').trim();
  }

    async function listLMStudioModels(configPatch) {
      try {
        return await makeLMStudioClient(configPatch).listModels({ timeoutMs: 10000 });
      } catch (error) {
        throw friendlyError(error, 'lmstudio');
      }
    }

    async function listLMStudioLoadedModels(configPatch) {
      try {
        return await makeLMStudioClient(configPatch).listLoadedModels({ timeoutMs: 10000 });
      } catch (error) {
        throw friendlyError(error, 'lmstudio');
      }
    }

    async function loadLMStudioModel(model, configPatch) {
      try {
        var result = await makeLMStudioClient(configPatch).loadModel(model, { timeoutMs: 120000 });
        var loaded = await listLMStudioLoadedModels(configPatch);
        var selected = loaded.find(function (item) {
          return item && (item.key === model || item.id === model || item.id === result.instance_id);
        });
        var modelId = String(selected && selected.id || result.instance_id || model || '').trim();
        saveLMStudioConfig({ model: modelId });
        return { model: modelId, models: loaded, loadResult: result };
      } catch (error) {
        throw friendlyError(error, 'lmstudio');
      }
    }

    async function syncLMStudioLoadedModel(configPatch) {
      var loaded = await listLMStudioLoadedModels(configPatch);
      if (!loaded.length) {
        throw new Error('LM Studio에 현재 로드된 LLM이 없습니다. LM Studio의 Local Server에서 모델을 먼저 Load 하세요.');
      }
      var configured = String(getLMStudioConfig().model || '').trim();
      var preferred = loaded.find(function (item) {
        return item && (item.id === configured || item.key === configured);
      }) || loaded[0];
      var model = String(preferred.id || '').trim();
      if (!model) throw new Error('LM Studio에서 로드된 모델 ID를 확인할 수 없습니다.');
      saveLMStudioConfig({ model: model });
      return { model: model, models: loaded };
    }

    async function callDeepSeekAPI(endpoint, options) {
      var key = String(storage.getItem('ss_deepseek_api_key') || '').trim();
      var urlBase = String(storage.getItem('ss_deepseek_base_url') || 'https://api.deepseek.com').replace(/\/+$/, '');
      var url = urlBase + endpoint;
      var headers = Object.assign({}, options && options.headers ? options.headers : {});
      if (key) headers.Authorization = 'Bearer ' + key;
      if (!headers.Accept) headers.Accept = 'application/json';
      var response = await fetch(url, Object.assign({}, options || {}, { headers: headers }));
      if (!response || !response.ok) {
        let message = 'DeepSeek API Error: ' + (response ? response.status : 'network');
        try {
          var errorPayload = await response.json();
          if (errorPayload && errorPayload.error && errorPayload.error.message) message = errorPayload.error.message;
        } catch (_) {}
        throw new Error(message);
      }
      return response;
    }

    async function listDeepSeekModels() {
      var response = await callDeepSeekAPI('/models', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      var data = await response.json().catch(function () { return {}; });
      var models = (Array.isArray(data && data.data) ? data.data : []).concat(Array.isArray(data && data.models) ? data.models : []);
      return models.map(function (item) {
        return String(item && (item.id || item.model || item.name || '')).trim();
      }).filter(Boolean);
    }

    async function testLMStudio(configPatch) {
      var startedAt = Date.now();
      try {
        var synced = await syncLMStudioLoadedModel(configPatch);
        return { ok: true, model: synced.model, models: synced.models, latencyMs: Date.now() - startedAt };
      } catch (error) {
        return { ok: false, models: [], latencyMs: Date.now() - startedAt, error: error.message };
      }
    }

    async function complete(request) {
      request = request || {};
      var provider = normalizeProvider(request.provider || getProvider());
      if (activeController) activeController.abort();
      var controller = new AbortController();
      activeController = controller;
      try {
        async function runLMStudio() {
          var synced = await syncLMStudioLoadedModel();
          var model = synced.model;
          var localResult = await makeLMStudioClient({ model: model }).complete({
            prompt: request.prompt,
            systemInstruction: request.systemInstruction,
            model: model,
            signal: controller.signal
          });
          return { provider: 'lmstudio', model: localResult.model || model, text: localResult.text || '' };
        }

        async function runAIStudio(modelOverride) {
          var model = String(modelOverride || getModel('aistudio') || DEFAULT_AISTUDIO_MODEL).trim();
          if (typeof callAIStudio !== 'function') throw new Error('AI Studio 호출 함수를 사용할 수 없습니다.');
          var cloudResult = await callAIStudio(
            request.prompt,
            request.systemInstruction,
            !!request.useSearch,
            model,
            controller.signal
          );
          return {
            provider: 'aistudio',
            model: model,
            text: cloudResult && cloudResult.text != null ? cloudResult.text : String(cloudResult || '')
          };
        }

        async function runDeepSeek(modelOverride) {
          var model = String(modelOverride || getModel('deepseek') || DEFAULT_DEEPSEEK_MODEL).trim();
          if (typeof callDeepseek !== 'function') throw new Error('DeepSeek 호출 함수를 사용할 수 없습니다.');
          var key = String(storage.getItem('ss_deepseek_api_key') || '').trim();
          if (!key) throw new Error('DeepSeek API Key가 없습니다. 설정에서 키를 저장하세요.');
          var result = await callDeepseek(request.prompt, request.systemInstruction, request.useSearch, model, controller.signal, key);
          return {
            provider: 'deepseek',
            model: model,
            text: result && result.text != null ? result.text : String(result || '')
          };
        }

        async function runOpenAI(modelOverride) {
          var model = String(modelOverride || getModel('openai') || DEFAULT_OPENAI_MODEL).trim();
          if (typeof callOpenAI !== 'function') throw new Error('OpenAI 호출 함수를 사용할 수 없습니다.');
          var key = String(storage.getItem('ss_openai_api_key') || '').trim();
          if (!key) throw new Error('OpenAI API Key가 없습니다. 설정에서 키를 저장하세요.');
          var result = await callOpenAI(request.prompt, request.systemInstruction, request.useSearch, model, controller.signal, key);
          return {
            provider: 'openai',
            model: model,
            text: result && result.text != null ? result.text : String(result || '')
          };
        }

        async function runOllama(modelOverride) {
          var model = String(modelOverride || getModel('ollama') || '').trim();
          if (typeof callOllama !== 'function') throw new Error('Ollama 호출 함수를 사용할 수 없습니다.');
          if (!model) throw new Error('Ollama 모델을 선택하세요. 설정에서 모델 확인을 먼저 실행할 수 있습니다.');
          var result = await callOllama(request.prompt, request.systemInstruction, request.useSearch, model, controller.signal);
          return {
            provider: 'ollama',
            model: (result && result.model) || model,
            text: result && result.text != null ? result.text : String(result || '')
          };
        }

        if (provider === 'lmstudio') return await runLMStudio();
        if (provider === 'aistudio') return await runAIStudio(request.model);
        if (provider === 'ollama') return await runOllama(request.model);
        if (provider === 'deepseek') return await runDeepSeek(request.model);
        if (provider === 'openai') return await runOpenAI(request.model);

        var lmError = null;
        if (isLMStudioConfigured()) {
          try {
            return await runLMStudio();
          } catch (error) {
            if (isAbortError(error)) throw error;
            lmError = friendlyError(error, 'lmstudio');
          }
        }
        if (isAIStudioConfigured()) {
          var fallbackResult = await runAIStudio();
          if (lmError) {
            fallbackResult.fallbackFrom = 'lmstudio';
            fallbackResult.fallbackReason = lmError.message;
          }
          return fallbackResult;
        }
        if (isOllamaConfigured() && getModel('ollama')) {
          return await runOllama();
        }
        if (lmError) throw lmError;
        if (isDeepSeekConfigured()) {
          return await runDeepSeek();
        }
        if (isOpenAIConfigured()) {
          return await runOpenAI();
        }
        throw new Error('LM Studio, AI Studio, Ollama, DeepSeek 또는 OpenAI 설정이 필요합니다.');
      } catch (error) {
        throw friendlyError(error, provider);
      } finally {
        if (activeController === controller) activeController = null;
      }
    }

    function abort() {
      if (activeController) activeController.abort();
    }

    return Object.freeze({
      getProvider: getProvider,
      setProvider: setProvider,
      getModel: getModel,
      setModel: setModel,
      getDeepSeekConfig: function () {
        return {
          baseUrl: String(storage.getItem('ss_deepseek_base_url') || 'https://api.deepseek.com'),
          model: storage.getItem(DEEPSEEK_MODEL_KEY) || getModel('deepseek')
        };
      },
      setDeepSeekConfig: function (patch) {
        if (patch && typeof patch === 'object') {
          if (patch.baseUrl) storage.setItem('ss_deepseek_base_url', String(patch.baseUrl));
          if (patch.model) storage.setItem(DEEPSEEK_MODEL_KEY, String(patch.model));
        }
        return {
          baseUrl: String(storage.getItem('ss_deepseek_base_url') || 'https://api.deepseek.com'),
          model: storage.getItem(DEEPSEEK_MODEL_KEY) || DEFAULT_DEEPSEEK_MODEL
        };
      },
      isLMStudioConfigured: isLMStudioConfigured,
      isAIStudioConfigured: isAIStudioConfigured,
      isOllamaConfigured: isOllamaConfigured,
      isDeepSeekConfigured: isDeepSeekConfigured,
      isOpenAIConfigured: isOpenAIConfigured,
      getLMStudioConfig: getLMStudioConfig,
      saveLMStudioConfig: saveLMStudioConfig,
      listLMStudioModels: listLMStudioModels,
      listLMStudioLoadedModels: listLMStudioLoadedModels,
      loadLMStudioModel: loadLMStudioModel,
      listDeepSeekModels: listDeepSeekModels,
      syncLMStudioLoadedModel: syncLMStudioLoadedModel,
      testLMStudio: testLMStudio,
      complete: complete,
      abort: abort
    });
  }

  return Object.freeze({
    version: '1.0.0',
    providerStorageKey: PROVIDER_KEY,
    aiStudioModelStorageKey: AISTUDIO_MODEL_KEY,
    openAIModelStorageKey: OPENAI_MODEL_KEY,
    defaultProvider: DEFAULT_PROVIDER,
    defaultAIStudioModel: DEFAULT_AISTUDIO_MODEL,
    defaultOpenAIModel: DEFAULT_OPENAI_MODEL,
    normalizeProvider: normalizeProvider,
    create: create
  });
});
