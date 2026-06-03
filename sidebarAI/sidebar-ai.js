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
<!--
  sidebarAI - ScholarAI & SSPAI HTML Fragments
  Include these fragments inside the right-side AI panel host.
-->

<!-- ScholarAI Sidebar -->
<div class="scholar-ai-sidebar" id="scholar-ai-sidebar">
  <div class="scholar-ai-resize-handle" id="scholar-ai-resize-handle" title="Drag to resize"></div>
  <div class="scholar-ai-inner">
    <div class="scholar-ai-header">
      <h3>ScholarAI</h3>
      <span>
        <button type="button" class="sa-btn" onclick="scholarAIFullscreen()" title="전체화면">전체화면</button>
        <button type="button" class="sa-btn sa-popup-toggle-btn" onclick="scholarAIPopupToggle()" title="Popup window">Popup</button>
        <button type="button" class="sa-btn" onclick="scholarAIShrink()" title="닫기">닫기</button>
      </span>
    </div>
    <div class="scholar-ai-body">
      <div class="scholar-ai-options-row" style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">
        <button type="button" class="sa-btn ghost" id="sa-pre-prompt-btn" onclick="toggleScholarAIPrePrompt()" style="font-size:11px">Pre-prompt</button>
        <button type="button" class="sa-btn ghost" id="sa-model-btn" onclick="toggleScholarAIModelSelect()" style="font-size:11px">Model</button>
      </div>
      <div id="scholar-ai-pre-prompt-panel" class="scholar-ai-collapse-panel" style="display:none;margin-bottom:8px">
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin:0 0 8px 0">
          <button type="button" class="sa-btn ghost" style="font-size:10px" onclick="scholarAIUsePromptRole('researcher')">Researcher</button>
          <button type="button" class="sa-btn ghost" style="font-size:10px" onclick="scholarAIUsePromptRole('editor')">Editor</button>
          <button type="button" class="sa-btn ghost" style="font-size:10px" onclick="scholarAIUsePromptRole('developer')">Developer</button>
        </div>
        <textarea id="scholar-ai-pre-prompt-text" class="scholar-ai-pre-prompt-ta" placeholder="Write reusable instructions that should be applied before every request." style="font-size:11px;line-height:1.5;min-height:120px;max-height:400px;resize:vertical;margin:0;padding:8px;background:#1a1e28;border-radius:4px;border:1px solid #2e3447;color:#fff;width:100%;box-sizing:border-box;display:block"></textarea>
      </div>
      <div id="scholar-ai-model-panel" class="scholar-ai-collapse-panel" style="display:none;margin-bottom:8px">
        <label style="font-size:10px;margin-bottom:4px">Model</label>
        <select id="scholar-ai-model-select" class="sa-model-select" style="width:100%;padding:6px 8px;font-size:11px;border:1px solid #2e3447;border-radius:4px;background:#1a1e28;color:#b0bac8">
          <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
          <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
          <option value="gemini-3-flash-preview">Gemini 3 Flash</option>
          <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite</option>
          <option value="gemini-2.0-flash-exp">Gemini 2.0 Flash Exp</option>
        </select>
        <label for="scholar-ai-tone-select" style="font-size:10px;margin:8px 0 4px">Writing tone</label>
        <select id="scholar-ai-tone-select" class="sa-model-select" style="width:100%;padding:6px 8px;font-size:11px;border:1px solid #2e3447;border-radius:4px;background:#1a1e28;color:#b0bac8">
          <option value="academic_ida">Academic (-ida)</option>
          <option value="academic_eumham">Academic (-eum/-ham)</option>
          <option value="general_polite">General polite</option>
        </select>
      </div>
      <label>Selected text</label>
      <div class="scholar-ai-selected-wrap" id="scholar-ai-selected-wrap">
        <textarea id="scholar-ai-selected" placeholder="The selected passage from the current document appears here."></textarea>
        <div class="scholar-ai-selected-resize-handle" id="scholar-ai-selected-resize-handle" title="Resize selected text"></div>
      </div>
      <div class="scholar-ai-prompt-wrap" id="scholar-ai-prompt-wrap">
        <label>Prompt / Question</label>
        <textarea id="scholar-ai-prompt" placeholder="Ask for a summary, explanation, comparison, outline, or question set."></textarea>
        <div class="scholar-ai-prompt-resize-handle" id="scholar-ai-prompt-resize-handle" title="Resize prompt"></div>
      </div>
      <div class="scholar-ai-run-row">
        <button type="button" id="scholar-ai-run-btn" class="sa-btn" style="background:#4f8ef7;color:#fff;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px" onclick="scholarAIRun()">Run</button>
        <button type="button" id="scholar-ai-stop-btn" class="sa-btn ghost" style="padding:6px 12px;font-size:12px" onclick="scholarAIStop()" disabled>Stop</button>
        <div id="scholar-ai-progress-wrap" class="scholar-ai-progress-wrap" aria-live="polite"><div class="scholar-ai-progress-bar"><div id="scholar-ai-progress-fill" class="scholar-ai-progress-fill"></div></div><span id="scholar-ai-progress-pct" class="scholar-ai-progress-pct">0%</span></div>
      </div>
      <div class="scholar-ai-result-wrap" id="scholar-ai-result-wrap">
        <label>Result</label>
        <textarea id="scholar-ai-result" class="scholar-ai-result" placeholder="The generated result will appear here."></textarea>
        <div class="scholar-ai-result-resize-handle" id="scholar-ai-result-resize-handle" title="Resize result"></div>
      </div>
    </div>
    <div class="scholar-ai-footer">
      <div class="scholar-ai-insert-wrap">
        <button type="button" class="sa-btn ghost" onclick="handleScholarAIInsertClick()">Insert into document</button>
        <div class="scholar-ai-insert-menu" id="scholar-ai-insert-menu">
          <button type="button" onclick="scholarAIInsertDoc(0); closeScholarAIInsertMenu()">Insert at cursor</button>
          <button type="button" onclick="scholarAIInsertDoc(1); closeScholarAIInsertMenu()">Append to document</button>
          <button type="button" onclick="scholarAIInsertDoc(2); closeScholarAIInsertMenu()">Replace selection</button>
          <button type="button" onclick="scholarAIInsertDoc(3); closeScholarAIInsertMenu()">GenSlide HTMLCode</button>
          <button type="button" onclick="scholarAIInsertDoc(4); closeScholarAIInsertMenu()">Mermaid(ME)</button>
        </div>
      </div>
      <button type="button" class="sa-btn ghost" onclick="scholarAIResultZoomOpen()" title="Open result in a larger editor">Zoom result</button>
      <span class="sa-font">font</span>
      <button type="button" class="sa-btn ghost" onclick="scholarAIResultFont(-1)">-</button>
      <button type="button" class="sa-btn ghost" onclick="scholarAIResultFont(1)">+</button>
      <button type="button" class="sa-btn" onclick="scholarAICopyResult()">Copy result</button>
      <button type="button" class="sa-btn ghost" onclick="scholarAIClearResult()" title="Clear the result">Clear result</button>
    </div>
    <div id="scholar-ai-result-zoom-overlay" class="scholar-ai-result-zoom-overlay" onclick="if(event.target.id==='scholar-ai-result-zoom-overlay') scholarAIResultZoomClose()">
      <div class="scholar-ai-result-zoom-box" onclick="event.stopPropagation()">
        <div class="scholar-ai-result-zoom-header">
          <span>Zoomed result view</span>
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <button type="button" class="sa-btn ghost" onclick="scholarAIAdjustZoom(-10)" style="font-size:12px">-</button>
            <span id="scholar-ai-zoom-label" style="font-size:11px;min-width:42px;text-align:center;color:#94a3b8">100%</span>
            <button type="button" class="sa-btn ghost" onclick="scholarAIAdjustZoom(10)" style="font-size:12px">+</button>
            <span style="display:inline-block;width:1px;height:16px;background:#334155;opacity:.6"></span>
            <button type="button" id="scholar-ai-zoom-mode-edit" class="sa-btn ghost" onclick="scholarAISetZoomMode('edit')" style="font-size:12px">Edit</button>
            <button type="button" id="scholar-ai-zoom-mode-view" class="sa-btn ghost" onclick="scholarAISetZoomMode('view')" style="font-size:12px">View</button>
            <button type="button" class="sa-btn" onclick="scholarAICopyZoomMarkdown()" style="font-size:12px">Copy MD</button>
            <button type="button" class="sa-btn ghost" onclick="scholarAIResultZoomClose()" style="font-size:12px">Close</button>
          </div>
        </div>
        <div class="scholar-ai-result-zoom-body">
          <textarea id="scholar-ai-result-zoom-ta" placeholder="The result will appear here." oninput="if(window.__scholarAIZoomMode==='view'){scholarAIRenderZoomMarkdown()}"></textarea>
          <div id="scholar-ai-result-zoom-view" class="scholar-ai-result-zoom-view hidden"></div>
        </div>
      </div>
    </div>
    <div class="scholar-ai-history" id="scholar-ai-history">
      <div class="scholar-ai-history-toolbar" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
        <button type="button" id="scholar-ai-history-toggle-btn" class="sa-btn ghost" onclick="scholarAIToggleHistoryPanel()">히스토리보기</button>
        <button type="button" class="sa-btn ghost" onclick="scholarAIHistorySaveAll()">히스토리 전체저장</button>
      </div>
      <div id="scholar-ai-history-panel" style="display:none;margin-top:6px">
        <input type="text" id="scholar-ai-history-search" placeholder="히스토리 검색..." class="scholar-ai-history-search">
        <div id="scholar-ai-history-list" class="scholar-ai-history-list"></div>
      </div>
    </div>
  </div>
</div>

<!-- SSPAI Sidebar -->
<div class="ssp-ai-sidebar" id="ssp-ai-sidebar">
  <div class="ssp-inner">
    <div class="ssp-header">
      <h3>sspimgAI</h3>
      <div class="ssp-header-actions">
        <button type="button" class="sa-btn ghost ssp-fullscreen-btn" onclick="sspAIFullscreen()" title="전체화면">전체화면</button>
        <button type="button" class="sa-btn ghost ssp-popup-toggle-btn" onclick="sspAIPopupToggle()" title="Popup">Popup</button>
        <button type="button" class="sa-btn ghost" onclick="sspAIShrink()" title="닫기">닫기</button>
      </div>
    </div>
    <div class="ssp-main">
      <div id="ssp-upload-zone" class="ssp-upload" onclick="document.getElementById('ssp-file-input').click()" title="Click to upload an image">
        Image upload (JPG, PNG, GIF, WebP)<br><small>or Ctrl+V paste</small>
      </div>
      <div class="ssp-sketch-row">
        <button type="button" class="sa-btn ghost ssp-btn-sketch" onclick="viewerSSPOpenSketchpad()" title="스케치 그림판 열기">스케치 그림판</button>
      </div>
      <input type="file" id="ssp-file-input" accept="image/*" style="display:none">
      <label>Prompt 1 (used for variation when a seed image is provided)</label>
      <textarea id="ssp-prompt" placeholder="Example: Convert this into a lecture diagram style."></textarea>
      <label>Prompt 2 (optional, used together with Prompt 1)</label>
      <textarea id="ssp-prompt-2" placeholder="Example: Use a dark blue background and English labels."></textarea>
      <label>Image generation model</label>
      <select id="ssp-model">
        <option value="gemini-3.1-flash-image-preview">Nano Banana 2</option>
        <option value="gemini-2.5-flash-image">Nano Banana</option>
        <option value="gemini-3-pro-image-preview">Nano Banana Pro</option>
        <option value="imagen-4.0-generate-001">Imagen 4</option>
      </select>
      <label>Image ratio</label>
      <div class="ssp-ratio-wrap">
        <button type="button" class="ssp-ratio-btn active" data-ratio="1:1">1:1</button>
        <button type="button" class="ssp-ratio-btn" data-ratio="16:9">16:9</button>
        <button type="button" class="ssp-ratio-btn" data-ratio="9:16">9:16</button>
        <button type="button" class="ssp-ratio-btn" data-ratio="4:3">4:3</button>
        <button type="button" class="ssp-ratio-btn" data-ratio="3:4">3:4</button>
      </div>
      <label style="font-size:10px;color:#64748b;display:block;margin-bottom:4px">Default: academic / document-style visual</label>
      <label><input type="checkbox" id="ssp-no-text"> Pure image (no text)</label>
      <div class="ssp-action-row">
        <button type="button" class="sa-btn ssp-btn-generate" onclick="viewerSSPGenerate()">Generate</button>
        <button type="button" class="sa-btn ghost ssp-btn-internal-insert" onclick="viewerSSPSaveInternalAndInsert('markdown')" title="Save result internally and insert into document">문서삽입</button>
        <button type="button" class="sa-btn ghost ssp-btn-crop" onclick="viewerSSPCropFromPanel()" title="Crop current result">Crop</button>
        <button type="button" class="sa-btn ssp-btn-imgbb" onclick="viewerSSPOpenImgbb()" title="Upload to imgBB">[imgBB] Upload</button>
        <button type="button" class="sa-btn ghost ssp-btn-imgbb-settings" onclick="viewerSSPToggleImgbbSettings()" title="imgBB settings">Settings</button>
      </div>
      <div id="ssp-imgbb-settings" class="ssp-imgbb-settings" style="display:none;margin:8px 0;padding:10px;border:1px solid #cbd5e1;border-radius:10px;background:rgba(248,250,252,0.9)">
        <label for="ssp-imgbb-api-key" style="display:block;font-size:11px;font-weight:700;color:#334155;margin-bottom:6px">imgBB API Key</label>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <input type="password" id="ssp-imgbb-api-key" class="ssp-image-link-input" placeholder="imgBB API key" autocomplete="off" spellcheck="false" style="flex:1 1 220px;min-width:180px">
          <button type="button" class="sa-btn ghost" onclick="viewerSSPSaveImgbbSettings()">Save</button>
        </div>
        <div id="ssp-imgbb-settings-status" style="margin-top:6px;font-size:10px;color:#64748b">Enter your imgBB API key to enable direct uploads.</div>
        <div style="margin-top:8px;font-size:11px">
          <a href="https://api.imgbb.com/" target="_blank" rel="noopener noreferrer" style="color:#2563eb;text-decoration:underline">Get API key: https://api.imgbb.com/</a>
        </div>
      </div>
      <label class="ssp-img-link-label">Image URL -> Insert (Markdown / HTML)</label>
      <div class="ssp-img-link-row">
        <input type="url" id="ssp-image-link-url" class="ssp-image-link-input" placeholder="https://i.ibb.co/... (imgBB direct link)" inputmode="url">
        <button type="button" class="sa-btn ghost ssp-btn-insert-md" onclick="sspInsertImageMarkdown()">Markdown</button>
        <button type="button" class="sa-btn ghost ssp-btn-insert-html" onclick="sspInsertImageHtml()">HTML</button>
      </div>
      <div id="ssp-progress-wrap" class="ssp-progress-wrap">
        <div class="ssp-progress-bar">
          <div id="ssp-progress-fill" class="ssp-progress-fill"></div>
        </div>
        <div class="ssp-progress-row">
          <span id="ssp-progress-pct" style="font-size:10px;color:#94a3b8">0%</span>
          <button type="button" class="sa-btn ghost" style="font-size:10px" onclick="viewerSSPAbort()">Abort</button>
        </div>
      </div>
      <div id="ssp-status" class="ssp-status"></div>
      <img id="ssp-result-img" class="ssp-result" style="display:none" alt="Generated image" title="Generated image preview">
      <button type="button" class="sa-btn ghost ssp-btn-open-result" style="margin-top:8px" onclick="viewerSSPOpenCurrentResultFullscreen()" disabled>크게보기</button>
      <button type="button" class="sa-btn ghost" style="margin-top:8px" onclick="viewerSSPDownload()" id="ssp-download-btn" disabled>Download</button>
    </div>
    <div class="ssp-history-resizer" title="Drag to resize history"></div>
    <div class="ssp-img-history" style="margin-top:12px;border-top:1px solid #2e3447;padding-top:8px">
      <label style="font-size:10px;color:#94a3b8;display:block;margin-bottom:6px">Image History</label>
      <div id="ssp-img-history-list" class="ssp-img-history-list"></div>
    </div>
  </div>
</div>

