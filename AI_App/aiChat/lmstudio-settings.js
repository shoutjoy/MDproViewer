/* LM Studio settings UI shared by AI Jena and ScholarAI. */
(function (root) {
  'use strict';

  var SETTINGS_ID = 'scholar-ai-provider-settings';

  function settingsMarkup() {
    return [
      '<div>',
      '  <p class="text-xs font-semibold text-slate-700 dark:text-slate-300">ScholarAI : LM Studio 설정</p>',
      '  <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-1">응답은 <code>/v1/chat/completions</code>, 현재 로드 모델 확인은 <code>/api/v1/models</code>를 사용합니다. 모델 변경은 LM Studio에서 수행합니다.</p>',
      '</div>',
      '<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">',
      '  <label class="text-xs text-slate-600 dark:text-slate-400">Base URL',
      '    <input id="settings-lmstudio-base-url" type="url" spellcheck="false" placeholder="http://127.0.0.1:5678/v1" class="mt-1 w-full px-2 py-1.5 border rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-600">',
      '  </label>',
      '  <label class="text-xs text-slate-600 dark:text-slate-400">API Key (선택)',
      '    <input id="settings-lmstudio-api-key" type="password" autocomplete="off" spellcheck="false" oninput="updateLMStudioApiKeyConnectionUI()" class="mt-1 w-full px-2 py-1.5 border rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-600">',
      '    <span id="settings-lmstudio-api-key-feedback" class="mt-1 text-[11px] min-h-[1rem] text-slate-500 dark:text-slate-400" aria-live="polite"></span>',
      '  </label>',
      '</div>',
      '<div class="rounded-md border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/80 p-2.5">',
      '  <div class="flex items-center justify-between gap-2">',
      '    <span class="text-xs font-semibold text-slate-700 dark:text-slate-300">LM Studio 현재 로드 모델</span>',
      '    <span id="settings-lmstudio-loaded-state" class="px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px]">확인 전</span>',
      '  </div>',
      '  <div id="settings-lmstudio-loaded-model" class="mt-2 px-2 py-2 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm font-semibold text-slate-800 dark:text-slate-100 break-all" aria-live="polite">확인 전</div>',
      '  <p id="settings-lmstudio-loaded-models-detail" class="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">앱에서 모델을 지정하지 않습니다. LM Studio에서 Load한 모델을 확인하여 자동으로 사용합니다.</p>',
      '</div>',
      '<div class="grid grid-cols-2 sm:grid-cols-4 gap-2">',
      '  <label class="text-xs text-slate-600 dark:text-slate-400">Temperature',
      '    <input id="settings-lmstudio-temperature" type="number" min="0" max="2" step="0.1" value="0.4" class="mt-1 w-full px-2 py-1.5 border rounded bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600">',
      '  </label>',
      '  <label class="text-xs text-slate-600 dark:text-slate-400">Max tokens',
      '    <input id="settings-lmstudio-max-tokens" type="number" min="1" step="1" value="8192" class="mt-1 w-full px-2 py-1.5 border rounded bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600">',
      '  </label>',
      '  <label class="text-xs text-slate-600 dark:text-slate-400">Timeout (초)',
      '    <input id="settings-lmstudio-timeout" type="number" min="1" step="1" value="90" class="mt-1 w-full px-2 py-1.5 border rounded bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600">',
      '  </label>',
      '  <label class="text-xs text-slate-600 dark:text-slate-400">Top P',
      '    <input id="settings-lmstudio-top-p" type="number" min="0" max="1" step="0.05" placeholder="기본값" class="mt-1 w-full px-2 py-1.5 border rounded bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600">',
      '  </label>',
      '</div>',
      '<div class="rounded-md border border-indigo-200 dark:border-indigo-900/70 bg-indigo-50/70 dark:bg-indigo-950/20 p-2.5">',
      '  <div class="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">AI Jena 출력 토큰</div>',
      '  <div class="grid grid-cols-2 gap-2">',
      '    <label class="text-xs text-slate-600 dark:text-slate-400">즉시응답 Max tokens',
      '      <input id="settings-aichat-quick-max-tokens" type="number" min="1" step="1" value="4096" class="mt-1 w-full px-2 py-1.5 border rounded bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600">',
      '    </label>',
      '    <label class="text-xs text-slate-600 dark:text-slate-400">추론 Max tokens',
      '      <input id="settings-aichat-reasoning-max-tokens" type="number" min="1" step="1" value="8192" class="mt-1 w-full px-2 py-1.5 border rounded bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600">',
      '    </label>',
      '  </div>',
      '  <label class="mt-2 block text-xs text-slate-600 dark:text-slate-400">추론 강도',
      '    <select id="settings-aichat-reasoning-level" class="mt-1 w-full px-2 py-1.5 border rounded bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600">',
      '      <option value="auto" selected>LM Studio 자동</option>',
      '      <option value="on">모델 기본 ON</option>',
      '      <option value="low">낮음 (low)</option>',
      '      <option value="medium">중간 (medium)</option>',
      '      <option value="high">높음 (high)</option>',
      '    </select>',
      '  </label>',
      '  <p class="mt-1.5 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">실제 출력은 로드 모델의 남은 컨텍스트 길이를 사용하며, 설정값은 모델이 보고한 한도를 넘지 않습니다. 모델이 선택한 추론 강도를 지원하지 않으면 LM Studio 자동 설정으로 재시도합니다.</p>',
      '</div>',
      '<div class="flex flex-wrap items-center gap-2">',
      '  <button type="button" onclick="saveScholarAIProviderSettingsFromUI(true)" class="px-2 py-1.5 rounded bg-indigo-600 text-white text-xs hover:bg-indigo-700">LM 설정 저장</button>',
      '  <button type="button" onclick="loadSettingsLMStudioModels()" class="px-2 py-1.5 rounded border border-slate-300 dark:border-slate-600 text-xs">현재 로드 모델 확인</button>',
      '  <button type="button" onclick="testSettingsLMStudioConnection()" class="px-2 py-1.5 rounded border border-slate-300 dark:border-slate-600 text-xs">LM 연결 테스트</button>',
      '  <button type="button" onclick="loadSettingsGeminiModels()" class="px-2 py-1.5 rounded border border-slate-300 dark:border-slate-600 text-xs">Gemini 모델 불러오기</button>',
      '</div>',
      '<p id="settings-scholar-ai-provider-status" class="text-xs min-h-[1.25rem] text-slate-500 dark:text-slate-400" aria-live="polite"></p>',
      '<div class="flex flex-wrap gap-x-3 gap-y-1 text-xs">',
      '  <a href="https://lmstudio.ai/download" target="_blank" rel="noopener noreferrer" class="text-indigo-600 dark:text-indigo-400 hover:underline">LM Studio 다운로드</a>',
      '  <a href="https://ollama.com/download" target="_blank" rel="noopener noreferrer" class="text-indigo-600 dark:text-indigo-400 hover:underline">Ollama 다운로드</a>',
      '  <a href="https://ollama.com/search" target="_blank" rel="noopener noreferrer" class="text-indigo-600 dark:text-indigo-400 hover:underline">Ollama 모델 찾기</a>',
      '</div>'
    ].join('\n');
  }

  function render(target) {
    var container = target || document.getElementById(SETTINGS_ID);
    if (!container) return false;
    container.innerHTML = settingsMarkup();
    container.setAttribute('data-ai-chat-settings-ui', 'lmstudio');
    return true;
  }

  root.AIChatLMStudioSettings = Object.freeze({
    render: render,
    markup: settingsMarkup
  });

  if (!render() && document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { render(); }, { once: true });
  }
})(window);
