/**
 * sidebarAI - Host App Config Example
 *
 * Host 앱은 뷰어 창(또는 iframe)에 로드되기 전에 window.SidebarAIConfig를 설정해야 합니다.
 * host를 사용하면 window.opener의 메서드를 자동으로 호출합니다.
 * callbacks를 사용하면 host 없이도 독립 실행이 가능합니다.
 */

(function () {
  'use strict';

  // ========== 옵션 1: host 사용 (팝업 창에서 window.opener 활용) ==========
  if (typeof window.opener !== 'undefined' && window.opener) {
    window.SidebarAIConfig = {
      host: window.opener,
      // crop-editor.html 경로 (선택)
      cropEditorBase: './'
    };
    return;
  }

  // ========== 옵션 2: callbacks만 사용 (독립 실행, API 직접 제공) ==========
  window.SidebarAIConfig = {
    host: null,
    cropEditorBase: './',
    callbacks: {
      // 필수: Gemini 텍스트 API
      callGemini: async function (prompt, systemInstruction, useSearch, modelOverride) {
        var key = getApiKey();
        var modelId = modelOverride || 'gemini-2.5-flash';
        var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + modelId + ':generateContent?key=' + key;
        var payload = { contents: [{ parts: [{ text: prompt }] }] };
        if (systemInstruction) payload.systemInstruction = { parts: [{ text: systemInstruction }] };
        if (useSearch) payload.tools = [{ googleSearch: {} }];
        var res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!res.ok) throw new Error('API Error: ' + res.status);
        var data = await res.json();
        var text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        return { text: text };
      },

      // 필수: 이미지 생성 API
      generateImage: async function (prompt, options) {
        var key = getApiKey();
        var modelId = (options && options.modelId) || 'gemini-3.1-flash-image-preview';
        var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + modelId + ':generateImages?key=' + key;
        var body = {
          instances: [{ prompt: prompt || '', image: options?.seedImage ? { bytesBase64Encoded: options.seedImage.split(',')[1] } : undefined }].filter(Boolean),
          parameters: {
            sampleCount: 1,
            aspectRatio: (options && options.aspectRatio) || '1:1',
            outputOptions: { mimeType: 'image/png' },
            personGeneration: 'DONT_ALLOW'
          }
        };
        if (options?.noText) body.parameters.personGeneration = 'DONT_ALLOW';
        var res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok) throw new Error('Image API Error: ' + res.status);
        var data = await res.json();
        var b64 = data.predictions?.[0]?.bytesBase64Encoded;
        return b64 ? 'data:image/png;base64,' + b64 : null;
      },

      // 필수: API 키
      getApiKey: function () {
        return localStorage.getItem('ss_gemini_api_key') || '';
      },

      // ScholarAI 사전 프롬프트
      getScholarAISystemInstruction: function () {
        return localStorage.getItem('ss_scholar_ai_system') || '';
      },
      setScholarAISystemInstruction: function (text) {
        localStorage.setItem('ss_scholar_ai_system', text || '');
      },

      // ScholarAI 모델
      getScholarAIModelId: function () {
        return localStorage.getItem('ss_scholar_ai_model') || 'gemini-2.5-pro';
      },
      setScholarAIModelId: function (id) {
        localStorage.setItem('ss_scholar_ai_model', id || '');
      },

      // 이미지 모델
      getImageModelId: function () {
        return localStorage.getItem('ss_image_model') || 'gemini-3.1-flash-image-preview';
      },

      // 작업 중단
      abortCurrentTask: function () {
        if (window._abortController) window._abortController.abort();
      },

      // 뷰어 콘텐츠 (편집/저장 시)
      setViewerContent: function (text, type) {
        console.log('setViewerContent', type, text?.length);
      },
      getViewerRenderedContent: function (text) {
        if (typeof marked !== 'undefined') return marked.parse(text || '');
        return (text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
      }
    }
  };

  function getApiKey() {
    var fn = window.SidebarAIConfig?.callbacks?.getApiKey;
    if (typeof fn === 'function') return fn();
    throw new Error('NO_API_KEY');
  }
})();