<!-- SSP Fullscreen Overlay -->
<div id="viewer-fs-overlay" class="viewer-fs-overlay" onclick="if(event.target.id==='viewer-fs-overlay'||event.target.id==='viewer-fs-area') viewerSSPCloseFullscreen()">
  <div class="viewer-fs-toolbar" onclick="event.stopPropagation()">
    <button type="button" onclick="viewerSSPFsZoom(-0.25)" title="Zoom out">-</button>
    <span id="viewer-fs-zoom-val" style="min-width:40px;text-align:center;font-size:12px">100%</span>
    <button type="button" onclick="viewerSSPFsZoom(0.25)" title="Zoom in">+</button>
    <button type="button" onclick="viewerSSPFsDownload()" title="Download">Download</button>
    <button type="button" class="viewer-fs-imgbb-btn" onclick="viewerSSPFsUploadImgbb()" title="Upload to imgBB">imgBB Upload</button>
    <button type="button" class="viewer-fs-internal-insert-btn" onclick="viewerSSPFsSaveInternalAndInsert()" title="Save internally and insert into document">문서삽입</button>
    <button type="button" class="viewer-fs-insert-btn" onclick="viewerSSPFsInsert()" title="Insert into document">Insert</button>
    <button type="button" class="viewer-fs-apply-btn" onclick="viewerSSPFsApplyToSSP()" title="sspimgAI 입력란에 적용">적용</button>
    <button type="button" onclick="viewerSSPFsCrop()" title="Crop">Crop</button>
    <button type="button" onclick="viewerSSPCloseFullscreen()" title="Close">Close</button>
  </div>
  <aside id="viewer-fs-gallery" class="viewer-fs-gallery" onclick="event.stopPropagation()">
    <div class="viewer-fs-gallery-title">History Gallery</div>
    <div id="viewer-fs-gallery-list" class="viewer-fs-gallery-list"></div>
  </aside>
  <div id="viewer-fs-imgbb-info" class="viewer-fs-imgbb-info"></div>
  <div class="viewer-fs-area" id="viewer-fs-area">
    <div class="viewer-fs-wrap" id="viewer-fs-wrap"><img id="viewer-fs-img" alt=""></div>
  </div>
</div>
`;

  var CLEAN_SIDEBAR_AI_HTML = String.raw`
<!--
  sidebarAI - ScholarAI & SSPAI HTML Fragments
  Include these fragments inside the right-side AI panel host.
-->

<!-- ScholarAI Sidebar -->
<div class="scholar-ai-sidebar" id="scholar-ai-sidebar">
  <div class="scholar-ai-resize-handle" id="scholar-ai-resize-handle" title="Drag to resize"></div>
  <div class="scholar-ai-inner">
    <div class="scholar-ai-header">
      <h3>ScholarAI</h3>
      <span>
        <button type="button" class="sa-btn" onclick="scholarAIShrink()" title="닫기">닫기</button>
        <button type="button" class="sa-btn sa-popup-toggle-btn" onclick="scholarAIPopupToggle()" title="Popup window">Popup</button>
        <button type="button" class="sa-btn" onclick="scholarAIFullscreen()" title="전체화면">전체화면</button>
      </span>
    </div>
    <div class="scholar-ai-body">
      <div class="scholar-ai-options-row" style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">
        <button type="button" class="sa-btn ghost" id="sa-pre-prompt-btn" onclick="toggleScholarAIPrePrompt()" style="font-size:11px">Pre-prompt</button>
        <button type="button" class="sa-btn ghost" id="sa-model-btn" onclick="toggleScholarAIModelSelect()" style="font-size:11px">Model</button>
      </div>
      <div id="scholar-ai-pre-prompt-panel" class="scholar-ai-collapse-panel" style="display:none;margin-bottom:8px">
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin:0 0 8px 0">
          <button type="button" class="sa-btn ghost" style="font-size:10px" onclick="scholarAIUsePromptRole('researcher')">Researcher</button>
          <button type="button" class="sa-btn ghost" style="font-size:10px" onclick="scholarAIUsePromptRole('editor')">Editor</button>
          <button type="button" class="sa-btn ghost" style="font-size:10px" onclick="scholarAIUsePromptRole('developer')">Developer</button>
        </div>
        <textarea id="scholar-ai-pre-prompt-text" class="scholar-ai-pre-prompt-ta" placeholder="Write reusable instructions that should be applied before every request." style="font-size:11px;line-height:1.5;min-height:120px;max-height:400px;resize:vertical;margin:0;padding:8px;background:#1a1e28;border-radius:4px;border:1px solid #2e3447;color:#fff;width:100%;box-sizing:border-box;display:block"></textarea>
      </div>
      <div id="scholar-ai-model-panel" class="scholar-ai-collapse-panel" style="display:none;margin-bottom:8px">
        <label style="font-size:10px;margin-bottom:4px">Model</label>
        <select id="scholar-ai-model-select" class="sa-model-select" style="width:100%;padding:6px 8px;font-size:11px;border:1px solid #2e3447;border-radius:4px;background:#1a1e28;color:#b0bac8">
          <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
          <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
          <option value="gemini-3-flash-preview">Gemini 3 Flash</option>
          <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite</option>
          <option value="gemini-2.0-flash-exp">Gemini 2.0 Flash Exp</option>
        </select>
        <label for="scholar-ai-tone-select" style="font-size:10px;margin:8px 0 4px">Writing tone</label>
        <select id="scholar-ai-tone-select" class="sa-model-select" style="width:100%;padding:6px 8px;font-size:11px;border:1px solid #2e3447;border-radius:4px;background:#1a1e28;color:#b0bac8">
          <option value="academic_ida">Academic (-ida)</option>
          <option value="academic_eumham">Academic (-eum/-ham)</option>
          <option value="general_polite">General polite</option>
        </select>
      </div>
      <label>Selected text</label>
      <div class="scholar-ai-selected-wrap" id="scholar-ai-selected-wrap">
        <textarea id="scholar-ai-selected" placeholder="The selected passage from the current document appears here."></textarea>
        <div class="scholar-ai-selected-resize-handle" id="scholar-ai-selected-resize-handle" title="Resize selected text"></div>
      </div>
      <div class="scholar-ai-prompt-wrap" id="scholar-ai-prompt-wrap">
        <label>Prompt / Question</label>
        <textarea id="scholar-ai-prompt" placeholder="Ask for a summary, explanation, comparison, outline, or question set."></textarea>
        <div class="scholar-ai-prompt-resize-handle" id="scholar-ai-prompt-resize-handle" title="Resize prompt"></div>
      </div>
      <div class="scholar-ai-run-row">
        <button type="button" id="scholar-ai-run-btn" class="sa-btn" style="background:#4f8ef7;color:#fff;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px" onclick="scholarAIRun()">Run</button>
        <button type="button" id="scholar-ai-stop-btn" class="sa-btn ghost" style="padding:6px 12px;font-size:12px" onclick="scholarAIStop()" disabled>Stop</button>
        <div id="scholar-ai-progress-wrap" class="scholar-ai-progress-wrap" aria-live="polite"><div class="scholar-ai-progress-bar"><div id="scholar-ai-progress-fill" class="scholar-ai-progress-fill"></div></div><span id="scholar-ai-progress-pct" class="scholar-ai-progress-pct">0%</span></div>
      </div>
      <div class="scholar-ai-result-wrap" id="scholar-ai-result-wrap">
        <label>Result</label>
        <textarea id="scholar-ai-result" class="scholar-ai-result" placeholder="The generated result will appear here."></textarea>
        <div class="scholar-ai-result-resize-handle" id="scholar-ai-result-resize-handle" title="Resize result"></div>
      </div>
    </div>
    <div class="scholar-ai-footer">
      <div class="scholar-ai-insert-wrap">
        <button type="button" class="sa-btn ghost" onclick="handleScholarAIInsertClick()">Insert into document</button>
        <div class="scholar-ai-insert-menu" id="scholar-ai-insert-menu">
          <button type="button" onclick="scholarAIInsertDoc(0); closeScholarAIInsertMenu()">Insert at cursor</button>
          <button type="button" onclick="scholarAIInsertDoc(1); closeScholarAIInsertMenu()">Append to document</button>
          <button type="button" onclick="scholarAIInsertDoc(2); closeScholarAIInsertMenu()">Replace selection</button>
          <button type="button" onclick="scholarAIInsertDoc(3); closeScholarAIInsertMenu()">GenSlide HTMLCode</button>
          <button type="button" onclick="scholarAIInsertDoc(4); closeScholarAIInsertMenu()">Mermaid(ME)</button>
        </div>
      </div>
      <button type="button" class="sa-btn ghost" onclick="scholarAIResultZoomOpen()" title="Open result in a larger editor">Zoom result</button>
      <span class="sa-font">font</span>
      <button type="button" class="sa-btn ghost" onclick="scholarAIResultFont(-1)">-</button>
      <button type="button" class="sa-btn ghost" onclick="scholarAIResultFont(1)">+</button>
      <button type="button" class="sa-btn" onclick="scholarAICopyResult()">Copy result</button>
      <button type="button" class="sa-btn ghost" onclick="scholarAIClearResult()" title="Clear the result">Clear result</button>
    </div>
    <div id="scholar-ai-result-zoom-overlay" class="scholar-ai-result-zoom-overlay" onclick="if(event.target.id==='scholar-ai-result-zoom-overlay') scholarAIResultZoomClose()">
      <div class="scholar-ai-result-zoom-box" onclick="event.stopPropagation()">
        <div class="scholar-ai-result-zoom-header">
          <span>Zoomed result view</span>
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <button type="button" class="sa-btn ghost" onclick="scholarAIAdjustZoom(-10)" style="font-size:12px">-</button>
            <span id="scholar-ai-zoom-label" style="font-size:11px;min-width:42px;text-align:center;color:#94a3b8">100%</span>
            <button type="button" class="sa-btn ghost" onclick="scholarAIAdjustZoom(10)" style="font-size:12px">+</button>
            <span style="display:inline-block;width:1px;height:16px;background:#334155;opacity:.6"></span>
            <button type="button" id="scholar-ai-zoom-mode-edit" class="sa-btn ghost" onclick="scholarAISetZoomMode('edit')" style="font-size:12px">Edit</button>
            <button type="button" id="scholar-ai-zoom-mode-view" class="sa-btn ghost" onclick="scholarAISetZoomMode('view')" style="font-size:12px">View</button>
            <button type="button" class="sa-btn" onclick="scholarAICopyZoomMarkdown()" style="font-size:12px">Copy MD</button>
            <button type="button" class="sa-btn ghost" onclick="scholarAIResultZoomClose()" style="font-size:12px">Close</button>
          </div>
        </div>
        <div class="scholar-ai-result-zoom-body">
          <textarea id="scholar-ai-result-zoom-ta" placeholder="The result will appear here." oninput="if(window.__scholarAIZoomMode==='view'){scholarAIRenderZoomMarkdown()}"></textarea>
          <div id="scholar-ai-result-zoom-view" class="scholar-ai-result-zoom-view hidden"></div>
        </div>
      </div>
    </div>
    <div class="scholar-ai-history" id="scholar-ai-history">
      <div class="scholar-ai-history-toolbar" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
        <button type="button" id="scholar-ai-history-toggle-btn" class="sa-btn ghost" onclick="scholarAIToggleHistoryPanel()">히스토리보기</button>
        <button type="button" class="sa-btn ghost" onclick="scholarAIHistorySaveAll()">히스토리 전체저장</button>
      </div>
      <div id="scholar-ai-history-panel" style="display:none;margin-top:6px">
        <input type="text" id="scholar-ai-history-search" placeholder="히스토리 검색..." class="scholar-ai-history-search">
        <div id="scholar-ai-history-list" class="scholar-ai-history-list"></div>
      </div>
    </div>
  </div>
</div>

<!-- SSPAI Sidebar -->
<div class="ssp-ai-sidebar" id="ssp-ai-sidebar">
  <div class="ssp-inner">
    <div class="ssp-header">
      <h3>sspimgAI</h3>
      <div class="ssp-header-actions">
        <button type="button" class="sa-btn ghost" onclick="sspAIShrink()" title="닫기">닫기</button>
        <button type="button" class="sa-btn ghost ssp-popup-toggle-btn" onclick="sspAIPopupToggle()" title="Popup">Popup</button>
        <button type="button" class="sa-btn ghost ssp-fullscreen-btn" onclick="sspAIFullscreen()" title="전체화면">전체화면</button>
      </div>
    </div>
    <div class="ssp-main">
      <div id="ssp-upload-zone" class="ssp-upload" onclick="document.getElementById('ssp-file-input').click()" title="Click to upload an image">
        Image upload (JPG, PNG, GIF, WebP)<br><small>or Ctrl+V paste</small>
      </div>
      <input type="file" id="ssp-file-input" accept="image/*" style="display:none">
      <label>Prompt 1 (used for variation when a seed image is provided)</label>
      <textarea id="ssp-prompt" placeholder="Example: Convert this into a lecture diagram style."></textarea>
      <label>Prompt 2 (optional, used together with Prompt 1)</label>
      <textarea id="ssp-prompt-2" placeholder="Example: Use a dark blue background and English labels."></textarea>
      <label>Image generation model</label>
      <select id="ssp-model">
        <option value="gemini-3.1-flash-image-preview">Nano Banana 2</option>
        <option value="gemini-2.5-flash-image">Nano Banana</option>
        <option value="gemini-3-pro-image-preview">Nano Banana Pro</option>
        <option value="imagen-4.0-generate-001">Imagen 4</option>
      </select>
      <label>Image ratio</label>
      <div class="ssp-ratio-wrap">
        <button type="button" class="ssp-ratio-btn active" data-ratio="1:1">1:1</button>
        <button type="button" class="ssp-ratio-btn" data-ratio="16:9">16:9</button>
        <button type="button" class="ssp-ratio-btn" data-ratio="9:16">9:16</button>
        <button type="button" class="ssp-ratio-btn" data-ratio="4:3">4:3</button>
        <button type="button" class="ssp-ratio-btn" data-ratio="3:4">3:4</button>
      </div>
      <label style="font-size:10px;color:#64748b;display:block;margin-bottom:4px">Default: academic / document-style visual</label>
      <label><input type="checkbox" id="ssp-no-text"> Pure image (no text)</label>
      <div class="ssp-action-row">
        <button type="button" class="sa-btn ssp-btn-generate" onclick="viewerSSPGenerate()">Generate</button>
        <button type="button" class="sa-btn ghost ssp-btn-internal-insert" onclick="viewerSSPSaveInternalAndInsert('markdown')" title="Save result internally and insert into document">문서삽입</button>
        <button type="button" class="sa-btn ghost ssp-btn-crop" onclick="viewerSSPCropFromPanel()" title="Crop current result">Crop</button>
        <button type="button" class="sa-btn ssp-btn-imgbb" onclick="viewerSSPOpenImgbb()" title="Upload to imgBB">[imgBB] Upload</button>
        <button type="button" class="sa-btn ghost ssp-btn-imgbb-settings" onclick="viewerSSPToggleImgbbSettings()" title="imgBB settings">Settings</button>
      </div>
      <div id="ssp-imgbb-settings" class="ssp-imgbb-settings" style="display:none;margin:8px 0;padding:10px;border:1px solid #cbd5e1;border-radius:10px;background:rgba(248,250,252,0.9)">
        <label for="ssp-imgbb-api-key" style="display:block;font-size:11px;font-weight:700;color:#334155;margin-bottom:6px">imgBB API Key</label>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <input type="password" id="ssp-imgbb-api-key" class="ssp-image-link-input" placeholder="imgBB API key" autocomplete="off" spellcheck="false" style="flex:1 1 220px;min-width:180px">
          <button type="button" class="sa-btn ghost" onclick="viewerSSPSaveImgbbSettings()">Save</button>
        </div>
        <div id="ssp-imgbb-settings-status" style="margin-top:6px;font-size:10px;color:#64748b">Enter your imgBB API key to enable direct uploads.</div>
        <div style="margin-top:8px;font-size:11px">
          <a href="https://api.imgbb.com/" target="_blank" rel="noopener noreferrer" style="color:#2563eb;text-decoration:underline">Get API key: https://api.imgbb.com/</a>
        </div>
      </div>
      <label class="ssp-img-link-label">Image URL -> Insert (Markdown / HTML)</label>
      <div class="ssp-img-link-row">
        <input type="url" id="ssp-image-link-url" class="ssp-image-link-input" placeholder="https://i.ibb.co/... (imgBB direct link)" inputmode="url">
        <button type="button" class="sa-btn ghost ssp-btn-insert-md" onclick="sspInsertImageMarkdown()">Markdown</button>
        <button type="button" class="sa-btn ghost ssp-btn-insert-html" onclick="sspInsertImageHtml()">HTML</button>
      </div>
      <div id="ssp-progress-wrap" class="ssp-progress-wrap">
        <div class="ssp-progress-bar">
          <div id="ssp-progress-fill" class="ssp-progress-fill"></div>
        </div>
        <div class="ssp-progress-row">
          <span id="ssp-progress-pct" style="font-size:10px;color:#94a3b8">0%</span>
          <button type="button" class="sa-btn ghost" style="font-size:10px" onclick="viewerSSPAbort()">Abort</button>
        </div>
      </div>
      <div id="ssp-status" class="ssp-status"></div>
      <img id="ssp-result-img" class="ssp-result" style="display:none" alt="Generated image" title="Generated image preview">
      <button type="button" class="sa-btn ghost ssp-btn-open-result" style="margin-top:8px" onclick="viewerSSPOpenCurrentResultFullscreen()" disabled>크게보기</button>
      <button type="button" class="sa-btn ghost" style="margin-top:8px" onclick="viewerSSPDownload()" id="ssp-download-btn" disabled>Download</button>
    </div>
    <div class="ssp-history-resizer" title="Drag to resize history"></div>
    <div class="ssp-img-history" style="margin-top:12px;border-top:1px solid #2e3447;padding-top:8px">
      <label style="font-size:10px;color:#94a3b8;display:block;margin-bottom:6px">Image History</label>
      <div id="ssp-img-history-list" class="ssp-img-history-list"></div>
    </div>
  </div>
