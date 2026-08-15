// This file is intentionally loaded as a classic script for file:// compatibility.
const pdfjsLib = null;
const pdfjsReady = false;
let pdfLibModulePromise = null;
let pdfJsModulePromise = null;
const PDFM_FORMAT = 'mdpro-pdf-merge-project';
const PDFM_VERSION = 1;
const PDFM_APP_ID = 'mdpro-pdf-merge';
const PDFM_WORK_TYPE = 'pdf_merge_project';
const PDFM_STORE = 'work_files';
const PDFM_ID_PREFIX = 'pdf_merge_project:';

function loadPdfLibModule() {
  if (!pdfLibModulePromise) {
    pdfLibModulePromise = import('https://cdn.skypack.dev/pdf-lib').catch(error => {
      pdfLibModulePromise = null;
      throw error;
    });
  }
  return pdfLibModulePromise;
}

function loadPdfJsModule() {
  if (!pdfJsModulePromise) {
    pdfJsModulePromise = import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs').then(module => {
      module.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
      return module;
    }).catch(error => {
      pdfJsModulePromise = null;
      throw error;
    });
  }
  return pdfJsModulePromise;
}

const els = {
  files: document.getElementById('files'), add: document.getElementById('add'), list: document.getElementById('list'),
  dropZone: document.querySelector('.sidebar'),
  split: document.getElementById('tool-split'), deletePages: document.getElementById('tool-delete-pages'), addPage: document.getElementById('tool-add-page'),
  insertImage: document.getElementById('tool-insert-image'), fillForm: document.getElementById('tool-fill-form'), signature: document.getElementById('tool-signature'),
  imageFile: document.getElementById('tool-image-file'), signatureModal: document.getElementById('signature-modal'), signatureCanvas: document.getElementById('signature-canvas'),
  projectSave: document.getElementById('project-save-indb'), projectLoad: document.getElementById('project-load-indb'),
  projectExport: document.getElementById('project-export'), projectImport: document.getElementById('project-import'), projectImportFile: document.getElementById('project-import-file'),
  projectModal: document.getElementById('project-modal'), projectModalTitle: document.getElementById('project-modal-title'), projectNameField: document.getElementById('project-name-field'),
  projectName: document.getElementById('project-name'), projectList: document.getElementById('project-list'), projectModalSave: document.getElementById('project-modal-save'),
  merge: document.getElementById('merge'), save: document.getElementById('save'), toPv: document.getElementById('to-pv'), close: document.getElementById('close'),
  preview: document.getElementById('preview'), placeholder: document.getElementById('placeholder'),
  busy: document.getElementById('busy'), status: document.getElementById('status'), quality: document.getElementById('quality')
};

let items = [];
let mergedBlob = null;
let mergedUrl = '';
let previewUrls = [];
let dragId = '';
let previewRequestId = 0;
let isBusy = false;
let selectedItemId = '';
let currentProjectId = '';
let currentProjectName = '';

function fileId(file) {
  return [file.name, file.size, file.lastModified, Math.random().toString(16).slice(2)].join(':');
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function clearMergedPreview() {
  mergedBlob = null;
  els.save.disabled = true;
  els.toPv.disabled = true;
  els.placeholder.hidden = false;
  clearPreviewImages();
  if (mergedUrl) URL.revokeObjectURL(mergedUrl);
  mergedUrl = '';
}

function clearPreviewImages() {
  els.preview.replaceChildren();
  previewUrls.forEach(url => URL.revokeObjectURL(url));
  previewUrls = [];
}

function getPdfRenderScale() {
  return Math.max(1, Math.min(3, Number(els.quality.value) || 1.75));
}

function getJpegQuality(scale) {
  return scale >= 2.2 ? 0.95 : scale >= 1.7 ? 0.9 : 0.82;
}

function showMergedPreview(pages) {
  clearPreviewImages();
  pages.forEach((page, index) => {
    const url = URL.createObjectURL(new Blob([page.jpeg], { type: 'image/jpeg' }));
    const image = document.createElement('img');
    image.src = url;
    image.alt = 'PDF ' + (index + 1) + '쪽 미리보기';
    image.width = Math.max(1, Math.round(page.width));
    image.height = Math.max(1, Math.round(page.height));
    image.loading = index > 1 ? 'lazy' : 'eager';
    previewUrls.push(url);
    els.preview.appendChild(image);
  });
}

async function renderPdfPageToImage(page, scale) {
  const pageViewport = page.getViewport({ scale: 1 });
  const renderViewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(renderViewport.width));
  canvas.height = Math.max(1, Math.ceil(renderViewport.height));
  const context = canvas.getContext('2d', { alpha: false });
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context, viewport: renderViewport }).promise;
  const jpeg = await canvasToJpeg(canvas, getJpegQuality(scale));
  const width = pageViewport.width;
  const height = pageViewport.height;
  canvas.width = 1;
  canvas.height = 1;
  page.cleanup();
  return { jpeg, width, height };
}

function setBusy(show, message) {
  isBusy = show;
  els.busy.style.display = show ? 'flex' : 'none';
  if (message) els.busy.textContent = message;
  els.add.classList.toggle('disabled', show);
  els.add.setAttribute('aria-disabled', String(show));
  els.merge.disabled = show || !items.length;
  els.save.disabled = show || !mergedBlob;
  els.toPv.disabled = show || !mergedBlob;
  [els.projectSave, els.projectLoad, els.projectExport, els.projectImport].forEach(button => { if (button) button.disabled = show; });
  updatePdfToolButtons();
}

function defaultProjectName() {
  if (currentProjectName) return currentProjectName;
  const firstName = items[0]?.file?.name?.replace(/\.pdf$/i, '') || 'PDF 병합 작업';
  return items.length > 1 ? firstName + ' 외 ' + (items.length - 1) + '개' : firstName;
}

function projectFileName(name) {
  const safe = String(name || 'pdf-merge-project').trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').slice(0, 100) || 'pdf-merge-project';
  return safe + '.pdfm';
}

function createProjectId() {
  const unique = globalThis.crypto?.randomUUID?.() || (Date.now() + '-' + Math.random().toString(16).slice(2));
  return PDFM_ID_PREFIX + unique;
}

async function getProjectDatabase() {
  const owner = window.opener && !window.opener.closed ? window.opener : window;
  const storage = owner.InDbStorage || window.InDbStorage;
  if (!storage) throw new Error('메인 화면의 inDB 저장 모듈에 연결하지 못했습니다.');
  let database = typeof storage.getDatabase === 'function' ? storage.getDatabase() : null;
  if (!database && typeof storage.init === 'function') {
    await storage.init();
    database = typeof storage.getDatabase === 'function' ? storage.getDatabase() : null;
  }
  if (!database || !database.objectStoreNames.contains(PDFM_STORE)) throw new Error('MarkdownProDB work_files 저장소가 준비되지 않았습니다.');
  return database;
}

function runProjectStore(mode, operation) {
  return getProjectDatabase().then(database => new Promise((resolve, reject) => {
    try {
      const transaction = database.transaction(PDFM_STORE, mode);
      const request = operation(transaction.objectStore(PDFM_STORE));
      if (request) {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('inDB 요청을 처리하지 못했습니다.'));
      } else {
        transaction.oncomplete = () => resolve();
      }
      transaction.onerror = () => reject(transaction.error || new Error('inDB 작업에 실패했습니다.'));
      transaction.onabort = () => reject(transaction.error || new Error('inDB 작업이 중단되었습니다.'));
    } catch (error) {
      reject(error);
    }
  }));
}

