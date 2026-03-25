/**
 * sidebarAI - ScholarAI & SSPAI Core Logic (Portable Module)
 * Extracted from viewer-standalone.js
 *
 * Host app provides callbacks via window.SidebarAIConfig:
 *   callGemini, generateImage, getApiKey, getScholarAISystemInstruction,
 *   setScholarAISystemInstruction, getScholarAIModelId, setScholarAIModelId,
 *   getImageModelId, abortCurrentTask, setViewerContent, getViewerRenderedContent
 *
 * @example
 *   window.SidebarAIConfig = {
 *     host: window.opener,  // or null to use callbacks only
 *     callbacks: { callGemini, generateImage, ... }
 *   };
 */
(function () {
  'use strict';
  if (typeof window.__sidebarAILoaded !== 'undefined') return;
  window.__sidebarAILoaded = true;

  var SIDEBAR_AI_HTML = String.raw`
<div class="scholar-ai-sidebar" id="scholar-ai-sidebar">
  <div class="scholar-ai-resize-handle" id="scholar-ai-resize-handle" title="????????癲????????????????????????????????????????????????????????></div>
  <div class="scholar-ai-inner">
    <div class="scholar-ai-header">
      <h3>ScholarAI</h3>
      <span>
        <button type="button" class="sa-btn" onclick="scholarAIShrink()" title="???????????????ㅻ깹?????>&gt;???????????????ㅻ깹?????/button>
        <button type="button" class="sa-btn" onclick="scholarAIFullscreen()" title="?????????????????怨뺤떪???????>???????????熬곣뫖利당춯??쎾퐲???????????????????꿔꺂?㏘틠??怨몄젦??????????/button>
      </span>
    </div>
    <div class="scholar-ai-body">
      <div class="scholar-ai-options-row" style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">
        <button type="button" class="sa-btn ghost" id="sa-pre-prompt-btn" onclick="toggleScholarAIPrePrompt()" style="font-size:11px">??????????????熬곣뫖利당춯??쎾퐲???????????????????꿔꺂?㏘틠??怨몄젦?????????????????????????/button>
        <button type="button" class="sa-btn ghost" id="sa-model-btn" onclick="toggleScholarAIModelSelect()" style="font-size:11px">?????????????????????????????????????????/button>
      </div>
      <div id="scholar-ai-pre-prompt-panel" class="scholar-ai-collapse-panel" style="display:none;margin-bottom:8px">
        <textarea id="scholar-ai-pre-prompt-text" class="scholar-ai-pre-prompt-ta" placeholder="???????????????熬곣뫖利당춯??쎾퐲???????????????????꿔꺂?㏘틠??怨몄젦?????????????????????????????????????????????????????????????????????????ш끽維뽳쭩?뱀땡???얩맪??????????????????????癲??????????????????????筌???? ???????????熬곣뫖利당춯??쎾퐲???????????????????꿔꺂?㏘틠??怨몄젦???????????????????????ㅻ깹??????????????????????????????嶺??" style="font-size:11px;line-height:1.5;min-height:120px;max-height:400px;resize:vertical;margin:0;padding:8px;background:#1a1e28;border-radius:4px;border:1px solid #2e3447;color:#fff;width:100%;box-sizing:border-box;display:block"></textarea>
      </div>
      <div id="scholar-ai-model-panel" class="scholar-ai-collapse-panel" style="display:none;margin-bottom:8px">
        <label style="font-size:10px;margin-bottom:4px">???????????????????????????/label>
        <select id="scholar-ai-model-select" class="sa-model-select" style="width:100%;padding:6px 8px;font-size:11px;border:1px solid #2e3447;border-radius:4px;background:#1a1e28;color:#b0bac8">
          <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
          <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
          <option value="gemini-3-flash-preview">Gemini 3 Flash</option>
          <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite</option>
          <option value="gemini-2.0-flash-exp">Gemini 2.0 Flash Exp</option>
        </select>
      </div>
      <label>???????????????????????????????????????????????????????????椰???????????</label>
      <textarea id="scholar-ai-selected" placeholder="??????????????????????椰???????????? ??????????????????????????????????????癲?????????? ?????????????????????????癲??????????"></textarea>
      <div class="scholar-ai-prompt-wrap" id="scholar-ai-prompt-wrap">
        <label>???????????熬곣뫖利당춯??쎾퐲???????????????????꿔꺂?㏘틠??怨몄젦?????????????????????????????????/label>
        <textarea id="scholar-ai-prompt" placeholder="???????????????????????????????????????????????????????????????????????????????????? ???????????????????????癲??????????????????????筌????></textarea>
        <div class="scholar-ai-prompt-resize-handle" id="scholar-ai-prompt-resize-handle" title="????????癲?????????????????????????????????????????熬곣뫖利당춯??쎾퐲???????????????????꿔꺂?㏘틠??怨몄젦????????????????????????????????????????????????????됰Ŧ???????????????????????></div>
      </div>
      <button type="button" class="sa-btn" style="background:#4f8ef7;color:#fff;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px" onclick="scholarAIRun()">????????</button>
      <div class="scholar-ai-result-wrap" id="scholar-ai-result-wrap">
        <label>??????耀붾굝??????筌뤾퍓彛???????????????濾??????????????????????롮쾸?椰?癲ル슢?ｆ쾮????/label>
        <textarea id="scholar-ai-result" class="scholar-ai-result" placeholder="???????? ????????耀붾굝??????筌뤾퍓彛????????????????椰????????? ?????????????癲?????????? ???????????????????????ш끽維뽳쭩?뱀땡???얩맪?????????????????????????????????????????⑤벡瑜?????????????????????????嶺??"></textarea>
        <div class="scholar-ai-result-resize-handle" id="scholar-ai-result-resize-handle" title="????????癲????????????????????????????????????耀붾굝??????筌뤾퍓彛???????????????濾??????????????????????롮쾸?椰?癲ル슢?ｆ쾮???????????????????????????됰Ŧ???????????????????????></div>
      </div>
    </div>
    <div class="scholar-ai-footer">
      <div class="scholar-ai-insert-wrap">
        <button type="button" class="sa-btn ghost" onclick="handleScholarAIInsertClick()">?????????????/button>
        <div class="scholar-ai-insert-menu" id="scholar-ai-insert-menu">
          <button type="button" onclick="scholarAIInsertDoc(0); closeScholarAIInsertMenu()">????????????????????????熬곣뫖利당춯??쎾퐲???????????????????꿔꺂?㏘틠??怨몄젦???????/button>
          <button type="button" onclick="scholarAIInsertDoc(1); closeScholarAIInsertMenu()">????????????????????諛몃마嶺뚮?????????????硫λ젒?????????????????????????????熬곣뫖利당춯??쎾퐲???????????????????꿔꺂?㏘틠??怨몄젦???????/button>
          <button type="button" onclick="scholarAIInsertDoc(2); closeScholarAIInsertMenu()">?????????????????????????????????/button>
        </div>
      </div>
      <button type="button" class="sa-btn ghost" onclick="scholarAIResultZoomOpen()" title="??????耀붾굝??????筌뤾퍓彛???????????????????????????????????怨뺤떪???????>????????耀붾굝??????筌뤾퍓彛??????????????????????????怨뺤떪???????/button>
      <span class="sa-font">font</span>
      <button type="button" class="sa-btn ghost" onclick="scholarAIResultFont(-1)">-</button>
      <button type="button" class="sa-btn ghost" onclick="scholarAIResultFont(1)">+</button>
      <button type="button" class="sa-btn" onclick="scholarAICopyResult()">??????耀붾굝??????筌뤾퍓彛?????????????????????癲됱빖???嶺??亦껋꼦????????/button>
      <button type="button" class="sa-btn ghost" onclick="scholarAIClearResult()" title="??????耀붾굝??????筌뤾퍓彛???????????????濾??????????????????????롮쾸?椰?癲ル슢?ｆ쾮???????????????????????????????????????????????ㅻ깹?????>??????耀붾굝??????筌뤾퍓彛???????????????濾??????????????????????롮쾸?椰?癲ル슢?ｆ쾮?????????????????????????????????ㅻ깹?????/button>
    </div>
    <div id="scholar-ai-result-zoom-overlay" class="scholar-ai-result-zoom-overlay" onclick="if(event.target.id==='scholar-ai-result-zoom-overlay') scholarAIResultZoomClose()">
      <div class="scholar-ai-result-zoom-box" onclick="event.stopPropagation()">
        <div class="scholar-ai-result-zoom-header">
          <span>???????? ??????耀붾굝??????筌뤾퍓彛??????????????????????????怨뺤떪???????/span>
          <button type="button" class="sa-btn ghost" onclick="scholarAIResultZoomClose()" style="font-size:12px">???????/button>
        </div>
        <div class="scholar-ai-result-zoom-body">
          <textarea id="scholar-ai-result-zoom-ta" placeholder="??????耀붾굝??????筌뤾퍓彛????????????????椰????????? ??????????????????癲??????????"></textarea>
        </div>
      </div>
    </div>
    <div class="scholar-ai-history">
      <label>???????????????怨뺤떪????????????/label>
      <input type="text" id="scholar-ai-history-search" placeholder="???????????????怨뺤떪??????????????????耀붾굝??????筌뤾퍓彛?????????." class="scholar-ai-history-search">
      <div id="scholar-ai-history-list" class="scholar-ai-history-list"></div>
      <button type="button" class="sa-btn ghost" onclick="scholarAIHistorySaveAll()" style="margin-top:4px">???????????????怨뺤떪???????????????????????熬곣뫖利당춯??쎾퐲???????????????????꿔꺂?㏘틠??怨몄젦?????/button>
    </div>
  </div>
</div>

<div class="ssp-ai-sidebar" id="ssp-ai-sidebar">
  <div class="ssp-inner">
    <div class="ssp-header">
      <h3>???SSP ?????????????????? ????????????諛몃마嶺뚮?????????????硫λ젒????????????/h3>
      <button type="button" class="sa-btn ghost" onclick="sspAIShrink()" style="font-size:10px">X ???????/button>
    </div>
    <div class="ssp-main">
      <div id="ssp-upload-zone" class="ssp-upload" onclick="document.getElementById('ssp-file-input').click()" title="??????????????????癲?????????????????????????????????????>
        ?????????????????? ???????(JPG, PNG, GIF, WebP)<br><small>?????Ctrl+V ????????????????????椰????????????/small>
      </div>
      <input type="file" id="ssp-file-input" accept="image/*" style="display:none">
      <label>???????????熬곣뫖利당춯??쎾퐲???????????????????꿔꺂?㏘틠??怨몄젦?????????????????????????1 (???????????????癲??????????????????????????? ????????????????????????????怨뺤떪??????</label>
      <textarea id="ssp-prompt" placeholder="?? ??????????????????泥???????????????????????????嶺?????????????????????????????????????怨뺤떪??????></textarea>
      <label>???????????熬곣뫖利당춯??쎾퐲???????????????????꿔꺂?㏘틠??怨몄젦?????????????????????????2 (???????????????ㅻ깹???? ???????????????? ???????? ??1+2 ??????????????????????</label>
      <textarea id="ssp-prompt-2" placeholder="?? ???????????꾩룆梨띰쭕?뚢뵾??????????????嶺뚮죭?댁젘????????????????????怨뺤떪????????? ?????????????????? ????????????거????????????? ?????></textarea>
      <label>?????????????????? ????????????諛몃마嶺뚮?????????????硫λ젒??????????????????????????????????????/label>
      <select id="ssp-model">
        <option value="gemini-3.1-flash-image-preview">Nano Banana 2</option>
        <option value="gemini-2.5-flash-image">Nano Banana</option>
        <option value="gemini-3-pro-image-preview">Nano Banana Pro</option>
        <option value="imagen-4.0-generate-001">Imagen 4</option>
      </select>
      <label>?????????????????? ?????/label>
      <div class="ssp-ratio-wrap">
        <button type="button" class="ssp-ratio-btn active" data-ratio="1:1">1:1</button>
        <button type="button" class="ssp-ratio-btn" data-ratio="16:9">16:9</button>
        <button type="button" class="ssp-ratio-btn" data-ratio="9:16">9:16</button>
        <button type="button" class="ssp-ratio-btn" data-ratio="4:3">4:3</button>
        <button type="button" class="ssp-ratio-btn" data-ratio="3:4">3:4</button>
      </div>
      <label style="font-size:10px;color:#64748b;display:block;margin-bottom:4px">???????? ??????????????????泥????????????????????????????/label>
      <label><input type="checkbox" id="ssp-no-text"> ???????????????????????? (??????????椰?????????????????????????????????????</label>
      <div class="ssp-action-row">
        <button type="button" class="sa-btn ssp-btn-generate" onclick="viewerSSPGenerate()">???AI ?????/button>
        <button type="button" class="sa-btn ssp-btn-imgbb" onclick="viewerSSPOpenImgbb()" title="imgBB??????????????諛몃마嶺뚮?????????????硫λ젒????????????????????????????????????????????????????????????>[imgBB] ???????/button>
        <button type="button" class="sa-btn ghost ssp-btn-imgbb-settings" onclick="viewerSSPToggleImgbbSettings()" title="imgBB API ??????????????????>????????????????/button>
      </div>
      <div id="ssp-imgbb-settings" class="ssp-imgbb-settings" style="display:none;margin:8px 0;padding:10px;border:1px solid #cbd5e1;border-radius:10px;background:rgba(248,250,252,0.9)">
        <label for="ssp-imgbb-api-key" style="display:block;font-size:11px;font-weight:700;color:#334155;margin-bottom:6px">imgBB API ??/label>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <input type="password" id="ssp-imgbb-api-key" class="ssp-image-link-input" placeholder="imgBB API key" autocomplete="off" spellcheck="false" style="flex:1 1 220px;min-width:180px">
          <button type="button" class="sa-btn ghost" onclick="viewerSSPSaveImgbbSettings()">????/button>
        </div>
        <div id="ssp-imgbb-settings-status" style="margin-top:6px;font-size:10px;color:#64748b">API ??? ?????????????????⑤벡瑜??????????????????????諛몃마嶺뚮?????????????硫λ젒??????????????????????????????????????????꾩룆梨띰쭕?뚢뵾??????????????嶺뚮죭?댁젘????????????imgBB???????????????????????????????????????嶺??</div>
      </div>
      <label class="ssp-img-link-label">?????????????????? URL ??????????????????????????????????? ??????(???????????????????????ш끽維뽳쭩?뱀땡???얩맪??????????????????????????????????????????</label>
      <div class="ssp-img-link-row">
        <input type="url" id="ssp-image-link-url" class="ssp-image-link-input" placeholder="https://i.ibb.co/??(imgBB ??" inputmode="url">
        <button type="button" class="sa-btn ghost ssp-btn-insert-md" onclick="sspInsertImageMarkdown()">??????/button>
      </div>
      <div id="ssp-progress-wrap" class="ssp-progress-wrap">
        <div class="ssp-progress-bar">
          <div id="ssp-progress-fill" class="ssp-progress-fill"></div>
        </div>
        <div class="ssp-progress-row">
          <span id="ssp-progress-pct" style="font-size:10px;color:#94a3b8">0%</span>
          <button type="button" class="sa-btn ghost" style="font-size:10px" onclick="viewerSSPAbort()">????????????諛몃마嶺뚮?????????????硫λ젒?????????????????????????</button>
        </div>
      </div>
      <div id="ssp-status" class="ssp-status"></div>
      <img id="ssp-result-img" class="ssp-result" style="display:none" alt="????????????諛몃마嶺뚮?????????????硫λ젒?????????????????耀붾굝??????筌뤾퍓彛????????? onclick="if(this.src) viewerSSPOpenFullscreen(this.src)" title="???????????????????????????怨뺤떪???????>
      <button type="button" class="sa-btn ghost" style="margin-top:8px" onclick="viewerSSPDownload()" id="ssp-download-btn" disabled>????????????????????????????????????????/button>
    </div>
    <div class="ssp-img-history" style="margin-top:12px;border-top:1px solid #2e3447;padding-top:8px">
      <label style="font-size:10px;color:#94a3b8;display:block;margin-bottom:6px">?????????????????? ????????????諛몃마嶺뚮?????????????硫λ젒??????????????????????????怨뺤떪????????????/label>
      <div id="ssp-img-history-list" class="ssp-img-history-list"></div>
    </div>
  </div>
</div>

<div id="viewer-fs-overlay" class="viewer-fs-overlay" onclick="if(event.target.id==='viewer-fs-overlay'||event.target.id==='viewer-fs-area') viewerSSPCloseFullscreen()">
  <div class="viewer-fs-toolbar" onclick="event.stopPropagation()">
    <button type="button" onclick="viewerSSPFsZoom(-0.25)" title="???????????????ㅻ깹?????>-</button>
    <span id="viewer-fs-zoom-val" style="min-width:40px;text-align:center;font-size:12px">100%</span>
    <button type="button" onclick="viewerSSPFsZoom(0.25)" title="???">+</button>
    <button type="button" onclick="viewerSSPFsDownload()" title="Download">Download</button>
    <button type="button" class="viewer-fs-imgbb-btn" onclick="viewerSSPFsUploadImgbb()" title="Upload to imgBB">imgBB Upload</button>
    <button type="button" class="viewer-fs-insert-btn" onclick="viewerSSPFsInsert()" title="Insert into document">Insert</button>
    <button type="button" onclick="viewerSSPFsCrop()" title="Crop">Crop</button>
    <button type="button" onclick="viewerSSPCloseFullscreen()" title="Close">Close</button>
  </div>
  <div class="viewer-fs-area" id="viewer-fs-area">
    <div class="viewer-fs-wrap" id="viewer-fs-wrap"><img id="viewer-fs-img" alt=""></div>
  </div>
</div>`;

  var CLEAN_SIDEBAR_AI_HTML = String.raw`
<div class="scholar-ai-sidebar" id="scholar-ai-sidebar">
  <div class="scholar-ai-resize-handle" id="scholar-ai-resize-handle" title="Drag to resize"></div>
  <div class="scholar-ai-inner">
    <div class="scholar-ai-header">
      <h3>ScholarAI</h3>
      <span>
        <button type="button" class="sa-btn" onclick="scholarAIShrink()" title="Close">&gt;축소</button>
        <button type="button" class="sa-btn" onclick="scholarAIFullscreen()" title="Fullscreen">전체화면</button>
      </span>
    </div>
    <div class="scholar-ai-body">
      <div class="scholar-ai-options-row" style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">
        <button type="button" class="sa-btn ghost" id="sa-pre-prompt-btn" onclick="toggleScholarAIPrePrompt()" style="font-size:11px">사전프롬프트</button>
        <button type="button" class="sa-btn ghost" id="sa-model-btn" onclick="toggleScholarAIModelSelect()" style="font-size:11px">모델선택</button>
      </div>
      <div id="scholar-ai-pre-prompt-panel" class="scholar-ai-collapse-panel" style="display:none;margin-bottom:8px">
        <textarea id="scholar-ai-pre-prompt-text" class="scholar-ai-pre-prompt-ta" placeholder="시스템 지침이나 자주 쓰는 프롬프트를 적어두세요." style="font-size:11px;line-height:1.5;min-height:120px;max-height:400px;resize:vertical;margin:0;padding:8px;background:#1a1e28;border-radius:4px;border:1px solid #2e3447;color:#fff;width:100%;box-sizing:border-box;display:block"></textarea>
      </div>
      <div id="scholar-ai-model-panel" class="scholar-ai-collapse-panel" style="display:none;margin-bottom:8px">
        <label style="font-size:10px;margin-bottom:4px">모델</label>
        <select id="scholar-ai-model-select" class="sa-model-select" style="width:100%;padding:6px 8px;font-size:11px;border:1px solid #2e3447;border-radius:4px;background:#1a1e28;color:#b0bac8">
          <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
          <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
          <option value="gemini-3-flash-preview">Gemini 3 Flash</option>
          <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite</option>
          <option value="gemini-2.0-flash-exp">Gemini 2.0 Flash Exp</option>
        </select>
      </div>
      <label>선택 텍스트</label>
      <textarea id="scholar-ai-selected" placeholder="문서에서 선택한 내용이 여기에 들어옵니다."></textarea>
      <div class="scholar-ai-prompt-wrap" id="scholar-ai-prompt-wrap">
        <label>질문 / 지시</label>
        <textarea id="scholar-ai-prompt" placeholder="요약, 설명, 비교, 문제 생성 등 원하는 작업을 입력하세요."></textarea>
        <div class="scholar-ai-prompt-resize-handle" id="scholar-ai-prompt-resize-handle" title="Resize prompt"></div>
      </div>
      <button type="button" class="sa-btn" style="background:#4f8ef7;color:#fff;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px" onclick="scholarAIRun()">실행</button>
      <div class="scholar-ai-result-wrap" id="scholar-ai-result-wrap">
        <label>결과</label>
        <textarea id="scholar-ai-result" class="scholar-ai-result" placeholder="실행 결과가 여기에 표시됩니다."></textarea>
        <div class="scholar-ai-result-resize-handle" id="scholar-ai-result-resize-handle" title="Resize result"></div>
      </div>
    </div>
    <div class="scholar-ai-footer">
      <div class="scholar-ai-insert-wrap">
        <button type="button" class="sa-btn ghost" onclick="handleScholarAIInsertClick()">문서삽입</button>
        <div class="scholar-ai-insert-menu" id="scholar-ai-insert-menu">
          <button type="button" onclick="scholarAIInsertDoc(0); closeScholarAIInsertMenu()">커서 위치</button>
          <button type="button" onclick="scholarAIInsertDoc(1); closeScholarAIInsertMenu()">문서 끝</button>
          <button type="button" onclick="scholarAIInsertDoc(2); closeScholarAIInsertMenu()">선택 대체</button>
        </div>
      </div>
      <button type="button" class="sa-btn ghost" onclick="scholarAIResultZoomOpen()" title="Zoom result">결과 크게보기</button>
      <span class="sa-font">font</span>
      <button type="button" class="sa-btn ghost" onclick="scholarAIResultFont(-1)">-</button>
      <button type="button" class="sa-btn ghost" onclick="scholarAIResultFont(1)">+</button>
      <button type="button" class="sa-btn" onclick="scholarAICopyResult()">복사</button>
      <button type="button" class="sa-btn ghost" onclick="scholarAIClearResult()" title="Clear result">지우기</button>
    </div>
    <div id="scholar-ai-result-zoom-overlay" class="scholar-ai-result-zoom-overlay" onclick="if(event.target.id==='scholar-ai-result-zoom-overlay') scholarAIResultZoomClose()">
      <div class="scholar-ai-result-zoom-box" onclick="event.stopPropagation()">
        <div class="scholar-ai-result-zoom-header">
          <span>결과 크게 보기</span>
          <button type="button" class="sa-btn ghost" onclick="scholarAIResultZoomClose()" style="font-size:12px">닫기</button>
        </div>
        <div class="scholar-ai-result-zoom-body">
          <textarea id="scholar-ai-result-zoom-ta" placeholder="결과가 여기에 표시됩니다."></textarea>
        </div>
      </div>
    </div>
    <div class="scholar-ai-history">
      <label>히스토리</label>
      <input type="text" id="scholar-ai-history-search" placeholder="히스토리 검색" class="scholar-ai-history-search">
      <div id="scholar-ai-history-list" class="scholar-ai-history-list"></div>
      <button type="button" class="sa-btn ghost" onclick="scholarAIHistorySaveAll()" style="margin-top:4px">전체 저장</button>
    </div>
  </div>
</div>

<div class="ssp-ai-sidebar" id="ssp-ai-sidebar">
  <div class="ssp-inner">
    <div class="ssp-header">
      <h3>SSP 이미지 생성기</h3>
      <button type="button" class="sa-btn ghost" onclick="sspAIShrink()" style="font-size:10px">닫기</button>
    </div>
    <div class="ssp-main">
      <div id="ssp-upload-zone" class="ssp-upload" onclick="document.getElementById('ssp-file-input').click()" title="Click to upload">
        이미지 업로드 (JPG, PNG, GIF, WebP)<br><small>또는 Ctrl+V 붙여넣기</small>
      </div>
      <input type="file" id="ssp-file-input" accept="image/*" style="display:none">
      <label>프롬프트 1</label>
      <textarea id="ssp-prompt" placeholder="예: 학술용 다이어그램 스타일로 변환"></textarea>
      <label>프롬프트 2</label>
      <textarea id="ssp-prompt-2" placeholder="예: 배경은 흰색, 설명은 한글로"></textarea>
      <label>이미지 생성 모델</label>
      <select id="ssp-model">
        <option value="gemini-3.1-flash-image-preview">Nano Banana 2</option>
        <option value="gemini-2.5-flash-image">Nano Banana</option>
        <option value="gemini-3-pro-image-preview">Nano Banana Pro</option>
        <option value="imagen-4.0-generate-001">Imagen 4</option>
      </select>
      <label>이미지 비율</label>
      <div class="ssp-ratio-wrap">
        <button type="button" class="ssp-ratio-btn active" data-ratio="1:1">1:1</button>
        <button type="button" class="ssp-ratio-btn" data-ratio="16:9">16:9</button>
        <button type="button" class="ssp-ratio-btn" data-ratio="9:16">9:16</button>
        <button type="button" class="ssp-ratio-btn" data-ratio="4:3">4:3</button>
        <button type="button" class="ssp-ratio-btn" data-ratio="3:4">3:4</button>
      </div>
      <label style="font-size:10px;color:#64748b;display:block;margin-bottom:4px">기본: 학술/논문용 도표 스타일</label>
      <label><input type="checkbox" id="ssp-no-text"> 순수 이미지 (텍스트 없음)</label>
      <div class="ssp-action-row">
        <button type="button" class="sa-btn ssp-btn-generate" onclick="viewerSSPGenerate()">AI 생성</button>
        <button type="button" class="sa-btn ssp-btn-imgbb" onclick="viewerSSPOpenImgbb()" title="Upload to imgBB">[imgBB] 업로드</button>
        <button type="button" class="sa-btn ghost ssp-btn-imgbb-settings" onclick="viewerSSPToggleImgbbSettings()" title="imgBB settings">설정</button>
      </div>
      <div id="ssp-imgbb-settings" class="ssp-imgbb-settings" style="display:none;margin:8px 0;padding:10px;border:1px solid #cbd5e1;border-radius:10px;background:rgba(248,250,252,0.9)">
        <label for="ssp-imgbb-api-key" style="display:block;font-size:11px;font-weight:700;color:#334155;margin-bottom:6px">imgBB API 키</label>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <input type="password" id="ssp-imgbb-api-key" class="ssp-image-link-input" placeholder="imgBB API key" autocomplete="off" spellcheck="false" style="flex:1 1 220px;min-width:180px">
          <button type="button" class="sa-btn ghost" onclick="viewerSSPSaveImgbbSettings()">저장</button>
        </div>
        <div id="ssp-imgbb-settings-status" style="margin-top:6px;font-size:10px;color:#64748b">API 키를 저장하면 imgBB 업로드를 바로 사용할 수 있습니다.</div>
      </div>
      <label class="ssp-img-link-label">Image URL - Insert (Markdown / HTML)</label>
      <div class="ssp-img-link-row">
        <input type="url" id="ssp-image-link-url" class="ssp-image-link-input" placeholder="https://i.ibb.co/... (imgBB)" inputmode="url">
        <button type="button" class="sa-btn ghost ssp-btn-insert-md" onclick="sspInsertImageMarkdown()">Markdown</button>
      </div>
      <div id="ssp-progress-wrap" class="ssp-progress-wrap">
        <div class="ssp-progress-bar">
          <div id="ssp-progress-fill" class="ssp-progress-fill"></div>
        </div>
        <div class="ssp-progress-row">
          <span id="ssp-progress-pct" style="font-size:10px;color:#94a3b8">0%</span>
          <button type="button" class="sa-btn ghost" style="font-size:10px" onclick="viewerSSPAbort()">생성중지</button>
        </div>
      </div>
      <div id="ssp-status" class="ssp-status"></div>
      <img id="ssp-result-img" class="ssp-result" style="display:none" alt="Generated image" onclick="if(this.src) viewerSSPOpenFullscreen(this.src)" title="Open fullscreen">
      <button type="button" class="sa-btn ghost" style="margin-top:8px" onclick="viewerSSPDownload()" id="ssp-download-btn" disabled>다운로드</button>
    </div>
    <div class="ssp-img-history" style="margin-top:12px;border-top:1px solid #2e3447;padding-top:8px">
      <label style="font-size:10px;color:#94a3b8;display:block;margin-bottom:6px">이미지 히스토리</label>
      <div id="ssp-img-history-list" class="ssp-img-history-list"></div>
    </div>
  </div>
</div>

<div id="viewer-fs-overlay" class="viewer-fs-overlay" onclick="if(event.target.id==='viewer-fs-overlay'||event.target.id==='viewer-fs-area') viewerSSPCloseFullscreen()">
  <div class="viewer-fs-toolbar" onclick="event.stopPropagation()">
    <button type="button" onclick="viewerSSPFsZoom(-0.25)" title="Zoom out">-</button>
    <span id="viewer-fs-zoom-val" style="min-width:40px;text-align:center;font-size:12px">100%</span>
    <button type="button" onclick="viewerSSPFsZoom(0.25)" title="Zoom in">+</button>
    <button type="button" onclick="viewerSSPFsDownload()" title="Download">Download</button>
    <button type="button" class="viewer-fs-imgbb-btn" onclick="viewerSSPFsUploadImgbb()" title="Upload to imgBB">imgBB Upload</button>
    <button type="button" class="viewer-fs-insert-btn" onclick="viewerSSPFsInsert()" title="Insert into document">Insert</button>
    <button type="button" onclick="viewerSSPFsCrop()" title="Crop">Crop</button>
    <button type="button" onclick="viewerSSPCloseFullscreen()" title="Close">Close</button>
  </div>
  <div class="viewer-fs-area" id="viewer-fs-area">
    <div class="viewer-fs-wrap" id="viewer-fs-wrap"><img id="viewer-fs-img" alt=""></div>
  </div>
</div>`;

  var __scholarAISelStart = null, __scholarAISelEnd = null, __scholarAICursorPos = null, __scholarAIResultFontSize = 13;
  var __scholarAIHistory = [];
  var __viewerSSPSeedImage = null, __viewerSSPResultImage = null, __viewerSSPRatio = '1:1';
  var __viewerSSPImgbbUploading = false;
  var __viewerSSPImgHistory = [];
  var LS_SSP_IMG_HISTORY = 'ss_viewer_ssp_img_history';
  var LS_SSP_PANEL_SPLIT = 'ss_viewer_ssp_panel_split';
  var SSP_IMG_HISTORY_MAX = 10;
  var __viewerFsScale = 1, __viewerFsTx = 0, __viewerFsTy = 0;
  var __viewerFsStartX = 0, __viewerFsStartY = 0, __viewerFsStartTx = 0, __viewerFsStartTy = 0, __viewerFsDragging = false;
  var __viewerFsOnMove = null, __viewerFsOnUp = null;
  var __viewerFsMetaDataUrl = null;
  var __viewerSSPCropWindow = null, __viewerSSPCropSource = null, __viewerSSPCropMessageBound = false;

  function getConfig() { return window.SidebarAIConfig || {}; }
  function getHost() { var c = getConfig(); return c.host || (typeof window.opener !== 'undefined' ? window.opener : null); }
  function invoke(name) {
    var c = getConfig();
    var args = Array.prototype.slice.call(arguments, 1);
    if (c.callbacks && typeof c.callbacks[name] === 'function') return c.callbacks[name].apply(null, args);
    var h = getHost();
    if (h && typeof h[name] === 'function') return h[name].apply(h, args);
    return undefined;
  }
  /** ???????????袁⑸즴筌?씛彛???돗??????????????癲ル슢二??곸젞???????????????????????????????????????????????????????????????????????????????????ㅻ깹?????????????????????????????????????嫄??????????筌띯뫔????????壤굿??띾????(??????????????????? ?????????????????????. async API??????????븐뼐????傭?끆?????Β?ｊ콞???????????븐뼐??????????????????????????????????????熬곣뫖利당춯??쎾퐲???????????????????꿔꺂?㏘틠??怨몄젦??*/
  function getCallback(name) {
    var c = getConfig();
    if (c.callbacks && typeof c.callbacks[name] === 'function') return c.callbacks[name];
    var h = getHost();
    if (h && typeof h[name] === 'function') return function () { return h[name].apply(h, arguments); };
    return undefined;
  }
  function invokeSync(name) {
    var c = getConfig();
    var args = Array.prototype.slice.call(arguments, 1);
    if (c.callbacks && typeof c.callbacks[name] === 'function') return c.callbacks[name].apply(null, args);
    var h = getHost();
    if (h && typeof h[name] === 'function') return h[name].apply(h, args);
    return undefined;
  }
  function getSidebarAIHtml() {
    return CLEAN_SIDEBAR_AI_HTML;
  }

  function notifyUser(message, isError) {
    var shown = false;
    var host = getHost();
    try {
      if (host && typeof host.showToast === 'function') {
        host.showToast(message);
        shown = true;
      }
    } catch (e) {}
    if (!shown) {
      try {
        if (typeof window.showToast === 'function') {
          window.showToast(message);
          shown = true;
        }
      } catch (e) {}
    }
    if (!shown && isError) alert(message);
  }

  function setSSPStatus(message) {
    var statusEl = document.getElementById('ssp-status');
    if (statusEl) statusEl.textContent = message || '';
  }

  function setImgbbSettingsStatus(message, isError) {
    var statusEl = document.getElementById('ssp-imgbb-settings-status');
    if (!statusEl) return;
    statusEl.textContent = message || '';
    statusEl.style.color = isError ? '#dc2626' : '#64748b';
  }
  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function viewerSSPFindHistoryEntryByDataUrl(dataURL) {
    if (!dataURL) return null;
    for (var i = 0; i < __viewerSSPImgHistory.length; i++) {
      if (__viewerSSPImgHistory[i] && __viewerSSPImgHistory[i].dataURL === dataURL) return __viewerSSPImgHistory[i];
    }
    return null;
  }
  function viewerSSPAttachImgbbInfo(dataURL, info) {
    var entry = viewerSSPFindHistoryEntryByDataUrl(dataURL);
    if (!entry) return;
    entry.imgbb = {
      directUrl: info && info.directUrl ? info.directUrl : '',
      viewerUrl: info && info.viewerUrl ? info.viewerUrl : '',
      deleteUrl: info && info.deleteUrl ? info.deleteUrl : '',
      uploadedAt: new Date().toISOString()
    };
    viewerSSPImgHistorySave();
    viewerSSPImgHistoryRender();
    if (__viewerFsMetaDataUrl === dataURL) viewerSSPUpdateFullscreenInfo(dataURL);
  }
  function ensureViewerFsOverlayOnBody() {
    var overlays = document.querySelectorAll('#viewer-fs-overlay');
    if (!overlays || !overlays.length) return null;
    var overlay = overlays[0];
    for (var i = overlays.length - 1; i >= 1; i--) {
      if (overlays[i] && overlays[i].parentNode) overlays[i].parentNode.removeChild(overlays[i]);
    }
    if (overlay.parentNode !== document.body) document.body.appendChild(overlay);
    return overlay;
  }
  function viewerSSPBuildFullscreenLinkField(label, value, href) {
    if (!value) return '';
    var safeLabel = escapeHtml(label || '');
    var safeValue = escapeHtml(value);
    var safeHref = href ? escapeHtml(href) : '';
    var escapedForInsert = String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    var insertBtn = '<button type="button" class="viewer-fs-link-insert" onclick="viewerSSPInsertLinkToDoc(\'' + escapedForInsert + '\', \'' + String(label || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'") + '\')">문서 삽입</button>';
    var openLink = safeHref
      ? '<a class="viewer-fs-link-open" href="' + safeHref + '" target="_blank" rel="noopener noreferrer">Open</a>'
      : '';
    return '' +
      '<label class="viewer-fs-link-field">' +
        '<span class="viewer-fs-link-label">' + safeLabel + '</span>' +
        '<div class="viewer-fs-link-input-wrap">' +
          '<input type="text" readonly value="' + safeValue + '" onclick="this.select()">' +
          insertBtn +
          openLink +
        '</div>' +
      '</label>';
  }

  function viewerSSPInsertLinkToDoc(url, label) {
    var u = String(url || '').trim();
    if (!u) return;
    var isDirect = /direct/i.test(String(label || ''));
    if (isDirect && typeof window.insertMarkdownImageAtCursor === 'function') {
      window.insertMarkdownImageAtCursor(u, getSspImageAltText(u));
      notifyUser('이미지 링크를 문서에 삽입했습니다.', false);
      return;
    }
    var ta = document.getElementById('viewer-edit-ta');
    if (!ta) {
      notifyUser('편집창을 찾을 수 없습니다.', true);
      return;
    }
    var linkText = '[image link](' + u + ')';
    ta.focus();
    document.execCommand('insertText', false, linkText);
    try { ta.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
    notifyUser('링크를 문서에 삽입했습니다.', false);
  }
  function viewerSSPFindHistoryEntryById(id) {
    if (!id) return null;
    for (var i = 0; i < __viewerSSPImgHistory.length; i++) {
      if (__viewerSSPImgHistory[i] && __viewerSSPImgHistory[i].id === id) return __viewerSSPImgHistory[i];
    }
    return null;
  }
  function viewerSSPEnsureFullscreenGallery() {
    var overlay = ensureViewerFsOverlayOnBody();
    if (!overlay) return null;
    var gallery = document.getElementById('viewer-fs-gallery');
    if (!gallery) {
      gallery = document.createElement('aside');
      gallery.id = 'viewer-fs-gallery';
      gallery.className = 'viewer-fs-gallery';
      gallery.innerHTML = '<div class="viewer-fs-gallery-title">History Gallery</div><div id="viewer-fs-gallery-list" class="viewer-fs-gallery-list"></div>';
      gallery.addEventListener('click', function (e) { e.stopPropagation(); });
      overlay.appendChild(gallery);
    }
    return gallery;
  }
  function viewerSSPOpenHistoryFullscreen(id) {
    var entry = viewerSSPFindHistoryEntryById(id);
    if (!entry || !entry.dataURL) return;
    viewerSSPOpenFullscreen(entry.dataURL);
  }
  function viewerSSPRenderFullscreenGallery(currentDataURL) {
    var gallery = viewerSSPEnsureFullscreenGallery();
    if (!gallery) return;
    var list = document.getElementById('viewer-fs-gallery-list');
    if (!list) return;
    if (!__viewerSSPImgHistory.length) {
      gallery.style.display = 'none';
      list.innerHTML = '';
      return;
    }
    var html = '';
    for (var i = 0; i < __viewerSSPImgHistory.length; i++) {
      var item = __viewerSSPImgHistory[i];
      var label = String(item.prompt || 'Untitled image').replace(/</g, '&lt;');
      label = label.substring(0, 26) + (label.length > 26 ? '...' : '');
      var timeText = '';
      try {
        timeText = item.createdAt ? new Date(item.createdAt).toLocaleString() : '';
      } catch (e) {}
      var active = currentDataURL && item.dataURL === currentDataURL ? ' active' : '';
      html += '<button type="button" class="viewer-fs-gallery-item' + active + '" onclick="viewerSSPOpenHistoryFullscreen(\'' + String(item.id).replace(/'/g, "\\'") + '\')">';
      html += '<img src="' + String(item.dataURL || '').replace(/"/g, '&quot;') + '" alt="">';
      html += '<span class="viewer-fs-gallery-meta">';
      html += '<span class="viewer-fs-gallery-label">' + label + '</span>';
      html += '<span class="viewer-fs-gallery-time">' + escapeHtml(timeText) + '</span>';
      html += '</span></button>';
    }
    list.innerHTML = html;
    gallery.style.display = 'flex';
  }
  function viewerSSPEnsureHistoryResizer() {
    var inner = document.querySelector('.ssp-ai-sidebar .ssp-inner');
    var history = document.querySelector('.ssp-ai-sidebar .ssp-img-history');
    if (!inner || !history) return null;
    var handle = inner.querySelector('.ssp-history-resizer');
    if (!handle) {
      handle = document.createElement('div');
      handle.className = 'ssp-history-resizer';
      handle.title = 'Drag to resize history';
      inner.insertBefore(handle, history);
    }
    return handle;
  }
  function viewerSSPApplyHistorySplit(value) {
    var inner = document.querySelector('.ssp-ai-sidebar .ssp-inner');
    if (!inner) return;
    var numeric = parseFloat(value);
    if (!isFinite(numeric)) numeric = 62;
    numeric = Math.max(30, Math.min(78, numeric));
    inner.style.setProperty('--ssp-main-size', numeric + '%');
    try { localStorage.setItem(LS_SSP_PANEL_SPLIT, String(numeric)); } catch (e) {}
  }
  function viewerSSPInitHistoryResizer() {
    var handle = viewerSSPEnsureHistoryResizer();
    var inner = document.querySelector('.ssp-ai-sidebar .ssp-inner');
    if (!handle || !inner || handle.__viewerSSPBound) return;
    handle.__viewerSSPBound = true;
    try {
      var saved = localStorage.getItem(LS_SSP_PANEL_SPLIT);
      if (saved) viewerSSPApplyHistorySplit(saved);
    } catch (e) {}
    handle.addEventListener('mousedown', function (e) {
      e.preventDefault();
      var rect = inner.getBoundingClientRect();
      var onMove = function (ev) {
        var offset = ev.clientY - rect.top;
        var percent = rect.height > 0 ? (offset / rect.height) * 100 : 62;
        viewerSSPApplyHistorySplit(percent);
      };
      var onUp = function () {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }
  function viewerSSPUpdateFullscreenInfo(dataURL) {
    var overlay = ensureViewerFsOverlayOnBody();
    if (!overlay) return;
    var infoEl = document.getElementById('viewer-fs-imgbb-info');
    if (!infoEl) {
      infoEl = document.createElement('div');
      infoEl.id = 'viewer-fs-imgbb-info';
      infoEl.className = 'viewer-fs-imgbb-info';
      overlay.appendChild(infoEl);
    }
    __viewerFsMetaDataUrl = dataURL || null;
    var entry = viewerSSPFindHistoryEntryByDataUrl(dataURL);
    var imgbb = entry && entry.imgbb ? entry.imgbb : null;
    if (!imgbb || (!imgbb.directUrl && !imgbb.viewerUrl)) {
      infoEl.style.display = 'none';
      infoEl.innerHTML = '';
      return;
    }
    var html = '<div class="viewer-fs-imgbb-title">imgBB links</div>';
    html += '<div class="viewer-fs-link-grid">';
    html += viewerSSPBuildFullscreenLinkField('Viewer URL', imgbb.viewerUrl, imgbb.viewerUrl);
    html += viewerSSPBuildFullscreenLinkField('Direct URL', imgbb.directUrl, imgbb.directUrl);
    html += '</div>';
    if (imgbb.uploadedAt) html += '<div class="viewer-fs-imgbb-saved">Saved: ' + escapeHtml(imgbb.uploadedAt) + '</div>';
    infoEl.innerHTML = html;
    infoEl.style.display = 'block';
  }

  function getImgbbApiKeyValue() {
    var input = document.getElementById('ssp-imgbb-api-key');
    var typed = input && input.value ? input.value.trim() : '';
    if (typed) return typed;
    var getKey = getCallback('getImgbbApiKey');
    if (typeof getKey === 'function') {
      try { return String(getKey() || '').trim(); } catch (e) {}
    }
    try { return localStorage.getItem('ss_imgbb_api_key') || ''; } catch (e) {}
    return '';
  }

  function viewerSSPLoadImgbbSettings() {
    var input = document.getElementById('ssp-imgbb-api-key');
    var key = getImgbbApiKeyValue();
    if (input) input.value = key;
    if (key) setImgbbSettingsStatus('????????????????????????됰Ŧ?????????????imgBB API ??? ???????????????ㅻ깹????????????癲????????????????????????????????嶺??', false);
    else setImgbbSettingsStatus('API ??? ?????????????????⑤벡瑜??????????????????????諛몃마嶺뚮?????????????硫λ젒??????????????????????????????????????????꾩룆梨띰쭕?뚢뵾??????????????嶺뚮죭?댁젘????????????imgBB???????????????????????????????????????嶺??', false);
  }

  function viewerSSPToggleImgbbSettings(forceOpen) {
    var panel = document.getElementById('ssp-imgbb-settings');
    if (!panel) return;
    var shouldOpen = typeof forceOpen === 'boolean'
      ? forceOpen
      : panel.style.display === 'none' || !panel.style.display;
    panel.style.display = shouldOpen ? 'block' : 'none';
    if (!shouldOpen) return;
    viewerSSPLoadImgbbSettings();
    var input = document.getElementById('ssp-imgbb-api-key');
    if (input) input.focus();
  }

  function viewerSSPSetImageUploadUI(enabled) {
    var on = !!enabled;
    var uploadZone = document.getElementById('ssp-upload-zone');
    var fileInput = document.getElementById('ssp-file-input');
    if (uploadZone) uploadZone.style.display = on ? '' : 'none';
    if (fileInput) fileInput.disabled = !on;
    document.querySelectorAll('.ssp-btn-imgbb, .ssp-btn-imgbb-settings, .viewer-fs-imgbb-btn, .ssp-h-upload, .ssp-btn-crop').forEach(function (el) {
      el.style.display = on ? '' : 'none';
    });
    if (!on) {
      var panel = document.getElementById('ssp-imgbb-settings');
      if (panel) panel.style.display = 'none';
    }
  }

  function viewerSSPApplyImageUploadSetting() {
    var getEnabled = getCallback('getImageUploadEnabled');
    if (typeof getEnabled === 'function') {
      try {
        var v = getEnabled();
        if (v && typeof v.then === 'function') {
          v.then(function (ok) { viewerSSPSetImageUploadUI(!!ok); }).catch(function () {});
          return;
        }
        viewerSSPSetImageUploadUI(!!v);
        return;
      } catch (e) {}
    }
    viewerSSPSetImageUploadUI(true);
  }

  async function viewerSSPSaveImgbbSettings() {
    var input = document.getElementById('ssp-imgbb-api-key');
    var key = input && input.value ? input.value.trim() : '';
    var setKey = getCallback('setImgbbApiKey');
    try {
      if (typeof setKey === 'function') await setKey(key);
      else {
        if (key) localStorage.setItem('ss_imgbb_api_key', key);
        else localStorage.removeItem('ss_imgbb_api_key');
      }
      setImgbbSettingsStatus(key ? 'imgBB API ??? ????????????꿔꺂???⑸븶????????????????????' : 'imgBB API ??? ??????????', false);
      notifyUser(key ? 'imgBB API ??? ????????????꿔꺂???⑸븶????????????????????' : 'imgBB API ??? ??????????????????????????????????????嶺??', false);
    } catch (e) {
      setImgbbSettingsStatus('imgBB API ?????????????????????????????????? ???????????꾩룆梨띰쭕?뚢뵾??????????????嶺뚮죭?댁젘?????????????????????됰Ŧ????????????????????????????????????嶺??', true);
      notifyUser('imgBB API ?????????????????????????????????? ???????????꾩룆梨띰쭕?뚢뵾??????????????嶺뚮죭?댁젘?????????????????????됰Ŧ????????????????????????????????????嶺??', true);
    }
  }

  function getViewerMarkdownRoot() {
    return document.getElementById('viewer') || document.getElementById('page-content');
  }

  var __aiDocSelTimer = null;
  /** ?????????????怨뺤떪???????#viewer) ????????????????????????????ш끽維뽳쭩?뱀땡???얩맪???????????????textarea)???????????????????????????????椰?????????????ScholarAI ????????????????+ SSP ???????????熬곣뫖利당춯??쎾퐲???????????????????꿔꺂?㏘틠??怨몄젦?????????????????????????*/
  function syncAiPanelsFromDocumentSelection() {
    var viewer = getViewerMarkdownRoot();
    var editTa = document.getElementById('viewer-edit-ta');
    var vp = document.getElementById('content-viewport');
    var isEdit = vp && vp.classList.contains('viewer-edit-active') && !vp.classList.contains('hidden');
    var taPassage = document.getElementById('scholar-ai-selected');
    var sspPrompt = document.getElementById('ssp-prompt');
    if (!taPassage && !sspPrompt) return;
    var text = '';
    var edStart, edEnd, fromEditor = false;
    if (isEdit && editTa) {
      var s = editTa.selectionStart, e = editTa.selectionEnd;
      if (s !== e) {
        text = editTa.value.slice(s, e).trim();
        if (text) {
          fromEditor = true;
          edStart = s;
          edEnd = e;
        }
      }
    }
    if (!text && viewer) {
      var sel = window.getSelection && window.getSelection();
      if (sel && !sel.isCollapsed && sel.anchorNode && viewer.contains(sel.anchorNode)) {
        var schBar = document.getElementById('scholar-ai-sidebar');
        var sspBar = document.getElementById('ssp-ai-sidebar');
        if (schBar && schBar.contains(sel.anchorNode)) return;
        if (sspBar && sspBar.contains(sel.anchorNode)) return;
        text = sel.toString().trim();
      }
    }
    if (!text) {
      if (taPassage && (window.__contentType || '') === 'summary' && (!taPassage.value || !String(taPassage.value).trim())) {
        taPassage.value = '??????????椰???????????? ??????????????????????癲???????????????????곕춴?????????????嫄????????????????????????????????????癲??????????from ????????癲????????????????????????????꾩룆梨띰쭕?뚢뵾??????????????嶺뚮죭?댁젘???????????????熬곣뫖利당춯??쎾퐲?????????????????????癲ル슢?싩땟???????????釉랁닑??????????????.';
      }
      return;
    }
    if (fromEditor) {
      __scholarAISelStart = edStart;
      __scholarAISelEnd = edEnd;
    } else {
      __scholarAISelStart = __scholarAISelEnd = null;
    }
    if (taPassage) taPassage.value = text;
    if (sspPrompt) sspPrompt.value = text;
  }

  function onAiGlobalSelectionChange() {
    clearTimeout(__aiDocSelTimer);
    __aiDocSelTimer = setTimeout(syncAiPanelsFromDocumentSelection, 90);
  }

  function toggleScholarAI() {
    var el = document.getElementById('scholar-ai-sidebar');
    if (!el) return;
    el.classList.toggle('open');
    if (el.classList.contains('open')) {
      syncAiPanelsFromDocumentSelection();
      scholarAIInitResize();
      scholarAILoadPrePrompt();
      scholarAIInitModelSelect();
    } else {
      el.classList.remove('fullscreen');
      var inner = document.getElementById('ai-right-sidebar-inner');
      if (inner && el.parentNode !== inner) {
        inner.insertBefore(el, inner.firstChild);
      }
      try { if (typeof window.__onAiSidebarPanelClosed === 'function') window.__onAiSidebarPanelClosed(); } catch (e) {}
    }
  }
  function scholarAIInitResize() {
    var handle = document.getElementById('scholar-ai-resize-handle');
    var sidebar = document.getElementById('scholar-ai-sidebar');
    if (!handle || !sidebar || !sidebar.classList.contains('open')) return;
    var minW = 280, maxW = Math.min(800, window.innerWidth - 200);
    var startX = 0, startW = 0;
    function onMove(e) {
      var w = startW + (e.clientX - startX);
      w = Math.max(minW, Math.min(maxW, w));
      sidebar.style.width = w + 'px';
      sidebar.style.minWidth = w + 'px';
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    handle.onmousedown = function (e) {
      if (sidebar.classList.contains('fullscreen')) return;
      e.preventDefault();
      startX = e.clientX;
      startW = sidebar.offsetWidth;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    };
  }
  function scholarAIShrink() {
    var el = document.getElementById('scholar-ai-sidebar');
    var inner = document.getElementById('ai-right-sidebar-inner');
    if (el) {
      el.classList.remove('open');
      el.classList.remove('fullscreen');
      if (inner && el.parentNode !== inner) {
        inner.insertBefore(el, inner.firstChild);
      }
    }
    try { if (typeof window.__onAiSidebarPanelClosed === 'function') window.__onAiSidebarPanelClosed(); } catch (e) {}
  }
  function toggleScholarAIPrePrompt() {
    var p = document.getElementById('scholar-ai-pre-prompt-panel');
    var btn = document.getElementById('sa-pre-prompt-btn');
    if (p) {
      p.style.display = p.style.display === 'none' ? 'block' : 'none';
      if (btn) btn.classList.toggle('active', p.style.display !== 'none');
      scholarAILoadPrePrompt();
    }
  }
  function toggleScholarAIModelSelect() {
    var p = document.getElementById('scholar-ai-model-panel');
    var btn = document.getElementById('sa-model-btn');
    if (p) {
      var open = p.style.display === 'none' || !p.style.display;
      p.style.display = open ? 'block' : 'none';
      if (btn) btn.classList.toggle('active', p.style.display !== 'none');
      scholarAIInitModelSelect();
      if (open && p.scrollIntoView) {
        requestAnimationFrame(function () {
          try { p.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) { p.scrollIntoView(true); }
        });
      }
    }
  }
  function scholarAILoadPrePrompt() {
    var el = document.getElementById('scholar-ai-pre-prompt-text');
    if (!el) return;
    var txt = invokeSync('getScholarAISystemInstruction') || '';
    el.value = txt || '';
    if (!el._scholarAISaveOnBlur) {
      el._scholarAISaveOnBlur = true;
      el.addEventListener('blur', function () {
        var setter = getCallback('setScholarAISystemInstruction');
        if (typeof setter === 'function') setter(el.value || '');
      });
    }
  }
  function scholarAIInitModelSelect() {
    var sel = document.getElementById('scholar-ai-model-select');
    var getter = getCallback('getScholarAIModelId');
    if (!sel) return;
    try {
      sel.value = (getter && typeof getter === 'function' ? getter() : null) || 'gemini-2.5-pro';
    } catch (e) {
      sel.value = 'gemini-2.5-pro';
    }
    sel.onchange = function () {
      var setter = getCallback('setScholarAIModelId');
      if (typeof setter === 'function') setter(sel.value);
    };
  }
  function scholarAIFullscreen() {
    var el = document.getElementById('scholar-ai-sidebar');
    if (!el) return;
    var inner = document.getElementById('ai-right-sidebar-inner');
    if (el.classList.contains('fullscreen')) {
      el.classList.remove('fullscreen');
      if (inner && el.parentNode !== inner) {
        inner.insertBefore(el, inner.firstChild);
      }
    } else {
      el.classList.add('fullscreen');
      document.body.appendChild(el);
    }
  }
  function scholarAISyncSelection() {
    syncAiPanelsFromDocumentSelection();
  }
  function scholarAIHistorySave() {
    try { localStorage.setItem('ss_viewer_scholar_ai_history', JSON.stringify(__scholarAIHistory)); } catch (e) {}
  }
  function scholarAIHistoryAdd(promptSnippet, resultText) {
    __scholarAIHistory.unshift({ id: Date.now(), prompt: promptSnippet || '', result: resultText || '', at: new Date().toISOString() });
    scholarAIHistorySave();
  }
  function scholarAIHistoryRender() {
    var list = document.getElementById('scholar-ai-history-list');
    var search = document.getElementById('scholar-ai-history-search');
    var q = (search && search.value) || '';
    q = q.trim().toLowerCase();
    var items = q ? __scholarAIHistory.filter(function (h) { return (h.prompt + ' ' + h.result).toLowerCase().indexOf(q) >= 0; }) : __scholarAIHistory;
    var html = '';
    for (var i = 0; i < items.length; i++) {
      var idx = __scholarAIHistory.indexOf(items[i]);
      var raw = items[i].prompt || items[i].result || '(??????';
      var lbl = raw.replace(/</g, '&lt;').substring(0, 36) + (raw.length > 36 ? '...' : '');
      html += '<div class="scholar-ai-history-item" data-idx="' + idx + '"><span class="sa-h-label" onclick="scholarAIHistoryShowResult(' + idx + ')" title="??????耀붾굝??????筌뤾퍓彛???????????????濾??????????????????????롮쾸?椰?癲ル슢?ｆ쾮??????????????>' + lbl.replace(/'/g, "\\'") + '</span><button type="button" class="sa-h-save" onclick="scholarAIHistorySaveMd(' + idx + ')" title="MD ????>????/button><button type="button" class="sa-h-del" onclick="scholarAIHistoryDelete(' + idx + ')" title="????>??/button></div>';
    }
    if (list) list.innerHTML = html || '<span style="font-size:11px;color:#94a3b8">????????????????耀붾굝??????筌뤾퍓彛????????????????椰????????? ?????????????????????????嶺??</span>';
  }
  function scholarAIHistoryShowResult(idx) {
    var h = __scholarAIHistory[idx];
    if (!h) return;
    var el = document.getElementById('scholar-ai-result');
    if (el) el.value = h.result;
  }
  function scholarAIHistoryDelete(idx) {
    __scholarAIHistory.splice(idx, 1);
    scholarAIHistorySave();
    scholarAIHistoryRender();
  }
  function scholarAIHistorySaveMd(idx) {
    var h = __scholarAIHistory[idx];
    if (!h || !h.result) { alert('?????????????????⑤벡瑜???????????????????????????????????????????????????????????嶺??'); return; }
    var a = document.createElement('a');
    a.href = 'data:text/markdown;charset=utf-8,' + encodeURIComponent(h.result);
    a.download = 'ScholarAI_' + (h.at || '').slice(0, 10) + '_' + idx + '.md';
    a.click();
  }
  function scholarAIHistorySaveAll() {
    if (__scholarAIHistory.length === 0) { alert('?????????????????⑤벡瑜???????????????????????怨뺤떪????????????????????????嶺???????????????????????쎛 ????????????????????????????????????嶺??'); return; }
    var parts = [];
    for (var i = 0; i < __scholarAIHistory.length; i++) {
      var h = __scholarAIHistory[i];
      parts.push('## ' + (i + 1) + '. ' + (h.at || '').slice(0, 19) + '\n\n' + (h.prompt ? '**?????????????????????????????????????** ' + h.prompt + '\n\n' : '') + h.result);
    }
    var a = document.createElement('a');
    a.href = 'data:text/markdown;charset=utf-8,' + encodeURIComponent(parts.join('\n\n---\n\n'));
    a.download = 'ScholarAI_???????????????怨뺤떪???????????????????????熬곣뫖利당춯??쎾퐲???????????????????꿔꺂?㏘틠??怨몄젦??' + new Date().toISOString().slice(0, 10) + '.md';
    a.click();
    alert('???????????熬곣뫖利당춯??쎾퐲???????????????????꿔꺂?㏘틠??怨몄젦??' + __scholarAIHistory.length + '????????????????????????????遺얘턁??????嶺뚮ㅎ?볟퐲??????????거???????????MD ?????????????????????????????????????????????????????袁⑤뜳?????????????????????????嶺??');
  }
  async function scholarAIRun() {
    var sel = document.getElementById('scholar-ai-selected');
    var promptEl = document.getElementById('scholar-ai-prompt');
    var resultEl = document.getElementById('scholar-ai-result');
    var passage = (sel && sel.value) ? sel.value.trim() : '';
    var userQ = (promptEl && promptEl.value) ? promptEl.value.trim() : '';
    if (!passage) { alert('??????????????????????椰???????????? ??????????????????????????????????癲??????????????????????筌????'); return; }
    var callGemini = getCallback('callGemini');
    if (typeof callGemini !== 'function') { alert('???????????????????????????????????????????????????????????????????API?????????????????????????????????????????????嶺??'); return; }
    if (resultEl) resultEl.value = '?????????????????????????거???????????猷몄굣??????????..';
    try {
      var fullPrompt = passage + '\n\n??????????????????????????????????????????????? ' + (userQ || '??????????????????????????????????????????????????????????거?????????????????????????꾩룆梨띰쭕?뚢뵾???????????????????');
      var sys = invokeSync('getScholarAISystemInstruction') || 'You are a scholarly assistant. Answer concisely in Korean based on the given passage. If the user asks a question, answer it; otherwise summarize or explain the passage.';
      var modelId = invokeSync('getScholarAIModelId') || null;
      var res = await callGemini(fullPrompt, sys, false, modelId);
      var text = res && res.text ? res.text : (res || '');
      if (resultEl) resultEl.value = typeof text === 'string' ? text : JSON.stringify(text);
      scholarAIHistoryAdd(userQ || passage.substring(0, 80), resultEl ? resultEl.value : '');
      scholarAIHistoryRender();
    } catch (e) {
      if (resultEl) resultEl.value = '???????????????? ' + (e.message || e);
    }
  }
  function scholarAICopyResult() {
    var el = document.getElementById('scholar-ai-result');
    if (el && el.value) {
      navigator.clipboard.writeText(el.value).then(function () { alert('???뀀맩鍮???癲????????????????????????????????????????ㅻ깹???轅붽틓??????????????????????ㅼ굣塋?'); }).catch(function () { alert('???????ㅻ깹???轅붽틓?????????? ????釉먮폁???????????????????'); });
    } else {
      alert('?????????????怨뺤떪?????????嫄???????????????????耀붾굝??????筌뤾퍓彛????????????????椰????????? ????????????????????????????????????嶺??');
    }
  }
  function scholarAIClearResult() {
    var el = document.getElementById('scholar-ai-result');
    if (el) el.value = '';
  }
  function scholarAIResultFont(delta) {
    var el = document.getElementById('scholar-ai-result');
    if (!el) return;
    __scholarAIResultFontSize = Math.max(10, Math.min(24, __scholarAIResultFontSize + delta));
    el.style.fontSize = __scholarAIResultFontSize + 'px';
  }
  function scholarAIResultZoomOpen() {
    var resultEl = document.getElementById('scholar-ai-result');
    var overlay = document.getElementById('scholar-ai-result-zoom-overlay');
    var zoomTa = document.getElementById('scholar-ai-result-zoom-ta');
    if (!resultEl || !overlay || !zoomTa) return;
    zoomTa.value = resultEl.value || '';
    overlay.classList.add('open');
    zoomTa.focus();
    function onEsc(e) {
      if (e.key === 'Escape') {
        scholarAIResultZoomClose();
        document.removeEventListener('keydown', onEsc);
      }
    }
    document.addEventListener('keydown', onEsc);
    overlay._zoomEsc = onEsc;
  }
  function scholarAIResultZoomClose() {
    var overlay = document.getElementById('scholar-ai-result-zoom-overlay');
    if (overlay && overlay._zoomEsc) {
      document.removeEventListener('keydown', overlay._zoomEsc);
      overlay._zoomEsc = null;
    }
    var resultEl = document.getElementById('scholar-ai-result');
    var zoomTa = document.getElementById('scholar-ai-result-zoom-ta');
    if (resultEl && zoomTa) resultEl.value = zoomTa.value;
    if (overlay) overlay.classList.remove('open');
  }
  function scholarAIPromptWrapInitResize() {
    var handle = document.getElementById('scholar-ai-prompt-resize-handle');
    var wrap = document.getElementById('scholar-ai-prompt-wrap');
    if (!handle || !wrap) return;
    var minH = 80;
    var maxH = 300;
    var startY = 0;
    var startH = 0;
    function onMove(e) {
      var dy = e.clientY - startY;
      var h = Math.max(minH, Math.min(maxH, startH + dy));
      wrap.style.height = h + 'px';
      wrap.style.minHeight = h + 'px';
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    handle.addEventListener('mousedown', function (e) {
      e.preventDefault();
      startY = e.clientY;
      startH = wrap.offsetHeight;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    });
  }
  function scholarAIResultWrapInitResize() {
    var handle = document.getElementById('scholar-ai-result-resize-handle');
    var wrap = document.getElementById('scholar-ai-result-wrap');
    if (!handle || !wrap) return;
    var minH = 160;
    var maxH = 600;
    var startY = 0;
    var startH = 0;
    function onMove(e) {
      var dy = e.clientY - startY;
      var h = Math.max(minH, Math.min(maxH, startH + dy));
      wrap.style.height = h + 'px';
      wrap.style.minHeight = h + 'px';
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    handle.addEventListener('mousedown', function (e) {
      e.preventDefault();
      startY = e.clientY;
      startH = wrap.offsetHeight;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    });
  }
  function handleScholarAIInsertClick() {
    var viewerSwitchToEdit = typeof window.viewerSwitchToEdit === 'function' ? window.viewerSwitchToEdit : function () {};
    var viewerBuildNav = typeof window.viewerBuildNav === 'function' ? window.viewerBuildNav : function () {};
    var isEdit = document.getElementById('content-viewport') && document.getElementById('content-viewport').classList.contains('viewer-edit-active');
    if (!isEdit) { alert('???????椰??????????????꾩룆梨띰쭕?뚢뵾?????????????????濾??????????????濾????????????????????嫄???????????????????살몝????'); if (viewerSwitchToEdit) viewerSwitchToEdit(); return; }
    var ta = document.getElementById('viewer-edit-ta');
    if (ta) __scholarAICursorPos = ta.selectionStart;
    toggleScholarAIInsertMenu();
  }
  function toggleScholarAIInsertMenu() {
    var m = document.getElementById('scholar-ai-insert-menu');
    if (m) m.classList.toggle('open');
  }
  function closeScholarAIInsertMenu() {
    var m = document.getElementById('scholar-ai-insert-menu');
    if (m) m.classList.remove('open');
  }
  function scholarAIInsertDoc(mode) {
    var resultEl = document.getElementById('scholar-ai-result');
    var resultText = resultEl && resultEl.value ? resultEl.value.trim() : '';
    if (!resultText) { alert('?????????????耀붾굝??????筌뤾퍓彛????????????????椰????????? ????????????????????????????????????嶺??'); return; }
    var ta = document.getElementById('viewer-edit-ta');
    var isEdit = document.getElementById('content-viewport') && document.getElementById('content-viewport').classList.contains('viewer-edit-active');
    var viewerSwitchToEdit = typeof window.viewerSwitchToEdit === 'function' ? window.viewerSwitchToEdit : function () {};
    var viewerBuildNav = typeof window.viewerBuildNav === 'function' ? window.viewerBuildNav : function () {};
    if (!isEdit || !ta) {
      var vp = document.getElementById('content-viewport');
      var wrap = document.getElementById('viewer-edit-wrap');
      if (vp) vp.classList.add('viewer-edit-active');
      if (wrap) wrap.style.display = 'flex';
      ta = document.getElementById('viewer-edit-ta');
      if (ta) { ta.value = window.__rawText || ''; ta.style.display = 'block'; }
      var eb = document.getElementById('viewer-btn-edit');
      var vb = document.getElementById('viewer-btn-view');
      if (eb) eb.style.display = 'none';
      if (vb) vb.style.display = 'inline-block';
      if (viewerBuildNav) viewerBuildNav();
    }
    ta = document.getElementById('viewer-edit-ta');
    if (!ta) return;
    var start, end, raw = ta.value;
    if (mode === 0) {
      start = end = (__scholarAICursorPos != null ? __scholarAICursorPos : ta.selectionStart);
    } else if (__scholarAISelStart != null && __scholarAISelEnd != null) {
      start = __scholarAISelStart;
      end = __scholarAISelEnd;
    } else {
      var selTa = document.getElementById('scholar-ai-selected');
      var selText = (selTa && selTa.value) ? selTa.value.trim() : '';
      var idx = selText ? raw.indexOf(selText) : -1;
      if (idx >= 0) { start = idx; end = idx + selText.length; } else { start = ta.selectionStart; end = ta.selectionEnd; }
    }
    var before = raw.slice(0, start);
    var after = raw.slice(end);
    var newVal = mode === 1 ? before + raw.slice(start, end) + '\n\n' + resultText + after : before + resultText + after;
    ta.value = newVal;
    window.__rawText = newVal;
    var insertEnd = mode === 1 ? start + (end - start) + 2 + resultText.length : start + resultText.length;
    __scholarAICursorPos = insertEnd;
    ta.focus();
    ta.setSelectionRange(insertEnd, insertEnd);
    var lines = (ta.value.substring(0, insertEnd).match(/\n/g) || []).length;
    var lineHeight = parseInt(getComputedStyle(ta).lineHeight, 10) || 20;
    ta.scrollTop = Math.max(0, lines * lineHeight - ta.clientHeight / 2);
  }

  function toggleViewerSSP() {
    var el = document.getElementById('ssp-ai-sidebar');
    if (!el) return;
    el.classList.toggle('open');
    if (el.classList.contains('open')) {
      syncAiPanelsFromDocumentSelection();
      viewerSSPInit();
    } else {
      try { if (typeof window.__onAiSidebarPanelClosed === 'function') window.__onAiSidebarPanelClosed(); } catch (e) {}
    }
  }
  function sspAIShrink() {
    var el = document.getElementById('ssp-ai-sidebar');
    if (el) el.classList.remove('open');
    try { if (typeof window.__onAiSidebarPanelClosed === 'function') window.__onAiSidebarPanelClosed(); } catch (e) {}
  }
  function viewerSSPSyncSelection() {
    syncAiPanelsFromDocumentSelection();
  }
  function viewerSSPSetUploadZoneContent(dataURL) {
    var uploadZone = document.getElementById('ssp-upload-zone');
    if (!uploadZone) return;
    if (dataURL) {
      uploadZone.innerHTML = '<div class="ssp-seed-loaded"><img src="' + dataURL.replace(/"/g, '&quot;') + '" onclick="viewerSSPOpenFullscreen(this.src); event.stopPropagation()" title="Open fullscreen"><div class="ssp-seed-actions"><button type="button" class="sa-btn ghost" onclick="viewerSSPClearSeed(); event.stopPropagation()">Clear seed image</button></div><small style="display:block;margin-top:4px;color:#94a3b8">Click to change</small></div>';
    } else {
      uploadZone.innerHTML = 'Image upload (JPG, PNG, GIF, WebP)<br><small>or Ctrl+V paste</small>';
    }
  }
  function viewerSSPClearSeed() {
    __viewerSSPSeedImage = null;
    viewerSSPSetUploadZoneContent(null);
  }
  function viewerSSPFsApply() {
    var wrap = document.getElementById('viewer-fs-wrap');
    var val = document.getElementById('viewer-fs-zoom-val');
    if (wrap) wrap.style.transform = 'translate(' + __viewerFsTx + 'px,' + __viewerFsTy + 'px) scale(' + __viewerFsScale + ')';
    if (val) val.textContent = Math.round(__viewerFsScale * 100) + '%';
  }
  function viewerSSPFsZoom(d) {
    __viewerFsScale = Math.max(0.25, Math.min(4, __viewerFsScale + d));
    viewerSSPFsApply();
  }
  function viewerSSPFsDownload() {
    var img = document.getElementById('viewer-fs-img');
    if (!img || !img.src) return;
    var dataURL = img.src;
    if (dataURL.indexOf('data:') === 0) {
      try {
        var arr = dataURL.split(',');
        var mime = (arr[0].match(/:(.*?);/) || [])[1] || 'image/png';
        var bstr = atob(arr[1]);
        var n = bstr.length;
        var u8arr = new Uint8Array(n);
        for (var i = 0; i < n; i++) u8arr[i] = bstr.charCodeAt(i);
        var blob = new Blob([u8arr], { type: mime });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'image_' + Date.now() + '.png';
        a.click();
        setTimeout(function () { URL.revokeObjectURL(url); }, 200);
      } catch (e) {
        var a = document.createElement('a');
        a.href = dataURL;
        a.download = 'image_' + Date.now() + '.png';
        a.click();
      }
    } else {
      var a = document.createElement('a');
      a.href = dataURL;
      a.download = 'image_' + Date.now() + '.png';
      a.click();
    }
  }
  function viewerSSPFsUploadImgbb() {
    var img = document.getElementById('viewer-fs-img');
    if (!img || !img.src) {
      notifyUser('?????????????????怨뺤떪???????????????????????????????????? ????????????????????????????????????嶺??', true);
      return;
    }
    viewerSSPUploadToImgbb(img.src);
  }
  function viewerSSPFsInsert() {
    var img = document.getElementById('viewer-fs-img');
    if (!img || !img.src) return;
    var h = getHost();
    if (h) try { h.postMessage({ type: 'imgViewerInsert', dataURL: img.src }, '*'); } catch (e) {}
  }
  function viewerSSPApplyCroppedImage(dataUrl) {
    if (!dataUrl) return;
    __viewerSSPResultImage = dataUrl;
    var resultImg = document.getElementById('ssp-result-img');
    if (resultImg) {
      resultImg.src = dataUrl;
      resultImg.style.display = 'block';
      resultImg.title = 'Open fullscreen';
    }
    var fsImg = document.getElementById('viewer-fs-img');
    if (fsImg) fsImg.src = dataUrl;
    var downloadBtn = document.getElementById('ssp-download-btn');
    if (downloadBtn) downloadBtn.disabled = false;
    var linkInput = document.getElementById('ssp-image-link-url');
    if (linkInput) linkInput.value = '';
    viewerSSPUpdateFullscreenInfo(dataUrl);
    viewerSSPImgHistoryAdd(dataUrl, 'Cropped image');
    setSSPStatus('Crop applied.');
  }
  function viewerSSPBindCropMessages() {
    if (__viewerSSPCropMessageBound) return;
    __viewerSSPCropMessageBound = true;
    window.addEventListener('message', function (ev) {
      if (!ev || !ev.data) return;
      if (ev.data.type === 'crop-ready') {
        if (!__viewerSSPCropWindow || ev.source !== __viewerSSPCropWindow || !__viewerSSPCropSource) return;
        try {
          __viewerSSPCropWindow.postMessage({ type: 'crop', image: __viewerSSPCropSource }, '*');
        } catch (e) {}
        return;
      }
      if (ev.data.type === 'aiimg-cropped') {
        if (!__viewerSSPCropWindow || ev.source !== __viewerSSPCropWindow || !ev.data.dataUrl) return;
        viewerSSPApplyCroppedImage(ev.data.dataUrl);
        try {
          __viewerSSPCropWindow.postMessage({ type: 'crop-applied' }, '*');
        } catch (e) {}
        __viewerSSPCropSource = ev.data.dataUrl;
      }
    });
  }
  function viewerSSPGetCropPageUrl() {
    var c = getConfig();
    if (c && c.cropPageUrl) return String(c.cropPageUrl);
    var base = (c && c.cropEditorBase != null) ? c.cropEditorBase : './';
    try {
      return new URL('crop.html', base).href;
    } catch (e) {}
    return String(base || './') + 'crop.html';
  }
  function viewerSSPFsCrop() {
    var img = document.getElementById('viewer-fs-img');
    if (!img || !img.src) {
      notifyUser('No image is open in fullscreen.', true);
      return;
    }
    viewerSSPBindCropMessages();
    __viewerSSPCropSource = img.src;
    __viewerSSPCropWindow = window.open(viewerSSPGetCropPageUrl(), 'crop', 'width=700,height=620,scrollbars=yes,resizable=yes');
    if (!__viewerSSPCropWindow) {
      notifyUser('Could not open the crop window. Check the popup blocker.', true);
      return;
    }
    try { __viewerSSPCropWindow.focus(); } catch (e) {}
    try {
      __viewerSSPCropWindow.postMessage({ type: 'crop', image: __viewerSSPCropSource }, '*');
    } catch (e) {}
  }
  function viewerSSPCloseFullscreen() {
    var overlay = ensureViewerFsOverlayOnBody();
    if (overlay) overlay.classList.remove('open');
    viewerSSPUpdateFullscreenInfo(null);
    if (__viewerFsOnMove) document.removeEventListener('mousemove', __viewerFsOnMove);
    if (__viewerFsOnUp) document.removeEventListener('mouseup', __viewerFsOnUp);
  }
  function viewerSSPOpenFullscreen(dataURL) {
    if (!dataURL) return;
    var overlay = ensureViewerFsOverlayOnBody();
    var img = document.getElementById('viewer-fs-img');
    if (!overlay || !img) return;
    img.src = dataURL;
    __viewerFsScale = 1;
    __viewerFsTx = 0;
    __viewerFsTy = 0;
    viewerSSPFsApply();
    viewerSSPUpdateFullscreenInfo(dataURL);
    viewerSSPRenderFullscreenGallery(dataURL);
    overlay.classList.add('open');
    var area = document.getElementById('viewer-fs-area');
    __viewerFsOnMove = function (e) {
      if (!__viewerFsDragging) return;
      __viewerFsTx = __viewerFsStartTx + e.clientX - __viewerFsStartX;
      __viewerFsTy = __viewerFsStartTy + e.clientY - __viewerFsStartY;
      viewerSSPFsApply();
    };
    __viewerFsOnUp = function () {
      __viewerFsDragging = false;
      document.removeEventListener('mousemove', __viewerFsOnMove);
      document.removeEventListener('mouseup', __viewerFsOnUp);
    };
    if (area) {
      area.onmousedown = function (e) {
        if (e.button !== 0) return;
        __viewerFsDragging = true;
        __viewerFsStartX = e.clientX;
        __viewerFsStartY = e.clientY;
        __viewerFsStartTx = __viewerFsTx;
        __viewerFsStartTy = __viewerFsTy;
        document.addEventListener('mousemove', __viewerFsOnMove);
        document.addEventListener('mouseup', __viewerFsOnUp);
      };
    }
  }
  function viewerSSPAbort() {
    var fn = getCallback('abortCurrentTask');
    if (typeof fn === 'function') try { fn(); } catch (e) {}
  }
  function viewerSSPInit() {
    ensureViewerFsOverlayOnBody();
    viewerSSPInitHistoryResizer();
    viewerSSPEnsureFullscreenGallery();
    var fileInput = document.getElementById('ssp-file-input');
    var uploadZone = document.getElementById('ssp-upload-zone');
    if (fileInput) {
      fileInput.onchange = function (e) {
        var f = e.target.files && e.target.files[0];
        if (f) {
          var r = new FileReader();
          r.onload = function () {
            __viewerSSPSeedImage = r.result;
            viewerSSPSetUploadZoneContent(r.result);
          };
          r.readAsDataURL(f);
        }
        fileInput.value = '';
      };
    }
    if (uploadZone) {
      uploadZone.ondragover = function (e) { e.preventDefault(); uploadZone.style.borderColor = '#f59e0b'; };
      uploadZone.ondragleave = function () { uploadZone.style.borderColor = ''; };
      uploadZone.ondrop = function (e) {
        e.preventDefault();
        uploadZone.style.borderColor = '';
        var f = e.dataTransfer.files[0];
        if (f && f.type.indexOf('image') >= 0) {
          var r = new FileReader();
          r.onload = function () {
            __viewerSSPSeedImage = r.result;
            viewerSSPSetUploadZoneContent(r.result);
          };
          r.readAsDataURL(f);
        }
      };
    }
    if (!window.__viewerSSPPasteInit) {
      window.__viewerSSPPasteInit = true;
      document.addEventListener('paste', function (e) {
        var sb = document.getElementById('ssp-ai-sidebar');
        if (!sb || !sb.classList.contains('open')) return;
        var items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        for (var i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image') >= 0) {
            var f = items[i].getAsFile();
            if (f) {
              var r = new FileReader();
              r.onload = function () {
                __viewerSSPSeedImage = r.result;
                viewerSSPSetUploadZoneContent(r.result);
              };
              r.readAsDataURL(f);
              e.preventDefault();
              break;
            }
          }
        }
      });
    }
    document.querySelectorAll('.ssp-ratio-btn').forEach(function (b) {
      b.onclick = function () {
        __viewerSSPRatio = this.getAttribute('data-ratio') || '1:1';
        document.querySelectorAll('.ssp-ratio-btn').forEach(function (x) { x.classList.toggle('active', x === b); });
      };
    });
    var modelSel = document.getElementById('ssp-model');
    var getImgModel = getCallback('getImageModelId');
    if (modelSel && typeof getImgModel === 'function') {
      try { modelSel.value = getImgModel() || 'gemini-3.1-flash-image-preview'; } catch (e) {}
    }
    var imgLinkLabel = document.querySelector('.ssp-img-link-label');
    if (imgLinkLabel) imgLinkLabel.textContent = 'Image URL -> Insert (Markdown / HTML)';
    var mdInsertBtn = document.querySelector('.ssp-btn-insert-md');
    if (mdInsertBtn) mdInsertBtn.textContent = 'Markdown';
    var actionRow = document.querySelector('.ssp-action-row');
    if (actionRow && !actionRow.querySelector('.ssp-btn-crop')) {
      var cropBtn = document.createElement('button');
      cropBtn.type = 'button';
      cropBtn.className = 'sa-btn ghost ssp-btn-crop';
      cropBtn.textContent = 'Crop';
      cropBtn.title = 'Crop current result image';
      cropBtn.onclick = function () {
        var resultImg = document.getElementById('ssp-result-img');
        if (!resultImg || !resultImg.src) {
          notifyUser('먼저 이미지를 생성하거나 업로드하세요.', true);
          return;
        }
        viewerSSPOpenFullscreen(resultImg.src);
        viewerSSPFsCrop();
      };
      actionRow.insertBefore(cropBtn, actionRow.querySelector('.ssp-btn-imgbb') || null);
    }
    var imgLinkRow = document.querySelector('.ssp-img-link-row');
    if (imgLinkRow && !document.querySelector('.ssp-btn-insert-html')) {
      var htmlBtn = document.createElement('button');
      htmlBtn.type = 'button';
      htmlBtn.className = 'sa-btn ghost ssp-btn-insert-html';
      htmlBtn.textContent = 'HTML';
      htmlBtn.onclick = sspInsertImageHtml;
      imgLinkRow.appendChild(htmlBtn);
    }
    var imgbbSettings = document.getElementById('ssp-imgbb-settings');
    if (imgbbSettings && !document.getElementById('ssp-imgbb-api-link')) {
      var linkWrap = document.createElement('div');
      linkWrap.style.marginTop = '8px';
      linkWrap.style.fontSize = '11px';
      var link = document.createElement('a');
      link.id = 'ssp-imgbb-api-link';
      link.href = 'https://api.imgbb.com/';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'API key 받기: https://api.imgbb.com/';
      link.style.color = '#2563eb';
      link.style.textDecoration = 'underline';
      linkWrap.appendChild(link);
      imgbbSettings.appendChild(linkWrap);
    }
    var imgbbKeyInput = document.getElementById('ssp-imgbb-api-key');
    if (imgbbKeyInput && !imgbbKeyInput.__viewerSSPBound) {
      imgbbKeyInput.__viewerSSPBound = true;
      imgbbKeyInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          viewerSSPSaveImgbbSettings();
        }
      });
    }
    viewerSSPApplyEnglishLabels();
    viewerSSPLoadImgbbSettings();
    viewerSSPApplyImageUploadSetting();
    viewerSSPImgHistoryLoad();
    viewerSSPImgHistoryRender();
  }
  async function viewerSSPGenerate() {
    var promptEl = document.getElementById('ssp-prompt');
    var promptEl2 = document.getElementById('ssp-prompt-2');
    var p1 = promptEl && promptEl.value ? promptEl.value.trim() : '';
    var p2 = promptEl2 && promptEl2.value ? promptEl2.value.trim() : '';
    var prompt = [p1, p2].filter(Boolean).join('\n\n');
    var seedImage = __viewerSSPSeedImage;
    var hasSeed = seedImage && typeof seedImage === 'string' && seedImage.indexOf('data:image') === 0;
    if (!hasSeed && !prompt) { alert('프롬프트를 입력하거나 시드 이미지를 업로드하세요.'); return; }
    var generateImage = getCallback('generateImage');
    if (typeof generateImage !== 'function') { alert('이미지 생성 API를 사용할 수 없습니다. 설정을 확인하세요.'); return; }
    var statusEl = document.getElementById('ssp-status');
    var resultImg = document.getElementById('ssp-result-img');
    var downloadBtn = document.getElementById('ssp-download-btn');
    var progressWrap = document.getElementById('ssp-progress-wrap');
    var progressFill = document.getElementById('ssp-progress-fill');
    var progressPct = document.getElementById('ssp-progress-pct');
    var modelSel = document.getElementById('ssp-model');
    var modelId = modelSel ? modelSel.value : 'gemini-3.1-flash-image-preview';
    var noText = document.getElementById('ssp-no-text') && document.getElementById('ssp-no-text').checked;
    var h = getHost();
    if (h && h._aiTaskCancelled !== undefined) h._aiTaskCancelled = false;
    if (progressWrap) { progressWrap.classList.add('visible'); progressWrap.style.display = 'flex'; }
    if (progressFill) progressFill.style.width = '0%';
    if (progressPct) progressPct.textContent = '0%';
    if (statusEl) statusEl.textContent = 'AI 이미지 생성 중...';
    var progressInterval = null;
    var progressVal = 0;
    var progressMax = 95;
    var progressStep = 2;
    var progressMs = 800;
    progressInterval = setInterval(function () {
      progressVal = Math.min(progressMax, progressVal + progressStep);
      if (progressFill) progressFill.style.width = progressVal + '%';
      if (progressPct) progressPct.textContent = progressVal + '%';
      if (progressVal >= progressMax) clearInterval(progressInterval);
    }, progressMs);
    try {
      var dataURL = await generateImage(prompt, { seedImage: hasSeed ? seedImage : null, modelId: modelId, aspectRatio: __viewerSSPRatio, noText: noText });
      clearInterval(progressInterval);
      if (progressFill) progressFill.style.width = '100%';
      if (progressPct) progressPct.textContent = '100%';
      if (progressWrap) setTimeout(function () { progressWrap.classList.remove('visible'); progressWrap.style.display = 'none'; }, 500);
      if (dataURL) {
        __viewerSSPResultImage = dataURL;
        if (resultImg) { resultImg.src = dataURL; resultImg.style.display = 'block'; resultImg.title = 'Open fullscreen'; }
        if (downloadBtn) downloadBtn.disabled = false;
        if (statusEl) statusEl.textContent = '생성 완료';
        viewerSSPImgHistoryAdd(dataURL, prompt);
      } else {
        if (statusEl) statusEl.textContent = '결과를 받지 못했습니다.';
      }
    } catch (e) {
      clearInterval(progressInterval);
      if (progressWrap) { progressWrap.classList.remove('visible'); progressWrap.style.display = 'none'; }
      if (statusEl) statusEl.textContent = (e && e.name === 'AbortError') ? '생성이 중단되었습니다.' : ('생성 오류: ' + (e.message || e));
    }
  }
  function viewerSSPDownload() {
    if (!__viewerSSPResultImage) { alert('다운로드할 이미지가 없습니다. 먼저 이미지를 생성하세요.'); return; }
    var a = document.createElement('a');
    a.href = __viewerSSPResultImage;
    a.download = 'ssp_image_' + Date.now() + '.png';
    a.click();
  }
  function getSspImageAltText(imageUrl) {
    var u = String(imageUrl || '').trim();
    if (!u) return 'image';
    try {
      var path = u.split('?')[0].split('#')[0];
      var name = path.substring(path.lastIndexOf('/') + 1) || 'image';
      name = decodeURIComponent(name).replace(/\.[^.]+$/, '').trim();
      return name || 'image';
    } catch (e) {
      return 'image';
    }
  }
  async function viewerSSPUploadToImgbb(sourceDataUrl) {
    if (__viewerSSPImgbbUploading) return;
    if (!sourceDataUrl || sourceDataUrl.indexOf('data:image') !== 0) {
      setSSPStatus('업로드할 이미지가 없습니다. 먼저 이미지를 생성하거나 불러오세요.');
      notifyUser('업로드할 이미지가 없습니다. 먼저 이미지를 생성하거나 불러오세요.', true);
      return;
    }
    __viewerSSPResultImage = sourceDataUrl;
    var resultImg = document.getElementById('ssp-result-img');
    var downloadBtn = document.getElementById('ssp-download-btn');
    if (resultImg) { resultImg.src = sourceDataUrl; resultImg.style.display = 'block'; }
    if (downloadBtn) downloadBtn.disabled = false;
    var apiKey = getImgbbApiKeyValue();
    if (!apiKey) {
      viewerSSPToggleImgbbSettings(true);
      setImgbbSettingsStatus('imgBB API 키를 먼저 입력하고 저장하세요.', true);
      notifyUser('imgBB API 키를 먼저 입력하고 저장하세요.', true);
      return;
    }

    var previewWindow = null;
    try {
      previewWindow = window.open('', '_blank');
      if (previewWindow && previewWindow.document) {
        previewWindow.document.write('<!doctype html><html><head><meta charset="utf-8"><title>imgBB Upload</title></head><body style="font-family:Segoe UI,sans-serif;padding:24px">imgBB uploading...</body></html>');
        previewWindow.document.close();
      }
    } catch (e) {}

    __viewerSSPImgbbUploading = true;
    document.querySelectorAll('.ssp-btn-imgbb, .ssp-h-upload, .viewer-fs-imgbb-btn').forEach(function (btn) {
      btn.disabled = true;
      btn.dataset.prevText = btn.textContent;
      btn.textContent = btn.classList.contains('ssp-h-upload') ? 'Uploading' : 'Uploading...';
    });
    setSSPStatus('imgBB uploading...');
    setImgbbSettingsStatus('Uploading image to imgBB.', false);

    try {
      var comma = sourceDataUrl.indexOf(',');
      var base64Data = comma >= 0 ? sourceDataUrl.slice(comma + 1) : sourceDataUrl;
      var form = new FormData();
      form.append('image', base64Data);
      form.append('name', 'sspimgai_' + Date.now());

      var response = await fetch('https://api.imgbb.com/1/upload?key=' + encodeURIComponent(apiKey), {
        method: 'POST',
        body: form
      });
      var payload = null;
      try { payload = await response.json(); } catch (e) {}
      if (!response.ok || !payload || payload.success === false) {
        throw new Error(
          payload && payload.error && payload.error.message
            ? payload.error.message
            : 'imgBB upload failed (' + response.status + ')'
        );
      }

      var data = payload.data || {};
      var directUrl = data.url || (data.image && data.image.url) || data.display_url || '';
      var viewerUrl = data.url_viewer || directUrl || '';
      viewerSSPAttachImgbbInfo(sourceDataUrl, {
        directUrl: directUrl,
        viewerUrl: viewerUrl,
        deleteUrl: data.delete_url || ''
      });
      var linkInput = document.getElementById('ssp-image-link-url');
      if (linkInput) linkInput.value = directUrl || viewerUrl;

      if (previewWindow && !previewWindow.closed) {
        if (viewerUrl) previewWindow.location.href = viewerUrl;
        else previewWindow.close();
      } else if (viewerUrl) {
        try { window.open(viewerUrl, '_blank'); } catch (e) {}
      }

      setSSPStatus('imgBB 업로드가 완료되었습니다.');
      setImgbbSettingsStatus('업로드 완료. 아래 링크를 Markdown 또는 HTML로 삽입할 수 있습니다.', false);
      notifyUser('imgBB 업로드 완료', false);
    } catch (e) {
      if (previewWindow && !previewWindow.closed) previewWindow.close();
      var message = e && e.message ? e.message : String(e || 'imgBB upload error');
      setSSPStatus('imgBB upload error: ' + message);
      setImgbbSettingsStatus('imgBB upload error: ' + message, true);
      notifyUser('imgBB upload error: ' + message, true);
    } finally {
      __viewerSSPImgbbUploading = false;
      document.querySelectorAll('.ssp-btn-imgbb, .ssp-h-upload, .viewer-fs-imgbb-btn').forEach(function (btn) {
        btn.disabled = false;
        if (btn.dataset.prevText) btn.textContent = btn.dataset.prevText;
      });
    }
  }
  async function viewerSSPOpenImgbb() {
    return viewerSSPUploadToImgbb(__viewerSSPResultImage);
  }
  function viewerSSPCropFromPanel() {
    var resultImg = document.getElementById('ssp-result-img');
    if (!resultImg || !resultImg.src) {
      notifyUser('먼저 이미지를 생성하거나 업로드하세요.', true);
      return;
    }
    viewerSSPOpenFullscreen(resultImg.src);
    viewerSSPFsCrop();
  }
  function sspInsertImageMarkdown() {
    var el = document.getElementById('ssp-image-link-url');
    var u = el && el.value.trim();
    if (!u) { alert('?????????????????? URL???????????????????????????????꾩룆梨띰쭕?뚢뵾???????????????????'); return; }
    if (typeof window.insertMarkdownImageAtCursor !== 'function') {
      alert('??????????????????????????????????????????????????????????????????嶺??');
      return;
    }
    window.insertMarkdownImageAtCursor(u, getSspImageAltText(u));
  }
  function sspInsertImageHtml() {
    var el = document.getElementById('ssp-image-link-url');
    var u = el && el.value.trim();
    if (!u) { alert('?????????????????? URL???????????????????????????????꾩룆梨띰쭕?뚢뵾???????????????????'); return; }
    if (typeof window.insertHtmlImageAtCursor !== 'function') {
      alert('??????????????????????????????????????????????????????????????????嶺??');
      return;
    }
    window.insertHtmlImageAtCursor(u, getSspImageAltText(u));
  }
  function viewerSSPUploadHistoryImage(id) {
    for (var i = 0; i < __viewerSSPImgHistory.length; i++) {
      if (__viewerSSPImgHistory[i].id === id) {
        viewerSSPUploadToImgbb(__viewerSSPImgHistory[i].dataURL);
        return;
      }
    }
    notifyUser('???????????????怨뺤떪???????????????????????????????????????????????? ???????????????????????????', true);
  }
  function viewerSSPImgHistoryLoad() {
    try {
      var raw = localStorage.getItem(LS_SSP_IMG_HISTORY);
      if (raw) __viewerSSPImgHistory = JSON.parse(raw);
      else __viewerSSPImgHistory = [];
    } catch (e) { __viewerSSPImgHistory = []; }
  }
  function viewerSSPImgHistorySave() {
    try { localStorage.setItem(LS_SSP_IMG_HISTORY, JSON.stringify(__viewerSSPImgHistory)); } catch (e) {}
  }
  function viewerSSPImgHistoryAdd(dataURL, prompt) {
    if (!dataURL) return;
    var entry = { id: 'sspih_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9), dataURL: dataURL, prompt: (prompt || '').substring(0, 80), createdAt: new Date().toISOString() };
    __viewerSSPImgHistory.unshift(entry);
    if (__viewerSSPImgHistory.length > SSP_IMG_HISTORY_MAX) __viewerSSPImgHistory = __viewerSSPImgHistory.slice(0, SSP_IMG_HISTORY_MAX);
    viewerSSPImgHistorySave();
    viewerSSPImgHistoryRender();
  }
  function viewerSSPImgHistoryRemove(id) {
    __viewerSSPImgHistory = __viewerSSPImgHistory.filter(function (h) { return h.id !== id; });
    viewerSSPImgHistorySave();
    viewerSSPImgHistoryRender();
  }
  function viewerSSPImgHistoryRender() {
    var list = document.getElementById('ssp-img-history-list');
    if (!list) return;
    if (__viewerSSPImgHistory.length === 0) { list.innerHTML = '<span style="font-size:10px;color:#94a3b8">????????????諛몃마嶺뚮?????????????硫λ젒????????????????????????????????????????? ?????????????????????????嶺??</span>'; return; }
    var html = '';
    for (var i = 0; i < __viewerSSPImgHistory.length; i++) {
      var h = __viewerSSPImgHistory[i];
      var lbl = (h.prompt || '(?????諛몃마?????熬곻퐢夷①뇾????????⑤뜤??').replace(/</g, '&lt;').substring(0, 30) + ((h.prompt || '').length > 30 ? '...' : '');
      html += '<div class="ssp-img-history-item" data-id="' + h.id + '">';
      html += '<img src="' + (h.dataURL || '').replace(/"/g, '&quot;') + '" onclick="viewerSSPOpenFullscreen(this.src); event.stopPropagation()" title="Open fullscreen">';
      html += '<span class="ssp-h-label">' + lbl + '</span>';
      html += '<button type="button" class="ssp-h-del" onclick="viewerSSPImgHistoryRemove(\'' + h.id + '\'); event.stopPropagation()" title="Delete">X</button>';
      html += '<button type="button" class="sa-btn ghost ssp-h-upload" onclick="viewerSSPUploadHistoryImage(\'' + h.id + '\'); event.stopPropagation()" title="Upload to imgBB">imgBB</button>';
      html += '</div>';
    }
    list.innerHTML = html;
  }

  function viewerSSPApplyEnglishLabels() {
    var generateBtn = document.querySelector('.ssp-btn-generate');
    if (generateBtn) generateBtn.textContent = 'Generate';
    var uploadBtn = document.querySelector('.ssp-btn-imgbb');
    if (uploadBtn) uploadBtn.textContent = '[imgBB] Upload';
    var settingsBtn = document.querySelector('.ssp-btn-imgbb-settings');
    if (settingsBtn) settingsBtn.textContent = 'Settings';
    var saveBtn = document.querySelector('#ssp-imgbb-settings button.sa-btn.ghost');
    if (saveBtn) saveBtn.textContent = 'Save';
    var linkLabel = document.querySelector('.ssp-img-link-label');
    if (linkLabel) linkLabel.textContent = 'Image URL -> Insert (Markdown / HTML)';
    var linkInput = document.getElementById('ssp-image-link-url');
    if (linkInput) linkInput.placeholder = 'https://i.ibb.co/... (imgBB direct link)';
    var settingsLabel = document.querySelector('label[for="ssp-imgbb-api-key"]');
    if (settingsLabel) settingsLabel.textContent = 'imgBB API Key';
    var settingsNote = document.getElementById('ssp-imgbb-settings-status');
    if (settingsNote && !getImgbbApiKeyValue()) settingsNote.textContent = 'Enter your imgBB API key to enable direct uploads.';
    var uploadZone = document.getElementById('ssp-upload-zone');
    if (uploadZone && !uploadZone.querySelector('img')) uploadZone.innerHTML = 'Image upload (JPG, PNG, GIF, WebP)<br><small>or Ctrl+V paste</small>';
    var noTextLabel = document.getElementById('ssp-no-text');
    if (noTextLabel && noTextLabel.parentElement) noTextLabel.parentElement.lastChild.textContent = ' Pure image (no text)';
  }

  function viewerSSPLoadImgbbSettings() {
    var input = document.getElementById('ssp-imgbb-api-key');
    var key = getImgbbApiKeyValue();
    if (input) input.value = key;
    if (key) setImgbbSettingsStatus('imgBB API key is saved and ready.', false);
    else setImgbbSettingsStatus('Enter your imgBB API key to enable direct uploads.', false);
  }

  async function viewerSSPSaveImgbbSettings() {
    var input = document.getElementById('ssp-imgbb-api-key');
    var key = input && input.value ? input.value.trim() : '';
    var setKey = getCallback('setImgbbApiKey');
    try {
      if (typeof setKey === 'function') await setKey(key);
      else {
        if (key) localStorage.setItem('ss_imgbb_api_key', key);
        else localStorage.removeItem('ss_imgbb_api_key');
      }
      setImgbbSettingsStatus(key ? 'imgBB API key saved.' : 'imgBB API key cleared.', false);
      notifyUser(key ? 'imgBB API key saved.' : 'imgBB API key cleared.', false);
    } catch (e) {
      setImgbbSettingsStatus('Could not save the imgBB API key.', true);
      notifyUser('Could not save the imgBB API key.', true);
    }
  }

  function sspInsertImageMarkdown() {
    var el = document.getElementById('ssp-image-link-url');
    var u = el && el.value.trim();
    if (!u) {
      alert('Enter an image URL first.');
      return;
    }
    if (typeof window.insertMarkdownImageAtCursor !== 'function') {
      alert('Markdown image insertion is not available.');
      return;
    }
    window.insertMarkdownImageAtCursor(u, getSspImageAltText(u));
  }

  function sspInsertImageHtml() {
    var el = document.getElementById('ssp-image-link-url');
    var u = el && el.value.trim();
    if (!u) {
      alert('Enter an image URL first.');
      return;
    }
    if (typeof window.insertHtmlImageAtCursor !== 'function') {
      alert('HTML image insertion is not available.');
      return;
    }
    window.insertHtmlImageAtCursor(u, getSspImageAltText(u));
  }

  function viewerSSPImgHistoryRender() {
    var list = document.getElementById('ssp-img-history-list');
    if (!list) return;
    if (__viewerSSPImgHistory.length === 0) {
      list.innerHTML = '<span style="font-size:10px;color:#94a3b8">No generated images yet.</span>';
      viewerSSPRenderFullscreenGallery((document.getElementById('viewer-fs-img') || {}).src || '');
      return;
    }
    var html = '';
    for (var i = 0; i < __viewerSSPImgHistory.length; i++) {
      var h = __viewerSSPImgHistory[i];
      var rawLabel = String(h.prompt || 'Generated image').replace(/</g, '&lt;');
      var lbl = rawLabel.substring(0, 30) + (rawLabel.length > 30 ? '...' : '');
      html += '<div class="ssp-img-history-item" data-id="' + h.id + '">';
      html += '<img src="' + (h.dataURL || '').replace(/"/g, '&quot;') + '" onclick="viewerSSPOpenFullscreen(this.src); event.stopPropagation()" title="Open fullscreen">';
      html += '<span class="ssp-h-label">' + lbl + '</span>';
      html += '<button type="button" class="ssp-h-del" onclick="viewerSSPImgHistoryRemove(\'' + h.id + '\'); event.stopPropagation()" title="Delete">X</button>';
      html += '<button type="button" class="sa-btn ghost ssp-h-upload" onclick="viewerSSPUploadHistoryImage(\'' + h.id + '\'); event.stopPropagation()" title="Upload to imgBB">imgBB</button>';
      html += '</div>';
    }
    list.innerHTML = html;
    viewerSSPRenderFullscreenGallery((document.getElementById('viewer-fs-img') || {}).src || '');
  }

  function scholarAIIsGarbledText(value) {
    var text = String(value || '').trim();
    if (!text) return false;
    var questionRuns = (text.match(/\?{4,}/g) || []).join('').length;
    var replacementCharCount = (text.match(/�/g) || []).length;
    var weirdKorCount = (text.match(/[癲椰筌怨뺤떪熬곣뫖利당춯쎾퐲꿔꺂㏘틠怨몄젦]/g) || []).length;
    return questionRuns >= Math.max(6, Math.floor(text.length * 0.25))
      || replacementCharCount >= 2
      || weirdKorCount >= Math.max(8, Math.floor(text.length * 0.2));
  }

  function scholarAINormalizeHistory() {
    var before = Array.isArray(__scholarAIHistory) ? __scholarAIHistory.length : 0;
    __scholarAIHistory = (Array.isArray(__scholarAIHistory) ? __scholarAIHistory : []).filter(function (item) {
      if (!item) return false;
      var prompt = String(item.prompt || '');
      var result = String(item.result || '');
      if (!prompt.trim() && !result.trim()) return false;
      return !(scholarAIIsGarbledText(prompt) && scholarAIIsGarbledText(result || prompt));
    });
    return before !== __scholarAIHistory.length;
  }

  function scholarAIHistoryRender() {
    var list = document.getElementById('scholar-ai-history-list');
    var search = document.getElementById('scholar-ai-history-search');
    if (!list) return;
    var q = (search && search.value) || '';
    q = q.trim().toLowerCase();
    var items = q
      ? __scholarAIHistory.filter(function (h) {
          return (String(h.prompt || '') + ' ' + String(h.result || '')).toLowerCase().indexOf(q) >= 0;
        })
      : __scholarAIHistory;
    if (!items.length) {
      list.innerHTML = '<span style="font-size:11px;color:#94a3b8">No ScholarAI history yet.</span>';
      return;
    }
    var html = '';
    for (var i = 0; i < items.length; i++) {
      var idx = __scholarAIHistory.indexOf(items[i]);
      var raw = String(items[i].prompt || items[i].result || 'Untitled history item');
      var lbl = raw.replace(/</g, '&lt;').substring(0, 36) + (raw.length > 36 ? '...' : '');
      html += '<div class="scholar-ai-history-item" data-idx="' + idx + '">';
      html += '<span class="sa-h-label" onclick="scholarAIHistoryShowResult(' + idx + ')" title="Show this result">' + lbl.replace(/'/g, "\\'") + '</span>';
      html += '<button type="button" class="sa-h-save" onclick="scholarAIHistorySaveMd(' + idx + ')" title="Save as Markdown">MD</button>';
      html += '<button type="button" class="sa-h-del" onclick="scholarAIHistoryDelete(' + idx + ')" title="Delete">X</button>';
      html += '</div>';
    }
    list.innerHTML = html;
  }

  window.toggleScholarAI = toggleScholarAI;
  window.scholarAIInitResize = scholarAIInitResize;
  window.scholarAIShrink = scholarAIShrink;
  window.toggleScholarAIPrePrompt = toggleScholarAIPrePrompt;
  window.toggleScholarAIModelSelect = toggleScholarAIModelSelect;
  window.scholarAIFullscreen = scholarAIFullscreen;
  window.scholarAISyncSelection = scholarAISyncSelection;
  window.scholarAIHistoryAdd = scholarAIHistoryAdd;
  window.scholarAIHistoryRender = scholarAIHistoryRender;
  window.scholarAIHistoryShowResult = scholarAIHistoryShowResult;
  window.scholarAIHistoryDelete = scholarAIHistoryDelete;
  window.scholarAIHistorySaveMd = scholarAIHistorySaveMd;
  window.scholarAIHistorySaveAll = scholarAIHistorySaveAll;
  window.scholarAIRun = scholarAIRun;
  window.scholarAICopyResult = scholarAICopyResult;
  window.scholarAIClearResult = scholarAIClearResult;
  window.scholarAIResultFont = scholarAIResultFont;
  window.scholarAIResultZoomOpen = scholarAIResultZoomOpen;
  window.scholarAIResultZoomClose = scholarAIResultZoomClose;
  window.handleScholarAIInsertClick = handleScholarAIInsertClick;
  window.toggleScholarAIInsertMenu = toggleScholarAIInsertMenu;
  window.closeScholarAIInsertMenu = closeScholarAIInsertMenu;
  window.scholarAIInsertDoc = scholarAIInsertDoc;
  window.toggleViewerSSP = toggleViewerSSP;
  window.sspAIShrink = sspAIShrink;
  window.viewerSSPSyncSelection = viewerSSPSyncSelection;
  window.viewerSSPInit = viewerSSPInit;
  window.viewerSSPGenerate = viewerSSPGenerate;
  window.viewerSSPDownload = viewerSSPDownload;
  window.viewerSSPToggleImgbbSettings = viewerSSPToggleImgbbSettings;
  window.viewerSSPSaveImgbbSettings = viewerSSPSaveImgbbSettings;
  window.viewerSSPOpenImgbb = viewerSSPOpenImgbb;
  window.sspInsertImageMarkdown = sspInsertImageMarkdown;
  window.sspInsertImageHtml = sspInsertImageHtml;
  window.viewerSSPUploadHistoryImage = viewerSSPUploadHistoryImage;
  window.viewerSSPClearSeed = viewerSSPClearSeed;
  window.viewerSSPOpenHistoryFullscreen = viewerSSPOpenHistoryFullscreen;
  window.viewerSSPOpenFullscreen = viewerSSPOpenFullscreen;
  window.viewerSSPCloseFullscreen = viewerSSPCloseFullscreen;
  window.viewerSSPImgHistoryRemove = viewerSSPImgHistoryRemove;
  window.viewerSSPAbort = viewerSSPAbort;
  window.viewerSSPFsZoom = viewerSSPFsZoom;
  window.viewerSSPFsDownload = viewerSSPFsDownload;
  window.viewerSSPFsUploadImgbb = viewerSSPFsUploadImgbb;
  window.viewerSSPFsInsert = viewerSSPFsInsert;
  window.viewerSSPFsCrop = viewerSSPFsCrop;
  window.viewerSSPCropFromPanel = viewerSSPCropFromPanel;
  window.viewerSSPInsertLinkToDoc = viewerSSPInsertLinkToDoc;
  window.getSidebarAIHtml = getSidebarAIHtml;

  window.sidebarAIInit = function () {
    scholarAIPromptWrapInitResize();
    scholarAIResultWrapInitResize();
    scholarAIHistoryRender();
    var resTa = document.getElementById('scholar-ai-result');
    if (resTa) resTa.style.fontSize = __scholarAIResultFontSize + 'px';
    var histSearch = document.getElementById('scholar-ai-history-search');
    if (histSearch) histSearch.addEventListener('input', scholarAIHistoryRender);
    /* ????????????????????????????????????????????????????????嫄???????????饔낅챷維?????곌퇈?????⑤슦瑗??ScholarAI ???????????????怨뺤떪?????????????????????(???????????????????) */
    try {
      var SA_CLEAR_FLAG = 'ss_viewer_scholar_ai_history_cleared_v1';
      if (!localStorage.getItem(SA_CLEAR_FLAG)) {
        localStorage.removeItem('ss_viewer_scholar_ai_history');
        __scholarAIHistory = [];
        localStorage.setItem(SA_CLEAR_FLAG, '1');
      } else {
        var saved = localStorage.getItem('ss_viewer_scholar_ai_history');
        if (saved) {
          var arr = JSON.parse(saved);
          if (Array.isArray(arr) && arr.length) __scholarAIHistory = arr;
        }
      }
    } catch (e) {}
    try {
      if (scholarAINormalizeHistory()) scholarAIHistorySave();
    } catch (e) {}
    scholarAIHistoryRender();
    if (!window.__aiDocSelectionBound) {
      window.__aiDocSelectionBound = true;
      document.addEventListener('selectionchange', onAiGlobalSelectionChange);
    }
    var vc = document.getElementById('viewer-container');
    if (vc && !vc.__aiMouseupSel) {
      vc.__aiMouseupSel = true;
      vc.addEventListener('mouseup', function () { setTimeout(syncAiPanelsFromDocumentSelection, 50); });
    }
    var editTa = document.getElementById('viewer-edit-ta');
    if (editTa && !editTa.__aiSelUp) {
      editTa.__aiSelUp = true;
      editTa.addEventListener('mouseup', function () { setTimeout(syncAiPanelsFromDocumentSelection, 50); });
      editTa.addEventListener('keyup', function (e) {
        if (e.key === 'Shift' || e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') setTimeout(syncAiPanelsFromDocumentSelection, 50);
      });
    }
  };

  document.addEventListener('click', function (e) {
    var m = document.getElementById('scholar-ai-insert-menu');
    if (m && m.classList.contains('open') && !m.contains(e.target) && !e.target.onclick) {
      var wrap = document.querySelector('.scholar-ai-insert-wrap');
      if (wrap && !wrap.contains(e.target)) m.classList.remove('open');
    }
  });
})();
