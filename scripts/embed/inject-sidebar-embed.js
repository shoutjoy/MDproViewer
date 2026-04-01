/**
 * sidebar-ai.html 8~148?�을 index.html??#ai-right-sidebar-inner ?�에 ?�습?�다.
 * ?�이?�바 마크?�을 바꾼 ?? node scripts/embed/inject-sidebar-embed.js
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', '..');
const lines = fs.readFileSync(path.join(root, 'sidebarAI/sidebar-ai.html'), 'utf8').split(/\r?\n/);
const embed = lines.slice(7, 148).join('\n');
const indent = '            ';
const inner = embed.split('\n').map((l) => indent + l).join('\n');
const block = `        <div id="ai-right-sidebar-wrap" class="hidden shrink-0 relative z-10 border-l border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 overflow-hidden" style="width:0;display:none">
            <div id="ai-right-sidebar-inner" class="h-full flex flex-row items-stretch overflow-hidden min-w-0">
${inner}
            </div>
        </div>`;
let idx = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const re = /        <div id="ai-right-sidebar-wrap"[\s\S]*?<\/div>\s*<\/div>/;
if (!re.test(idx)) throw new Error('ai-right-sidebar-wrap 블록??찾을 ???�습?�다.');
idx = idx.replace(re, block);
fs.writeFileSync(path.join(root, 'index.html'), idx);
console.log('index.html???�이?�바 마크??반영 ?�료');