function makeInDbProjectRecord(name) {
  const now = new Date().toISOString();
  if (!currentProjectId) currentProjectId = createProjectId();
  currentProjectName = String(name || defaultProjectName()).trim() || 'PDF 병합 작업';
  return {
    id: currentProjectId,
    appId: PDFM_APP_ID,
    workType: PDFM_WORK_TYPE,
    format: PDFM_FORMAT,
    projectVersion: PDFM_VERSION,
    name: currentProjectName,
    selectedItemId,
    files: items.map(item => ({
      itemId: item.id,
      name: item.file.name,
      type: item.file.type || 'application/pdf',
      size: item.file.size,
      lastModified: item.file.lastModified || Date.now(),
      pageCount: item.pageCount || null,
      blob: item.file
    })),
    createdAt: window.__loadedPdfmCreatedAt || now,
    updatedAt: now
  };
}

async function saveProjectToInDb() {
  if (!items.length) return alert('저장할 PDF 작업이 없습니다.');
  const name = els.projectName.value.trim() || defaultProjectName();
  closeProjectModal();
  setBusy(true, 'PDF 병합 프로젝트를 inDB에 저장하는 중…');
  try {
    const record = makeInDbProjectRecord(name);
    await runProjectStore('readwrite', store => store.put(record));
    window.__loadedPdfmCreatedAt = record.createdAt;
    els.status.textContent = '프로젝트 “' + record.name + '”을 inDB에 저장했습니다. · PDF ' + items.length + '개';
  } catch (error) {
    alert('프로젝트를 inDB에 저장하지 못했습니다.\n' + (error?.message || error));
  } finally {
    setBusy(false);
  }
}

async function listInDbProjects() {
  const records = await runProjectStore('readonly', store => store.getAll());
  return (Array.isArray(records) ? records : []).filter(record => record && record.appId === PDFM_APP_ID && record.workType === PDFM_WORK_TYPE)
    .sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')));
}

function fileFromStoredEntry(entry) {
  const source = entry.blob instanceof Blob ? entry.blob : new Blob([entry.blob], { type: entry.type || 'application/pdf' });
  return new File([source], entry.name || 'document.pdf', { type: entry.type || source.type || 'application/pdf', lastModified: Number(entry.lastModified) || Date.now() });
}

function restoreProject(record, fromFile) {
  const entries = Array.isArray(record.files) ? record.files : [];
  if (!entries.length) throw new Error('프로젝트에 PDF 파일이 없습니다.');
  items = entries.map(entry => ({
    id: entry.itemId || fileId({ name: entry.name, size: entry.size || entry.blob?.size || 0, lastModified: entry.lastModified || 0 }),
    file: fileFromStoredEntry(entry),
    bytes: null,
    pageCount: Number(entry.pageCount) || null
  }));
  selectedItemId = items.some(item => item.id === record.selectedItemId) ? record.selectedItemId : items[0].id;
  currentProjectId = fromFile ? '' : String(record.id || '');
  currentProjectName = String(record.name || 'PDF 병합 작업');
  window.__loadedPdfmCreatedAt = fromFile ? '' : String(record.createdAt || '');
  clearMergedPreview();
  renderList();
  els.status.textContent = '프로젝트 “' + currentProjectName + '”을 불러왔습니다. · PDF ' + items.length + '개';
}

async function loadInDbProject(record) {
  closeProjectModal();
  setBusy(true, 'inDB 프로젝트를 불러오는 중…');
  try {
    restoreProject(record, false);
  } catch (error) {
    alert('프로젝트를 불러오지 못했습니다.\n' + (error?.message || error));
  } finally {
    setBusy(false);
  }
}

async function deleteInDbProject(record) {
  if (!confirm('“' + record.name + '” 프로젝트를 inDB에서 삭제할까요?')) return;
  await runProjectStore('readwrite', store => store.delete(record.id));
  if (currentProjectId === record.id) {
    currentProjectId = '';
    window.__loadedPdfmCreatedAt = '';
  }
  await renderProjectList();
}

async function renderProjectList() {
  els.projectList.replaceChildren();
  try {
    const records = await listInDbProjects();
    if (!records.length) {
      const empty = document.createElement('div');
      empty.className = 'project-empty';
      empty.textContent = 'inDB에 저장된 PDF 병합 프로젝트가 없습니다.';
      els.projectList.appendChild(empty);
      return;
    }
    records.forEach(record => {
      const row = document.createElement('article');
      row.className = 'project-entry';
      const details = document.createElement('div');
      const name = document.createElement('div');
      name.className = 'project-entry-name';
      name.textContent = record.name || '이름 없는 프로젝트';
      const meta = document.createElement('div');
      meta.className = 'project-entry-meta';
      const updated = record.updatedAt ? new Date(record.updatedAt).toLocaleString('ko-KR') : '날짜 없음';
      meta.textContent = 'PDF ' + (Array.isArray(record.files) ? record.files.length : 0) + '개 · ' + updated;
      details.append(name, meta);
      const actions = document.createElement('div');
      actions.className = 'project-entry-actions';
      const load = document.createElement('button');
      load.type = 'button'; load.className = 'button'; load.textContent = '불러오기';
      load.addEventListener('click', () => loadInDbProject(record));
      const remove = document.createElement('button');
      remove.type = 'button'; remove.className = 'button'; remove.textContent = '삭제';
      remove.addEventListener('click', () => deleteInDbProject(record).catch(error => alert('프로젝트를 삭제하지 못했습니다.\n' + (error?.message || error))));
      actions.append(load, remove);
      row.append(details, actions);
      els.projectList.appendChild(row);
    });
  } catch (error) {
    const failed = document.createElement('div');
    failed.className = 'project-empty';
    failed.textContent = 'inDB 프로젝트 목록을 읽지 못했습니다: ' + (error?.message || error);
    els.projectList.appendChild(failed);
  }
}

function openProjectModal(mode) {
  const saving = mode === 'save';
  els.projectModalTitle.textContent = saving ? '현재 PDF 병합 작업을 inDB에 저장' : 'inDB PDF 병합 프로젝트 불러오기';
  els.projectNameField.hidden = !saving;
  els.projectModalSave.hidden = !saving;
  els.projectList.hidden = saving;
  els.projectName.value = defaultProjectName();
  els.projectModal.hidden = false;
  if (saving) setTimeout(() => els.projectName.select(), 0);
  else renderProjectList();
}

function closeProjectModal() {
  els.projectModal.hidden = true;
}

function bytesToBase64(bytes) {
  const chunkSize = 3 * 16384;
  const chunks = [];
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const part = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
    let binary = '';
    for (let index = 0; index < part.length; index += 1) binary += String.fromCharCode(part[index]);
    chunks.push(btoa(binary));
  }
  return chunks.join('');
}

function base64ToBlob(base64, type) {
  const chunkChars = 4 * 16384;
  const parts = [];
  for (let offset = 0; offset < base64.length; offset += chunkChars) {
    const binary = atob(base64.slice(offset, Math.min(offset + chunkChars, base64.length)));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    parts.push(bytes);
  }
  return new Blob(parts, { type: type || 'application/pdf' });
}