</div>

<!-- SSP Fullscreen Overlay -->
<div id="viewer-fs-overlay" class="viewer-fs-overlay" onclick="if(event.target.id==='viewer-fs-overlay'||event.target.id==='viewer-fs-area') viewerSSPCloseFullscreen()">
  <div class="viewer-fs-toolbar" onclick="event.stopPropagation()">
    <button type="button" onclick="viewerSSPFsZoom(-0.25)" title="Zoom out">-</button>
    <span id="viewer-fs-zoom-val" style="min-width:40px;text-align:center;font-size:12px">100%</span>
    <button type="button" onclick="viewerSSPFsZoom(0.25)" title="Zoom in">+</button>
    <button type="button" onclick="viewerSSPFsDownload()" title="Download">Download</button>
    <button type="button" class="viewer-fs-imgbb-btn" onclick="viewerSSPFsUploadImgbb()" title="Upload to imgBB">imgBB Upload</button>
    <button type="button" class="viewer-fs-internal-insert-btn" onclick="viewerSSPFsSaveInternalAndInsert()" title="Save internally and insert into document">문서삽입</button>
    <button type="button" class="viewer-fs-insert-btn" onclick="viewerSSPFsInsert()" title="Insert into document">Insert</button>
    <button type="button" class="viewer-fs-apply-btn" onclick="viewerSSPFsApplyToSSP()" title="sspimgAI 입력란에 적용">적용</button>
    <button type="button" onclick="viewerSSPFsCrop()" title="Crop">Crop</button>
    <button type="button" onclick="viewerSSPCloseFullscreen()" title="Close">Close</button>
  </div>
  <aside id="viewer-fs-gallery" class="viewer-fs-gallery" onclick="event.stopPropagation()">
    <div class="viewer-fs-gallery-title">History Gallery</div>
    <div id="viewer-fs-gallery-list" class="viewer-fs-gallery-list"></div>
  </aside>
  <div id="viewer-fs-imgbb-info" class="viewer-fs-imgbb-info"></div>
  <div class="viewer-fs-area" id="viewer-fs-area">
    <div class="viewer-fs-wrap" id="viewer-fs-wrap"><img id="viewer-fs-img" alt=""></div>
  </div>
