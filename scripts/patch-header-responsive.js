/** One-off: saveFile(보내기) 버튼 반응형 클래스 정렬 — 이미 적용됨 */
const fs = require('fs');
const p = require('path').join(__dirname, '..', 'index.html');
const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
const idx = lines.findIndex((l) => l.includes('onclick="saveFile()"'));
if (idx < 0) { console.error('saveFile not found'); process.exit(1); }
lines[idx + 1] = '                class="p-1.5 sm:p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors text-slate-600 dark:text-slate-300 flex items-center gap-1 shrink-0"';
lines[idx + 3] = '                <i data-lucide="download" class="w-[18px] h-[18px] sm:w-5 sm:h-5"></i>';
if (lines[idx + 4].includes('hidden lg:inline'))
  lines[idx + 4] = lines[idx + 4].replace('hidden lg:inline', 'hidden xl:inline');
fs.writeFileSync(p, lines.join('\n'));
console.log('ok');
