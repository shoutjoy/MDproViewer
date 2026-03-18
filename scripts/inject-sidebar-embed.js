/**
 * sidebar-ai.html 8~148행을 index.html의 #ai-right-sidebar-inner 안에 넣습니다.
 * 사이드바 마크업을 바꾼 뒤: node scripts/inject-sidebar-embed.js
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
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
if (!re.test(idx)) throw new Error('ai-right-sidebar-wrap 블록을 찾을 수 없습니다.');
idx = idx.replace(re, block);
fs.writeFileSync(path.join(root, 'index.html'), idx);
console.log('index.html에 사이드바 마크업 반영 완료');