</div>
`;

  var __scholarAISelStart = null, __scholarAISelEnd = null, __scholarAICursorPos = null, __scholarAIResultFontSize = 13;
  var __scholarAITextFontSizes = {};
  var __scholarAILastSelectionTarget = null, __scholarAILastSelectionDoc = null;
  var __scholarAIActiveResultTab = 'insert';
  var __scholarAIZoomPercent = 100, __scholarAIZoomMode = 'edit';
  window.__scholarAIZoomMode = __scholarAIZoomMode;
  var __scholarAIRunning = false;
  var __scholarAIProgressTimer = null;
  var __scholarAIProgressValue = 0;
  var __scholarAIHistory = [];
  var __viewerSSPSeedImage = null, __viewerSSPResultImage = null, __viewerSSPRatio = '1:1';
  var __viewerSSPTextFontSizes = {};
  var __viewerSSPGenerating = false, __viewerSSPAbortRequested = false;
  var __viewerSSPImgbbUploading = false;
  var __viewerSSPImgHistory = [];
  var __viewerSSPExternalFsGallery = [];
  var LS_SSP_IMG_HISTORY = 'ss_viewer_ssp_img_history';
  var LS_SSP_PANEL_SPLIT = 'ss_viewer_ssp_panel_split';
  var LS_SA_POPUP_MODE = 'ss_viewer_sa_popup_mode';
  var LS_SSP_POPUP_MODE = 'ss_viewer_ssp_popup_mode';
  var LS_SA_HISTORY_COLLAPSED = 'ss_viewer_sa_history_collapsed';
  var LS_SA_POPUP_RECT = 'ss_viewer_sa_popup_rect';
  var LS_SSP_POPUP_RECT = 'ss_viewer_ssp_popup_rect';
  var LS_SA_TONE_PRESET = 'ss_viewer_scholar_ai_tone_preset';
  var SA_TONE_DEFAULT = 'academic_ida';
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

  function getPopupModeKey(panelId) {
    return panelId === 'ssp-ai-sidebar' ? LS_SSP_POPUP_MODE : LS_SA_POPUP_MODE;
  }

  function getPopupRectKey(panelId) {
    return panelId === 'ssp-ai-sidebar' ? LS_SSP_POPUP_RECT : LS_SA_POPUP_RECT;
  }

  function isPanelPopupMode(panelId) {
    var key = getPopupModeKey(panelId);
    try { return localStorage.getItem(key) === '1'; } catch (e) { return false; }
  }

  function updatePopupToggleLabels() {
    var sa = document.getElementById('scholar-ai-sidebar');
    var sp = document.getElementById('ssp-ai-sidebar');
    var saPopup = !!(sa && sa.classList.contains('popup'));
    var spPopup = !!(sp && sp.classList.contains('popup'));
    var saBtns = document.querySelectorAll('.sa-popup-toggle-btn');
    var spBtns = document.querySelectorAll('.ssp-popup-toggle-btn');
    for (var i = 0; i < saBtns.length; i++) saBtns[i].textContent = saPopup ? 'Dock' : 'Popup';
    for (var j = 0; j < spBtns.length; j++) spBtns[j].textContent = spPopup ? 'Dock' : 'Popup';
  }

  function updateScholarHeaderActionButtons() {
    var panel = document.getElementById('scholar-ai-sidebar');
    if (!panel) return;
    var closeBtn = panel.querySelector('.scholar-ai-header button[onclick*="scholarAIShrink"]');
    var fullBtn = panel.querySelector('.scholar-ai-header button[onclick*="scholarAIFullscreen"]');
    if (closeBtn) {
      closeBtn.textContent = '닫기';
      closeBtn.title = '닫기';
    }
    if (fullBtn) {
      var isFullscreen = panel.classList.contains('fullscreen');
      fullBtn.textContent = isFullscreen ? '축소' : '전체화면';
      fullBtn.title = isFullscreen ? '축소' : '전체화면';
    }
  }

  function updateSSPHeaderActionButtons() {
    var panel = document.getElementById('ssp-ai-sidebar');
    if (!panel) return;
    var closeBtn = panel.querySelector('.ssp-header button[onclick*="sspAIShrink"]');
    var fullBtn = panel.querySelector('.ssp-fullscreen-btn');
    if (closeBtn) {
      closeBtn.textContent = '닫기';
      closeBtn.title = '닫기';
    }
    if (fullBtn) {
      var isFullscreen = panel.classList.contains('fullscreen');
      fullBtn.textContent = isFullscreen ? '복원' : '전체화면';
      fullBtn.title = isFullscreen ? '복원' : '전체화면';
    }
  }

  function savePanelPopupRect(panelId, panel) {
    if (!panel || !panel.classList.contains('popup') || !panel.classList.contains('open')) return;
    var rect = panel.getBoundingClientRect();
    var payload = {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    };
    try { localStorage.setItem(getPopupRectKey(panelId), JSON.stringify(payload)); } catch (e) {}
  }

  function loadPanelPopupRect(panelId) {
    try {
      var raw = localStorage.getItem(getPopupRectKey(panelId));
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || !isFinite(obj.left) || !isFinite(obj.top) || !isFinite(obj.width) || !isFinite(obj.height)) return null;
      return obj;
    } catch (e) {
      return null;
    }
  }

  function applyPanelPopupRect(panelId, panel) {
    if (!panel) return;
    var vw = Math.max(320, window.innerWidth || 1280);
    var vh = Math.max(240, window.innerHeight || 720);
    var saved = loadPanelPopupRect(panelId);
    var defaultRect = panelId === 'ssp-ai-sidebar'
      ? { left: Math.max(12, vw - 460), top: 72, width: 420, height: Math.min(760, Math.round(vh * 0.82)) }
      : { left: Math.max(12, vw - 520), top: 72, width: 480, height: Math.min(780, Math.round(vh * 0.84)) };
    var rect = saved || defaultRect;
    var minW = 320, minH = 280;
    var width = Math.max(minW, Math.min(vw - 24, rect.width));
    var height = Math.max(minH, Math.min(vh - 24, rect.height));
    var left = Math.max(8, Math.min(vw - width - 8, rect.left));
    var top = Math.max(8, Math.min(vh - height - 8, rect.top));
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
    panel.style.width = width + 'px';
    panel.style.height = height + 'px';
  }

  function setPanelPopupMode(panelId, enable) {
    var panel = document.getElementById(panelId);
    var inner = document.getElementById('ai-right-sidebar-inner');
    if (!panel) return;
    var on = !!enable;
    try { localStorage.setItem(getPopupModeKey(panelId), on ? '1' : '0'); } catch (e) {}
    if (on) {
      panel.classList.add('popup');
      panel.classList.remove('fullscreen');
      if (panel.classList.contains('open')) {
        if (panel.parentNode !== document.body) document.body.appendChild(panel);
        applyPanelPopupRect(panelId, panel);
      }
    } else {
      savePanelPopupRect(panelId, panel);
      panel.classList.remove('popup');
      panel.classList.remove('fullscreen');
      panel.style.left = '';
      panel.style.top = '';
      panel.style.height = '';
      panel.style.width = '';
      if (inner && panel.parentNode !== inner) {
        if (panelId === 'scholar-ai-sidebar') inner.insertBefore(panel, inner.firstChild);
        else inner.appendChild(panel);
      }
    }
    updatePopupToggleLabels();
    updateSSPHeaderActionButtons();
    try { if (typeof window.refreshAiRightSidebarWrap === 'function') window.refreshAiRightSidebarWrap(); } catch (e) {}
  }

  function closeAiPanelHard(panelId) {
    var panel = document.getElementById(panelId);
    if (!panel) return;
    savePanelPopupRect(panelId, panel);
    panel.classList.remove('open');
    panel.classList.remove('fullscreen');
    panel.classList.remove('popup');
    panel.style.left = '';
    panel.style.top = '';
    panel.style.right = '';
    panel.style.bottom = '';
    panel.style.width = '';
    panel.style.height = '';
    panel.style.minWidth = '';
    panel.style.maxWidth = '';
    panel.style.maxHeight = '';
    panel.style.transform = '';
    panel.style.resize = '';
    var inner = document.getElementById('ai-right-sidebar-inner');
    if (inner && panel.parentNode !== inner) {
      if (panelId === 'scholar-ai-sidebar') inner.insertBefore(panel, inner.firstChild);
      else inner.appendChild(panel);
    }
  }

  function ensurePanelPopupDraggable(panelId, headerSelector) {
    var panel = document.getElementById(panelId);
    var header = document.querySelector(headerSelector);
    if (!panel || !header || header.__popupDragBound) return;
    header.__popupDragBound = true;
    header.addEventListener('pointerdown', function (e) {
      if (!panel.classList.contains('popup') || !panel.classList.contains('open')) return;
      var t = e.target;
      if (t && t.closest && t.closest('button, input, select, textarea, a, .sa-btn')) return;
      var rect = panel.getBoundingClientRect();
      var startX = e.clientX;
      var startY = e.clientY;
      var startLeft = rect.left;
      var startTop = rect.top;
      if (header.setPointerCapture) {
        try { header.setPointerCapture(e.pointerId); } catch (err) {}
      }
      document.body.style.userSelect = 'none';
      var onMove = function (ev) {
        var vw = Math.max(320, window.innerWidth || 1280);
        var vh = Math.max(240, window.innerHeight || 720);
        var nextLeft = startLeft + (ev.clientX - startX);
        var nextTop = startTop + (ev.clientY - startY);
        nextLeft = Math.max(8, Math.min(vw - panel.offsetWidth - 8, nextLeft));
        nextTop = Math.max(8, Math.min(vh - panel.offsetHeight - 8, nextTop));
        panel.style.left = Math.round(nextLeft) + 'px';
        panel.style.top = Math.round(nextTop) + 'px';
      };
      var onUp = function () {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
        document.body.style.userSelect = '';
        savePanelPopupRect(panelId, panel);
      };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    });
  }

  function scholarAIPopupToggle() {
    var panel = document.getElementById('scholar-ai-sidebar');
    if (!panel) return;
    setPanelPopupMode('scholar-ai-sidebar', !panel.classList.contains('popup'));
  }

  function sspAIPopupToggle() {
    var panel = document.getElementById('ssp-ai-sidebar');
    if (!panel) return;
    setPanelPopupMode('ssp-ai-sidebar', !panel.classList.contains('popup'));
  }

  function sspAIFullscreen() {
    var el = document.getElementById('ssp-ai-sidebar');
    if (!el) return;
    var inner = document.getElementById('ai-right-sidebar-inner');
    if (el.classList.contains('fullscreen')) {
      el.classList.remove('fullscreen');
      if (el.classList.contains('popup')) {
        if (el.parentNode !== document.body) document.body.appendChild(el);
        applyPanelPopupRect('ssp-ai-sidebar', el);
      } else if (inner && el.parentNode !== inner) {
        inner.appendChild(el);
      }
    } else {
      el.classList.add('open');
      el.classList.add('fullscreen');
      document.body.appendChild(el);
    }
    updatePopupToggleLabels();
    updateSSPHeaderActionButtons();
    try { if (typeof window.refreshAiRightSidebarWrap === 'function') window.refreshAiRightSidebarWrap(); } catch (e) {}
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
   
    var insertBtn = '<button type="button" class="viewer-fs-link-insert" onclick="viewerSSPInsertLinkToDoc(\'' + escapedForInsert + '\', \'' + String(label || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'") + '\')">\uBB38\uC11C\uC5D0 \uC0BD\uC785</button>';
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
      // \uD55C\uAE00 \uD45C\uC2DC: \uBB38\uC11C\uC5D0 \uC774\uBBF8\uC9C0\uAC00 \uC0BD\uC785\uB418\uC5C8\uC2B5\uB2C8\uB2E4.
      notifyUser('\uBB38\uC11C\uC5D0 \uC774\uBBF8\uC9C0\uAC00 \uC0BD\uC785\uB418\uC5C8\uC2B5\uB2C8\uB2E4.', false);
      return;
    }
    var ta = document.getElementById('viewer-edit-ta');
    if (!ta) {
      // \uD55C\uAE00 \uD45C\uC2DC: \uD3B8\uC9D1\uAE30\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC5B4 \uB9C1\uD06C\uB97C \uC0BD\uC785\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.
      notifyUser('\uD3B8\uC9D1\uAE30\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC5B4 \uB9C1\uD06C\uB97C \uC0BD\uC785\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.', true);
      return;
    }
    var linkText = '[image link](' + u + ')';
    ta.focus();
    document.execCommand('insertText', false, linkText);
    try { ta.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
  
    notifyUser('\uC774\uBBF8\uC9C0 \uB9C1\uD06C\uAC00 \uBB38\uC11C\uC5D0 \uC0BD\uC785\uB418\uC5C8\uC2B5\uB2C8\uB2E4.', false);
  }

  function viewerSSPFindHistoryEntryById(id) {
    if (!id) return null;
    for (var i = 0; i < __viewerSSPImgHistory.length; i++) {
      if (__viewerSSPImgHistory[i] && __viewerSSPImgHistory[i].id === id) return __viewerSSPImgHistory[i];
    }
    return null;
  }
  function viewerSSPFindExternalGalleryEntryById(id) {
    if (!id) return null;
    for (var i = 0; i < __viewerSSPExternalFsGallery.length; i++) {
      if (__viewerSSPExternalFsGallery[i] && __viewerSSPExternalFsGallery[i].id === id) return __viewerSSPExternalFsGallery[i];
    }
    return null;
  }
  function viewerSSPFindFullscreenGalleryEntryById(id) {
    return viewerSSPFindExternalGalleryEntryById(id) || viewerSSPFindHistoryEntryById(id);
  }
  function viewerSSPGetFullscreenGallerySource() {
    return (__viewerSSPExternalFsGallery && __viewerSSPExternalFsGallery.length)
      ? __viewerSSPExternalFsGallery
      : __viewerSSPImgHistory;
  }
  function viewerSSPSetFullscreenGallery(items, currentDataURL) {
    var next = [];
    if (Array.isArray(items)) {
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (!item) continue;
        var src = String(item.dataURL || '').trim();
        if (!src) continue;
        next.push({
          id: String(item.id || ('ext_' + i)),
          dataURL: src,
          prompt: item.prompt || item.label || '',
          createdAt: item.createdAt || Date.now(),
          imgbb: item.imgbb || null
        });
      }
    }
    __viewerSSPExternalFsGallery = next;
    viewerSSPRenderFullscreenGallery(
      currentDataURL || ((document.getElementById('viewer-fs-img') || {}).src || '')
    );
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
    var entry = viewerSSPFindFullscreenGalleryEntryById(id);
    if (!entry || !entry.dataURL) return;
    viewerSSPOpenFullscreen(entry.dataURL);
  }
  function viewerSSPRenderFullscreenGallery(currentDataURL) {
    var gallery = viewerSSPEnsureFullscreenGallery();
    if (!gallery) return;
    var list = document.getElementById('viewer-fs-gallery-list');
    if (!list) return;
    var source = viewerSSPGetFullscreenGallerySource();
    if (!source.length) {
      gallery.style.display = 'none';
      list.innerHTML = '';
      return;
    }
    var titleEl = gallery.querySelector('.viewer-fs-gallery-title');
    if (titleEl) titleEl.textContent = __viewerSSPExternalFsGallery.length ? 'Gallery' : 'History Gallery';
    var html = '';
    for (var i = 0; i < source.length; i++) {
      var item = source[i];
      var label = String(item.prompt || item.label || 'Untitled image').replace(/</g, '&lt;');
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
    if (key) setImgbbSettingsStatus('imgBB API key is loaded. You can upload images directly to imgBB.', false);
    else setImgbbSettingsStatus('No API key saved. Enter your imgBB API key to enable direct uploads.', false);
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
      setImgbbSettingsStatus(key ? 'imgBB API key saved.' : 'imgBB API key cleared.', false);
      notifyUser(key ? 'imgBB API key saved.' : 'imgBB API key cleared.', false);
    } catch (e) {
      setImgbbSettingsStatus('Failed to save imgBB API key. Please try again.', true);
      notifyUser('Failed to save imgBB API key. Please try again.', true);
    }
  }

  function getViewerMarkdownRoot() {
    return document.getElementById('viewer') || document.getElementById('page-content');
  }

  function isAiPanelElement(node) {
    if (!node) return false;
    var el = node.nodeType === 1 ? node : node.parentElement;
    if (!el || !el.closest) return false;
    return !!el.closest('#scholar-ai-sidebar, #ssp-ai-sidebar, #ai-right-sidebar-wrap');
  }

  function isTextSelectionControl(el) {
    if (!el || !el.tagName) return false;
    var tag = String(el.tagName).toUpperCase();
    if (tag === 'TEXTAREA') return true;
    if (tag !== 'INPUT') return false;
    var type = String(el.type || 'text').toLowerCase();
    return ['text', 'search', 'url', 'tel', 'password', 'email', 'number'].indexOf(type) >= 0;
  }

  function captureSelectionFromTextControl(docRef) {
    if (!docRef) return null;
    var active = docRef.activeElement;
    if (!isTextSelectionControl(active) || isAiPanelElement(active)) return null;
    var s = Number(active.selectionStart);
    var e = Number(active.selectionEnd);
    if (!isFinite(s) || !isFinite(e) || s === e) return null;
    var start = Math.max(0, Math.min(s, e));
    var end = Math.max(0, Math.max(s, e));
    var raw = String(active.value || '');
    var text = raw.slice(start, end).trim();
    if (!text) return null;
    return { text: text, start: start, end: end, target: active, doc: docRef, source: 'text-control' };
  }

  function captureSelectionFromDom(docRef, rootLimit) {
    if (!docRef || typeof docRef.getSelection !== 'function') return null;
    var sel = null;
    try { sel = docRef.getSelection(); } catch (e) { return null; }
    if (!sel || sel.isCollapsed || !sel.anchorNode) return null;
    var anchor = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
    if (!anchor) return null;
    if (isAiPanelElement(anchor)) return null;
    if (rootLimit && !rootLimit.contains(anchor)) return null;
    var text = String(sel.toString() || '').trim();
    if (!text) return null;
    return { text: text, start: null, end: null, target: null, doc: docRef, source: 'dom' };
  }

  function captureSelectionFromIframes() {
    var iframes = document.querySelectorAll('iframe');
    for (var i = 0; i < iframes.length; i++) {
      var frame = iframes[i];
      var fd = null;
      try { fd = frame.contentDocument || (frame.contentWindow && frame.contentWindow.document); } catch (e) { fd = null; }
      if (!fd) continue;
      var fromControl = captureSelectionFromTextControl(fd);
      if (fromControl) return fromControl;
      var fromDom = captureSelectionFromDom(fd, null);
      if (fromDom) return fromDom;
    }
    return null;
  }

  function getFrameDocument(frame) {
    if (!frame) return null;
    try { return frame.contentDocument || (frame.contentWindow && frame.contentWindow.document) || null; } catch (e) { return null; }
  }

  function isFrameUsable(frame) {
    if (!frame || !frame.isConnected) return false;
    var rect = null;
    try { rect = frame.getBoundingClientRect(); } catch (e) { rect = null; }
    if (rect && (rect.width <= 0 || rect.height <= 0)) return false;
    try {
      var cs = window.getComputedStyle(frame);
      if (cs && (cs.display === 'none' || cs.visibility === 'hidden')) return false;
    } catch (e2) {}
    return true;
  }

  function findGenSlideFrame() {
    var selectors = [
      '#html2ppt-frame',
      'iframe[title="GenSlide"]',
      'iframe[src*="GenSlide/jenaEditor"]',
      'iframe[src*="Html2pptx/jenaEditor"]'
    ];
    for (var i = 0; i < selectors.length; i++) {
      var frame = document.querySelector(selectors[i]);
      if (isFrameUsable(frame) && getFrameDocument(frame)) return frame;
    }
    return null;
  }

  function captureSelectionFromGenSlide() {
    var frame = findGenSlideFrame();
    if (!frame) return null;
    var docRef = getFrameDocument(frame);
    if (!docRef) return null;

    var fromControl = captureSelectionFromTextControl(docRef);
    if (fromControl) {
      fromControl.source = 'genslide-text-control';
      return fromControl;
    }

    var code = docRef.getElementById('code');
    if (isTextSelectionControl(code)) {
      var raw = String(code.value || '').trim();
      if (raw) {
        return { text: raw, start: null, end: null, target: code, doc: docRef, source: 'genslide-code' };
      }
    }

    try {
      var win = frame.contentWindow;
      if (win && typeof win.getWysHtml === 'function') {
        var wysHtml = String(win.getWysHtml() || '').trim();
        if (wysHtml) return { text: wysHtml, start: null, end: null, target: null, doc: docRef, source: 'genslide-wys-html' };
      }
      if (win && Array.isArray(win.slides)) {
        var idx = Math.max(0, Math.min(win.slides.length - 1, Number(win.cur) || 0));
        var slideHtml = String((win.slides[idx] && win.slides[idx].html) || '').trim();
        if (slideHtml) return { text: slideHtml, start: null, end: null, target: null, doc: docRef, source: 'genslide-slide-html' };
      }
    } catch (e) {}

    var fromDom = captureSelectionFromDom(docRef, null);
    if (fromDom) {
      fromDom.source = 'genslide-dom';
      return fromDom;
    }
    return null;
  }

  var __aiDocSelTimer = null;
 
  function syncAiPanelsFromDocumentSelection() {
    var viewer = getViewerMarkdownRoot();
    var taPassage = document.getElementById('scholar-ai-selected');
    var sspPrompt = document.getElementById('ssp-prompt');
    if (!taPassage && !sspPrompt) return;

    var pick = null;
    if (!pick) pick = captureSelectionFromGenSlide();
    if (!pick) pick = captureSelectionFromTextControl(document);
    if (!pick && viewer) pick = captureSelectionFromDom(document, viewer);
    if (!pick) pick = captureSelectionFromDom(document, null);
    if (!pick) pick = captureSelectionFromIframes();

    if (!pick || !pick.text) {
      if (taPassage && (window.__contentType || '') === 'summary' && (!taPassage.value || !String(taPassage.value).trim())) {
        taPassage.value = 'Select a passage from the document to start the AI analysis.';
      }
      return;
    }

    if (pick.source === 'text-control') {
      __scholarAISelStart = pick.start;
      __scholarAISelEnd = pick.end;
      __scholarAICursorPos = pick.end;
      __scholarAILastSelectionTarget = pick.target || null;
      __scholarAILastSelectionDoc = pick.doc || null;
    } else {
      __scholarAISelStart = __scholarAISelEnd = null;
      __scholarAILastSelectionTarget = null;
      __scholarAILastSelectionDoc = pick.doc || null;
    }

    if (taPassage) taPassage.value = pick.text;
    if (sspPrompt) sspPrompt.value = pick.text;
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
      if (el.classList.contains('popup') || isPanelPopupMode('scholar-ai-sidebar')) {
        el.classList.add('popup');
        if (el.parentNode !== document.body) document.body.appendChild(el);
        applyPanelPopupRect('scholar-ai-sidebar', el);
      }
      syncAiPanelsFromDocumentSelection();
      scholarAIInitResize();
      scholarAILoadPrePrompt();
      scholarAIInitModelSelect();
      scholarAIInitToneSelect();
    } else {
      closeAiPanelHard('scholar-ai-sidebar');
      updatePopupToggleLabels();
      updateScholarHeaderActionButtons();
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
    closeAiPanelHard('scholar-ai-sidebar');
    updatePopupToggleLabels();
    updateScholarHeaderActionButtons();
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
      scholarAIInitToneSelect();
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
  function scholarAIUsePromptRole(role) {
    var el = document.getElementById('scholar-ai-pre-prompt-text');
    if (!el) return;
    if (typeof window.getScholarAIPromptByRole !== 'function') return;
    var next = '';
    try { next = window.getScholarAIPromptByRole(role) || ''; } catch (e) { next = ''; }
    if (!next) return;
    el.value = next;
    var setter = getCallback('setScholarAISystemInstruction');
    if (typeof setter === 'function') setter(next);
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
  function scholarAIGetTonePreset() {
    try {
      var v = localStorage.getItem(LS_SA_TONE_PRESET) || SA_TONE_DEFAULT;
      if (v === 'academic_ida' || v === 'academic_eumham' || v === 'general_polite') return v;
    } catch (e) {}
    return SA_TONE_DEFAULT;
  }
  function scholarAISaveTonePreset(v) {
    var next = (v === 'academic_ida' || v === 'academic_eumham' || v === 'general_polite') ? v : SA_TONE_DEFAULT;
    try { localStorage.setItem(LS_SA_TONE_PRESET, next); } catch (e) {}
    return next;
  }
  function scholarAIGetToneInstruction(v) {
    var tone = (v === 'academic_ida' || v === 'academic_eumham' || v === 'general_polite') ? v : SA_TONE_DEFAULT;
    if (tone === 'academic_eumham') {
      return '\uBB38\uCCB4 \uD504\uB9AC\uC14B: \uD559\uC220\uD615. \uBB38\uC7A5 \uC885\uACB0\uC740 -\uC74C/-\uD568 \uD615\uD0DC\uB97C \uC77C\uAD00\uB418\uAC8C \uC0AC\uC6A9\uD558\uACE0 \uAD6C\uC5B4\uCCB4\uB97C \uD53C\uD558\uC138\uC694.';
    }
    if (tone === 'general_polite') {
      return '\uBB38\uCCB4 \uD504\uB9AC\uC14B: \uC77C\uBC18 \uACF5\uC190\uCCB4. -\uC2B5\uB2C8\uB2E4/-\uC694 \uAC19\uC740 \uACF5\uC190\uD55C \uC5B4\uBBF8\uB97C \uC0AC\uC6A9\uD558\uACE0 \uAC00\uB3C5\uC131\uC744 \uB192\uC774\uC138\uC694.';
    }
    return '\uBB38\uCCB4 \uD504\uB9AC\uC14B: \uD559\uC220 \uC11C\uC220\uD615. \uBB38\uC7A5 \uC885\uACB0\uC740 \uAC04\uACB0\uD55C -\uC774\uB2E4 \uD615\uD0DC\uB97C \uC6B0\uC120 \uC0AC\uC6A9\uD558\uC138\uC694.';
  }
  function scholarAIInitToneSelect() {
    var sel = document.getElementById('scholar-ai-tone-select');
    if (!sel) return;
    sel.value = scholarAIGetTonePreset();
    sel.onchange = function () {
      scholarAISaveTonePreset(sel.value);
    };
  }
  function scholarAIFullscreen() {
    var el = document.getElementById('scholar-ai-sidebar');
    if (!el) return;
    var inner = document.getElementById('ai-right-sidebar-inner');
    if (el.classList.contains('fullscreen')) {
      el.classList.remove('fullscreen');
      if (el.classList.contains('popup')) {
        if (el.parentNode !== document.body) document.body.appendChild(el);
        applyPanelPopupRect('scholar-ai-sidebar', el);
      } else if (inner && el.parentNode !== inner) {
        inner.insertBefore(el, inner.firstChild);
      }
    } else {
      el.classList.add('fullscreen');
      document.body.appendChild(el);
    }
    updateScholarHeaderActionButtons();
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
  function scholarAISetHistoryCollapsed(collapsed) {
    var panel = document.getElementById('scholar-ai-history-panel');
    var btn = document.getElementById('scholar-ai-history-toggle-btn');
    var nextCollapsed = !!collapsed;
    if (panel) panel.style.display = nextCollapsed ? 'none' : 'block';
    if (btn) btn.textContent = nextCollapsed ? '히스토리보기' : '히스토리닫기';
    try { localStorage.setItem(LS_SA_HISTORY_COLLAPSED, nextCollapsed ? '1' : '0'); } catch (e) {}
  }
  function scholarAIToggleHistoryPanel() {
    var panel = document.getElementById('scholar-ai-history-panel');
    if (!panel) return;
    var collapsed = panel.style.display === 'none' || !panel.style.display;
    scholarAISetHistoryCollapsed(!collapsed);
  }
  function scholarAIInitHistoryPanel() {
    var collapsed = true;
    try {
      collapsed = (localStorage.getItem(LS_SA_HISTORY_COLLAPSED) || '1') !== '0';
    } catch (e) {}
    scholarAISetHistoryCollapsed(collapsed);
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
      var raw = items[i].prompt || items[i].result || 'Untitled history item';
      var lbl = raw.replace(/</g, '&lt;').substring(0, 36) + (raw.length > 36 ? '...' : '');
      html += '<div class="scholar-ai-history-item" data-idx="' + idx + '"><span class="sa-h-label" onclick="scholarAIHistoryShowResult(' + idx + ')" title="Show this result">' + lbl.replace(/'/g, "\\'") + '</span><button type="button" class="sa-h-save" onclick="scholarAIHistorySaveMd(' + idx + ')" title="Save as Markdown">MD</button><button type="button" class="sa-h-del" onclick="scholarAIHistoryDelete(' + idx + ')" title="Delete">X</button></div>';
    }
    if (list) list.innerHTML = html || '<span style="font-size:11px;color:#94a3b8">No ScholarAI history yet.</span>';
  }
  function scholarAIHistoryShowResult(idx) {
    var h = __scholarAIHistory[idx];
    if (!h) return;
    scholarAIApplyResultText(h.result || '');
  }
  function scholarAIHistoryDelete(idx) {
    __scholarAIHistory.splice(idx, 1);
    scholarAIHistorySave();
    scholarAIHistoryRender();
  }
  function scholarAIHistorySaveMd(idx) {
    var h = __scholarAIHistory[idx];
    if (!h || !h.result) { alert('No result available to save.'); return; }
    var a = document.createElement('a');
    a.href = 'data:text/markdown;charset=utf-8,' + encodeURIComponent(h.result);
    a.download = 'ScholarAI_' + (h.at || '').slice(0, 10) + '_' + idx + '.md';
    a.click();
  }
  function scholarAIHistorySaveAll() {
    if (__scholarAIHistory.length === 0) { alert('No ScholarAI history to save yet.'); return; }
    var parts = [];
    for (var i = 0; i < __scholarAIHistory.length; i++) {
      var h = __scholarAIHistory[i];
      parts.push('## ' + (i + 1) + '. ' + (h.at || '').slice(0, 19) + '\n\n' + (h.prompt ? '**Prompt** ' + h.prompt + '\n\n' : '') + h.result);
    }
    var a = document.createElement('a');
    a.href = 'data:text/markdown;charset=utf-8,' + encodeURIComponent(parts.join('\n\n---\n\n'));
    a.download = 'ScholarAI_history_' + new Date().toISOString().slice(0, 10) + '.md';
    a.click();
    alert('Saved ' + __scholarAIHistory.length + ' ScholarAI history item(s) as a Markdown file.');
  }

  function scholarAISetProgress(value, visible) {
    var wrap = document.getElementById('scholar-ai-progress-wrap');
    var fill = document.getElementById('scholar-ai-progress-fill');
    var pct = document.getElementById('scholar-ai-progress-pct');
    var v = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
    __scholarAIProgressValue = v;
    if (wrap) {
      wrap.classList.toggle('visible', !!visible);
      wrap.style.display = visible ? 'flex' : 'none';
    }
    if (fill) fill.style.width = v + '%';
    if (pct) pct.textContent = v + '%';
  }

  function scholarAIStartProgress() {
    clearInterval(__scholarAIProgressTimer);
    scholarAISetProgress(0, true);
    __scholarAIProgressTimer = setInterval(function () {
      var next = __scholarAIProgressValue < 55
        ? __scholarAIProgressValue + 5
        : (__scholarAIProgressValue < 82 ? __scholarAIProgressValue + 3 : __scholarAIProgressValue + 1);
      scholarAISetProgress(Math.min(95, next), true);
      if (__scholarAIProgressValue >= 95) clearInterval(__scholarAIProgressTimer);
    }, 700);
  }

  function scholarAIStopProgress(done) {
    clearInterval(__scholarAIProgressTimer);
    __scholarAIProgressTimer = null;
    if (done) {
      scholarAISetProgress(100, true);
      setTimeout(function () { scholarAISetProgress(0, false); }, 650);
      return;
    }
    scholarAISetProgress(0, false);
  }

  function scholarAISetRunningState(running) {
    __scholarAIRunning = !!running;
    var runBtn = document.getElementById('scholar-ai-run-btn');
    var stopBtn = document.getElementById('scholar-ai-stop-btn');
    if (runBtn) {
      runBtn.disabled = __scholarAIRunning;
      runBtn.style.opacity = __scholarAIRunning ? '0.75' : '1';
    }
    if (stopBtn) {
      stopBtn.disabled = !__scholarAIRunning;
      stopBtn.style.opacity = __scholarAIRunning ? '1' : '0.6';
    }
    if (__scholarAIRunning) scholarAIStartProgress();
  }

  function scholarAIStop() {
    if (!__scholarAIRunning) return;
    var abortFn = getCallback('abortCurrentTask');
    if (typeof abortFn === 'function') {
      try { abortFn(); } catch (e) {}
    }
    var resultEl = document.getElementById('scholar-ai-result');
    var insertEl = document.getElementById('scholar-ai-result-insert');
    if (resultEl && resultEl.value === 'Running ScholarAI...') {
      resultEl.value = 'Stopped by user.';
    }
    if (insertEl && insertEl.value === 'Running ScholarAI...') insertEl.value = '';
    scholarAIStopProgress(false);
    scholarAISetRunningState(false);
  }

  function scholarAIEnsureResultTabs() {
    var wrap = document.getElementById('scholar-ai-result-wrap');
    if (!wrap || wrap.getAttribute('data-sa-tabs-ready') === '1') return;
    var explainTa = document.getElementById('scholar-ai-result');
    if (!explainTa) return;
    var label = wrap.querySelector('label');
    if (label) label.textContent = '결과';

    var tabBar = document.createElement('div');
    tabBar.className = 'scholar-ai-result-tabs';
    tabBar.style.cssText = 'display:flex;gap:6px;align-items:center;margin:4px 0 6px 0;';
    tabBar.innerHTML = ''
      + '<button type="button" id="scholar-ai-tab-explanation" class="sa-btn ghost" style="font-size:11px;padding:4px 8px" onclick="scholarAISetResultTab(\'explanation\')">설명</button>'
      + '<button type="button" id="scholar-ai-tab-insert" class="sa-btn ghost" style="font-size:11px;padding:4px 8px" onclick="scholarAISetResultTab(\'insert\')">삽입 결과</button>';
    if (label && label.parentNode) label.parentNode.insertBefore(tabBar, explainTa);

    var insertTa = document.getElementById('scholar-ai-result-insert');
    if (!insertTa) {
      insertTa = explainTa.cloneNode(false);
      insertTa.id = 'scholar-ai-result-insert';
      insertTa.className = (insertTa.className || '') + ' scholar-ai-result-insert';
      insertTa.placeholder = '문서에 삽입할 최종 결과가 여기에 표시됩니다.';
      insertTa.style.display = 'none';
      if (explainTa.nextSibling) wrap.insertBefore(insertTa, explainTa.nextSibling);
      else wrap.appendChild(insertTa);
    }
    wrap.setAttribute('data-sa-tabs-ready', '1');
    scholarAISetResultTab(__scholarAIActiveResultTab || 'insert');
  }

  function scholarAISetResultTab(tab) {
    __scholarAIActiveResultTab = tab === 'explanation' ? 'explanation' : 'insert';
    var explainTa = document.getElementById('scholar-ai-result');
    var insertTa = document.getElementById('scholar-ai-result-insert');
    var tabExplain = document.getElementById('scholar-ai-tab-explanation');
    var tabInsert = document.getElementById('scholar-ai-tab-insert');
    if (!explainTa || !insertTa) return;
    var showExplain = __scholarAIActiveResultTab === 'explanation';
    explainTa.style.display = showExplain ? 'block' : 'none';
    insertTa.style.display = showExplain ? 'none' : 'block';
    if (tabExplain) tabExplain.classList.toggle('active', showExplain);
    if (tabInsert) tabInsert.classList.toggle('active', !showExplain);
  }

  function scholarAIGetActiveResultTextarea() {
    var explainTa = document.getElementById('scholar-ai-result');
    var insertTa = document.getElementById('scholar-ai-result-insert');
    if (__scholarAIActiveResultTab === 'explanation') return explainTa || insertTa;
    return insertTa || explainTa;
  }

  function scholarAINormalizeResultText(text) {
    var t = String(text || '').trim();
    if (!t) return '';
    t = t.replace(/^html\s*\n/i, '').replace(/^markdown\s*\n/i, '').replace(/^md\s*\n/i, '').trim();
    t = t.replace(/^```[a-zA-Z0-9_-]*\n?/, '').replace(/```$/, '').trim();
    return t;
  }

  function scholarAIParseExplanationResult(raw) {
    var text = String(raw || '').replace(/\r\n/g, '\n').trim();
    if (!text) return { explanation: '', result: '' };

    var markerRe = /\[\s*(EXPLANATION|RESULT|설명|결과)\s*(?::[^\]]*)?\]/ig;
    var marks = [];
    var m = null;
    while ((m = markerRe.exec(text)) !== null) {
      var rawKey = String(m[1] || '');
      var normKey = (/^설명$/i.test(rawKey) ? 'EXPLANATION' : (/^결과$/i.test(rawKey) ? 'RESULT' : rawKey.toUpperCase()));
      marks.push({ key: normKey, idx: m.index, end: markerRe.lastIndex });
    }
    if (marks.length) {
      var explanation = '';
      var result = '';
      for (var i = 0; i < marks.length; i++) {
        var cur = marks[i];
        var next = marks[i + 1];
        var seg = text.slice(cur.end, next ? next.idx : text.length).trim();
        if (cur.key === 'EXPLANATION') explanation += (explanation ? '\n\n' : '') + seg;
        if (cur.key === 'RESULT') result += (result ? '\n\n' : '') + seg;
      }
      return { explanation: explanation.trim(), result: scholarAINormalizeResultText(result) };
    }

    var fenceMatch = text.match(/```[a-zA-Z0-9_-]*\n([\s\S]*?)```/);
    if (fenceMatch && fenceMatch[1]) {
      var code = String(fenceMatch[1] || '').trim();
      var explanationPart = text.replace(fenceMatch[0], '').trim();
      return { explanation: explanationPart, result: scholarAINormalizeResultText(code) };
    }

    if (/^\s*<!DOCTYPE html/i.test(text) || /^\s*<html[\s>]/i.test(text) || /^\s*<(div|section|article|main|style|script)[\s>]/i.test(text)) {
      return { explanation: '', result: scholarAINormalizeResultText(text) };
    }
    return { explanation: text, result: '' };
  }

  function scholarAIApplyResultText(rawText) {
    scholarAIEnsureResultTabs();
    var parsed = scholarAIParseExplanationResult(rawText);
    var explainEl = document.getElementById('scholar-ai-result');
    var insertEl = document.getElementById('scholar-ai-result-insert');
    if (explainEl) explainEl.value = parsed.explanation || '';
    if (insertEl) insertEl.value = parsed.result || '';
    if (insertEl && insertEl.value) scholarAISetResultTab('insert');
    else scholarAISetResultTab('explanation');
    return {
      explanation: explainEl ? explainEl.value : '',
      result: insertEl ? insertEl.value : ''
    };
  }

  function scholarAIGetInsertResultText() {
    var insertEl = document.getElementById('scholar-ai-result-insert');
    var explainEl = document.getElementById('scholar-ai-result');
    var insertText = insertEl && insertEl.value ? String(insertEl.value).trim() : '';
    if (insertText) return insertText;
    var explainText = explainEl && explainEl.value ? String(explainEl.value).trim() : '';
    var parsed = scholarAIParseExplanationResult(explainText);
    return parsed.result || '';
  }

  async function scholarAIRun() {
    var sel = document.getElementById('scholar-ai-selected');
    var promptEl = document.getElementById('scholar-ai-prompt');
    var resultEl = document.getElementById('scholar-ai-result');
    var insertEl = document.getElementById('scholar-ai-result-insert');
    var passage = (sel && sel.value) ? sel.value.trim() : '';
    var userQ = (promptEl && promptEl.value) ? promptEl.value.trim() : '';
    if (!passage) { alert('Please provide selected text to analyze.'); return; }
    var callGemini = getCallback('callGemini');
    if (typeof callGemini !== 'function') { alert('ScholarAI API is not available. Please check your settings.'); return; }
    if (resultEl) resultEl.value = 'Running ScholarAI...';
    if (insertEl) insertEl.value = '';
    scholarAISetRunningState(true);
    try {
      var fullPrompt = passage + '\n\nQuestion/Instruction: ' + (userQ || 'Please summarize and explain the passage clearly.');
      var sys = invokeSync('getScholarAISystemInstruction') || 'You are a scholarly assistant. Answer concisely in Korean based on the given passage. If the user asks a question, answer it; otherwise summarize or explain the passage.';
      var tonePreset = scholarAIGetTonePreset();
      var toneInstruction = scholarAIGetToneInstruction(tonePreset);
      if (toneInstruction) sys += '\n\n' + toneInstruction;
      var modelId = invokeSync('getScholarAIModelId') || null;
      var res = await callGemini(fullPrompt, sys, false, modelId);
      var text = res && res.text ? res.text : (res || '');
      var finalText = typeof text === 'string' ? text : JSON.stringify(text);
      scholarAIApplyResultText(finalText);
      scholarAIHistoryAdd(userQ || passage.substring(0, 80), finalText);
      scholarAIHistoryRender();
      scholarAIStopProgress(true);
    } catch (e) {
      var msg = (e && e.message) ? String(e.message) : String(e || '');
      scholarAIStopProgress(false);
      if (resultEl) {
        if ((e && e.name === 'AbortError') || /aborted|abort/i.test(msg)) resultEl.value = 'Stopped by user.';
        else resultEl.value = 'Error: ' + msg;
      }
      if (insertEl) insertEl.value = '';
      scholarAISetResultTab('explanation');
    } finally {
      scholarAISetRunningState(false);
    }
  }
  function scholarAICopyResult() {
    var el = scholarAIGetActiveResultTextarea();
    if (el && el.value) {
      navigator.clipboard.writeText(el.value).then(function () { alert('Result copied to clipboard.'); }).catch(function () { alert('Failed to copy result.'); });
    } else {
      alert('There is no result to copy yet.');
    }
  }
  function scholarAIClearResult() {
    var explainEl = document.getElementById('scholar-ai-result');
    var insertEl = document.getElementById('scholar-ai-result-insert');
    if (explainEl) explainEl.value = '';
    if (insertEl) insertEl.value = '';
  }
  function scholarAIResultFont(delta) {
    var explainEl = document.getElementById('scholar-ai-result');
    var insertEl = document.getElementById('scholar-ai-result-insert');
    if (!explainEl && !insertEl) return;
    __scholarAIResultFontSize = Math.max(10, Math.min(24, __scholarAIResultFontSize + delta));
    if (explainEl) explainEl.style.setProperty('font-size', __scholarAIResultFontSize + 'px', 'important');
    if (insertEl) insertEl.style.setProperty('font-size', __scholarAIResultFontSize + 'px', 'important');
  }
  function scholarAIGetTextFontSize(el) {
    if (!el) return 12;
    var id = el.id || '';
    if (__scholarAITextFontSizes[id]) return __scholarAITextFontSizes[id];
    var computed = 0;
    try {
      computed = parseFloat(window.getComputedStyle(el).fontSize || '');
    } catch (e) {}
    return Math.max(10, Math.min(32, Math.round(computed || 12)));
  }
  function scholarAISetTextFontSize(el, size) {
    if (!el) return;
    var next = Math.max(10, Math.min(32, Math.round(Number(size) || 12)));
    if (el.id) __scholarAITextFontSizes[el.id] = next;
    el.style.setProperty('font-size', next + 'px', 'important');
    if (el.id === 'scholar-ai-result' || el.id === 'scholar-ai-result-insert') {
      __scholarAIResultFontSize = next;
      var pairId = el.id === 'scholar-ai-result' ? 'scholar-ai-result-insert' : 'scholar-ai-result';
      var pair = document.getElementById(pairId);
      if (pair) {
        pair.style.setProperty('font-size', next + 'px', 'important');
        if (pair.id) __scholarAITextFontSizes[pair.id] = next;
      }
    }
  }
  function scholarAIBindAltWheelFontSize() {
    var ids = [
      'scholar-ai-pre-prompt-text',
      'scholar-ai-selected',
      'scholar-ai-prompt',
      'scholar-ai-result',
      'scholar-ai-result-insert'
    ];
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el || el.__scholarAIAltWheelFontBound) return;
      el.__scholarAIAltWheelFontBound = true;
      el.addEventListener('wheel', function (event) {
        if (!event || !event.altKey || event.ctrlKey || event.metaKey) return;
        var dy = Number(event.deltaY) || 0;
        if (dy === 0) return;
        event.preventDefault();
        event.stopPropagation();
        scholarAISetTextFontSize(el, scholarAIGetTextFontSize(el) + (dy < 0 ? 1 : -1));
      }, { passive: false });
    });
  }
  function scholarAIBindZoomAltWheel() {
    var targets = [
      document.getElementById('scholar-ai-result-zoom-ta'),
      document.getElementById('scholar-ai-result-zoom-view')
    ].filter(Boolean);
    targets.forEach(function (el) {
      if (el.__scholarAIZoomAltWheelBound) return;
      el.__scholarAIZoomAltWheelBound = true;
      el.addEventListener('wheel', function (event) {
        if (!event || !event.altKey || event.ctrlKey || event.metaKey) return;
        var dy = Number(event.deltaY) || 0;
        if (dy === 0) return;
        event.preventDefault();
        event.stopPropagation();
        scholarAIAdjustZoom(dy < 0 ? 10 : -10);
      }, { passive: false });
    });
  }
  function scholarAIApplyZoomUi() {
    var ta = document.getElementById('scholar-ai-result-zoom-ta');
    var view = document.getElementById('scholar-ai-result-zoom-view');
    var label = document.getElementById('scholar-ai-zoom-label');
    var editBtn = document.getElementById('scholar-ai-zoom-mode-edit');
    var viewBtn = document.getElementById('scholar-ai-zoom-mode-view');
    var sizePx = Math.max(10, Math.min(42, Math.round(16 * (__scholarAIZoomPercent / 100))));
    if (ta) ta.style.setProperty('font-size', sizePx + 'px', 'important');
    if (view) view.style.setProperty('font-size', sizePx + 'px', 'important');
    if (label) label.textContent = __scholarAIZoomPercent + '%';
    if (editBtn) {
      editBtn.style.borderColor = __scholarAIZoomMode === 'edit' ? '#4f8ef7' : '';
      editBtn.style.color = __scholarAIZoomMode === 'edit' ? '#4f8ef7' : '';
    }
    if (viewBtn) {
      viewBtn.style.borderColor = __scholarAIZoomMode === 'view' ? '#4f8ef7' : '';
      viewBtn.style.color = __scholarAIZoomMode === 'view' ? '#4f8ef7' : '';
    }
  }
  function scholarAIRenderZoomMarkdown() {
    var ta = document.getElementById('scholar-ai-result-zoom-ta');
    var view = document.getElementById('scholar-ai-result-zoom-view');
    if (!ta || !view) return;
    var raw = ta.value || '';
    if (typeof marked !== 'undefined' && marked.parse) {
      try {
        var out = marked.parse(raw);
        if (out && typeof out.then === 'function') {
          out.then(function (html) { view.innerHTML = html || ''; }).catch(function () {
            view.innerHTML = '<pre style="white-space:pre-wrap;margin:0">' + escapeHtml(raw) + '</pre>';
          });
        } else {
          view.innerHTML = out || '';
        }
      } catch (e) {
        view.innerHTML = '<pre style="white-space:pre-wrap;margin:0">' + escapeHtml(raw) + '</pre>';
      }
      return;
    }
    view.innerHTML = '<pre style="white-space:pre-wrap;margin:0">' + escapeHtml(raw) + '</pre>';
  }
  function scholarAISetZoomMode(mode) {
    var ta = document.getElementById('scholar-ai-result-zoom-ta');
    var view = document.getElementById('scholar-ai-result-zoom-view');
    __scholarAIZoomMode = mode === 'view' ? 'view' : 'edit';
    window.__scholarAIZoomMode = __scholarAIZoomMode;
    if (!ta || !view) return;
    var useView = __scholarAIZoomMode === 'view';
    ta.style.display = useView ? 'none' : 'block';
    view.style.display = useView ? 'block' : 'none';
    ta.setAttribute('aria-hidden', useView ? 'true' : 'false');
    view.setAttribute('aria-hidden', useView ? 'false' : 'true');
    if (useView) scholarAIRenderZoomMarkdown();
    scholarAIApplyZoomUi();
  }
  function scholarAIAdjustZoom(delta) {
    var d = Number(delta || 0);
    __scholarAIZoomPercent = Math.max(60, Math.min(220, __scholarAIZoomPercent + d));
    scholarAIApplyZoomUi();
  }
  function scholarAICopyZoomMarkdown() {
    var ta = document.getElementById('scholar-ai-result-zoom-ta');
    var txt = ta && typeof ta.value === 'string' ? ta.value : '';
    if (!txt.trim()) { alert('No content to copy.'); return; }
    navigator.clipboard.writeText(txt).then(function () {
      alert('Markdown copied to clipboard.');
    }).catch(function () {
      alert('Failed to copy markdown.');
    });
  }
  function scholarAIResultZoomOpen() {
    var resultEl = scholarAIGetActiveResultTextarea();
    var overlay = document.getElementById('scholar-ai-result-zoom-overlay');
    var zoomTa = document.getElementById('scholar-ai-result-zoom-ta');
    if (!resultEl || !overlay || !zoomTa) return;
    zoomTa.value = resultEl.value || '';
    overlay.classList.add('open');
    window.__scholarAIZoomMode = __scholarAIZoomMode;
    scholarAISetZoomMode(__scholarAIZoomMode);
    scholarAIApplyZoomUi();
    scholarAIBindAltWheelFontSize();
    scholarAIBindZoomAltWheel();
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
  function scholarAISelectedWrapInitResize() {
    var handle = document.getElementById('scholar-ai-selected-resize-handle');
    var wrap = document.getElementById('scholar-ai-selected-wrap');
    if (!handle || !wrap) return;
    if (handle._saResizeBound) return;
    handle._saResizeBound = true;
    var minH = 80;
    var maxH = 520;
    var startY = 0;
    var startH = 0;
    var dragging = false;
    function onMove(e) {
      if (!dragging) return;
      var dy = e.clientY - startY;
      var h = Math.max(minH, Math.min(maxH, startH + dy));
      wrap.style.height = h + 'px';
      wrap.style.minHeight = h + 'px';
    }
    function onUp() {
      if (!dragging) return;
      dragging = false;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    handle.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      dragging = true;
      startY = e.clientY;
      startH = wrap.offsetHeight;
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    });
  }
  function scholarAIPromptWrapInitResize() {
    var handle = document.getElementById('scholar-ai-prompt-resize-handle');
    var wrap = document.getElementById('scholar-ai-prompt-wrap');
    if (!handle || !wrap) return;
    if (handle._saResizeBound) return;
    handle._saResizeBound = true;
    var minH = 80;
    var maxH = 520;
    var startY = 0;
    var startH = 0;
    var dragging = false;
    function onMove(e) {
      if (!dragging) return;
      var dy = e.clientY - startY;
      var h = Math.max(minH, Math.min(maxH, startH + dy));
      wrap.style.height = h + 'px';
      wrap.style.minHeight = h + 'px';
    }
    function onUp() {
      if (!dragging) return;
      dragging = false;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    handle.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      dragging = true;
      startY = e.clientY;
      startH = wrap.offsetHeight;
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    });
  }
  function scholarAIResultWrapInitResize() {
    var handle = document.getElementById('scholar-ai-result-resize-handle');
    var wrap = document.getElementById('scholar-ai-result-wrap');
    if (!handle || !wrap) return;
    if (handle._saResizeBound) return;
    handle._saResizeBound = true;
    var minH = 160;
    var maxH = 900;
    var startY = 0;
    var startH = 0;
    var dragging = false;
    function onMove(e) {
      if (!dragging) return;
      var dy = e.clientY - startY;
      var h = Math.max(minH, Math.min(maxH, startH + dy));
      wrap.style.height = h + 'px';
      wrap.style.minHeight = h + 'px';
    }
    function onUp() {
      if (!dragging) return;
      dragging = false;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    handle.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      dragging = true;
      startY = e.clientY;
      startH = wrap.offsetHeight;
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    });
  }
  function handleScholarAIInsertClick() {
    var viewerSwitchToEdit = typeof window.viewerSwitchToEdit === 'function' ? window.viewerSwitchToEdit : function () {};
    var viewerBuildNav = typeof window.viewerBuildNav === 'function' ? window.viewerBuildNav : function () {};
    var isEdit = document.getElementById('content-viewport') && document.getElementById('content-viewport').classList.contains('viewer-edit-active');
    if (!isEdit) { alert('Switching to edit mode first.'); if (viewerSwitchToEdit) viewerSwitchToEdit(); return; }
    var ta = document.getElementById('viewer-edit-ta');
    if (ta) __scholarAICursorPos = ta.selectionStart;
    scholarAISetResultTab('insert');
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
    var resultText = scholarAIGetInsertResultText();
    if (!resultText) { alert('There is no ScholarAI result to insert.'); return; }

    function findDocFromFrames(selectors) {
      for (var i = 0; i < selectors.length; i++) {
        var frame = document.querySelector(selectors[i]);
        if (!frame) continue;
        try {
          var d = frame.contentDocument || (frame.contentWindow && frame.contentWindow.document);
          if (d) return d;
        } catch (e) {}
      }
      return null;
    }
    function findWritableControlInDoc(docRef, preferredId) {
      if (!docRef) return null;
      if (preferredId) {
        var preferred = docRef.getElementById(preferredId);
        if (isTextSelectionControl(preferred) && !preferred.disabled && !preferred.readOnly) return preferred;
      }
      var active = docRef.activeElement;
      if (isTextSelectionControl(active) && !active.disabled && !active.readOnly) return active;
      var first = docRef.querySelector('textarea:not([disabled]):not([readonly]),input[type="text"]:not([disabled]):not([readonly])');
      if (isTextSelectionControl(first)) return first;
      return null;
    }
    function insertIntoTextControl(target, text, appendMode) {
      if (!target) return false;
      var raw = String(target.value || '');
      var s = isFinite(target.selectionStart) ? target.selectionStart : raw.length;
      var e = isFinite(target.selectionEnd) ? target.selectionEnd : s;
      s = Math.max(0, Math.min(s, raw.length));
      e = Math.max(0, Math.min(e, raw.length));
      var before = raw.slice(0, s);
      var selected = raw.slice(s, e);
      var after = raw.slice(e);
      var next = appendMode ? (before + selected + '\n\n' + text + after) : (before + text + after);
      target.value = next;
      var caret = appendMode ? (s + selected.length + 2 + text.length) : (s + text.length);
      if (typeof target.focus === 'function') target.focus();
      if (typeof target.setSelectionRange === 'function') target.setSelectionRange(caret, caret);
      try {
        var evCtor = (target.ownerDocument && target.ownerDocument.defaultView && target.ownerDocument.defaultView.Event) || Event;
        target.dispatchEvent(new evCtor('input', { bubbles: true }));
        target.dispatchEvent(new evCtor('change', { bubbles: true }));
      } catch (e2) {}
      return true;
    }

    if (mode === 3) {
      var gsDoc = findDocFromFrames([
        '#html2ppt-frame',
        'iframe[title="GenSlide"]',
        'iframe[src*="Html2pptx/jenaEditor"]'
      ]);
      var gsTarget = findWritableControlInDoc(gsDoc, 'code');
      if (!gsTarget) { alert('GenSlide HTMLCode 입력창을 찾지 못했습니다. GenSlide를 먼저 열어주세요.'); return; }
      insertIntoTextControl(gsTarget, resultText, false);
      __scholarAILastSelectionTarget = gsTarget;
      __scholarAISelStart = __scholarAISelEnd = null;
      __scholarAICursorPos = isFinite(gsTarget.selectionStart) ? gsTarget.selectionStart : String(gsTarget.value || '').length;
      return;
    }

    if (mode === 4) {
      var mmDoc = findDocFromFrames([
        '#mermaid-editor-frame',
        'iframe[title="Mermaid Editor"]',
        'iframe[src*="mermaid-editor/index.html"]'
      ]);
      var mmTarget = findWritableControlInDoc(mmDoc, 'raw-code-editor');
      if (!mmTarget) { alert('Mermaid 코드 입력창을 찾지 못했습니다. Mermaid Editor를 먼저 열어주세요.'); return; }
      insertIntoTextControl(mmTarget, resultText, false);
      __scholarAILastSelectionTarget = mmTarget;
      __scholarAISelStart = __scholarAISelEnd = null;
      __scholarAICursorPos = isFinite(mmTarget.selectionStart) ? mmTarget.selectionStart : String(mmTarget.value || '').length;
      return;
    }

    var ta = document.getElementById('viewer-edit-ta');
    var isEdit = document.getElementById('content-viewport') && document.getElementById('content-viewport').classList.contains('viewer-edit-active');
    var viewerBuildNav = typeof window.viewerBuildNav === 'function' ? window.viewerBuildNav : function () {};

    var target = (isEdit && ta) ? ta : null;

    if (!target && __scholarAILastSelectionTarget && __scholarAILastSelectionTarget.isConnected && isTextSelectionControl(__scholarAILastSelectionTarget)) {
      target = __scholarAILastSelectionTarget;
    }
    if (!target && isTextSelectionControl(document.activeElement) && !isAiPanelElement(document.activeElement)) {
      target = document.activeElement;
    }

    if (!target) {
      var gsFrame = document.getElementById('html2ppt-frame');
      try {
        var gsDoc2 = gsFrame && (gsFrame.contentDocument || (gsFrame.contentWindow && gsFrame.contentWindow.document));
        if (gsDoc2) {
          var gsActive = gsDoc2.activeElement;
          if (isTextSelectionControl(gsActive) && !gsActive.disabled && !gsActive.readOnly) target = gsActive;
          if (!target) {
            var gsCode = gsDoc2.getElementById('code');
            if (isTextSelectionControl(gsCode) && !gsCode.disabled && !gsCode.readOnly) target = gsCode;
          }
          if (!target) {
            var gsAny = gsDoc2.querySelector('textarea:not([disabled]):not([readonly]),input[type="text"]:not([disabled]):not([readonly])');
            if (isTextSelectionControl(gsAny)) target = gsAny;
          }
        }
      } catch (e) {}
    }

    if (!target) {
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
      target = document.getElementById('viewer-edit-ta');
    }
    if (!target) return;

    var start, end, raw = String(target.value || '');
    if (mode === 0) {
      var fallbackPos = isFinite(target.selectionStart) ? target.selectionStart : raw.length;
      start = end = (__scholarAICursorPos != null ? __scholarAICursorPos : fallbackPos);
    } else if (__scholarAISelStart != null && __scholarAISelEnd != null && __scholarAILastSelectionTarget === target) {
      start = __scholarAISelStart;
      end = __scholarAISelEnd;
    } else {
      var selTa = document.getElementById('scholar-ai-selected');
      var selText = (selTa && selTa.value) ? selTa.value.trim() : '';
      var idx = selText ? raw.indexOf(selText) : -1;
      if (idx >= 0) {
        start = idx;
        end = idx + selText.length;
      } else {
        start = isFinite(target.selectionStart) ? target.selectionStart : raw.length;
        end = isFinite(target.selectionEnd) ? target.selectionEnd : start;
      }
    }
    start = Math.max(0, Math.min(start, raw.length));
    end = Math.max(0, Math.min(end, raw.length));
    var before = raw.slice(0, start);
    var after = raw.slice(end);
    var newVal = mode === 1 ? before + raw.slice(start, end) + '\n\n' + resultText + after : before + resultText + after;
    target.value = newVal;
    if (target === document.getElementById('viewer-edit-ta')) window.__rawText = newVal;
    var insertEnd = mode === 1 ? start + (end - start) + 2 + resultText.length : start + resultText.length;
    __scholarAICursorPos = insertEnd;
    __scholarAISelStart = __scholarAISelEnd = null;
    __scholarAILastSelectionTarget = target;
    target.focus();
    if (typeof target.setSelectionRange === 'function') target.setSelectionRange(insertEnd, insertEnd);
    var lines = (target.value.substring(0, insertEnd).match(/\n/g) || []).length;
    var lineHeight = parseInt(getComputedStyle(target).lineHeight, 10) || 20;
    if (isFinite(target.scrollTop)) target.scrollTop = Math.max(0, lines * lineHeight - target.clientHeight / 2);
    try {
      var evCtor = (target.ownerDocument && target.ownerDocument.defaultView && target.ownerDocument.defaultView.Event) || Event;
      target.dispatchEvent(new evCtor('input', { bubbles: true }));
      target.dispatchEvent(new evCtor('change', { bubbles: true }));
    } catch (e) {}
  }
  function toggleViewerSSP() {
    var el = document.getElementById('ssp-ai-sidebar');
    if (!el) return;
    el.classList.toggle('open');
    if (el.classList.contains('open')) {
      if (el.classList.contains('popup') || isPanelPopupMode('ssp-ai-sidebar')) {
        el.classList.add('popup');
        if (el.parentNode !== document.body) document.body.appendChild(el);
        applyPanelPopupRect('ssp-ai-sidebar', el);
      }
      syncAiPanelsFromDocumentSelection();
      viewerSSPInit();
    } else {
      closeAiPanelHard('ssp-ai-sidebar');
      updatePopupToggleLabels();
      updateSSPHeaderActionButtons();
      try { if (typeof window.__onAiSidebarPanelClosed === 'function') window.__onAiSidebarPanelClosed(); } catch (e) {}
    }
  }
  function sspAIShrink() {
    closeAiPanelHard('ssp-ai-sidebar');
    updatePopupToggleLabels();
    updateSSPHeaderActionButtons();
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
  function viewerSSPApplySketchImage(dataURL) {
    if (!dataURL || String(dataURL).indexOf('data:image') !== 0) return false;
    __viewerSSPSeedImage = dataURL;
    __viewerSSPResultImage = dataURL;
    viewerSSPSetUploadZoneContent(dataURL);
    var resultImg = document.getElementById('ssp-result-img');
    if (resultImg) {
      resultImg.src = dataURL;
      resultImg.style.display = 'block';
      resultImg.title = 'Open fullscreen';
    }
    var downloadBtn = document.getElementById('ssp-download-btn');
    if (downloadBtn) downloadBtn.disabled = false;
    var openBtn = document.querySelector('.ssp-btn-open-result');
    if (openBtn) openBtn.disabled = false;
    var linkInput = document.getElementById('ssp-image-link-url');
    if (linkInput) linkInput.value = '';
    viewerSSPImgHistoryAdd(dataURL, 'Sketchpad image');
    setSSPStatus('Sketchpad image inserted into sspimgAI.');
    return true;
  }
  function viewerSSPOpenSketchpad() {
    if (window.AiSketchPad && typeof window.AiSketchPad.open === 'function') {
      window.AiSketchPad.open('ssp');
      return;
    }
    notifyUser('Sketchpad is not loaded.', true);
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
        
        notifyUser('No image found. Please capture or select an image first.', true);
        return;
    }
    viewerSSPUploadToImgbb(img.src);
  }
  function viewerSSPFsApplyToSSP() {
    var img = document.getElementById('viewer-fs-img');
    if (!img || !img.src) {
      notifyUser('No image is open.', true);
      return;
    }
    viewerSSPApplyImageToPanel(img.src, 'Applied image');
    notifyUser('Image applied to sspimgAI input.', false);
  }
  function viewerSSPFsSaveInternalAndInsert() {
    var img = document.getElementById('viewer-fs-img');
    if (!img || !img.src) {
      notifyUser('문서에 삽입할 이미지가 없습니다.', true);
      return;
    }
    __viewerSSPResultImage = img.src;
    return viewerSSPSaveInternalAndInsert('markdown');
  }
  function viewerSSPFsInsert() {
    var img = document.getElementById('viewer-fs-img');
    if (!img || !img.src) return;
    var h = getHost();
    if (h) try { h.postMessage({ type: 'imgViewerInsert', dataURL: img.src }, '*'); } catch (e) {}
  }
  function viewerSSPApplyImageToPanel(dataUrl, historyLabel) {
    if (!dataUrl) return false;
    __viewerSSPSeedImage = dataUrl;
    __viewerSSPResultImage = dataUrl;
    viewerSSPSetUploadZoneContent(dataUrl);
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
    var openBtn = document.querySelector('.ssp-btn-open-result');
    if (openBtn) openBtn.disabled = false;
    var linkInput = document.getElementById('ssp-image-link-url');
    if (linkInput) linkInput.value = '';
    viewerSSPUpdateFullscreenInfo(dataUrl);
    viewerSSPImgHistoryAdd(dataUrl, historyLabel || 'Applied image');
    return true;
  }
  function viewerSSPShowHistoryImage(id) {
    for (var i = 0; i < __viewerSSPImgHistory.length; i++) {
      if (__viewerSSPImgHistory[i].id === id) {
        var dataURL = __viewerSSPImgHistory[i].dataURL;
        if (!dataURL) return;
        __viewerSSPSeedImage = dataURL;
        __viewerSSPResultImage = dataURL;
        viewerSSPSetUploadZoneContent(dataURL);
        var resultImg = document.getElementById('ssp-result-img');
        if (resultImg) {
          resultImg.src = dataURL;
          resultImg.style.display = 'block';
          resultImg.title = 'Generated image preview';
        }
        var downloadBtn = document.getElementById('ssp-download-btn');
        if (downloadBtn) downloadBtn.disabled = false;
        var openBtn = document.querySelector('.ssp-btn-open-result');
        if (openBtn) openBtn.disabled = false;
        setSSPStatus('히스토리 이미지를 결과창에 표시했습니다. 크게 보려면 크게보기 버튼을 누르세요.');
        return;
      }
    }
    notifyUser('선택한 히스토리 이미지를 찾을 수 없습니다.', true);
  }
  function viewerSSPOpenCurrentResultFullscreen() {
    var resultImg = document.getElementById('ssp-result-img');
    var src = (resultImg && resultImg.src) || __viewerSSPResultImage;
    if (!src) {
      notifyUser('크게 볼 이미지가 없습니다.', true);
      return;
    }
    viewerSSPOpenFullscreen(src);
  }
  function viewerSSPApplyCroppedImage(dataUrl) {
    if (!viewerSSPApplyImageToPanel(dataUrl, 'Cropped image')) return;
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
    var base = (c && c.cropEditorBase != null) ? c.cropEditorBase : './js/crop/';
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
    __viewerSSPAbortRequested = true;
    var fn = getCallback('abortCurrentTask');
    if (typeof fn === 'function') try { fn(); } catch (e) {}
    var statusEl = document.getElementById('ssp-status');
    if (statusEl) statusEl.textContent = '생성 중지 요청을 보냈습니다.';
  }
  function viewerSSPEnsureProgressPlacement() {
    var actionRow = document.querySelector('.ssp-action-row');
    var progressWrap = document.getElementById('ssp-progress-wrap');
    if (actionRow && progressWrap && actionRow.parentNode && actionRow.nextElementSibling !== progressWrap) {
      actionRow.parentNode.insertBefore(progressWrap, actionRow.nextSibling);
    }
  }
  function viewerSSPSetProgressVisible(visible, pct) {
    var progressWrap = document.getElementById('ssp-progress-wrap');
    var progressFill = document.getElementById('ssp-progress-fill');
    var progressPct = document.getElementById('ssp-progress-pct');
    viewerSSPEnsureProgressPlacement();
    if (progressWrap) {
      progressWrap.classList.toggle('visible', !!visible);
      progressWrap.style.display = visible ? 'flex' : 'none';
    }
    if (typeof pct === 'number') {
      var safePct = Math.max(0, Math.min(100, Math.round(pct)));
      if (progressFill) progressFill.style.width = safePct + '%';
      if (progressPct) progressPct.textContent = safePct + '%';
    }
  }
  function viewerSSPSetGeneratingState(running) {
    __viewerSSPGenerating = !!running;
    var generateBtn = document.querySelector('.ssp-btn-generate');
    var abortBtn = document.querySelector('#ssp-progress-wrap button');
    if (generateBtn) generateBtn.disabled = __viewerSSPGenerating;
    if (abortBtn) {
      abortBtn.disabled = !__viewerSSPGenerating;
      abortBtn.textContent = '중지';
    }
  }
  function viewerSSPBindAltWheelFont() {
    ['ssp-prompt', 'ssp-prompt-2'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el || el.__viewerSSPAltWheelBound) return;
      el.__viewerSSPAltWheelBound = true;
      var current = parseFloat(window.getComputedStyle(el).fontSize) || 11;
      __viewerSSPTextFontSizes[id] = __viewerSSPTextFontSizes[id] || current;
      el.addEventListener('wheel', function (e) {
        if (!e.altKey) return;
        e.preventDefault();
        e.stopPropagation();
        var base = __viewerSSPTextFontSizes[id] || parseFloat(window.getComputedStyle(el).fontSize) || 11;
        var next = Math.max(9, Math.min(34, base + (e.deltaY < 0 ? 1 : -1)));
        __viewerSSPTextFontSizes[id] = next;
        el.style.setProperty('font-size', next + 'px', 'important');
      }, { passive: false });
    });
  }
  function viewerSSPInit() {
    ensureViewerFsOverlayOnBody();
    viewerSSPInitHistoryResizer();
    viewerSSPEnsureFullscreenGallery();
    viewerSSPEnsureProgressPlacement();
    viewerSSPBindAltWheelFont();
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
    if (actionRow && !actionRow.querySelector('.ssp-btn-internal-insert')) {
      var internalInsertBtn = document.createElement('button');
      internalInsertBtn.type = 'button';
      internalInsertBtn.className = 'sa-btn ghost ssp-btn-internal-insert';
      internalInsertBtn.textContent = '문서삽입';
      internalInsertBtn.title = '결과 이미지를 문서 내부에 저장하고 삽입';
      internalInsertBtn.onclick = function () { viewerSSPSaveInternalAndInsert('markdown'); };
      var generateBtn = actionRow.querySelector('.ssp-btn-generate');
      if (generateBtn && generateBtn.nextSibling) actionRow.insertBefore(internalInsertBtn, generateBtn.nextSibling);
      else actionRow.appendChild(internalInsertBtn);
    }
    if (actionRow && !actionRow.querySelector('.ssp-btn-crop')) {
      var cropBtn = document.createElement('button');
      cropBtn.type = 'button';
      cropBtn.className = 'sa-btn ghost ssp-btn-crop';
      cropBtn.textContent = 'Crop';
      cropBtn.title = 'Crop current result image';
      cropBtn.onclick = function () {
        var resultImg = document.getElementById('ssp-result-img');
        if (!resultImg || !resultImg.src) {
      
          notifyUser('\\uC790\\uB974\\uAE30\\uD560 \\uC774\\uBBF8\\uC9C0\\uAC00 \\uC5C6\\uC2B5\\uB2C8\\uB2E4. \\uBA3C\\uC800 \\uC774\\uBBF8\\uC9C0\\uB97C \\uC0DD\\uC131\\uD558\\uAC70\\uB098 \\uBD88\\uB7EC\\uC624\\uC138\\uC694.', true);
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
      link.textContent = 'API key ?????諛몃마嶺뚮??????猷고?影瑜곸떻?? https://api.imgbb.com/';
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
    if (__viewerSSPGenerating) return;
    viewerSSPEnsureProgressPlacement();
    viewerSSPBindAltWheelFont();
    var promptEl = document.getElementById('ssp-prompt');
    var promptEl2 = document.getElementById('ssp-prompt-2');
    var p1 = promptEl && promptEl.value ? promptEl.value.trim() : '';
    var p2 = promptEl2 && promptEl2.value ? promptEl2.value.trim() : '';
    var prompt = [p1, p2].filter(Boolean).join('\n\n');
    var seedImage = __viewerSSPSeedImage;
    var hasSeed = seedImage && typeof seedImage === 'string' && seedImage.indexOf('data:image') === 0;
    if (!hasSeed && !prompt) { alert('?????獄쏅챶留??????ш내?℡ㅇ?좊눧??????????쇨덫櫻????????????轅붽틓??????????耀붾굝?????????????????????饔낅떽??????'); return; }
    var generateImage = getCallback('generateImage');
    if (typeof generateImage !== 'function') { alert('?????耀붾굝????? ????ш끽維뽳쭩???API???????????????源낆┰?????????곸죩. ????μ떜媛?걫??????饔낅떽???????????轅붽틓??影?놁쟼???'); return; }
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
    __viewerSSPAbortRequested = false;
    viewerSSPSetGeneratingState(true);
    viewerSSPSetProgressVisible(true, 0);
    if (progressWrap) { progressWrap.classList.add('visible'); progressWrap.style.display = 'flex'; }
    if (progressFill) progressFill.style.width = '0%';
    if (progressPct) progressPct.textContent = '0%';
    if (statusEl) statusEl.textContent = '\uC774\uBBF8\uC9C0\uB97C \uC0DD\uC131 \uC911\uC785\uB2C8\uB2E4...';
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
      if (__viewerSSPAbortRequested) {
        viewerSSPSetProgressVisible(false, 0);
        if (statusEl) statusEl.textContent = '생성 요청이 중단되었습니다.';
        return;
      }
      if (progressFill) progressFill.style.width = '100%';
      if (progressPct) progressPct.textContent = '100%';
      if (progressWrap) setTimeout(function () { progressWrap.classList.remove('visible'); progressWrap.style.display = 'none'; }, 500);
      if (dataURL) {
        __viewerSSPResultImage = dataURL;
        if (resultImg) { resultImg.src = dataURL; resultImg.style.display = 'block'; resultImg.title = 'Open fullscreen'; }
        if (downloadBtn) downloadBtn.disabled = false;
        var openBtn = document.querySelector('.ssp-btn-open-result');
        if (openBtn) openBtn.disabled = false;
        if (statusEl) statusEl.textContent = '\uC774\uBBF8\uC9C0 \uC0DD\uC131\uC774 \uC644\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.';
        viewerSSPImgHistoryAdd(dataURL, prompt);
      } else {
        if (statusEl) statusEl.textContent = '\uC774\uBBF8\uC9C0 \uB370\uC774\uD130\uB97C \uBC1B\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.';
      }
    } catch (e) {
      clearInterval(progressInterval);
      if (progressWrap) { progressWrap.classList.remove('visible'); progressWrap.style.display = 'none'; }
      if (statusEl) statusEl.textContent = (e && e.name === 'AbortError')
        ? '\uC0DD\uC131 \uC694\uCCAD\uC774 \uC911\uB2E8\uB418\uC5C8\uC2B5\uB2C8\uB2E4.'
        : ('\uC774\uBBF8\uC9C0 \uC0DD\uC131 \uC911 \uC624\uB958: ' + (e.message || e));
    } finally {
      viewerSSPSetGeneratingState(false);
      __viewerSSPAbortRequested = false;
    }
  }
  function viewerSSPDownload() {
    if (!__viewerSSPResultImage) { alert('\uBA3C\uC800 \uC774\uBBF8\uC9C0\uB97C \uC0DD\uC131\uD55C \uB4A4 \uB2E4\uC6B4\uB85C\uB4DC\uD558\uC138\uC694.'); return; }
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
      // Korean UI message (kept as Unicode escape to avoid future mojibake):
   
      setSSPStatus('\uC5C5\uB85C\uB4DC\uD560 \uC774\uBBF8\uC9C0\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4. \uBA3C\uC800 \uC774\uBBF8\uC9C0\uB97C \uC0DD\uC131\uD558\uAC70\uB098 \uBD88\uB7EC\uC624\uC138\uC694.');
      notifyUser('\uC5C5\uB85C\uB4DC\uD560 \uC774\uBBF8\uC9C0\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4. \uBA3C\uC800 \uC774\uBBF8\uC9C0\uB97C \uC0DD\uC131\uD558\uAC70\uB098 \uBD88\uB7EC\uC624\uC138\uC694.', true);
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
      // Korean UI message:
 
      setImgbbSettingsStatus('imgBB API \uD0A4\uB97C \uBA3C\uC800 \uC785\uB825\uD558\uACE0 \uC800\uC7A5\uD558\uC138\uC694.', true);
      notifyUser('imgBB API \uD0A4\uB97C \uBA3C\uC800 \uC785\uB825\uD558\uACE0 \uC800\uC7A5\uD558\uC138\uC694.', true);
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

      setSSPStatus('imgBB upload completed.');
      setImgbbSettingsStatus('Upload completed. You can insert the link below as Markdown or HTML.', false);
      notifyUser('imgBB upload completed', false);
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
  async function viewerSSPSaveInternalAndInsert(format) {
    var sourceDataUrl = __viewerSSPResultImage || __viewerSSPSeedImage;
    if (!sourceDataUrl || String(sourceDataUrl).indexOf('data:image') !== 0) {
      setSSPStatus('문서에 삽입할 이미지가 없습니다. 먼저 이미지를 생성하거나 불러오세요.');
      notifyUser('문서에 삽입할 이미지가 없습니다. 먼저 이미지를 생성하거나 불러오세요.', true);
      return;
    }
    if (!window.ImageDB || typeof window.ImageDB.saveDataUrl !== 'function') {
      setSSPStatus('ImageDB 모듈을 사용할 수 없습니다.');
      notifyUser('ImageDB 모듈을 사용할 수 없습니다.', true);
      return;
    }
    var imageDb = null;
    try { imageDb = (typeof db !== 'undefined') ? db : null; } catch (e) { imageDb = null; }
    if (!imageDb) {
      setSSPStatus('내부 이미지 DB가 아직 준비되지 않았습니다.');
      notifyUser('내부 이미지 DB가 아직 준비되지 않았습니다.', true);
      return;
    }
    var btn = document.querySelector('.ssp-btn-internal-insert');
    if (btn) {
      btn.disabled = true;
      btn.dataset.prevText = btn.textContent;
      btn.textContent = '저장중...';
    }
    try {
      var saved = await window.ImageDB.saveDataUrl(imageDb, sourceDataUrl, {
        name: 'sspimgai_' + Date.now() + '.png'
      });
      var internalUrl = saved && saved.url ? saved.url : '';
      if (!internalUrl) throw new Error('Internal image URL was not created.');
      var linkInput = document.getElementById('ssp-image-link-url');
      if (linkInput) linkInput.value = internalUrl;
      if (String(format || 'markdown').toLowerCase() === 'html') {
        if (typeof window.insertHtmlImageAtCursor !== 'function') throw new Error('HTML image insertion is not available.');
        window.insertHtmlImageAtCursor(internalUrl, getSspImageAltText(internalUrl));
      } else {
        if (typeof window.insertMarkdownImageAtCursor !== 'function') throw new Error('Markdown image insertion is not available.');
        window.insertMarkdownImageAtCursor(internalUrl, getSspImageAltText(internalUrl));
      }
      setSSPStatus('문서 내부에 저장하고 삽입했습니다.');
      notifyUser('이미지를 문서 내부에 저장하고 삽입했습니다.', false);
    } catch (e) {
      var msg = e && e.message ? e.message : String(e || 'internal save error');
      setSSPStatus('문서 내부 저장/삽입 오류: ' + msg);
      notifyUser('문서 내부 저장/삽입 오류: ' + msg, true);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = btn.dataset.prevText || '문서삽입';
      }
    }
  }
  function viewerSSPCropFromPanel() {
    var resultImg = document.getElementById('ssp-result-img');
    if (!resultImg || !resultImg.src) {
      // Korean message (Unicode-escaped): no image available for crop action.
      notifyUser('\uC790\uB974\uAE30\uD560 \uC774\uBBF8\uC9C0\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4. \uBA3C\uC800 \uC774\uBBF8\uC9C0\uB97C \uC0DD\uC131\uD558\uAC70\uB098 \uBD88\uB7EC\uC624\uC138\uC694.', true);
      return;
    }
    viewerSSPOpenFullscreen(resultImg.src);
    viewerSSPFsCrop();
  }
  function sspInsertImageMarkdown() {
    var el = document.getElementById('ssp-image-link-url');
    var u = el && el.value.trim();
    // Korean message (Unicode-escaped): request URL input first.
    if (!u) { alert('\uC774\uBBF8\uC9C0 URL\uC744 \uBA3C\uC800 \uC785\uB825\uD558\uC138\uC694.'); return; }
    if (typeof window.insertMarkdownImageAtCursor !== 'function') {
      alert('Markdown image insertion is not available.');
      return;
    }
    window.insertMarkdownImageAtCursor(u, getSspImageAltText(u));
  }
  function sspInsertImageHtml() {
    var el = document.getElementById('ssp-image-link-url');
    var u = el && el.value.trim();
    // Korean message (Unicode-escaped): request URL input first.
    if (!u) { alert('\uC774\uBBF8\uC9C0 URL\uC744 \uBA3C\uC800 \uC785\uB825\uD558\uC138\uC694.'); return; }
    if (typeof window.insertHtmlImageAtCursor !== 'function') {
      alert('HTML image insertion is not available.');
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
    // Korean message (Unicode-escaped): selected history image was not found.
    notifyUser('\uC120\uD0DD\uD55C \uAE30\uB85D \uC774\uBBF8\uC9C0\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.', true);
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
  if (__viewerSSPImgHistory.length === 0) { 
    list.innerHTML = '<span style="font-size:10px;color:#94a3b8">No image history available. Your generated images will appear here.</span>'; 
    return; 
}
    var html = '';
    for (var i = 0; i < __viewerSSPImgHistory.length; i++) {
      var h = __viewerSSPImgHistory[i];
      var lbl = (h.prompt || '(No prompt)').replace(/</g, '&lt;').substring(0, 30) + ((h.prompt || '').length > 30 ? '...' : '');
      html += '<div class="ssp-img-history-item" data-id="' + h.id + '">';
      html += '<img src="' + (h.dataURL || '').replace(/"/g, '&quot;') + '" onclick="viewerSSPShowHistoryImage(\'' + h.id + '\'); event.stopPropagation()" title="결과창에 표시">';
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
      html += '<img src="' + (h.dataURL || '').replace(/"/g, '&quot;') + '" onclick="viewerSSPShowHistoryImage(\'' + h.id + '\'); event.stopPropagation()" title="결과창에 표시">';
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
    var replacementCharCount = (text.match(/\uFFFD/g) || []).length;
    return questionRuns >= Math.max(6, Math.floor(text.length * 0.25))
      || replacementCharCount >= 2;
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
  window.scholarAIPopupToggle = scholarAIPopupToggle;
  window.toggleScholarAIPrePrompt = toggleScholarAIPrePrompt;
  window.scholarAIUsePromptRole = scholarAIUsePromptRole;
  window.toggleScholarAIModelSelect = toggleScholarAIModelSelect;
  window.scholarAIFullscreen = scholarAIFullscreen;
  window.scholarAISyncSelection = scholarAISyncSelection;
  window.scholarAIHistoryAdd = scholarAIHistoryAdd;
  window.scholarAIToggleHistoryPanel = scholarAIToggleHistoryPanel;
  window.scholarAIHistoryRender = scholarAIHistoryRender;
  window.scholarAIHistoryShowResult = scholarAIHistoryShowResult;
  window.scholarAIHistoryDelete = scholarAIHistoryDelete;
  window.scholarAIHistorySaveMd = scholarAIHistorySaveMd;
  window.scholarAIHistorySaveAll = scholarAIHistorySaveAll;
  window.scholarAIRun = scholarAIRun;
  window.scholarAIStop = scholarAIStop;
  window.scholarAICopyResult = scholarAICopyResult;
  window.scholarAIClearResult = scholarAIClearResult;
  window.scholarAIResultFont = scholarAIResultFont;
  window.scholarAIRenderZoomMarkdown = scholarAIRenderZoomMarkdown;
  window.scholarAIAdjustZoom = scholarAIAdjustZoom;
  window.scholarAISetZoomMode = scholarAISetZoomMode;
  window.scholarAISetResultTab = scholarAISetResultTab;
  window.scholarAICopyZoomMarkdown = scholarAICopyZoomMarkdown;
  window.scholarAIResultZoomOpen = scholarAIResultZoomOpen;
  window.scholarAIResultZoomClose = scholarAIResultZoomClose;
  window.SidebarAIInsertDeps = {
    getInsertResultText: scholarAIGetInsertResultText,
    isTextSelectionControl: isTextSelectionControl,
    isAiPanelElement: isAiPanelElement,
    setResultTab: scholarAISetResultTab,
    getSelectionState: function () {
      return {
        selStart: __scholarAISelStart,
        selEnd: __scholarAISelEnd,
        cursorPos: __scholarAICursorPos,
        lastSelectionTarget: __scholarAILastSelectionTarget,
        lastSelectionDoc: __scholarAILastSelectionDoc
      };
    },
    setSelectionState: function (next) {
      var n = next || {};
      if (Object.prototype.hasOwnProperty.call(n, 'selStart')) __scholarAISelStart = n.selStart;
      if (Object.prototype.hasOwnProperty.call(n, 'selEnd')) __scholarAISelEnd = n.selEnd;
      if (Object.prototype.hasOwnProperty.call(n, 'cursorPos')) __scholarAICursorPos = n.cursorPos;
      if (Object.prototype.hasOwnProperty.call(n, 'lastSelectionTarget')) __scholarAILastSelectionTarget = n.lastSelectionTarget;
      if (Object.prototype.hasOwnProperty.call(n, 'lastSelectionDoc')) __scholarAILastSelectionDoc = n.lastSelectionDoc;
    }
  };
  window.handleScholarAIInsertClick = (window.SidebarAIInsert && window.SidebarAIInsert.handleScholarAIInsertClick)
    ? window.SidebarAIInsert.handleScholarAIInsertClick
    : handleScholarAIInsertClick;
  window.toggleScholarAIInsertMenu = (window.SidebarAIInsert && window.SidebarAIInsert.toggleScholarAIInsertMenu)
    ? window.SidebarAIInsert.toggleScholarAIInsertMenu
    : toggleScholarAIInsertMenu;
  window.closeScholarAIInsertMenu = (window.SidebarAIInsert && window.SidebarAIInsert.closeScholarAIInsertMenu)
    ? window.SidebarAIInsert.closeScholarAIInsertMenu
    : closeScholarAIInsertMenu;
  window.scholarAIInsertDoc = (window.SidebarAIInsert && window.SidebarAIInsert.scholarAIInsertDoc)
    ? window.SidebarAIInsert.scholarAIInsertDoc
    : scholarAIInsertDoc;
  window.toggleViewerSSP = toggleViewerSSP;
  window.sspAIShrink = sspAIShrink;
  window.sspAIPopupToggle = sspAIPopupToggle;
  window.sspAIFullscreen = sspAIFullscreen;
  window.viewerSSPSyncSelection = viewerSSPSyncSelection;
  window.viewerSSPInit = viewerSSPInit;
  window.viewerSSPApplySketchImage = viewerSSPApplySketchImage;
  window.viewerSSPOpenSketchpad = viewerSSPOpenSketchpad;
  window.viewerSSPGenerate = viewerSSPGenerate;
  window.viewerSSPDownload = viewerSSPDownload;
  window.viewerSSPOpenCurrentResultFullscreen = viewerSSPOpenCurrentResultFullscreen;
  window.viewerSSPSaveInternalAndInsert = viewerSSPSaveInternalAndInsert;
  window.viewerSSPToggleImgbbSettings = viewerSSPToggleImgbbSettings;
  window.viewerSSPSaveImgbbSettings = viewerSSPSaveImgbbSettings;
  window.viewerSSPOpenImgbb = viewerSSPOpenImgbb;
  window.viewerSSPUploadToImgbb = viewerSSPUploadToImgbb;
  window.sspInsertImageMarkdown = sspInsertImageMarkdown;
  window.sspInsertImageHtml = sspInsertImageHtml;
  window.viewerSSPUploadHistoryImage = viewerSSPUploadHistoryImage;
  window.viewerSSPShowHistoryImage = viewerSSPShowHistoryImage;
  window.viewerSSPClearSeed = viewerSSPClearSeed;
  window.viewerSSPOpenHistoryFullscreen = viewerSSPOpenHistoryFullscreen;
  window.viewerSSPSetFullscreenGallery = viewerSSPSetFullscreenGallery;
  window.viewerSSPOpenFullscreen = viewerSSPOpenFullscreen;
  window.viewerSSPCloseFullscreen = viewerSSPCloseFullscreen;
  window.viewerSSPImgHistoryRemove = viewerSSPImgHistoryRemove;
  window.viewerSSPAbort = viewerSSPAbort;
  window.viewerSSPFsZoom = viewerSSPFsZoom;
  window.viewerSSPFsDownload = viewerSSPFsDownload;
  window.viewerSSPFsUploadImgbb = viewerSSPFsUploadImgbb;
  window.viewerSSPFsApplyToSSP = viewerSSPFsApplyToSSP;
  window.viewerSSPFsSaveInternalAndInsert = viewerSSPFsSaveInternalAndInsert;
  window.viewerSSPFsInsert = viewerSSPFsInsert;
  window.viewerSSPFsCrop = viewerSSPFsCrop;
  window.viewerSSPCropFromPanel = viewerSSPCropFromPanel;
  window.viewerSSPInsertLinkToDoc = viewerSSPInsertLinkToDoc;
  window.getSidebarAIHtml = getSidebarAIHtml;

  window.sidebarAIInit = function () {
    setPanelPopupMode('scholar-ai-sidebar', isPanelPopupMode('scholar-ai-sidebar'));
    setPanelPopupMode('ssp-ai-sidebar', isPanelPopupMode('ssp-ai-sidebar'));
    updatePopupToggleLabels();
    updateScholarHeaderActionButtons();
    updateSSPHeaderActionButtons();
    ensurePanelPopupDraggable('scholar-ai-sidebar', '#scholar-ai-sidebar .scholar-ai-header');
    ensurePanelPopupDraggable('ssp-ai-sidebar', '#ssp-ai-sidebar .ssp-header');
    if (!window.__aiPopupResizeSaveBound) {
      window.__aiPopupResizeSaveBound = true;
      window.addEventListener('mouseup', function () {
        savePanelPopupRect('scholar-ai-sidebar', document.getElementById('scholar-ai-sidebar'));
        savePanelPopupRect('ssp-ai-sidebar', document.getElementById('ssp-ai-sidebar'));
      });
      window.addEventListener('resize', function () {
        var sa = document.getElementById('scholar-ai-sidebar');
        var sp = document.getElementById('ssp-ai-sidebar');
        if (sa && sa.classList.contains('popup') && sa.classList.contains('open')) applyPanelPopupRect('scholar-ai-sidebar', sa);
        if (sp && sp.classList.contains('popup') && sp.classList.contains('open')) applyPanelPopupRect('ssp-ai-sidebar', sp);
      });
    }
    scholarAISelectedWrapInitResize();
    scholarAIPromptWrapInitResize();
    scholarAIResultWrapInitResize();
    scholarAIEnsureResultTabs();
    scholarAIInitToneSelect();
    scholarAIInitHistoryPanel();
    scholarAIHistoryRender();
    scholarAIBindAltWheelFontSize();
    var resTa = document.getElementById('scholar-ai-result');
    var resInsertTa = document.getElementById('scholar-ai-result-insert');
    if (resTa) resTa.style.setProperty('font-size', __scholarAIResultFontSize + 'px', 'important');
    if (resInsertTa) resInsertTa.style.setProperty('font-size', __scholarAIResultFontSize + 'px', 'important');
    scholarAISetRunningState(false);
    var histSearch = document.getElementById('scholar-ai-history-search');
    if (histSearch) histSearch.addEventListener('input', scholarAIHistoryRender);
   
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
      document.addEventListener('mouseup', onAiGlobalSelectionChange);
      document.addEventListener('keyup', onAiGlobalSelectionChange);
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

    var frames = document.querySelectorAll('iframe');
    for (var i = 0; i < frames.length; i++) {
      var frame = frames[i];
      if (frame.__aiSelBound) continue;
      frame.__aiSelBound = true;
      frame.addEventListener('load', function () { setTimeout(syncAiPanelsFromDocumentSelection, 60); });
      try {
        var fd = frame.contentDocument || (frame.contentWindow && frame.contentWindow.document);
        if (fd) {
          fd.addEventListener('selectionchange', onAiGlobalSelectionChange);
          fd.addEventListener('mouseup', onAiGlobalSelectionChange);
          fd.addEventListener('keyup', onAiGlobalSelectionChange);
          fd.addEventListener('click', onAiGlobalSelectionChange);
          fd.addEventListener('input', onAiGlobalSelectionChange);
          var gsCode = fd.getElementById('code');
          if (gsCode && !gsCode.__aiGenSlideCodeBound) {
            gsCode.__aiGenSlideCodeBound = true;
            gsCode.addEventListener('focus', function () { setTimeout(syncAiPanelsFromDocumentSelection, 30); });
            gsCode.addEventListener('click', function () { setTimeout(syncAiPanelsFromDocumentSelection, 30); });
            gsCode.addEventListener('keyup', function () { setTimeout(syncAiPanelsFromDocumentSelection, 30); });
            gsCode.addEventListener('input', function () { setTimeout(syncAiPanelsFromDocumentSelection, 30); });
          }
        }
      } catch (e) {}
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