async function exportPdfmProject() {
  if (!items.length) return alert('내보낼 PDF 작업이 없습니다.');
  setBusy(true, '.pdfm 작업 파일을 만드는 중…');
  try {
    const now = new Date().toISOString();
    const project = {
      format: PDFM_FORMAT,
      version: PDFM_VERSION,
      name: defaultProjectName(),
      createdAt: window.__loadedPdfmCreatedAt || now,
      exportedAt: now,
      selectedItemId,
      files: []
    };
    for (let index = 0; index < items.length; index += 1) {
      els.busy.textContent = '.pdfm에 PDF 포함 중… ' + (index + 1) + ' / ' + items.length;
      const item = items[index];
      const bytes = new Uint8Array(await item.file.arrayBuffer());
      project.files.push({ itemId: item.id, name: item.file.name, type: item.file.type || 'application/pdf', size: item.file.size, lastModified: item.file.lastModified || Date.now(), pageCount: item.pageCount || null, dataBase64: bytesToBase64(bytes) });
    }
    const blob = new Blob([JSON.stringify(project)], { type: 'application/vnd.mdviewer.pdfm+json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = projectFileName(project.name);
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    els.status.textContent = '현재 작업을 ' + link.download + ' 파일로 내보냈습니다.';
  } catch (error) {
    alert('.pdfm 작업 파일을 만들지 못했습니다.\n' + (error?.message || error));
  } finally {
    setBusy(false);
    els.busy.textContent = 'PDF를 병합하는 중…';
  }
}

async function importPdfmProject(file) {
  if (!file) return;
  setBusy(true, '.pdfm 작업 파일을 불러오는 중…');
  try {
    const project = JSON.parse(await file.text());
    if (project?.format !== PDFM_FORMAT || Number(project.version) !== PDFM_VERSION || !Array.isArray(project.files)) throw new Error('지원하는 PDF 병합 프로젝트 파일이 아닙니다.');
    const entries = project.files.map(entry => {
      if (!entry?.dataBase64 || !entry?.name) throw new Error('프로젝트 안의 PDF 데이터가 손상되었습니다.');
      return { ...entry, blob: base64ToBlob(entry.dataBase64, entry.type || 'application/pdf') };
    });
    restoreProject({ ...project, files: entries }, true);
  } catch (error) {
    alert('.pdfm 작업 파일을 불러오지 못했습니다.\n' + (error?.message || error));
  } finally {
    setBusy(false);
  }
}

function getSelectedItem() {
  return items.find(item => item.id === selectedItemId) || items[0] || null;
}

function updatePdfToolButtons() {
  const disabled = isBusy || !getSelectedItem();
  [els.split, els.deletePages, els.addPage, els.insertImage, els.fillForm, els.signature].forEach(button => {
    if (button) button.disabled = disabled;
  });
}

function renderList() {
  els.list.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = '병합할 PDF 파일을 불러오세요.';
    els.list.appendChild(empty);
  }
  items.forEach((item, index) => {
    const row = document.createElement('article');
    row.className = 'item cursor-pointer';
    row.classList.toggle('selected', item.id === (selectedItemId || items[0]?.id));
    row.draggable = true;
    row.dataset.id = item.id;
    row.title = '클릭하면 이 PDF를 미리보기';
    row.innerHTML = '<div class="handle" title="끌어서 순서 변경">☰</div>' +
      '<div><div class="name"></div><div class="meta"></div></div>' +
      '<div class="actions"><button type="button" class="mini up" title="위로">▲</button><button type="button" class="mini down" title="아래로">▼</button><button type="button" class="mini remove" title="제거">×</button></div>';
    row.querySelector('.name').textContent = (index + 1) + '. ' + item.file.name;
    row.querySelector('.meta').textContent = (item.pageCount ? item.pageCount + '쪽 · ' : '') + formatSize(item.file.size) + ' · 파일 등록 완료';
    row.querySelector('.up').disabled = index === 0;
    row.querySelector('.down').disabled = index === items.length - 1;
    row.querySelector('.up').addEventListener('click', () => moveItem(index, index - 1));
    row.querySelector('.down').addEventListener('click', () => moveItem(index, index + 1));
    row.querySelector('.remove').addEventListener('click', () => {
      const removedId = item.id;
      items.splice(index, 1);
      if (selectedItemId === removedId) selectedItemId = items[Math.min(index, items.length - 1)]?.id || '';
      clearMergedPreview();
      renderList();
    });
    row.addEventListener('click', function (event) {
      if (event.target.closest('.actions') || event.target.closest('.handle')) return;
      selectedItemId = item.id;
      renderList();
      previewPdfItemWithBrowser(index);
    });
    row.addEventListener('dragstart', () => { dragId = item.id; row.classList.add('dragging'); });
    row.addEventListener('dragend', () => { dragId = ''; row.classList.remove('dragging'); });
    row.addEventListener('dragover', event => event.preventDefault());
    row.addEventListener('drop', event => {
      event.preventDefault();
      const from = items.findIndex(entry => entry.id === dragId);
      if (from >= 0 && from !== index) moveItem(from, index);
    });
    els.list.appendChild(row);
  });
  const knownPages = items.reduce((sum, item) => sum + (Number(item.pageCount) || 0), 0);
  const pageText = knownPages ? ' · 확인된 ' + knownPages + '쪽' : '';
  els.status.textContent = items.length ? items.length + '개 PDF 파일 등록 완료' + pageText + ' · 위에서 아래 순서로 병합' : '선택된 PDF 없음';
  els.merge.disabled = isBusy || !items.length;
  updatePdfToolButtons();
}

function moveItem(from, to) {
  if (from < 0 || to < 0 || from >= items.length || to >= items.length || from === to) return;
  const [item] = items.splice(from, 1);
  items.splice(to, 0, item);
  clearMergedPreview();
  renderList();
}

async function previewPdfItem(index) {
  const item = items[index];
  if (!item) return;
  const requestId = ++previewRequestId;
  const fileName = String(item.file && item.file.name ? item.file.name : ('문서 ' + (index + 1)));
  setBusy(true, 'PDF를 미리보는 중…');
  clearPreviewImages();
  els.placeholder.hidden = false;
  try {
    await ensurePdfItemLoaded(item);
    const pdf = await pdfjsLib.getDocument({ data: item.bytes.slice(), useWorkerFetch: false }).promise;
    const totalPages = pdf.numPages;
    const scale = getPdfRenderScale();
    const previewPages = [];
    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
      if (requestId !== previewRequestId) {
        await pdf.destroy();
        return;
      }
      els.busy.textContent = 'PDF 미리보기 중… ' + pageNumber + ' / ' + totalPages + ' · ' + fileName;
      const page = await pdf.getPage(pageNumber);
      const pageImage = await renderPdfPageToImage(page, scale);
      previewPages.push(pageImage);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    await pdf.destroy();
    if (requestId !== previewRequestId) return;
    showMergedPreview(previewPages);
    els.placeholder.hidden = true;
    els.status.textContent = fileName + ' 미리보기 · 총 ' + totalPages + '쪽';
  } catch (error) {
    if (requestId !== previewRequestId) return;
    clearPreviewImages();
    alert('개별 PDF 미리보기를 불러오지 못했습니다.\n' + (error?.message || error));
  } finally {
    if (requestId === previewRequestId) {
      setBusy(false);
      els.busy.textContent = 'PDF를 병합하는 중…';
      if (els.placeholder.hidden && !els.preview.children.length) {
        els.placeholder.hidden = false;
      }
    }
  }
}

async function readFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const documentTask = pdfjsLib.getDocument({ data: bytes.slice(), useWorkerFetch: false });
  const pdf = await documentTask.promise;
  const pageCount = pdf.numPages;
  await pdf.destroy();
  return { id: fileId(file), file, bytes, pageCount };
}

