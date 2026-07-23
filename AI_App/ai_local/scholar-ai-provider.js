/*
 * ScholarAIProvider - AI Studio / LM Studio text provider adapter.
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
  var DEFAULT_PROVIDER = 'auto';
  var DEFAULT_AISTUDIO_MODEL = 'gemini-2.5-pro';

  function storageOrDefault(storage) {
    var target = storage || (root && root.localStorage);
    if (!target || typeof target.getItem !== 'function' || typeof target.setItem !== 'function') {
      throw new Error('ScholarAI 설정 저장소를 사용할 수 없습니다.');
    }
    return target;
  }

  function normalizeProvider(value) {
    var provider = String(value || '').toLowerCase();
    if (provider === 'lmstudio' || provider === 'aistudio' || provider === 'auto') return provider;
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
    return error instanceof Error ? error : new Error(message);
  }

  function create(options) {
    options = options || {};
    var storage = storageOrDefault(options.storage);
    var callAIStudio = options.callAIStudio;
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
      return storage.getItem(AISTUDIO_MODEL_KEY) || DEFAULT_AISTUDIO_MODEL;
    }

    function setModel(model, provider) {
      var selectedProvider = normalizeProvider(provider || getProvider());
      if (selectedProvider === 'auto') selectedProvider = 'lmstudio';
      var value = String(model || '').trim();
      if (selectedProvider === 'lmstudio') {
        saveLMStudioConfig({ model: value });
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

    async function syncLMStudioLoadedModel(configPatch) {
      var loaded = await listLMStudioLoadedModels(configPatch);
      if (!loaded.length) {
        throw new Error('LM Studio에 현재 로드된 LLM이 없습니다. LM Studio의 Local Server에서 모델을 먼저 Load 하세요.');
      }
      var model = String(loaded[0].id || '').trim();
      if (!model) throw new Error('LM Studio에서 로드된 모델 ID를 확인할 수 없습니다.');
      saveLMStudioConfig({ model: model });
      return { model: model, models: loaded };
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

        if (provider === 'lmstudio') return await runLMStudio();
        if (provider === 'aistudio') return await runAIStudio(request.model);

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
        if (lmError) throw lmError;
        throw new Error('LM Studio 또는 AI Studio 설정이 필요합니다.');
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
      isLMStudioConfigured: isLMStudioConfigured,
      isAIStudioConfigured: isAIStudioConfigured,
      getLMStudioConfig: getLMStudioConfig,
      saveLMStudioConfig: saveLMStudioConfig,
      listLMStudioModels: listLMStudioModels,
      listLMStudioLoadedModels: listLMStudioLoadedModels,
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
    defaultProvider: DEFAULT_PROVIDER,
    defaultAIStudioModel: DEFAULT_AISTUDIO_MODEL,
    normalizeProvider: normalizeProvider,
    create: create
  });
});
