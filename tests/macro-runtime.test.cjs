const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
let view = true, scroll = 0, moved = [];
const listeners = new Set(), notices = [];
const container = { clientHeight:400, scrollHeight:1800, get scrollTop() { return scroll; }, getBoundingClientRect:() => ({top:0}) };
let nodes = [0, 500, 1000].map((offset, index) => ({
  tagName:'H2', textContent:'제목 '+index,
  getBoundingClientRect:() => ({top:offset-scroll}),
  scrollIntoView() { scroll=offset; moved.push(index); }
}));
const context = vm.createContext({
  document:{body:{classList:{contains:() => view}},getElementById:id => id==='viewer' ? {querySelectorAll:() => nodes} : id==='viewer-container' ? container : null},
  addEventListener:(type,fn) => listeners.add(fn), removeEventListener:(type,fn) => listeners.delete(fn),
  getComputedStyle:() => ({scrollMarginTop:'0',scrollPaddingTop:'0'}), showToast:text => notices.push(text)
});
vm.runInContext('window=globalThis',context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../trt/macro-runtime.js'),'utf8'),context);
function key(key, input=false) {
  const event = {key,defaultPrevented:false,target:{closest:selector => input && selector.includes('textarea') ? {} : null},
    preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){} };
  [...listeners].forEach(fn=>fn(event)); return event;
}
const runtime = context.MacroRuntime;
runtime.create('M001',{}).enableHeadingNavigation();
assert.equal(listeners.size,2);
assert.equal(key('ArrowRight').defaultPrevented,true); assert.equal(scroll,500);
key('ArrowRight'); assert.equal(scroll,1000);
key('ArrowRight'); assert.equal(scroll,1000); assert.match(notices.at(-1),/마지막/);
key('ArrowLeft'); assert.equal(scroll,500);
view=false; assert.equal(key('ArrowRight').defaultPrevented,false); assert.equal(scroll,500);
view=true; assert.equal(key('ArrowRight',true).defaultPrevented,false); assert.equal(scroll,500);
runtime.create('M001',{}).enableHeadingNavigation(); assert.equal(listeners.size,2);
key('ArrowLeft'); assert.equal(scroll,0);
scroll=510; key('ArrowRight'); assert.equal(scroll,1000, 'manual scrolling determines current heading');
nodes=[]; key('ArrowRight'); assert.match(notices.at(-1),/목차가 없습니다/);
runtime.stopAll(); assert.equal(listeners.size,0);
assert.equal(key('ArrowRight').defaultPrevented,false);
console.log('Macro runtime: actual heading scroll, boundaries, view/input guards, reapply cleanup, changed document and deactivation passed.');