async function ensurePdfItemLoaded(item) {
  if (!pdfjsReady) throw new Error('PDF 처리 라이브러리를 불러오지 못했습니다.');
  if (item.bytes && Number(item.pageCount) > 0) return item;
  const bytes = new Uint8Array(await item.file.arrayBuffer());
  const documentTask = pdfjsLib.getDocument({ data: bytes.slice(), useWorkerFetch: false });
  const pdf = await documentTask.promise;
  item.bytes = bytes;
  item.pageCount = pdf.numPages;
  await pdf.destroy();
  renderList();
  return item;
}

async function addFiles(fileList) {
  if (isBusy) return;
  const files = Array.from(fileList || []).filter(file => file.type === 'application/pdf' || /\.pdf$/i.test(file.name));
  if (!files.length) return;
  const added = files.map(file => ({
    id: fileId(file),
    file,
    bytes: null,
    pageCount: null
  }));
  items = items.concat(added);
  if (!selectedItemId && added.length) selectedItemId = added[0].id;
  clearMergedPreview();
  renderList();
}

function canvasToJpeg(canvas, quality) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => {
    if (!blob) return reject(new Error('PDF 페이지 이미지를 만들지 못했습니다.'));
    blob.arrayBuffer().then(buffer => resolve(new Uint8Array(buffer)), reject);
  }, 'image/jpeg', quality));
}

