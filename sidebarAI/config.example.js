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

      // 필수: 이미지 생성 — Gemini 이미지 모델은 :generateContent, Imagen은 :predict
      generateImage: async function (prompt, options) {
        var key = getApiKey();
        if (!key) throw new Error('API 키 없음');
        var modelId = (options && options.modelId) || 'gemini-2.5-flash-image';
        var aspectRatio = (options && options.aspectRatio) || '1:1';
        var seed = options && options.seedImage;
        var hasSeed = seed && String(seed).indexOf('data:image') === 0;
        if (String(modelId).indexOf('imagen-') === 0 && !hasSeed) {
          var u1 = 'https://generativelanguage.googleapis.com/v1beta/models/' + modelId + ':predict?key=' + encodeURIComponent(key);
          var imP = (prompt || '').trim() || 'image';
          imP += (options && options.noText) ? ' No text.' : ' Scholarly figure style; labels OK.';
          var r1 = await fetch(u1, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ instances: [{ prompt: imP }], parameters: { sampleCount: 1, aspectRatio: aspectRatio, personGeneration: 'allow_adult' } }) });
          if (!r1.ok) throw new Error('Imagen: ' + r1.status);
          var d1 = await r1.json();
          var b1 = d1.generatedImages && d1.generatedImages[0] && d1.generatedImages[0].image && d1.generatedImages[0].image.imageBytes;
          return b1 ? 'data:image/png;base64,' + b1 : null;
        }
        if (String(modelId).indexOf('imagen-') === 0) modelId = 'gemini-2.5-flash-image';
        var u2 = 'https://generativelanguage.googleapis.com/v1beta/models/' + modelId + ':generateContent?key=' + encodeURIComponent(key);
        var simple = options && options.noText;
        var acad = '[Scholarly figure] For papers/lectures: clear diagram style, labels OK. ';
        var simp = '[Simple] No text or typography. ';
        var txt = (prompt || '').trim() || (hasSeed ? (simple ? 'Edit image. ' + simp : 'Scholarly adaptation. ' + acad) : (simple ? 'Image. ' + simp : 'Academic diagram. ' + acad));
        if (txt.indexOf('[Scholarly') < 0 && txt.indexOf('[Simple') < 0) txt += simple ? ' ' + simp : ' ' + acad;
        var parts = [];
        if (hasSeed) {
          var i = seed.indexOf(',');
          var mm = seed.match(/^data:([^;]+);/);
          parts.push({ inlineData: { mimeType: mm ? mm[1] : 'image/png', data: i >= 0 ? seed.slice(i + 1) : seed } });
        }
        parts.push({ text: txt });
        var r2 = await fetch(u2, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: parts }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: aspectRatio } } }) });
        if (!r2.ok) throw new Error('Gemini image: ' + r2.status);
        var d2 = await r2.json();
        var cand = d2.candidates && d2.candidates[0];
        var ps = cand && cand.content && cand.content.parts;
        if (ps) for (var j = 0; j < ps.length; j++) if (ps[j].inlineData && ps[j].inlineData.data) return 'data:' + (ps[j].inlineData.mimeType || 'image/png') + ';base64,' + ps[j].inlineData.data;
        throw new Error('이미지 없음');
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
        return localStorage.getItem('ss_image_model') || 'gemini-2.5-flash-image';
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
