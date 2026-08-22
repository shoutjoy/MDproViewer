const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('AI Jena composer supports document/image selection, drag-drop, paste, preview, and removal', () => {
  const chat = read('AI_App/aiChat/ai-chat.js');
  assert.match(chat, /id="ai-chat-file-input"/);
  assert.match(chat, /\.txt,\.md,\.markdown,\.csv,\.json,\.html,\.htm,\.docx,\.pdf,\.pptx,\.xlsx,\.png,\.jpg,\.jpeg,\.gif,\.webp,\.bmp,\.svg,\.avif,\.ico/);
  assert.match(chat, /addEventListener\('paste'/);
  assert.match(chat, /addEventListener\('drop'/);
  assert.match(chat, /function renderPendingAttachments\(\)/);
  assert.match(chat, /pendingAttachments\.splice\(index, 1\)/);
  assert.match(chat, /function appendUserAttachmentGallery\(item, message\)/);
  assert.match(chat, /message\.role === 'user'\) appendUserAttachmentGallery/);
  assert.match(chat, /confirmAndOpenImageInFma\(attachment\.dataUrl, attachment\.name\)/);
});

test('AI Jena bridge extracts supported documents and preserves images for vision providers', () => {
  const app = read('js/app.js');
  assert.match(app, /async function extractAIChatAttachment\(file\)/);
  assert.match(app, /extractAIChatPdfText/);
  assert.match(app, /extractAIChatOfficeText/);
  assert.match(app, /extension === '\.docx' \|\| extension === '\.pptx' \|\| extension === '\.xlsx'/);
  assert.match(app, /input_image/);
  assert.match(app, /inlineData/);
  assert.match(app, /extractAttachment: function \(file\)/);
});

test('attachment limits protect chat storage and model context', () => {
  const chat = read('AI_App/aiChat/ai-chat.js');
  const app = read('js/app.js');
  assert.match(chat, /MAX_ATTACHMENTS = 8/);
  assert.match(chat, /if \(attachmentLoading\)/);
  assert.match(app, /25 \* 1024 \* 1024/);
  assert.match(app, /text\.slice\(0, 160000\)/);
});