async function mergePdfs() {
  if (!items.length) return;
  if (!pdfjsReady) return alert('PDF 처리 라이브러리를 불러오지 못했습니다. 병합기 창을 다시 열어 주세요.');
  const JsPdf = window.jspdf?.jsPDF;
  if (!JsPdf) return alert('PDF 생성 라이브러리를 불러오지 못했습니다.');
  setBusy(true, 'PDF를 병합하는 중…');
  clearMergedPreview();
  previewRequestId += 1;
  let output = null;
  let outputPages = 0;
  const previewPages = [];
  const scale = getPdfRenderScale();
  try {
    for (let index = 0; index < items.length; index += 1) {
      els.busy.textContent = 'PDF 정보를 준비하는 중… ' + (index + 1) + ' / ' + items.length;
      await ensurePdfItemLoaded(items[index]);
    }
    const totalPages = items.reduce((sum, item) => sum + item.pageCount, 0);
    for (const item of items) {
      const source = await pdfjsLib.getDocument({ data: item.bytes.slice(), useWorkerFetch: false }).promise;
      for (let pageNumber = 1; pageNumber <= source.numPages; pageNumber += 1) {
        els.busy.textContent = 'PDF 병합 중… ' + (outputPages + 1) + ' / ' + totalPages;
        const page = await source.getPage(pageNumber);
        const image = await renderPdfPageToImage(page, scale);
        const width = image.width;
        const height = image.height;
        const orientation = width > height ? 'landscape' : 'portrait';
        if (!output) output = new JsPdf({ unit: 'pt', format: [width, height], orientation, compress: true });
        else output.addPage([width, height], orientation);
        output.addImage(image.jpeg, 'JPEG', 0, 0, width, height, undefined, 'MEDIUM');
        previewPages.push(image);
        outputPages += 1;
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      await source.destroy();
    }
    mergedBlob = output.output('blob');
    els.busy.textContent = '병합 결과를 검증하는 중…';
    const mergedBytes = new Uint8Array(await mergedBlob.arrayBuffer());
    const verification = await pdfjsLib.getDocument({ data: mergedBytes, useWorkerFetch: false }).promise;
    const verifiedPages = verification.numPages;
    await verification.destroy();
    if (verifiedPages !== outputPages) {
      throw new Error('병합 결과 쪽 수가 예상과 다릅니다. (예상 ' + outputPages + '쪽, 결과 ' + verifiedPages + '쪽)');
    }
    mergedUrl = URL.createObjectURL(mergedBlob);
    showMergedPreview(previewPages);
    els.placeholder.hidden = true;
    els.save.disabled = false;
    els.toPv.disabled = false;
    els.status.textContent = items.length + '개 PDF를 순서대로 병합 및 검증 완료 · 총 ' + verifiedPages + '쪽';
  } catch (error) {
    alert('PDF 병합에 실패했습니다.\n' + (error?.message || error));
    clearMergedPreview();
  } finally {
    setBusy(false);
    els.busy.textContent = 'PDF를 병합하는 중…';
  }
}

function saveMerged() {
  if (!mergedBlob) return;
  const link = document.createElement('a');
  link.href = mergedUrl || URL.createObjectURL(mergedBlob);
  link.download = mergedFileName();
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function mergedFileName() {
  return 'merged-' + new Date().toISOString().slice(0, 10) + '.pdf';
}

function sendMergedToPv() {
  if (!mergedBlob) return;
  const parentWindow = window.opener;
  if (!parentWindow || parentWindow.closed || typeof parentWindow.openMergedPdfInPreviewPopup !== 'function') {
    alert('PV로 보내려면 MDproViewer의 PDF 병합 메뉴에서 이 창을 열어 주세요.');
    return;
  }
  let opened = false;
  try {
    opened = parentWindow.openMergedPdfInPreviewPopup(mergedBlob, mergedFileName()) === true;
  } catch (error) {
    alert('병합 PDF를 PV로 보내지 못했습니다.\n' + (error?.message || error));
    return;
  }
  if (!opened) {
    alert('PV 창을 열지 못했습니다. 팝업 허용 설정을 확인하세요.');
    return;
  }
  els.status.textContent = items.length + '개 PDF 병합 결과를 PV로 보냈습니다.';
}

function showPdfBlobInPreview(blob, label) {
  clearPreviewImages();
  const url = URL.createObjectURL(blob);
  const frame = document.createElement('iframe');
  frame.src = url;
  frame.title = label || 'PDF 미리보기';
  frame.style.width = '100%';
  frame.style.height = '100%';
  frame.style.minHeight = '100%';
  frame.style.border = '0';
  frame.style.background = '#ffffff';
  previewUrls.push(url);
  els.preview.appendChild(frame);
  els.placeholder.hidden = true;
}

function previewPdfItemWithBrowser(index) {
  const item = items[index];
  if (!item || !item.file) return;
  showPdfBlobInPreview(item.file, item.file.name);
  els.status.textContent = item.file.name + ' · 개별 PDF 미리보기';
}

function downloadPdfBytes(bytes, fileName) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function outputName(item, suffix) {
  const base = String(item?.file?.name || 'document.pdf').replace(/\.pdf$/i, '');
  return base + '-' + suffix + '.pdf';
}

function parsePageRanges(text, pageCount) {
  const selected = new Set();
  String(text || '').split(',').map(part => part.trim()).filter(Boolean).forEach(part => {
    if (part.includes('-')) {
      const [start, end] = part.split('-').map(value => Number.parseInt(value.trim(), 10));
      if (Number.isFinite(start) && Number.isFinite(end)) {
        for (let page = Math.min(start, end); page <= Math.max(start, end); page += 1) selected.add(page - 1);
      }
    } else {
      const page = Number.parseInt(part, 10);
      if (Number.isFinite(page)) selected.add(page - 1);
    }
  });
  return Array.from(selected).filter(index => index >= 0 && index < pageCount).sort((a, b) => a - b);
}

async function loadSelectedPdfDocument() {
  const item = getSelectedItem();
  if (!item) throw new Error('먼저 PDF 파일을 선택하세요.');
  const pdfLib = await loadPdfLibModule();
  const bytes = await item.file.arrayBuffer();
  const document = await pdfLib.PDFDocument.load(bytes);
  return { item, pdfLib, document };
}

async function runPdfTool(message, action) {
  setBusy(true, message);
  try {
    await action();
  } catch (error) {
    alert('PDF 작업에 실패했습니다.\n' + (error?.message || error));
  } finally {
    setBusy(false);
    els.busy.textContent = 'PDF를 병합하는 중…';
  }
}

async function splitSelectedPdf() {
  await runPdfTool('PDF 페이지를 분할하는 중…', async () => {
    const { item, pdfLib, document } = await loadSelectedPdfDocument();
    for (let index = 0; index < document.getPageCount(); index += 1) {
      const output = await pdfLib.PDFDocument.create();
      const [page] = await output.copyPages(document, [index]);
      output.addPage(page);
      downloadPdfBytes(await output.save(), outputName(item, 'page-' + (index + 1)));
    }
    els.status.textContent = item.file.name + ' · ' + document.getPageCount() + '개 페이지 분할 완료';
  });
}

async function deleteSelectedPages() {
  const rangeText = prompt('삭제할 페이지를 입력하세요. 예: 1,3-5');
  if (rangeText === null) return;
  await runPdfTool('PDF 페이지를 삭제하는 중…', async () => {
    const { item, pdfLib, document } = await loadSelectedPdfDocument();
    const deleteIndices = new Set(parsePageRanges(rangeText, document.getPageCount()));
    if (!deleteIndices.size) throw new Error('삭제할 페이지 번호가 올바르지 않습니다.');
    const keepIndices = document.getPageIndices().filter(index => !deleteIndices.has(index));
    if (!keepIndices.length) throw new Error('모든 페이지를 삭제할 수는 없습니다.');
    const output = await pdfLib.PDFDocument.create();
    const pages = await output.copyPages(document, keepIndices);
    pages.forEach(page => output.addPage(page));
    downloadPdfBytes(await output.save(), outputName(item, 'pages-deleted'));
    els.status.textContent = item.file.name + ' · 페이지 삭제 파일 저장 완료';
  });
}

async function addPageToSelectedPdf() {
  const position = String(prompt('빈 페이지 위치를 입력하세요: start 또는 end', 'end') || '').toLowerCase();
  if (!position) return;
  if (position !== 'start' && position !== 'end') return alert('start 또는 end를 입력하세요.');
  const text = prompt('빈 페이지에 넣을 텍스트를 입력하세요. 필요 없으면 비워두세요.', '') ?? '';
  await runPdfTool('빈 페이지를 추가하는 중…', async () => {
    const { item, pdfLib, document } = await loadSelectedPdfDocument();
    const output = await pdfLib.PDFDocument.create();
    const addBlank = async () => {
      const page = output.addPage();
      if (text) {
        const font = await output.embedFont(pdfLib.StandardFonts.Helvetica);
        page.drawText(text, { x: 50, y: page.getHeight() - 80, size: 18, font, color: pdfLib.rgb(0, 0, 0) });
      }
    };
    if (position === 'start') await addBlank();
    const pages = await output.copyPages(document, document.getPageIndices());
    pages.forEach(page => output.addPage(page));
    if (position === 'end') await addBlank();
    downloadPdfBytes(await output.save(), outputName(item, 'page-added'));
    els.status.textContent = item.file.name + ' · 빈 페이지 추가 파일 저장 완료';
  });
}

async function insertImageIntoSelectedPdf(imageFile) {
  if (!imageFile) return;
  const pageNumber = Number.parseInt(prompt('이미지를 넣을 페이지 번호', '1') || '1', 10);
  const x = Number.parseFloat(prompt('X 좌표', '50') || '50');
  const y = Number.parseFloat(prompt('Y 좌표', '50') || '50');
  const width = Number.parseFloat(prompt('이미지 너비', '200') || '200');
  await runPdfTool('PDF에 이미지를 삽입하는 중…', async () => {
    const { item, document } = await loadSelectedPdfDocument();
    if (pageNumber < 1 || pageNumber > document.getPageCount()) throw new Error('페이지 번호가 올바르지 않습니다.');
    const imageBytes = await imageFile.arrayBuffer();
    const image = imageFile.type === 'image/png' ? await document.embedPng(imageBytes) : await document.embedJpg(imageBytes);
    const scale = width / image.width;
    document.getPage(pageNumber - 1).drawImage(image, { x, y, width, height: image.height * scale });
    downloadPdfBytes(await document.save(), outputName(item, 'image-inserted'));
    els.status.textContent = item.file.name + ' · 이미지 삽입 파일 저장 완료';
  });
}

async function fillSelectedPdfForm() {
  const jsonText = prompt('폼 필드 값을 JSON으로 입력하세요.', '{"name":"홍길동"}');
  if (jsonText === null) return;
  let values;
  try { values = JSON.parse(jsonText); } catch { return alert('유효한 JSON이 아닙니다.'); }
  await runPdfTool('PDF 폼을 작성하는 중…', async () => {
    const { item, document } = await loadSelectedPdfDocument();
    const form = document.getForm();
    Object.entries(values).forEach(([name, value]) => {
      const field = form.getField(name);
      if (typeof field.setText === 'function') field.setText(String(value));
      else if (typeof field.select === 'function') field.select(String(value));
      else if (value && typeof field.check === 'function') field.check();
      else if (!value && typeof field.uncheck === 'function') field.uncheck();
    });
    downloadPdfBytes(await document.save(), outputName(item, 'form-filled'));
    els.status.textContent = item.file.name + ' · 폼 작성 파일 저장 완료';
  });
}

function openSignatureModal() {
  els.signatureModal.hidden = false;
  const context = els.signatureCanvas.getContext('2d');
  context.clearRect(0, 0, els.signatureCanvas.width, els.signatureCanvas.height);
  context.lineWidth = 2;
  context.lineCap = 'round';
  context.strokeStyle = '#000000';
}

function closeSignatureModal() {
  els.signatureModal.hidden = true;
}

async function applySignatureToSelectedPdf() {
  const pageNumber = Number.parseInt(document.getElementById('signature-page').value || '1', 10);
  const x = Number.parseFloat(document.getElementById('signature-x').value || '50');
  const y = Number.parseFloat(document.getElementById('signature-y').value || '50');
  const width = Number.parseFloat(document.getElementById('signature-width').value || '150');
  closeSignatureModal();
  await runPdfTool('PDF에 서명을 추가하는 중…', async () => {
    const { item, document } = await loadSelectedPdfDocument();
    if (pageNumber < 1 || pageNumber > document.getPageCount()) throw new Error('페이지 번호가 올바르지 않습니다.');
    const signatureBlob = await new Promise((resolve, reject) => els.signatureCanvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('서명 이미지를 만들지 못했습니다.')), 'image/png'));
    const signature = await document.embedPng(await signatureBlob.arrayBuffer());
    const scale = width / signature.width;
    document.getPage(pageNumber - 1).drawImage(signature, { x, y, width, height: signature.height * scale });
    downloadPdfBytes(await document.save(), outputName(item, 'signed'));
    els.status.textContent = item.file.name + ' · 서명 파일 저장 완료';
  });
}

let pageToolState = null;
let layerEditorState = null;

function closePageToolModal() {
  document.getElementById('page-tool-modal').hidden = true;
  pageToolState = null;
}

