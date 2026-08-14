import * as pdfjsLib from '../../vendor/pdfjs/build/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('../../vendor/pdfjs/build/pdf.worker.min.mjs', import.meta.url).href;

const els = {
  files: document.getElementById('files'), add: document.getElementById('add'), list: document.getElementById('list'),
  dropZone: document.querySelector('.sidebar'),
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
    row.draggable = true;
    row.dataset.id = item.id;
    row.title = '클릭하면 이 PDF를 미리보기';
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
    row.addEventListener('click', function (event) {
      if (event.target.closest('.actions') || event.target.closest('.handle')) return;
      previewPdfItem(index);
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

async function previewPdfItem(index) {
  const item = items[index];
  if (!item) return;
  const requestId = ++previewRequestId;
  const fileName = String(item.file && item.file.name ? item.file.name : ('문서 ' + (index + 1)));
  setBusy(true, 'PDF를 미리보는 중…');
  clearPreviewImages();
  els.placeholder.hidden = false;
  try {
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

async function addFiles(fileList) {
  if (isBusy) return;
  const files = Array.from(fileList || []).filter(file => file.type === 'application/pdf' || /\.pdf$/i.test(file.name));
  if (!files.length) return;
  setBusy(true, 'PDF 정보를 읽는 중…');
  const added = [];
  const failed = [];
  try {
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      els.busy.textContent = 'PDF 정보를 읽는 중… ' + (index + 1) + ' / ' + files.length;
      try {
        added.push(await readFile(file));
      } catch (error) {
        failed.push({ file, error });
      }
    }
    if (added.length) {
      items = items.concat(added);
      clearMergedPreview();
      renderList();
    }
  } finally {
    setBusy(false);
    els.busy.textContent = 'PDF를 병합하는 중…';
  }
  if (failed.length) {
    const failedNames = failed.map(entry => entry.file.name).join('\n');
    alert(failed.length + '개 PDF를 읽지 못했습니다. 나머지 파일은 목록에 추가했습니다.\n\n' + failedNames);
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
  previewRequestId += 1;
  let output = null;
  let outputPages = 0;
  const previewPages = [];
  const scale = getPdfRenderScale();
  try {
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

els.files.addEventListener('change', async event => {
  const selectedFiles = Array.from(event.currentTarget.files || []);
  event.currentTarget.value = '';
  await addFiles(selectedFiles);
});
let dropDepth = 0;
els.dropZone.addEventListener('dragenter', event => {
  if (!event.dataTransfer || !Array.from(event.dataTransfer.types || []).includes('Files')) return;
  event.preventDefault();
  dropDepth += 1;
  if (!isBusy) els.dropZone.classList.add('drop-active');
});
els.dropZone.addEventListener('dragover', event => {
  if (!event.dataTransfer || !Array.from(event.dataTransfer.types || []).includes('Files')) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = isBusy ? 'none' : 'copy';
});
els.dropZone.addEventListener('dragleave', () => {
  dropDepth = Math.max(0, dropDepth - 1);
  if (!dropDepth) els.dropZone.classList.remove('drop-active');
});
els.dropZone.addEventListener('drop', async event => {
  event.preventDefault();
  dropDepth = 0;
  els.dropZone.classList.remove('drop-active');
  if (isBusy) return;
  const files = Array.from(event.dataTransfer?.files || []);
  const pdfFiles = files.filter(file => file.type === 'application/pdf' || /\.pdf$/i.test(file.name));
  if (!pdfFiles.length) {
    alert('PDF 파일만 드래그해서 놓을 수 있습니다.');
    return;
  }
  await addFiles(pdfFiles);
});
window.addEventListener('dragover', event => {
  if (event.dataTransfer && Array.from(event.dataTransfer.types || []).includes('Files')) event.preventDefault();
});
window.addEventListener('drop', event => {
  if (event.dataTransfer && Array.from(event.dataTransfer.types || []).includes('Files')) event.preventDefault();
});
els.merge.addEventListener('click', mergePdfs);
els.save.addEventListener('click', saveMerged);
els.toPv.addEventListener('click', sendMergedToPv);
els.close.addEventListener('click', () => window.close());
window.addEventListener('beforeunload', () => {
  if (mergedUrl) URL.revokeObjectURL(mergedUrl);
  previewUrls.forEach(url => URL.revokeObjectURL(url));
});
