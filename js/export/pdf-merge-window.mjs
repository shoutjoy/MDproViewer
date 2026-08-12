import * as pdfjsLib from '../../vendor/pdfjs/build/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('../../vendor/pdfjs/build/pdf.worker.min.mjs', import.meta.url).href;

const els = {
  files: document.getElementById('files'), add: document.getElementById('add'), list: document.getElementById('list'),
  merge: document.getElementById('merge'), save: document.getElementById('save'), close: document.getElementById('close'),
  preview: document.getElementById('preview'), placeholder: document.getElementById('placeholder'),
  busy: document.getElementById('busy'), status: document.getElementById('status'), quality: document.getElementById('quality')
};

let items = [];
let mergedBlob = null;
let mergedUrl = '';
let previewUrls = [];
let dragId = '';

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
  els.placeholder.hidden = false;
  els.preview.replaceChildren();
  previewUrls.forEach(url => URL.revokeObjectURL(url));
  previewUrls = [];
  if (mergedUrl) URL.revokeObjectURL(mergedUrl);
  mergedUrl = '';
}

function showMergedPreview(pages) {
  els.preview.replaceChildren();
  previewUrls.forEach(url => URL.revokeObjectURL(url));
  previewUrls = [];
  pages.forEach((page, index) => {
    const url = URL.createObjectURL(new Blob([page.jpeg], { type: 'image/jpeg' }));
    const image = document.createElement('img');
    image.src = url;
    image.alt = '병합 PDF ' + (index + 1) + '쪽';
    image.width = Math.max(1, Math.round(page.width));
    image.height = Math.max(1, Math.round(page.height));
    image.loading = index > 1 ? 'lazy' : 'eager';
    previewUrls.push(url);
    els.preview.appendChild(image);
  });
}

function setBusy(show, message) {
  els.busy.style.display = show ? 'flex' : 'none';
  if (message) els.busy.textContent = message;
  els.add.disabled = show;
  els.merge.disabled = show || !items.length;
  els.save.disabled = show || !mergedBlob;
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
    row.className = 'item';
    row.draggable = true;
    row.dataset.id = item.id;
    row.innerHTML = '<div class="handle" title="끌어서 순서 변경">☰</div>' +
      '<div><div class="name"></div><div class="meta"></div></div>' +
      '<div class="actions"><button type="button" class="mini up" title="위로">▲</button><button type="button" class="mini down" title="아래로">▼</button><button type="button" class="mini remove" title="제거">×</button></div>';
    row.querySelector('.name').textContent = (index + 1) + '. ' + item.file.name;
    row.querySelector('.meta').textContent = item.pageCount + '쪽 · ' + formatSize(item.file.size);
    row.querySelector('.up').disabled = index === 0;
    row.querySelector('.down').disabled = index === items.length - 1;
    row.querySelector('.up').addEventListener('click', () => moveItem(index, index - 1));
    row.querySelector('.down').addEventListener('click', () => moveItem(index, index + 1));
    row.querySelector('.remove').addEventListener('click', () => { items.splice(index, 1); clearMergedPreview(); renderList(); });
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
  const pages = items.reduce((sum, item) => sum + item.pageCount, 0);
  els.status.textContent = items.length ? items.length + '개 PDF · 총 ' + pages + '쪽 · 위에서 아래 순서로 병합' : '선택된 PDF 없음';
  els.merge.disabled = !items.length;
}

function moveItem(from, to) {
  if (from < 0 || to < 0 || from >= items.length || to >= items.length || from === to) return;
  const [item] = items.splice(from, 1);
  items.splice(to, 0, item);
  clearMergedPreview();
  renderList();
}

async function readFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const documentTask = pdfjsLib.getDocument({ data: bytes.slice(), useWorkerFetch: false });
  const pdf = await documentTask.promise;
  const pageCount = pdf.numPages;
  await pdf.destroy();
  return { id: fileId(file), file, bytes, pageCount };
}

async function addFiles(fileList) {
  const files = Array.from(fileList || []).filter(file => file.type === 'application/pdf' || /\.pdf$/i.test(file.name));
  if (!files.length) return;
  setBusy(true, 'PDF 정보를 읽는 중…');
  try {
    const added = [];
    for (const file of files) added.push(await readFile(file));
    items = items.concat(added);
    clearMergedPreview();
    renderList();
  } catch (error) {
    alert('PDF 파일을 읽지 못했습니다.\n' + (error?.message || error));
  } finally {
    setBusy(false);
  }
}

function canvasToJpeg(canvas, quality) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => {
    if (!blob) return reject(new Error('PDF 페이지 이미지를 만들지 못했습니다.'));
    blob.arrayBuffer().then(buffer => resolve(new Uint8Array(buffer)), reject);
  }, 'image/jpeg', quality));
}

async function mergePdfs() {
  if (!items.length) return;
  const JsPdf = window.jspdf?.jsPDF;
  if (!JsPdf) return alert('PDF 생성 라이브러리를 불러오지 못했습니다.');
  setBusy(true, 'PDF를 병합하는 중…');
  clearMergedPreview();
  let output = null;
  let outputPages = 0;
  const previewPages = [];
  const scale = Math.max(1, Math.min(3, Number(els.quality.value) || 1.75));
  try {
    const totalPages = items.reduce((sum, item) => sum + item.pageCount, 0);
    for (const item of items) {
      const source = await pdfjsLib.getDocument({ data: item.bytes.slice(), useWorkerFetch: false }).promise;
      for (let pageNumber = 1; pageNumber <= source.numPages; pageNumber += 1) {
        els.busy.textContent = 'PDF 병합 중… ' + (outputPages + 1) + ' / ' + totalPages;
        const page = await source.getPage(pageNumber);
        const pageViewport = page.getViewport({ scale: 1 });
        const renderViewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.ceil(renderViewport.width));
        canvas.height = Math.max(1, Math.ceil(renderViewport.height));
        const context = canvas.getContext('2d', { alpha: false });
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: context, viewport: renderViewport }).promise;
        const jpeg = await canvasToJpeg(canvas, scale >= 2.2 ? 0.95 : scale >= 1.7 ? 0.9 : 0.82);
        const width = pageViewport.width;
        const height = pageViewport.height;
        const orientation = width > height ? 'landscape' : 'portrait';
        if (!output) output = new JsPdf({ unit: 'pt', format: [width, height], orientation, compress: true });
        else output.addPage([width, height], orientation);
        output.addImage(jpeg, 'JPEG', 0, 0, width, height, undefined, 'MEDIUM');
        previewPages.push({ jpeg, width, height });
        outputPages += 1;
        canvas.width = 1;
        canvas.height = 1;
        page.cleanup();
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
  link.download = 'merged-' + new Date().toISOString().slice(0, 10) + '.pdf';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

els.add.addEventListener('click', () => els.files.click());
els.files.addEventListener('change', () => { addFiles(els.files.files); els.files.value = ''; });
els.merge.addEventListener('click', mergePdfs);
els.save.addEventListener('click', saveMerged);
els.close.addEventListener('click', () => window.close());
window.addEventListener('beforeunload', () => {
  if (mergedUrl) URL.revokeObjectURL(mergedUrl);
  previewUrls.forEach(url => URL.revokeObjectURL(url));
});