function updatePageToolSelectionUi() {
  if (!pageToolState) return;
  document.querySelectorAll('#page-grid .page-card').forEach(card => card.classList.toggle('selected', pageToolState.selected.has(Number(card.dataset.index))));
  document.getElementById('page-selection-status').textContent = pageToolState.selected.size + '개 페이지 선택';
}

async function renderPageToolThumbnails(item) {
  try {
    const pdfJs = await loadPdfJsModule();
    const pdf = await pdfJs.getDocument({ data: new Uint8Array(await item.file.arrayBuffer()) }).promise;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      if (!pageToolState) break;
      const card = document.querySelector('#page-grid .page-card[data-index="' + (pageNumber - 1) + '"]');
      if (!card) continue;
      const page = await pdf.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(0.36, 118 / base.width);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      card.insertBefore(canvas, card.firstChild);
      page.cleanup();
    }
    await pdf.destroy();
  } catch (error) {
    console.warn('페이지 썸네일을 렌더링하지 못해 번호 선택 화면을 사용합니다.', error);
  }
}

async function openPageToolModal(mode) {
  const item = getSelectedItem();
  if (!item) return alert('먼저 PDF 파일을 선택하세요.');
  setBusy(true, 'PDF 페이지 정보를 불러오는 중…');
  try {
    const { pdfLib, document: pdfDocument } = await loadSelectedPdfDocument();
    const count = pdfDocument.getPageCount();
    pageToolState = { mode, item, pdfLib, pdfDocument, selected: new Set() };
    if (mode === 'add' && count) pageToolState.selected.add(0);
    const titles = { split: '페이지 분할 및 추출', delete: '페이지 선택 삭제', add: '빈 페이지 위치 선택' };
    document.getElementById('page-tool-title').textContent = titles[mode];
    document.getElementById('page-tool-batch').hidden = mode !== 'split';
    document.getElementById('page-tool-apply').textContent = mode === 'split' ? '선택 페이지 하나로 추출' : mode === 'delete' ? '선택 페이지 삭제' : '빈 페이지 추가';
    document.getElementById('page-add-position-wrap').hidden = mode !== 'add';
    document.getElementById('page-add-text-wrap').hidden = mode !== 'add';
    const grid = document.getElementById('page-grid');
    grid.replaceChildren();
    for (let index = 0; index < count; index += 1) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'page-card';
      card.dataset.index = String(index);
      card.innerHTML = '<span class="page-number">' + (index + 1) + ' 페이지</span>';
      card.addEventListener('click', () => {
        if (!pageToolState) return;
        if (mode === 'add') pageToolState.selected = new Set([index]);
        else if (pageToolState.selected.has(index)) pageToolState.selected.delete(index);
        else pageToolState.selected.add(index);
        updatePageToolSelectionUi();
      });
      grid.appendChild(card);
    }
    document.getElementById('page-tool-modal').hidden = false;
    updatePageToolSelectionUi();
    renderPageToolThumbnails(item);
  } catch (error) {
    alert('페이지 선택 창을 열지 못했습니다.\n' + (error?.message || error));
  } finally {
    setBusy(false);
  }
}

async function applyPageTool() {
  if (!pageToolState) return;
  const state = pageToolState;
  const selected = Array.from(state.selected).sort((a, b) => a - b);
  if (!selected.length) return alert('페이지를 선택하세요.');
  closePageToolModal();
  await runPdfTool('선택한 페이지를 처리하는 중…', async () => {
    if (state.mode === 'split') {
      const output = await state.pdfLib.PDFDocument.create();
      const pages = await output.copyPages(state.pdfDocument, selected);
      pages.forEach(page => output.addPage(page));
      downloadPdfBytes(await output.save(), outputName(state.item, 'pages-' + selected.map(index => index + 1).join('-')));
      els.status.textContent = state.item.file.name + ' · 선택한 ' + selected.length + '개 페이지 추출 완료';
      return;
    }
    if (state.mode === 'delete') {
      const removed = new Set(selected);
      const keep = state.pdfDocument.getPageIndices().filter(index => !removed.has(index));
      if (!keep.length) throw new Error('모든 페이지를 삭제할 수는 없습니다.');
      const output = await state.pdfLib.PDFDocument.create();
      const pages = await output.copyPages(state.pdfDocument, keep);
      pages.forEach(page => output.addPage(page));
      downloadPdfBytes(await output.save(), outputName(state.item, 'pages-deleted'));
      els.status.textContent = state.item.file.name + ' · 선택 페이지 삭제 완료';
      return;
    }
    const target = selected[0];
    const position = document.getElementById('page-add-position').value;
    const text = document.getElementById('page-add-text').value;
    const output = await state.pdfLib.PDFDocument.create();
    const copied = await output.copyPages(state.pdfDocument, state.pdfDocument.getPageIndices());
    const size = state.pdfDocument.getPage(target).getSize();
    const addBlank = async () => {
      const page = output.addPage([size.width, size.height]);
      if (text) {
        const font = await output.embedFont(state.pdfLib.StandardFonts.Helvetica);
        page.drawText(text, { x: 50, y: size.height - 80, size: 18, font, color: state.pdfLib.rgb(0, 0, 0) });
      }
    };
    for (let index = 0; index < copied.length; index += 1) {
      if (index === target && position === 'before') await addBlank();
      output.addPage(copied[index]);
      if (index === target && position === 'after') await addBlank();
    }
    downloadPdfBytes(await output.save(), outputName(state.item, 'blank-page-added'));
    els.status.textContent = state.item.file.name + ' · 빈 페이지 추가 완료';
  });
}

async function batchSplitAllPages() {
  if (!pageToolState) return;
  const state = pageToolState;
  closePageToolModal();
  await runPdfTool('전체 페이지를 개별 분할하는 중…', async () => {
    for (let index = 0; index < state.pdfDocument.getPageCount(); index += 1) {
      const output = await state.pdfLib.PDFDocument.create();
      const [page] = await output.copyPages(state.pdfDocument, [index]);
      output.addPage(page);
      downloadPdfBytes(await output.save(), outputName(state.item, 'page-' + (index + 1)));
    }
    els.status.textContent = state.item.file.name + ' · 전체 페이지 개별 분할 완료';
  });
}

function closeLayerEditor() {
  document.getElementById('layer-editor-modal').hidden = true;
  if (layerEditorState?.objectUrl) URL.revokeObjectURL(layerEditorState.objectUrl);
  layerEditorState = null;
}

