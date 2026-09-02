/*
 * LocalAI - reusable, local-only LM Studio toolkit.
 *
 * Loading this file only creates an object. It does not access the DOM,
 * localStorage, or the network until one of its methods is called.
 *
 * Browser: <script src="AI_App/ai_local/local-ai.js"></script> -> window.LocalAI
 * Node/CommonJS: const LocalAI = require('./AI_App/ai_local/local-ai.js');
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LocalAI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const VERSION = '1.0.0';
  const STORAGE_KEY = 'local_ai_lmstudio_settings_v1';

  const defaults = Object.freeze({
    baseUrl: 'http://127.0.0.1:5678/v1',
    model: 'google/gemma-4-e4b',
    apiKey: '',
    temperature: 0.4,
    maxTokens: 16384,
    quickMaxTokens: 4096,
    reasoningMaxTokens: 8192,
    fastMaxTokens: 4000,
    fastTimeoutMs: 580000,
    fastSafetyTimeout: true,
    fastCompleteStreaming: true,
    reasoningLevel: 'auto',
    timeoutMs: 720000,
    topP: null,
    seed: null,
    frequencyPenalty: null,
    presencePenalty: null
  });

  const settingsSchema = Object.freeze({
    baseUrl: { type: 'url', required: true, description: 'OpenAI-compatible API base URL ending in /v1' },
    model: { type: 'string', required: true, description: 'Model identifier returned by GET /v1/models' },
    apiKey: { type: 'password', required: false, description: 'Optional Bearer token configured in LM Studio' },
    temperature: { type: 'number', min: 0, max: 2, default: defaults.temperature },
    maxTokens: { type: 'integer', min: 1, default: defaults.maxTokens },
    quickMaxTokens: { type: 'integer', min: 1, default: defaults.quickMaxTokens },
    reasoningMaxTokens: { type: 'integer', min: 1, default: defaults.reasoningMaxTokens },
    fastMaxTokens: { type: 'integer', min: 1, default: defaults.fastMaxTokens },
    fastTimeoutMs: { type: 'integer', min: 1000, default: defaults.fastTimeoutMs },
    fastSafetyTimeout: { type: 'boolean', default: defaults.fastSafetyTimeout },
    fastCompleteStreaming: { type: 'boolean', default: defaults.fastCompleteStreaming },
    reasoningLevel: { type: 'string', default: defaults.reasoningLevel },
    timeoutMs: { type: 'integer', min: 1000, default: defaults.timeoutMs },
    topP: { type: 'number', min: 0, max: 1, nullable: true },
    seed: { type: 'integer', nullable: true },
    frequencyPenalty: { type: 'number', min: -2, max: 2, nullable: true },
    presencePenalty: { type: 'number', min: -2, max: 2, nullable: true }
  });

  const endpoints = Object.freeze({
    models: '/models',
    loadedModels: '/api/v1/models',
    loadModel: '/api/v1/models/load',
    nativeChat: '/api/v1/chat',
    chatCompletions: '/chat/completions'
  });

  const mdlive = Object.freeze({
    providerSettingsKey: 'mdpro_ai_provider_settings_v1',
    defaultProviderMode: 'auto',
    providerModes: Object.freeze({
      auto: ['lmstudio', 'aistudio'],
      lmstudio: ['lmstudio'],
      aistudio: ['aistudio'],
      'aistudio-lmstudio': ['aistudio', 'lmstudio']
    }),
    settingsFields: Object.freeze({
      baseUrl: 'lmStudioBaseUrl',
      model: 'lmStudioModel',
      apiKey: 'lmStudioApiKey',
      configured: 'lmStudioConfigured'
    }),
    uiIds: Object.freeze({
      providerMode: 'ai_provider_mode',
      baseUrl: 'ai_lmstudio_base_url',
      model: 'ai_lmstudio_model',
      modelList: 'ai_lmstudio_model_list',
      modelSelect: 'ai_lmstudio_model_select',
      apiKey: 'ai_lmstudio_api_key'
    }),
    independentModelStorageKeys: Object.freeze({
      'dr-model': 'mdpro_dr_tab_model_question',
      'dr-ai-model': 'mdpro_dr_tab_model_ai_search',
      'dr-data-model': 'mdpro_dr_tab_model_data_research',
      'dr-ec-model': 'mdpro_dr_tab_model_editor_cmd'
    }),
    modelSelectIds: Object.freeze([
      'tr-model',
      'tr-model-write',
      'tr-doc-model',
      'dr-model',
      'dr-ai-model',
      'dr-data-model',
      'dr-ec-model',
      'cite-ai-model',
      'vr-transcribe-model',
      'scholar-ai-model-select'
    ]),
    featureStorageKeys: Object.freeze({
      deepResearchPrePrompt: 'mdpro_dr_pre_prompt',
      deepResearchEditorHistory: 'mdpro_dr_ec_history',
      deepResearchHistoryDatabase: 'mdlive-dr-history',
      translatorHistory: 'mdpro_tr_history',
      scholarSystemInstruction: 'mdpro_sidebar_scholar_system_instruction',
      scholarModel: 'mdpro_sidebar_scholar_model_id'
    }),
    sourceModules: Object.freeze({
      provider: 'js/core/ai-provider.js',
      deepResearch: 'js/ai/deep-research.js',
      translator: 'js/ai/translator.js',
      citationSearch: 'js/cite/cite-ai-search.js',
      liveAI: 'js/ui/live-ai-integration.js'
    })
  });

  const styleInstructions = Object.freeze({
    academic: '답변은 반드시 학술체(~이다)로 작성하세요.',
    report: '답변은 반드시 보고체(~임, ~함)로 작성하세요.',
    polite: '답변은 반드시 일반체(존댓말)로 작성하세요.'
  });

  const verificationInstruction = `When verified academic search results are provided, use only those results for citations and bibliographic details.
Do not fabricate sources, DOI values, journal names, authors, publication years, or citation counts.
The public academic search result list is already visible to the user. Do not repeat the same list as the AI answer.
If the provided search results do not support the requested claim, state "근거 부족" instead of inventing sources.`;

  const synthesisInstruction = `AI answer objective:
Use the public academic search results as evidence and produce a claim-centered prior-research synthesis, not another search-result list and not paper-by-paper summaries.
Extract claims, findings, variable relationships, result directions, mechanisms, conditions, and limitations from abstracts, then attach author-year citations to each extracted claim.
Required sections:
1. 주어진 자료에서 추출 가능한 내용의 범위
2. 초록에서 추출한 핵심 주장과 결과
3. 같은 결과를 지지하는 정보
4. 반대되거나 제한적인 정보
5. 연구주제에 대한 종합 해석
6. 최종 종합문
The unit of organization must be the extracted claim/result, not the paper. Use Korean author-year citations such as Kim과 Oh(2024).`;

  const deepResearchPresets = Object.freeze({
    basic: `You are an academic research assistant.

Task:
Analyze the verified public academic search results for the following topic:
[여기에 주제 입력]

Search conditions:
- Publication years: [연도 범위 입력]
- Only include verifiable, existing journal articles.
- Do NOT fabricate citations.
- If bibliographic information is uncertain, explicitly state uncertainty.

Output requirements:
1. Do not repeat the visible search-result list.
2. Extract claims/results from abstracts and organize by claim/result, not by paper.
3. Identify claims that are supported by multiple studies and attach all supporting citations.
4. Identify contradictory, partial, non-significant, indirect, or context-dependent findings.
5. Synthesize the topic across extracted claims and findings.
6. Add author-year citations for every evidence-backed statement.
7. Include citation information only as evidence attached to claims, not as a standalone reference-list output.`,

    research: `You are a doctoral-level research assistant.

Analyze verified empirical studies on:
[연구주제]

Conditions:
- Years: 2023–2026
- Empirical quantitative studies only
- State the theoretical framework, sample, statistical method, model fit indices, and citation count when available.
- APA 7 format with DOI required.
- No fabricated sources.
- Focus on claim/result extraction, duplicated constructs, contradictory results, and implications with author-year citations.`,

    meta: `Analyze verified systematic reviews or meta-analyses on:
[주제]

Include effect sizes, number of studies, statistical model, publication-bias methods, DOI, and APA 7 format.
Exclude narrative reviews. Do not list papers only; compare overlapping conclusions, disagreements, and implications with author-year citations.`,

    recommend: `You are an academic research assistant.

Analyze verified peer-reviewed empirical journal articles on:
[주제]

Years: 2023–2026

Requirements:
- Only real, verifiable articles; do not fabricate citations.
- APA 7th edition with DOI.
- State theoretical framework and statistical method.
- Separate Korean and international studies.
- Organize convergent and contradictory findings and provide author-year citations in each synthesized claim.`,

    'data-survey': `You are a doctoral-level academic research assistant specializing in theoretical and conceptual analysis.

Conduct a structured theoretical literature synthesis based on verified public academic search results for:
[여기에 주제 입력]

Publication years: [연도 범위 입력]
Include foundational works and recent developments. Use only real peer-reviewed articles or academic books and never fabricate citations.

Required structure:
I. Conceptual Definitions
II. Theoretical Foundations
III. Conceptual Structure
IV. Intellectual Genealogy
V. Reference List in APA 7 with DOI when available

Compare definitions, evolution, dimensions, overlaps, key scholars, ambiguities, and frequently cited definitions.`,

    'systematic-review': `You are a doctoral-level academic research assistant specializing in systematic literature review.

Conduct a structured literature review based on verified public academic search results on:
[여기에 구체적 주제 입력]

Publication years: [연도 범위 입력]
Use only real peer-reviewed sources. Do not fabricate citations. Include foundational theories and recent developments.

Required structure:
I. Theoretical Trends
II. Methodological Trends
III. Empirical Findings Synthesis
IV. Research Gaps and Future Directions
V. Reference List in APA 7 with DOI when available

Identify consensus, contradictions, boundary conditions, under-theorized areas, and where longitudinal or multilevel modeling is needed.`,

    'academic-paper': `You are a doctoral-level academic research assistant.

Produce three structured outputs on:
[여기에 구체적 주제 입력]

1. Conceptual and Theoretical Synthesis Sample
2. Research Model Design Sample with variables, controls, hypotheses, methods, and a text diagram
3. Empirical Evidence Review Sample based on verified studies from [연도 범위 입력]

Use formal academic tone, maintain theoretical coherence, group evidence by claims rather than papers, use APA 7 and DOI when available, and never fabricate sources.`,

    citation: `You are an academic citation assistant.

Analyze real, verifiable, peer-reviewed journal articles found in public academic search results on:
[여기에 주제 입력]

Publication years: [연도 범위 입력]
Do not output only a reference list. Extract claims from titles and abstracts, group supporting and contradictory findings, attach author-year citations to every claim, and provide an overall synthesis. Never fabricate citations.`
  });

  const scholarSystemInstruction = 'You are a scholarly assistant. Respond in Korean and always split output into [EXPLANATION] and [RESULT]. Keep [EXPLANATION] for rationale and [RESULT] for insertion-ready final content only.';

  const scholarRoleInstructions = Object.freeze({
    researcher: 'Structure the response as claim-centered academic synthesis: use provided search results as raw evidence, do not repeat the result list, do not summarize paper-by-paper, extract claims/results from abstracts, group same-direction and opposing claims, and attach author-year citations to each claim.',
    editor: 'Rewrite with clear and concise academic tone, reducing ambiguity and redundancy.',
    developer: 'Provide implementation-ready code and a practical step-by-step checklist.',
    slide: 'Convert source text into concise, presentation-ready HTML slides. Summarize, structure by slide, and use tables, diagrams, or charts where appropriate. Add minimal JavaScript only when needed.',
    default: 'Split output into [EXPLANATION] and [RESULT], with insertion-ready content only in [RESULT].'
  });

  function trim(value) {
    return String(value == null ? '' : value).trim();
  }

  function normalizeBaseUrl(value) {
    let url = trim(value || defaults.baseUrl).replace(/\/+$/, '');
    url = url.replace(/\/chat\/completions$/i, '').replace(/\/models$/i, '');
    if (url && !/\/v1$/i.test(url)) url += '/v1';
    return url || defaults.baseUrl;
  }

  function normalizeOptionalBaseUrl(value) {
    const url = trim(value).replace(/\/+$/, '')
      .replace(/\/chat\/completions$/i, '').replace(/\/models$/i, '');
    return url && !/\/v1$/i.test(url) ? url + '/v1' : url;
  }

  function finiteOr(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function normalizeReasoningLevel(value) {
    const level = trim(value || defaults.reasoningLevel).toLowerCase();
    return ['auto', 'on', 'low', 'medium', 'high'].indexOf(level) >= 0 ? level : defaults.reasoningLevel;
  }

  function normalizeConfig(input) {
    const raw = input || {};
    const source = Object.assign({}, defaults, raw);
    const baseUrlPrimary = normalizeBaseUrl(raw.baseUrlPrimary || raw.baseUrl || raw.lmStudioBaseUrl || source.baseUrl);
    const baseUrlSecondary = normalizeOptionalBaseUrl(raw.baseUrlSecondary);
    const activeBaseUrlSlot = raw.activeBaseUrlSlot === 'secondary' && baseUrlSecondary ? 'secondary' : 'primary';
    return {
      baseUrl: activeBaseUrlSlot === 'secondary' ? baseUrlSecondary : baseUrlPrimary,
      baseUrlPrimary: baseUrlPrimary,
      baseUrlSecondary: baseUrlSecondary,
      activeBaseUrlSlot: activeBaseUrlSlot,
      model: trim(raw.model || raw.modelId || raw.lmStudioModel || source.model || defaults.model),
      apiKey: trim(raw.apiKey || raw.lmStudioApiKey || source.apiKey),
      temperature: finiteOr(source.temperature, defaults.temperature),
      maxTokens: Math.max(1, Math.round(finiteOr(raw.maxTokens == null ? raw.maxOutputTokens : raw.maxTokens, defaults.maxTokens))),
      quickMaxTokens: Math.max(1, Math.round(finiteOr(source.quickMaxTokens, defaults.quickMaxTokens))),
      reasoningMaxTokens: Math.max(1, Math.round(finiteOr(source.reasoningMaxTokens, defaults.reasoningMaxTokens))),
      fastMaxTokens: Math.max(1, Math.round(finiteOr(source.fastMaxTokens, defaults.fastMaxTokens))),
      fastTimeoutMs: Math.max(1000, Math.round(finiteOr(source.fastTimeoutMs, defaults.fastTimeoutMs))),
      fastSafetyTimeout: source.fastSafetyTimeout !== false,
      fastCompleteStreaming: source.fastCompleteStreaming !== false,
      reasoningLevel: normalizeReasoningLevel(source.reasoningLevel),
      timeoutMs: Math.max(1000, Math.round(finiteOr(source.timeoutMs, defaults.timeoutMs))),
      topP: source.topP == null ? null : finiteOr(source.topP, null),
      seed: source.seed == null ? null : Math.round(finiteOr(source.seed, 0)),
      frequencyPenalty: source.frequencyPenalty == null ? null : finiteOr(source.frequencyPenalty, null),
      presencePenalty: source.presencePenalty == null ? null : finiteOr(source.presencePenalty, null)
    };
  }

  function assertConfig(config) {
    if (!config.baseUrl) throw new Error('LM Studio baseUrl이 필요합니다.');
    if (!config.model) throw new Error('LM Studio 모델명이 필요합니다.');
    return config;
  }

  function assertConnectionConfig(config) {
    if (!config.baseUrl) throw new Error('LM Studio baseUrl이 필요합니다.');
    return config;
  }

  function getServerRoot(baseUrl) {
    return normalizeBaseUrl(baseUrl).replace(/\/v1$/i, '');
  }

  function resolveFetch(fetchImpl) {
    const fn = fetchImpl || (root && root.fetch);
    if (typeof fn !== 'function') throw new Error('fetch 구현이 필요합니다. createClient({ fetch })로 전달하세요.');
    const bound = fn.bind ? fn.bind(root) : fn;
    return async function (url, options) {
      options = options || {};
      let target;
      try { target = new URL(String(url)); } catch (_) { target = null; }
      const isLoopback = target && (target.hostname === '127.0.0.1' || target.hostname === 'localhost' || target.hostname === '::1');
      const tauriInvoke = root && root.__TAURI_INTERNALS__ && root.__TAURI_INTERNALS__.invoke;
      if (isLoopback && typeof tauriInvoke === 'function') {
        if (options.signal && options.signal.aborted) throw options.signal.reason || new DOMException('요청이 취소되었습니다.', 'AbortError');
        const headerMap = {};
        if (typeof Headers !== 'undefined' && options.headers instanceof Headers) {
          options.headers.forEach(function (value, key) { headerMap[key.toLowerCase()] = value; });
        } else {
          Object.keys(options.headers || {}).forEach(function (key) { headerMap[key.toLowerCase()] = options.headers[key]; });
        }
        const result = await tauriInvoke('lmstudio_api_request', {
          request: {
            url: String(url),
            method: String(options.method || 'GET').toUpperCase(),
            authorization: headerMap.authorization || null,
            contentType: headerMap['content-type'] || 'application/json',
            accept: headerMap.accept || 'application/json',
            body: options.body == null ? null : String(options.body),
            timeoutSeconds: 3600
          }
        });
        return new Response(String(result.body || ''), {
          status: Number(result.status || 500),
          headers: { 'Content-Type': result.contentType || 'application/json' }
        });
      }
      const location = root && root.location;
      const isLocalWebApp = location && /^https?:$/.test(location.protocol)
        && (location.hostname === '127.0.0.1' || location.hostname === 'localhost' || location.hostname === '::1');
      if (isLoopback && isLocalWebApp && String(url).indexOf('/__mdviewer_lmstudio_proxy') < 0) {
        return await bound('/__mdviewer_lmstudio_proxy?url=' + encodeURIComponent(String(url)), options);
      }
      try {
        return await bound(url, options);
      } catch (error) {
        const canProxy = location && /^https?:$/.test(location.protocol) && isLoopback
          && String(url).indexOf('/__mdviewer_lmstudio_proxy') < 0;
        if (!canProxy || (error && error.name === 'AbortError')) throw error;
        const proxyUrl = '/__mdviewer_lmstudio_proxy?url=' + encodeURIComponent(String(url));
        return await bound(proxyUrl, options);
      }
    };
  }

  function createRequestSignal(externalSignal, timeoutMs) {
    const controller = new AbortController();
    let timedOut = false;
    const abortFromExternal = function () { controller.abort(externalSignal.reason); };
    if (externalSignal) {
      if (externalSignal.aborted) abortFromExternal();
      else externalSignal.addEventListener('abort', abortFromExternal, { once: true });
    }
    let timer = setTimeout(function () {
      timedOut = true;
      controller.abort(new Error('LM Studio request timed out'));
    }, Math.max(1000, timeoutMs));
    return {
      signal: controller.signal,
      didTimeout: function () { return timedOut; },
      disarmTimeout: function () {
        if (timer) clearTimeout(timer);
        timer = null;
      },
      cleanup: function () {
        if (timer) clearTimeout(timer);
        timer = null;
        if (externalSignal) externalSignal.removeEventListener('abort', abortFromExternal);
      }
    };
  }

  function makeHeaders(config, extraHeaders) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, extraHeaders || {});
    if (config.apiKey && !headers.Authorization) headers.Authorization = 'Bearer ' + config.apiKey;
    return headers;
  }

  async function parseResponse(response, label) {
    const data = await response.json().catch(function () { return {}; });
    if (!response.ok) {
      const message = data && data.error && data.error.message;
      throw new Error(message || label + ' HTTP ' + response.status);
    }
    return data;
  }

  function isUnsupportedReasoningSettingError(error) {
    const message = trim(error && error.message || error).toLowerCase();
    return /reasoning(?:\s+setting)?[\s\S]{0,100}(?:not\s+supported|unsupported)/i.test(message)
      || /supported\s+settings?\s*:[\s\S]{0,80}(?:'on'|'off'|on|off)/i.test(message);
  }

  function composeUserText(prompt, userText) {
    const first = trim(prompt);
    const second = userText == null ? '' : String(userText);
    return second ? (first ? first + '\n\n' + second : second) : first;
  }

  function buildMessages(options) {
    const messages = [];
    if (options.systemInstruction) messages.push({ role: 'system', content: String(options.systemInstruction) });
    if (Array.isArray(options.messages)) {
      options.messages.forEach(function (message) {
        if (!message || !message.role || message.content == null) return;
        messages.push({ role: String(message.role), content: message.content });
      });
    }
    const userContent = composeUserText(options.prompt, options.userText);
    if (userContent) messages.push({ role: 'user', content: userContent });
    if (!messages.length) throw new Error('prompt, userText 또는 messages가 필요합니다.');
    return messages;
  }

  function buildRequestBody(config, options, stream) {
    const body = {
      model: trim(options.model || options.modelId || config.model),
      messages: buildMessages(options),
      temperature: finiteOr(options.temperature, config.temperature),
      max_tokens: Math.max(1, Math.round(finiteOr(options.maxTokens == null ? options.maxOutputTokens : options.maxTokens, config.maxTokens))),
      stream: !!stream
    };
    const optional = {
      top_p: options.topP == null ? config.topP : options.topP,
      seed: options.seed == null ? config.seed : options.seed,
      frequency_penalty: options.frequencyPenalty == null ? config.frequencyPenalty : options.frequencyPenalty,
      presence_penalty: options.presencePenalty == null ? config.presencePenalty : options.presencePenalty,
      stop: options.stop,
      response_format: options.responseFormat
    };
    Object.keys(optional).forEach(function (key) {
      if (optional[key] != null) body[key] = optional[key];
    });
    return body;
  }

  function contentToText(content) {
    if (content == null) return '';
    if (typeof content === 'string' || typeof content === 'number') return String(content);
    if (Array.isArray(content)) return content.map(contentToText).join('');
    if (typeof content !== 'object') return '';
    if (typeof content.text === 'string') return content.text;
    if (typeof content.content === 'string' || Array.isArray(content.content)) return contentToText(content.content);
    if (typeof content.value === 'string') return content.value;
    if (content.message) return contentToText(content.message);
    return '';
  }

  function extractCompletionParts(data) {
    const payload = data && data.data && !data.choices ? data.data
      : data && data.response && !data.choices ? data.response
      : data;
    const choice = payload && payload.choices && payload.choices[0];
    const message = choice && choice.message;
    const nativeOutput = payload && Array.isArray(payload.output) ? payload.output : [];
    let text = trim(contentToText(
      (message && message.content)
      || (choice && choice.text)
      || (payload && payload.output_text)
      || nativeOutput.filter(function (item) {
        return item && (item.type === 'message' || item.role === 'assistant');
      }).map(function (item) { return item.content || item.text || ''; })
    ));
    let reasoning = trim(message && (
      message.reasoning_content || message.reasoning || message.analysis
    ) || choice && (choice.reasoning_content || choice.reasoning)
      || nativeOutput.filter(function (item) {
        return item && (item.type === 'reasoning' || item.type === 'analysis');
      }).map(function (item) { return item.content || item.text || ''; }).join('\n'));
    const taggedReasoning = [];
    text = text.replace(/<think>([\s\S]*?)<\/think>/gi, function (_, value) {
      if (trim(value)) taggedReasoning.push(trim(value));
      return '';
    }).trim();
    if (/^<think>/i.test(text) && !/<\/think>/i.test(text)) {
      taggedReasoning.push(text.replace(/^<think>/i, '').trim());
      text = '';
    }
    if (taggedReasoning.length) reasoning = [reasoning].concat(taggedReasoning).filter(Boolean).join('\n\n');
    return { text: text, reasoning: reasoning };
  }

  function createClient(initialConfig) {
    const initial = initialConfig || {};
    let config = normalizeConfig(initial);
    const fetchImpl = initial.fetch;

    function getConfig(options) {
      const copy = Object.assign({}, config);
      if (options && options.redactApiKey && copy.apiKey) copy.apiKey = '***';
      return copy;
    }

    function configure(next) {
      const patch = Object.assign({}, next || {});
      if (patch.baseUrl == null && patch.lmStudioBaseUrl != null) patch.baseUrl = patch.lmStudioBaseUrl;
      if (patch.model == null && patch.modelId != null) patch.model = patch.modelId;
      if (patch.model == null && patch.lmStudioModel != null) patch.model = patch.lmStudioModel;
      if (patch.apiKey == null && patch.lmStudioApiKey != null) patch.apiKey = patch.lmStudioApiKey;
      if (patch.maxTokens == null && patch.maxOutputTokens != null) patch.maxTokens = patch.maxOutputTokens;
      config = normalizeConfig(Object.assign({}, config, patch));
      return getConfig();
    }

    async function listModels(options) {
      options = options || {};
      const active = assertConnectionConfig(normalizeConfig(Object.assign({}, config, options.config || {})));
      const requestSignal = createRequestSignal(options.signal, options.timeoutMs || Math.min(active.timeoutMs, 10000));
      try {
        const headers = Object.assign({ Accept: 'application/json' }, options.headers || {});
        if (active.apiKey && !headers.Authorization) headers.Authorization = 'Bearer ' + active.apiKey;
        const response = await resolveFetch(options.fetch || fetchImpl)(getServerRoot(active.baseUrl) + endpoints.loadedModels, {
          method: 'GET',
          headers: headers,
          signal: requestSignal.signal
        });
        const data = await parseResponse(response, 'LM Studio models');
        const models = Array.isArray(data.models) ? data.models : (Array.isArray(data.data) ? data.data : []);
        return models.filter(function (item) {
          return item && item.type !== 'embedding' && item.type !== 'embeddings';
        }).map(function (item) { return trim(item && (item.key || item.id)); }).filter(Boolean);
      } finally {
        requestSignal.cleanup();
      }
    }

    async function loadModel(model, options) {
      options = options || {};
      const active = assertConnectionConfig(normalizeConfig(Object.assign({}, config, options.config || {})));
      const modelId = trim(model);
      if (!modelId) throw new Error('불러올 LM Studio 모델을 선택하세요.');
      const requestSignal = createRequestSignal(options.signal, options.timeoutMs || active.timeoutMs);
      try {
        const headers = Object.assign({ Accept: 'application/json', 'Content-Type': 'application/json' }, options.headers || {});
        if (active.apiKey && !headers.Authorization) headers.Authorization = 'Bearer ' + active.apiKey;
        const response = await resolveFetch(options.fetch || fetchImpl)(getServerRoot(active.baseUrl) + endpoints.loadModel, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({ model: modelId }),
          signal: requestSignal.signal
        });
        return await parseResponse(response, 'LM Studio model load');
      } finally {
        requestSignal.cleanup();
      }
    }

    async function listLoadedModels(options) {
      options = options || {};
      const active = assertConnectionConfig(normalizeConfig(Object.assign({}, config, options.config || {})));
      const requestSignal = createRequestSignal(options.signal, options.timeoutMs || Math.min(active.timeoutMs, 10000));
      try {
        const headers = Object.assign({ Accept: 'application/json' }, options.headers || {});
        if (active.apiKey && !headers.Authorization) headers.Authorization = 'Bearer ' + active.apiKey;
        const response = await resolveFetch(options.fetch || fetchImpl)(getServerRoot(active.baseUrl) + endpoints.loadedModels, {
          method: 'GET',
          headers: headers,
          signal: requestSignal.signal
        });
        const data = await parseResponse(response, 'LM Studio loaded models');
        return (Array.isArray(data.models) ? data.models : []).filter(function (item) {
          return item && item.type === 'llm' && Array.isArray(item.loaded_instances) && item.loaded_instances.length > 0;
        }).map(function (item) {
          const instances = item.loaded_instances.map(function (instance) {
            return {
              id: trim(instance && instance.id),
              contextLength: instance && instance.config ? instance.config.context_length : null,
              remainingTtlSeconds: instance ? instance.remaining_ttl_seconds : null
            };
          });
          return {
            id: trim((instances[0] && instances[0].id) || item.key),
            key: trim(item.key),
            displayName: trim(item.display_name || item.key),
            instances: instances,
            capabilities: item.capabilities || null
          };
        }).filter(function (item) { return !!item.id; });
      } finally {
        requestSignal.cleanup();
      }
    }

    async function complete(options) {
      options = options || {};
      const active = assertConfig(normalizeConfig(Object.assign({}, config, options.config || {})));
      const timeoutMs = options.timeoutMs || active.timeoutMs;
      const requestSignal = createRequestSignal(options.signal, timeoutMs);
      try {
        const response = await resolveFetch(options.fetch || fetchImpl)(active.baseUrl + endpoints.chatCompletions, {
          method: 'POST',
          headers: makeHeaders(active, options.headers),
          body: JSON.stringify(buildRequestBody(active, options, false)),
          signal: requestSignal.signal
        });
        const data = await parseResponse(response, 'LM Studio');
        const completion = extractCompletionParts(data);
        if (!completion.text && !completion.reasoning) throw new Error('LM Studio 응답이 비어 있습니다.');
        const text = completion.text || '모델이 추론 내용만 반환하고 최종 답변을 생성하지 못했습니다. Max tokens 값을 늘려 다시 시도하세요.';
        return {
          provider: 'lmstudio',
          model: trim(data.model || options.model || options.modelId || active.model),
          text: text,
          reasoning: completion.reasoning || '',
          usage: data.usage || null,
          finishReason: data.choices && data.choices[0] && data.choices[0].finish_reason,
          raw: options.includeRaw ? data : undefined
        };
      } catch (error) {
        if (requestSignal.didTimeout()) throw new Error('LM Studio 요청 시간이 초과되었습니다 (' + timeoutMs + 'ms).');
        throw error;
      } finally {
        requestSignal.cleanup();
      }
    }

    async function chat(options) {
      options = options || {};
      const active = assertConfig(normalizeConfig(Object.assign({}, config, options.config || {})));
      const timeoutMs = options.timeoutMs || active.timeoutMs;
      const requestSignal = createRequestSignal(options.signal, timeoutMs);
      const body = {
        model: trim(options.model || options.modelId || active.model),
        input: options.input == null ? '' : options.input,
        system_prompt: trim(options.systemInstruction || options.systemPrompt),
        stream: options.internalStream === true,
        store: options.store === true,
        temperature: finiteOr(options.temperature, active.temperature),
        max_output_tokens: Math.max(1, Math.round(finiteOr(options.maxTokens == null ? options.maxOutputTokens : options.maxTokens, active.maxTokens)))
      };
      if (options.reasoning != null) body.reasoning = String(options.reasoning);
      if (options.contextLength != null) body.context_length = Math.max(1, Math.round(finiteOr(options.contextLength, 1)));
      if (options.topP != null || active.topP != null) body.top_p = options.topP == null ? active.topP : options.topP;
      if (options.previousResponseId) body.previous_response_id = String(options.previousResponseId);
      try {
        if (options.internalStream === true && root && typeof root.XMLHttpRequest === 'function' && !options.fetch && !fetchImpl
          && !(root.__TAURI_INTERNALS__ && typeof root.__TAURI_INTERNALS__.invoke === 'function')
          && !(root.location && /^https?:$/.test(root.location.protocol))) {
          if (typeof options.onEvent === 'function') {
            try { options.onEvent({ type: 'transport.start', transport: 'xhr-sse' }, { text: '', reasoning: '' }); } catch (ignore) {}
          }
          const runXhrStream = function (requestBody, reasoningSettingFallback) {
            return new Promise(function (resolve, reject) {
              const xhr = new root.XMLHttpRequest();
              let responseOffset = 0;
              let buffer = '';
              let eventName = '';
              let dataLines = [];
              let text = '';
              let reasoning = '';
              let finalData = null;
              let streamError = null;
              let settled = false;
              const emit = function (event) {
                if (!event || typeof event !== 'object') return;
                if (options.completeStreaming === true && ((event.type === 'reasoning.delta' || event.type === 'message.delta') && event.content)) {
                  xhr.timeout = 0;
                  requestSignal.disarmTimeout();
                }
                if (event.type === 'reasoning.delta' && event.content) {
                  reasoning += String(event.content);
                  if (typeof options.onReasoningToken === 'function') options.onReasoningToken(String(event.content), reasoning, event);
                } else if (event.type === 'message.delta' && event.content) {
                  text += String(event.content);
                  if (typeof options.onToken === 'function') options.onToken(String(event.content), text, event);
                } else if (event.type === 'chat.end' && event.result) {
                  finalData = event.result;
                } else if (event.type === 'error' && event.error) {
                  streamError = event.error;
                }
                if (typeof options.onEvent === 'function') {
                  try { options.onEvent(event, { text: text, reasoning: reasoning }); } catch (ignore) {}
                }
              };
              const flushEvent = function () {
                if (!dataLines.length) {
                  eventName = '';
                  return;
                }
                const raw = dataLines.join('\n');
                dataLines = [];
                let event;
                try { event = JSON.parse(raw); } catch (ignore) { eventName = ''; return; }
                if (!event.type && eventName) event.type = eventName;
                eventName = '';
                emit(event);
              };
              const consumeLine = function (line) {
                if (line === '') return flushEvent();
                if (line.charAt(0) === ':') return;
                if (line.indexOf('event:') === 0) eventName = line.slice(6).trim();
                else if (line.indexOf('data:') === 0) dataLines.push(line.slice(5).trimStart());
              };
              const consumeNewText = function (done) {
                const responseText = String(xhr.responseText || '');
                if (responseText.length <= responseOffset) return;
                buffer += responseText.slice(responseOffset);
                responseOffset = responseText.length;
                const lines = buffer.split(/\r?\n/);
                buffer = lines.pop() || '';
                lines.forEach(consumeLine);
                if (done) {
                  if (buffer) consumeLine(buffer.replace(/\r$/, ''));
                  buffer = '';
                  flushEvent();
                }
              };
              const cleanupXhr = function () {
                if (requestSignal.signal) requestSignal.signal.removeEventListener('abort', abortXhr);
              };
              const abortXhr = function () {
                if (settled) return;
                try { xhr.abort(); } catch (ignore) {}
                const error = new Error('AI Jena request aborted');
                error.name = 'AbortError';
                fail(error);
              };
              const fail = function (error) {
                if (settled) return;
                settled = true;
                cleanupXhr();
                reject(error);
              };
              xhr.open('POST', getServerRoot(active.baseUrl) + endpoints.nativeChat, true);
              xhr.responseType = 'text';
              if (typeof xhr.overrideMimeType === 'function') xhr.overrideMimeType('text/event-stream; charset=utf-8');
              const headers = makeHeaders(active, options.headers);
              Object.keys(headers).forEach(function (name) { xhr.setRequestHeader(name, headers[name]); });
              xhr.timeout = timeoutMs;
              xhr.onprogress = function () {
                // Some browsers keep status at 0 for a cross-origin streaming
                // response until load, even though responseText is already growing.
                consumeNewText(false);
              };
              xhr.onerror = function () { fail(new Error('LM Studio 스트리밍 연결에 실패했습니다.')); };
              xhr.ontimeout = function () { fail(new Error('LM Studio 스트리밍 요청 시간이 초과되었습니다 (' + timeoutMs + 'ms).')); };
              xhr.onabort = function () {
                const error = new Error('AI Jena request aborted');
                error.name = 'AbortError';
                fail(error);
              };
              xhr.onload = function () {
                if (settled) return;
                if (xhr.status < 200 || xhr.status >= 300) {
                  let message = '';
                  try {
                    const payload = JSON.parse(String(xhr.responseText || '{}'));
                    message = payload && payload.error && payload.error.message || '';
                  } catch (ignore) {}
                  return fail(new Error(message || 'LM Studio native chat stream HTTP ' + xhr.status));
                }
                consumeNewText(true);
                if (!finalData && streamError) return fail(new Error(streamError.message || 'LM Studio 스트리밍 오류'));
                if (!finalData) {
                  finalData = {
                    model_instance_id: requestBody.model,
                    output: [
                      reasoning ? { type: 'reasoning', content: reasoning } : null,
                      text ? { type: 'message', content: text } : null
                    ].filter(Boolean)
                  };
                }
                const output = Array.isArray(finalData.output) ? finalData.output : [];
                const finalText = trim(output.filter(function (item) { return item && item.type === 'message'; }).map(function (item) { return item.content || ''; }).join('\n')) || trim(text);
                const finalReasoning = trim(output.filter(function (item) { return item && item.type === 'reasoning'; }).map(function (item) { return item.content || ''; }).join('\n')) || trim(reasoning);
                if (!finalText && !finalReasoning) return fail(new Error('LM Studio 응답이 비어 있습니다.'));
                settled = true;
                cleanupXhr();
                resolve({
                  provider: 'lmstudio',
                  model: trim(finalData.model_instance_id || requestBody.model),
                  text: finalText || '모델이 추론 내용만 반환하고 최종 답변을 생성하지 못했습니다. 출력 토큰 설정을 늘려 다시 시도하세요.',
                  reasoning: finalReasoning,
                  usage: finalData.stats || null,
                  finishReason: finalData.finish_reason || finalData.stop_reason
                    || (finalData.stats && (finalData.stats.finish_reason || finalData.stats.stop_reason)) || '',
                  responseId: finalData.response_id || null,
                  reasoningSettingFallback: reasoningSettingFallback,
                  raw: options.includeRaw ? finalData : undefined
                });
              };
              if (requestSignal.signal) {
                if (requestSignal.signal.aborted) return abortXhr();
                requestSignal.signal.addEventListener('abort', abortXhr, { once: true });
              }
              xhr.send(JSON.stringify(requestBody));
            });
          };
          try {
            return await runXhrStream(body, false);
          } catch (error) {
            if (!Object.prototype.hasOwnProperty.call(body, 'reasoning') || !isUnsupportedReasoningSettingError(error)) throw error;
            const fallbackBody = Object.assign({}, body);
            delete fallbackBody.reasoning;
            return await runXhrStream(fallbackBody, true);
          }
        }
        const nativeFetch = resolveFetch(options.fetch || fetchImpl);
        const nativeUrl = getServerRoot(active.baseUrl) + endpoints.nativeChat;
        const sendNativeChat = async function (requestBody) {
          const response = await nativeFetch(nativeUrl, {
            method: 'POST',
            headers: makeHeaders(active, options.headers),
            body: JSON.stringify(requestBody),
            signal: requestSignal.signal
          });
          return parseResponse(response, 'LM Studio native chat');
        };
        let data;
        let reasoningSettingFallback = false;
        try {
          data = await sendNativeChat(body);
        } catch (error) {
          if (!Object.prototype.hasOwnProperty.call(body, 'reasoning') || !isUnsupportedReasoningSettingError(error)) throw error;
          const fallbackBody = Object.assign({}, body);
          delete fallbackBody.reasoning;
          data = await sendNativeChat(fallbackBody);
          reasoningSettingFallback = true;
        }
        const output = Array.isArray(data.output) ? data.output : [];
        const text = trim(output.filter(function (item) { return item && item.type === 'message'; }).map(function (item) { return item.content || ''; }).join('\n'));
        const reasoning = trim(output.filter(function (item) { return item && item.type === 'reasoning'; }).map(function (item) { return item.content || ''; }).join('\n'));
        if (!text && !reasoning) throw new Error('LM Studio 응답이 비어 있습니다.');
        return {
          provider: 'lmstudio',
          model: trim(data.model_instance_id || body.model),
          text: text || '모델이 추론 내용만 반환하고 최종 답변을 생성하지 못했습니다. 출력 토큰 설정을 늘려 다시 시도하세요.',
          reasoning: reasoning,
          usage: data.stats || null,
          finishReason: data.finish_reason || data.stop_reason
            || (data.stats && (data.stats.finish_reason || data.stats.stop_reason)) || '',
          responseId: data.response_id || null,
          reasoningSettingFallback: reasoningSettingFallback,
          raw: options.includeRaw ? data : undefined
        };
      } catch (error) {
        if (requestSignal.didTimeout()) throw new Error('LM Studio 요청 시간이 초과되었습니다 (' + timeoutMs + 'ms).');
        throw error;
      } finally {
        requestSignal.cleanup();
      }
    }

    async function chatStream(options) {
      options = options || {};
      if (root && typeof root.XMLHttpRequest === 'function' && !options.fetch && !fetchImpl) {
        return chat(Object.assign({}, options, { internalStream: true }));
      }
      const active = assertConfig(normalizeConfig(Object.assign({}, config, options.config || {})));
      const timeoutMs = options.timeoutMs || active.timeoutMs;
      const requestSignal = createRequestSignal(options.signal, timeoutMs);
      const body = {
        model: trim(options.model || options.modelId || active.model),
        input: options.input == null ? '' : options.input,
        system_prompt: trim(options.systemInstruction || options.systemPrompt),
        stream: true,
        store: options.store === true,
        temperature: finiteOr(options.temperature, active.temperature),
        max_output_tokens: Math.max(1, Math.round(finiteOr(options.maxTokens == null ? options.maxOutputTokens : options.maxTokens, active.maxTokens)))
      };
      if (options.reasoning != null) body.reasoning = String(options.reasoning);
      if (options.contextLength != null) body.context_length = Math.max(1, Math.round(finiteOr(options.contextLength, 1)));
      if (options.topP != null || active.topP != null) body.top_p = options.topP == null ? active.topP : options.topP;
      if (options.previousResponseId) body.previous_response_id = String(options.previousResponseId);
      try {
        const nativeFetch = resolveFetch(options.fetch || fetchImpl);
        const nativeUrl = getServerRoot(active.baseUrl) + endpoints.nativeChat;
        const openNativeStream = async function (requestBody) {
          const response = await nativeFetch(nativeUrl, {
            method: 'POST',
            headers: makeHeaders(active, options.headers),
            body: JSON.stringify(requestBody),
            signal: requestSignal.signal
          });
          if (!response.ok) await parseResponse(response, 'LM Studio native chat stream');
          return response;
        };
        let response;
        let reasoningSettingFallback = false;
        try {
          response = await openNativeStream(body);
        } catch (error) {
          if (!Object.prototype.hasOwnProperty.call(body, 'reasoning') || !isUnsupportedReasoningSettingError(error)) throw error;
          const fallbackBody = Object.assign({}, body);
          delete fallbackBody.reasoning;
          response = await openNativeStream(fallbackBody);
          reasoningSettingFallback = true;
        }

        let text = '';
        let reasoning = '';
        let finalData = null;
        let streamError = null;
        const emit = function (event) {
          if (!event || typeof event !== 'object') return;
          if (options.completeStreaming === true && ((event.type === 'reasoning.delta' || event.type === 'message.delta') && event.content)) {
            requestSignal.disarmTimeout();
          }
          if (event.type === 'reasoning.delta' && event.content) {
            reasoning += String(event.content);
            if (typeof options.onReasoningToken === 'function') options.onReasoningToken(String(event.content), reasoning, event);
          } else if (event.type === 'message.delta' && event.content) {
            text += String(event.content);
            if (typeof options.onToken === 'function') options.onToken(String(event.content), text, event);
          } else if (event.type === 'chat.end' && event.result) {
            finalData = event.result;
          } else if (event.type === 'error' && event.error) {
            streamError = event.error;
          }
          if (typeof options.onEvent === 'function') {
            try { options.onEvent(event, { text: text, reasoning: reasoning }); } catch (ignore) {}
          }
        };

        if (!response.body || typeof response.body.getReader !== 'function') {
          finalData = await parseResponse(response, 'LM Studio native chat stream');
          emit({ type: 'chat.end', result: finalData });
        } else {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let eventName = '';
          let dataLines = [];
          const flushEvent = function () {
            if (!dataLines.length) {
              eventName = '';
              return;
            }
            const raw = dataLines.join('\n');
            eventName = eventName || '';
            dataLines = [];
            let event;
            try { event = JSON.parse(raw); } catch (ignore) { eventName = ''; return; }
            if (!event.type && eventName) event.type = eventName;
            eventName = '';
            emit(event);
          };
          const consumeLine = function (line) {
            if (line === '') return flushEvent();
            if (line.charAt(0) === ':') return;
            if (line.indexOf('event:') === 0) eventName = line.slice(6).trim();
            else if (line.indexOf('data:') === 0) dataLines.push(line.slice(5).trimStart());
          };
          let done = false;
          while (!done) {
            const chunk = await reader.read();
            done = chunk.done;
            buffer += decoder.decode(chunk.value || new Uint8Array(), { stream: !done });
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() || '';
            lines.forEach(consumeLine);
          }
          if (buffer) consumeLine(buffer.replace(/\r$/, ''));
          flushEvent();
        }

        if (!finalData && streamError) throw new Error(streamError.message || 'LM Studio 스트리밍 오류');
        if (!finalData) {
          finalData = {
            model_instance_id: body.model,
            output: [
              reasoning ? { type: 'reasoning', content: reasoning } : null,
              text ? { type: 'message', content: text } : null
            ].filter(Boolean)
          };
        }
        const output = Array.isArray(finalData.output) ? finalData.output : [];
        const finalText = trim(output.filter(function (item) { return item && item.type === 'message'; }).map(function (item) { return item.content || ''; }).join('\n')) || trim(text);
        const finalReasoning = trim(output.filter(function (item) { return item && item.type === 'reasoning'; }).map(function (item) { return item.content || ''; }).join('\n')) || trim(reasoning);
        if (!finalText && !finalReasoning) throw new Error('LM Studio 응답이 비어 있습니다.');
        return {
          provider: 'lmstudio',
          model: trim(finalData.model_instance_id || body.model),
          text: finalText || '모델이 추론 내용만 반환하고 최종 답변을 생성하지 못했습니다. 출력 토큰 설정을 늘려 다시 시도하세요.',
          reasoning: finalReasoning,
          usage: finalData.stats || null,
          finishReason: finalData.finish_reason || finalData.stop_reason
            || (finalData.stats && (finalData.stats.finish_reason || finalData.stats.stop_reason)) || '',
          responseId: finalData.response_id || null,
          reasoningSettingFallback: reasoningSettingFallback,
          raw: options.includeRaw ? finalData : undefined
        };
      } catch (error) {
        if (requestSignal.didTimeout()) throw new Error('LM Studio 스트리밍 요청 시간이 초과되었습니다 (' + timeoutMs + 'ms).');
        throw error;
      } finally {
        requestSignal.cleanup();
      }
    }

    async function stream(options) {
      options = options || {};
      const active = assertConfig(normalizeConfig(Object.assign({}, config, options.config || {})));
      const timeoutMs = options.timeoutMs || active.timeoutMs;
      const requestSignal = createRequestSignal(options.signal, timeoutMs);
      let text = '';
      try {
        const response = await resolveFetch(options.fetch || fetchImpl)(active.baseUrl + endpoints.chatCompletions, {
          method: 'POST',
          headers: makeHeaders(active, options.headers),
          body: JSON.stringify(buildRequestBody(active, options, true)),
          signal: requestSignal.signal
        });
        if (!response.ok) await parseResponse(response, 'LM Studio stream');
        if (!response.body || typeof response.body.getReader !== 'function') {
          throw new Error('현재 fetch 구현은 스트리밍 응답을 지원하지 않습니다.');
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let done = false;
        const consumeLine = function (line) {
          const value = line.replace(/^data:\s*/, '').trim();
          if (!value || value === '[DONE]') return;
          try {
            const event = JSON.parse(value);
            const delta = event.choices && event.choices[0] && (
              (event.choices[0].delta && event.choices[0].delta.content) || event.choices[0].text
            );
            if (delta) {
              text += delta;
              if (typeof options.onToken === 'function') options.onToken(delta, text, event);
            }
          } catch (ignore) {}
        };
        while (!done) {
          const chunk = await reader.read();
          done = chunk.done;
          buffer += decoder.decode(chunk.value || new Uint8Array(), { stream: !done });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() || '';
          lines.forEach(consumeLine);
        }
        if (buffer.trim()) consumeLine(buffer);
        return { provider: 'lmstudio', model: trim(options.model || options.modelId || active.model), text: text };
      } catch (error) {
        if (requestSignal.didTimeout()) throw new Error('LM Studio 스트리밍 시간이 초과되었습니다 (' + timeoutMs + 'ms).');
        throw error;
      } finally {
        requestSignal.cleanup();
      }
    }

    async function testConnection(options) {
      const startedAt = Date.now();
      try {
        const models = await listModels(options);
        return { ok: true, latencyMs: Date.now() - startedAt, models: models, config: getConfig({ redactApiKey: true }) };
      } catch (error) {
        return { ok: false, latencyMs: Date.now() - startedAt, models: [], error: error.message, config: getConfig({ redactApiKey: true }) };
      }
    }

    return Object.freeze({
      getConfig: getConfig,
      configure: configure,
      listModels: listModels,
      listLoadedModels: listLoadedModels,
      loadModel: loadModel,
      chat: chat,
      chatStream: chatStream,
      complete: complete,
      stream: stream,
      testConnection: testConnection
    });
  }

  function getStorage(storage) {
    const target = storage || (root && root.localStorage);
    if (!target || typeof target.getItem !== 'function' || typeof target.setItem !== 'function') {
      throw new Error('localStorage 호환 저장소가 필요합니다.');
    }
    return target;
  }

  function loadConfig(storage, key) {
    const raw = getStorage(storage).getItem(key || STORAGE_KEY);
    return normalizeConfig(raw ? JSON.parse(raw) : {});
  }

  function saveConfig(config, storage, key) {
    const normalized = normalizeConfig(config);
    getStorage(storage).setItem(key || STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  }

  function loadMdliveConfig(storage) {
    const raw = getStorage(storage).getItem(mdlive.providerSettingsKey);
    const parsed = raw ? JSON.parse(raw) : {};
    return normalizeConfig({
      baseUrl: parsed.lmStudioBaseUrl,
      model: parsed.lmStudioModel,
      apiKey: parsed.lmStudioApiKey
    });
  }

  function createFromMdliveSettings(storage, overrides) {
    return createClient(Object.assign({}, loadMdliveConfig(storage), overrides || {}));
  }

  function fillResearchTemplate(template, values) {
    values = values || {};
    const topic = trim(values.topic) || '[주제 미입력]';
    const years = trim(values.years) || '[연도 미입력]';
    return String(template || '')
      .replace(/\[여기에 구체적 주제 입력\]/g, topic)
      .replace(/\[여기에 주제 입력\]/g, topic)
      .replace(/\[연도 범위 입력\]/g, years)
      .replace(/\[연구주제\]/g, topic)
      .replace(/\[주제\]/g, topic);
  }

  function appendStyle(prompt, tone) {
    const instruction = styleInstructions[trim(tone).toLowerCase()];
    return trim(prompt) + (instruction ? '\n\n' + instruction : '');
  }

  function appendEvidence(prompt, evidenceText) {
    const evidence = trim(evidenceText);
    if (!evidence) return trim(prompt);
    return trim(prompt) + '\n\nVERIFIED ACADEMIC SEARCH RESULTS:\n' + evidence;
  }

  function buildQuestionPrompt(options) {
    options = options || {};
    let prompt = [trim(options.prePrompt), trim(options.question)].filter(Boolean).join('\n\n');
    prompt = appendStyle(prompt, options.tone);
    return appendEvidence(prompt, options.evidenceText);
  }

  function buildResearchPrompt(options) {
    options = options || {};
    const preset = options.template || deepResearchPresets[options.preset || 'basic'] || deepResearchPresets.basic;
    let prompt = fillResearchTemplate(preset, options);
    prompt += '\n\n' + verificationInstruction + '\n\n' + synthesisInstruction;
    if (trim(options.question)) prompt += '\n\n질문:\n' + trim(options.question);
    prompt = appendStyle(prompt, options.tone);
    return appendEvidence(prompt, options.evidenceText);
  }

  function buildEditorPrompt(options) {
    options = options || {};
    let prompt = trim(options.command) + '\n\n---\n\n' + trim(options.text);
    return appendEvidence(prompt, options.evidenceText);
  }

  function buildCitationPrompt(options) {
    options = typeof options === 'string' ? { topic: options } : (options || {});
    return 'List 5 to 10 academic references in APA 7 format for the following topic. Output only the reference list, one reference per line. No numbering, no extra explanation. Do not fabricate references. If source verification is unavailable, state that limitation.\n\nTopic: ' + trim(options.topic);
  }

  function buildScholarPrompt(options) {
    options = options || {};
    const role = trim(options.role).toLowerCase();
    const roleKey = role === 'slide_editor' ? 'slide' : role;
    const instruction = scholarRoleInstructions[roleKey] || scholarRoleInstructions.default;
    return instruction + '\n\n' + trim(options.prompt || options.text);
  }

  function splitText(text, chunkSize) {
    const input = String(text == null ? '' : text);
    const size = Math.max(1, Math.round(finiteOr(chunkSize, 8000)));
    const chunks = [];
    for (let index = 0; index < input.length; index += size) chunks.push(input.slice(index, index + size));
    return chunks.length ? chunks : [''];
  }

  async function runChunks(client, options) {
    options = options || {};
    const chunks = splitText(options.text, options.chunkSize || 8000);
    const results = [];
    for (let index = 0; index < chunks.length; index += 1) {
      if (options.signal && options.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      if (typeof options.onProgress === 'function') options.onProgress(index, chunks.length);
      const result = await client.complete(Object.assign({}, options.request || {}, {
        prompt: options.prompt,
        userText: chunks[index],
        signal: options.signal
      }));
      results.push(result.text);
      if (typeof options.onProgress === 'function') options.onProgress(index + 1, chunks.length);
    }
    return { provider: 'lmstudio', model: client.getConfig().model, text: results.join('\n\n'), chunks: results };
  }

  const features = Object.freeze({
    deepResearch: Object.freeze({
      question: function (client, options) {
        options = options || {};
        return client.complete(Object.assign({ temperature: 0.5, maxTokens: 8192, timeoutMs: 300000 }, options.request || {}, { prompt: buildQuestionPrompt(options), signal: options.signal }));
      },
      academicSearch: function (client, options) {
        options = options || {};
        return client.complete(Object.assign({ temperature: 0.4, maxTokens: 8192, timeoutMs: 300000 }, options.request || {}, { prompt: buildResearchPrompt(options), signal: options.signal }));
      },
      dataResearch: function (client, options) {
        return features.deepResearch.academicSearch(client, options);
      },
      editor: function (client, options) {
        options = options || {};
        return client.complete(Object.assign({ temperature: 0.4, maxTokens: 8192, timeoutMs: 300000 }, options.request || {}, { prompt: buildEditorPrompt(options), signal: options.signal }));
      },
      localAgent: function (client, options) {
        options = options || {};
        const systemInstruction = 'You are a deep academic research assistant. Produce a structured, evidence-oriented research answer. If live web or database verification is unavailable, explicitly state that limitation and avoid fabricating citations.';
        return client.complete(Object.assign({ temperature: 0.4, maxTokens: 8192, timeoutMs: 600000 }, options.request || {}, { prompt: trim(options.prompt || options.question), systemInstruction: systemInstruction, signal: options.signal }));
      }
    }),
    translator: Object.freeze({
      run: function (client, options) {
        options = options || {};
        return runChunks(client, {
          text: options.text,
          prompt: trim(options.prompt) || 'You are a professional academic translator. Translate the following text in a natural formal style while preserving academic context.',
          chunkSize: options.chunkSize || 8000,
          signal: options.signal,
          onProgress: options.onProgress,
          request: Object.assign({ temperature: 0.4, maxTokens: 8192, timeoutMs: 60000 }, options.request || {})
        });
      }
    }),
    citations: Object.freeze({
      suggest: function (client, options) {
        options = typeof options === 'string' ? { topic: options } : (options || {});
        return client.complete(Object.assign({ temperature: 0.3, maxTokens: 4096, timeoutMs: 60000 }, options.request || {}, { prompt: buildCitationPrompt(options), signal: options.signal }));
      }
    }),
    scholar: Object.freeze({
      run: function (client, options) {
        options = options || {};
        return client.complete(Object.assign({ temperature: 0.35, maxTokens: 8192, timeoutMs: 90000 }, options.request || {}, {
          prompt: buildScholarPrompt(options),
          systemInstruction: trim(options.systemInstruction) || scholarSystemInstruction,
          signal: options.signal
        }));
      }
    })
  });

  const registry = Object.freeze({
    deepResearch: Object.freeze({ source: mdlive.sourceModules.deepResearch, methods: ['question', 'academicSearch', 'dataResearch', 'editor', 'localAgent'] }),
    translator: Object.freeze({ source: mdlive.sourceModules.translator, methods: ['run'] }),
    citations: Object.freeze({ source: mdlive.sourceModules.citationSearch, methods: ['suggest'] }),
    scholar: Object.freeze({ source: mdlive.sourceModules.liveAI, methods: ['run'] })
  });

  return Object.freeze({
    version: VERSION,
    defaults: defaults,
    settingsSchema: settingsSchema,
    endpoints: endpoints,
    storageKey: STORAGE_KEY,
    compatibility: Object.freeze({ mdlive: mdlive }),
    prompts: Object.freeze({
      deepResearch: Object.freeze({ presets: deepResearchPresets, styles: styleInstructions, verification: verificationInstruction, synthesis: synthesisInstruction }),
      scholar: Object.freeze({ system: scholarSystemInstruction, roles: scholarRoleInstructions })
    }),
    builders: Object.freeze({
      fillResearchTemplate: fillResearchTemplate,
      question: buildQuestionPrompt,
      research: buildResearchPrompt,
      editor: buildEditorPrompt,
      citation: buildCitationPrompt,
      scholar: buildScholarPrompt
    }),
    features: features,
    registry: registry,
    normalizeBaseUrl: normalizeBaseUrl,
    normalizeConfig: normalizeConfig,
    createClient: createClient,
    loadConfig: loadConfig,
    saveConfig: saveConfig,
    loadMdliveConfig: loadMdliveConfig,
    createFromMdliveSettings: createFromMdliveSettings
  });
});