async function renderLayerEditorPage(resetLayer) {
  if (!layerEditorState) return;
  const pageNumber = Number(document.getElementById('layer-page-select').value || '1');
  layerEditorState.pageIndex = pageNumber - 1;
  const page = await layerEditorState.pdfJsDocument.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(1.5, 880 / base.width);
  const viewport = page.getViewport({ scale });
  const canvas = document.getElementById('layer-page-canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const stage = document.getElementById('layer-stage');
  stage.style.width = canvas.width + 'px';
  stage.style.height = canvas.height + 'px';
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  page.cleanup();
  if (resetLayer) {
    const layer = document.getElementById('editable-layer');
    layer.style.left = Math.max(20, (canvas.width - 220) / 2) + 'px';
    layer.style.top = Math.max(20, (canvas.height - 90) / 2) + 'px';
    layer.style.width = '220px';
    layer.style.height = layerEditorState.type === 'form' ? '54px' : '110px';
  }
}

async function openLayerEditor(payload) {
  const item = getSelectedItem();
  if (!item) return alert('먼저 PDF 파일을 선택하세요.');
  setBusy(true, '시각적 PDF 편집기를 준비하는 중…');
  try {
    const [pdfLib, pdfJs] = await Promise.all([loadPdfLibModule(), loadPdfJsModule()]);
    const sourceBytes = new Uint8Array(await item.file.arrayBuffer());
    const pdfLibDocument = await pdfLib.PDFDocument.load(sourceBytes.slice());
    const pdfJsDocument = await pdfJs.getDocument({ data: sourceBytes.slice() }).promise;
    layerEditorState = { item, type: payload.type, imageFile: payload.imageFile || null, dataUrl: payload.dataUrl || '', pdfLib, pdfLibDocument, pdfJsDocument, pageIndex: Math.max(0, payload.pageIndex || 0), objectUrl: '' };
    document.getElementById('layer-editor-title').textContent = payload.type === 'form' ? '폼 필드 위치 편집' : payload.type === 'signature' ? '서명 이미지 위치 편집' : '이미지 레이어 위치 편집';
    const pageSelect = document.getElementById('layer-page-select');
    pageSelect.replaceChildren();
    for (let index = 0; index < pdfLibDocument.getPageCount(); index += 1) pageSelect.add(new Option((index + 1) + ' 페이지', String(index + 1)));
    pageSelect.value = String(Math.min(pdfLibDocument.getPageCount(), layerEditorState.pageIndex + 1));
    const formFields = document.getElementById('layer-form-fields');
    formFields.hidden = payload.type !== 'form';
    const layer = document.getElementById('editable-layer');
    const content = document.getElementById('editable-layer-content');
    layer.classList.toggle('form-layer', payload.type === 'form');
    content.replaceChildren();
    if (payload.type === 'form') content.textContent = document.getElementById('layer-form-value').value || '텍스트 입력 필드';
    else {
      const image = document.createElement('img');
      if (payload.imageFile) {
        layerEditorState.objectUrl = URL.createObjectURL(payload.imageFile);
        image.src = layerEditorState.objectUrl;
      } else image.src = payload.dataUrl;
      image.alt = payload.type === 'signature' ? '서명 이미지' : '삽입 이미지';
      content.appendChild(image);
    }
    document.getElementById('layer-editor-modal').hidden = false;
    await renderLayerEditorPage(true);
  } catch (error) {
    closeLayerEditor();
    alert('시각적 PDF 편집기를 열지 못했습니다.\n' + (error?.message || error));
  } finally {
    setBusy(false);
  }
}

async function saveLayerEditorResult() {
  if (!layerEditorState) return;
  const state = layerEditorState;
  const layer = document.getElementById('editable-layer');
  const stage = document.getElementById('layer-stage');
  const pageIndex = state.pageIndex;
  const page = state.pdfLibDocument.getPage(pageIndex);
  const pageSize = page.getSize();
  const x = layer.offsetLeft * pageSize.width / stage.clientWidth;
  const width = layer.offsetWidth * pageSize.width / stage.clientWidth;
  const height = layer.offsetHeight * pageSize.height / stage.clientHeight;
  const y = pageSize.height - (layer.offsetTop * pageSize.height / stage.clientHeight) - height;
  closeLayerEditor();
  await runPdfTool('레이어를 PDF에 적용하는 중…', async () => {
    if (state.type === 'form') {
      const form = state.pdfLibDocument.getForm();
      const requestedName = document.getElementById('layer-form-name').value.trim() || 'field';
      const fieldName = requestedName + '-' + Date.now();
      const field = form.createTextField(fieldName);
      field.setText(document.getElementById('layer-form-value').value || '');
      field.addToPage(page, { x, y, width, height, borderWidth: 1 });
    } else {
      let bytes;
      let isPng = state.type === 'signature';
      if (state.imageFile) {
        bytes = await state.imageFile.arrayBuffer();
        isPng = state.imageFile.type === 'image/png';
      } else bytes = await (await fetch(state.dataUrl)).arrayBuffer();
      const image = isPng ? await state.pdfLibDocument.embedPng(bytes) : await state.pdfLibDocument.embedJpg(bytes);
      page.drawImage(image, { x, y, width, height });
    }
    const suffix = state.type === 'form' ? 'form-added' : state.type === 'signature' ? 'signed' : 'image-inserted';
    downloadPdfBytes(await state.pdfLibDocument.save(), outputName(state.item, suffix));
    els.status.textContent = state.item.file.name + ' · 시각적 ' + (state.type === 'form' ? '폼' : state.type === 'signature' ? '서명' : '이미지') + ' 편집 완료';
  });
}

function prepareSignatureLayer() {
  const pageIndex = Math.max(0, Number.parseInt(document.getElementById('signature-page').value || '1', 10) - 1);
  const dataUrl = els.signatureCanvas.toDataURL('image/png');
  closeSignatureModal();
  openLayerEditor({ type: 'signature', dataUrl, pageIndex });
}

function bindLayerPointerControls() {
  const layer = document.getElementById('editable-layer');
  const handle = layer.querySelector('.resize-handle');
  let action = null;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;
  let startWidth = 0;
  let startHeight = 0;
  const begin = (event, type) => {
    event.preventDefault();
    action = type;
    startX = event.clientX;
    startY = event.clientY;
    startLeft = layer.offsetLeft;
    startTop = layer.offsetTop;
    startWidth = layer.offsetWidth;
    startHeight = layer.offsetHeight;
    layer.setPointerCapture(event.pointerId);
  };
  layer.addEventListener('pointerdown', event => { if (event.target !== handle) begin(event, 'move'); });
  handle.addEventListener('pointerdown', event => begin(event, 'resize'));
  layer.addEventListener('pointermove', event => {
    if (!action) return;
    const stage = document.getElementById('layer-stage');
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (action === 'move') {
      layer.style.left = Math.max(0, Math.min(stage.clientWidth - layer.offsetWidth, startLeft + dx)) + 'px';
      layer.style.top = Math.max(0, Math.min(stage.clientHeight - layer.offsetHeight, startTop + dy)) + 'px';
    } else {
      layer.style.width = Math.max(30, Math.min(stage.clientWidth - layer.offsetLeft, startWidth + dx)) + 'px';
      layer.style.height = Math.max(24, Math.min(stage.clientHeight - layer.offsetTop, startHeight + dy)) + 'px';
    }
  });
  const end = () => { action = null; };
  layer.addEventListener('pointerup', end);
  layer.addEventListener('pointercancel', end);
}

async function mergePdfsWithPdfLib() {
  if (!items.length) return;
  setBusy(true, 'PDF 병합 라이브러리를 불러오는 중…');
  clearMergedPreview();
  previewRequestId += 1;
  try {
    const pdfLib = await loadPdfLibModule();
    if (!pdfLib || typeof pdfLib.PDFDocument !== 'function') {
      throw new Error('pdf-lib의 PDFDocument를 불러오지 못했습니다.');
    }
    const mergedDocument = await pdfLib.PDFDocument.create();
    let totalPages = 0;
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      els.busy.textContent = 'PDF 병합 중… ' + (index + 1) + ' / ' + items.length + ' · ' + item.file.name;
      const bytes = await item.file.arrayBuffer();
      const sourceDocument = await pdfLib.PDFDocument.load(bytes);
      const pageIndices = sourceDocument.getPageIndices();
      const copiedPages = await mergedDocument.copyPages(sourceDocument, pageIndices);
      copiedPages.forEach(page => mergedDocument.addPage(page));
      item.pageCount = pageIndices.length;
      totalPages += pageIndices.length;
    }
    const outputBytes = await mergedDocument.save();
    mergedBlob = new Blob([outputBytes], { type: 'application/pdf' });
    if (mergedUrl) URL.revokeObjectURL(mergedUrl);
    mergedUrl = URL.createObjectURL(mergedBlob);
    showPdfBlobInPreview(mergedBlob, mergedFileName());
    els.save.disabled = false;
    els.toPv.disabled = false;
    els.status.textContent = items.length + '개 PDF 원본 품질 병합 완료 · 총 ' + totalPages + '쪽';
    renderList();
  } catch (error) {
    clearMergedPreview();
    alert('PDF 병합에 실패했습니다.\n' + (error?.message || error));
  } finally {
    setBusy(false);
    els.busy.textContent = 'PDF를 병합하는 중…';
  }
}

async function handleFileInputSelection(event) {
  const selectedFiles = Array.from(event.currentTarget.files || []);
  if (!selectedFiles.length) return;
  event.currentTarget.value = '';
  await addFiles(selectedFiles);
}
els.files.addEventListener('input', handleFileInputSelection);
els.files.addEventListener('change', handleFileInputSelection);
els.projectSave.addEventListener('click', () => openProjectModal('save'));
els.projectLoad.addEventListener('click', () => openProjectModal('load'));
els.projectExport.addEventListener('click', exportPdfmProject);
els.projectImport.addEventListener('click', () => els.projectImportFile.click());
els.projectImportFile.addEventListener('change', event => {
  const file = event.currentTarget.files?.[0] || null;
  event.currentTarget.value = '';
  if (file) importPdfmProject(file);
});
document.getElementById('project-modal-cancel').addEventListener('click', closeProjectModal);
els.projectModalSave.addEventListener('click', saveProjectToInDb);
els.projectName.addEventListener('keydown', event => { if (event.key === 'Enter') saveProjectToInDb(); });
els.split.addEventListener('click', () => openPageToolModal('split'));
els.deletePages.addEventListener('click', () => openPageToolModal('delete'));
els.addPage.addEventListener('click', () => openPageToolModal('add'));
els.insertImage.addEventListener('click', () => els.imageFile.click());
els.imageFile.addEventListener('change', async event => {
  const imageFile = event.currentTarget.files?.[0] || null;
  event.currentTarget.value = '';
  if (imageFile) await openLayerEditor({ type: 'image', imageFile, pageIndex: 0 });
});
els.fillForm.addEventListener('click', () => openLayerEditor({ type: 'form', pageIndex: 0 }));
els.signature.addEventListener('click', openSignatureModal);
document.getElementById('signature-clear').addEventListener('click', () => els.signatureCanvas.getContext('2d').clearRect(0, 0, els.signatureCanvas.width, els.signatureCanvas.height));
document.getElementById('signature-cancel').addEventListener('click', closeSignatureModal);
document.getElementById('signature-apply').addEventListener('click', prepareSignatureLayer);
document.getElementById('page-tool-cancel').addEventListener('click', closePageToolModal);
document.getElementById('page-tool-apply').addEventListener('click', applyPageTool);
document.getElementById('page-tool-batch').addEventListener('click', batchSplitAllPages);
document.getElementById('page-select-all').addEventListener('click', () => {
  if (!pageToolState) return;
  if (pageToolState.mode === 'add') pageToolState.selected = new Set([0]);
  else pageToolState.selected = new Set(pageToolState.pdfDocument.getPageIndices());
  updatePageToolSelectionUi();
});
document.getElementById('page-select-none').addEventListener('click', () => {
  if (!pageToolState) return;
  pageToolState.selected.clear();
  updatePageToolSelectionUi();
});
document.getElementById('layer-page-select').addEventListener('change', () => renderLayerEditorPage(true));
document.getElementById('layer-editor-cancel').addEventListener('click', closeLayerEditor);
document.getElementById('layer-editor-apply').addEventListener('click', saveLayerEditorResult);
document.getElementById('layer-form-value').addEventListener('input', event => {
  if (layerEditorState?.type === 'form') document.getElementById('editable-layer-content').textContent = event.currentTarget.value || '텍스트 입력 필드';
});
bindLayerPointerControls();
{
  const canvas = els.signatureCanvas;
  const context = canvas.getContext('2d');
  let drawing = false;
  let lastX = 0;
  let lastY = 0;
  const point = event => {
    const source = event.touches?.[0] || event;
    const rect = canvas.getBoundingClientRect();
    return { x: (source.clientX - rect.left) * canvas.width / rect.width, y: (source.clientY - rect.top) * canvas.height / rect.height };
  };
  const start = event => { drawing = true; const next = point(event); lastX = next.x; lastY = next.y; };
  const move = event => {
    if (!drawing) return;
    event.preventDefault();
    const next = point(event);
    context.beginPath();
    context.moveTo(lastX, lastY);
    context.lineTo(next.x, next.y);
    context.stroke();
    lastX = next.x;
    lastY = next.y;
  };
  const end = () => { drawing = false; };
  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  canvas.addEventListener('mouseup', end);
  canvas.addEventListener('mouseleave', end);
  canvas.addEventListener('touchstart', start, { passive: true });
  canvas.addEventListener('touchmove', move, { passive: false });
  canvas.addEventListener('touchend', end);
}
function isFileDrag(dataTransfer) {
  if (!dataTransfer) return false;
  if (dataTransfer.files && dataTransfer.files.length) return true;
  if (Array.from(dataTransfer.items || []).some(item => item.kind === 'file')) return true;
  return Array.from(dataTransfer.types || []).some(type => String(type).toLowerCase() === 'files');
}

document.addEventListener('dragenter', event => {
  if (!isFileDrag(event.dataTransfer)) return;
  event.preventDefault();
  if (!isBusy) els.dropZone.classList.add('drop-active');
}, true);

document.addEventListener('dragover', event => {
  if (!isFileDrag(event.dataTransfer)) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = isBusy ? 'none' : 'copy';
  if (!isBusy) els.dropZone.classList.add('drop-active');
}, true);

document.addEventListener('dragleave', event => {
  if (event.relatedTarget) return;
  els.dropZone.classList.remove('drop-active');
}, true);

document.addEventListener('drop', async event => {
  if (!event.dataTransfer) return;
  event.preventDefault();
  event.stopPropagation();
  els.dropZone.classList.remove('drop-active');
  if (isBusy) return;
  const files = Array.from(event.dataTransfer.files || []);
  const projectFiles = files.filter(file => /\.pdfm$/i.test(file.name));
  if (projectFiles.length === 1 && files.length === 1) {
    await importPdfmProject(projectFiles[0]);
    return;
  }
  const pdfFiles = files.filter(file => file.type === 'application/pdf' || /\.pdf$/i.test(file.name));
  if (!pdfFiles.length) {
    alert('PDF 파일만 드래그해서 놓을 수 있습니다.');
    return;
  }
  await addFiles(pdfFiles);
}, true);
els.merge.addEventListener('click', mergePdfsWithPdfLib);
els.save.addEventListener('click', saveMerged);
els.toPv.addEventListener('click', sendMergedToPv);
els.close.addEventListener('click', () => window.close());
window.addEventListener('beforeunload', () => {
  if (mergedUrl) URL.revokeObjectURL(mergedUrl);
  previewUrls.forEach(url => URL.revokeObjectURL(url));
});
window.__pdfMergeModuleReady = true;
