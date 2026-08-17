(function () {
  'use strict';
  if (typeof window.__scholarAIUpgradeInstall === 'function') {
    window.__scholarAIUpgradeInstall();
    return;
  }
  window.__scholarAIUpgradesLoaded = true;

  var LS_TRANSLATION_DIRECTION = 'ss_viewer_scholar_ai_translation_direction';
  var LS_RESPONSE_MODE = 'ss_viewer_scholar_ai_response_mode';
  var activePresentation = 'default';
  var specialRunning = false;
  var quickProgressTimer = null;
  var quickProgressHideTimer = null;
  var quickProgressValue = 0;
  var baseStop = typeof window.scholarAIStop === 'function' ? window.scholarAIStop : null;

  function el(id) { return document.getElementById(id); }
  function callbacks() {
    return (window.SidebarAIConfig && window.SidebarAIConfig.callbacks) || {};
  }
  function getCallback(name) {
    var cb = callbacks()[name];
    return typeof cb === 'function' ? cb : null;
  }
  function estimateTokens(text) {
    var value = String(text || '');
    return Math.max(0, Math.ceil(value.length / 3.2));
  }
  function setQuickProgress(value, visible) {
    var wrap = el('scholar-ai-progress-wrap');
    var fill = el('scholar-ai-progress-fill');
    var pct = el('scholar-ai-progress-pct');
    var next = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
    quickProgressValue = next;
    if (wrap) {
      wrap.classList.toggle('visible', !!visible);
      wrap.style.display = visible ? 'flex' : 'none';
      wrap.setAttribute('aria-valuenow', String(next));
    }
    if (fill) fill.style.width = next + '%';
    if (pct) pct.textContent = next + '%';
  }
  function startQuickProgress() {
    if (quickProgressTimer) clearInterval(quickProgressTimer);
    if (quickProgressHideTimer) clearTimeout(quickProgressHideTimer);
    quickProgressTimer = null;
    quickProgressHideTimer = null;
    setQuickProgress(0, true);
    quickProgressTimer = setInterval(function () {
      var step = quickProgressValue < 55 ? 5 : (quickProgressValue < 82 ? 3 : 1);
      setQuickProgress(Math.min(95, quickProgressValue + step), true);
      if (quickProgressValue >= 95) {
        clearInterval(quickProgressTimer);
        quickProgressTimer = null;
      }
    }, 400);
  }
  function finishQuickProgress(completed) {
    if (quickProgressTimer) clearInterval(quickProgressTimer);
    if (quickProgressHideTimer) clearTimeout(quickProgressHideTimer);
    quickProgressTimer = null;
    quickProgressHideTimer = null;
    if (completed === false) {
      setQuickProgress(0, false);
      return;
    }
    setQuickProgress(100, true);
    quickProgressHideTimer = setTimeout(function () {
      setQuickProgress(0, false);
      quickProgressHideTimer = null;
    }, 900);
  }
  function setRunning(running, stage, completed) {
    var wasRunning = specialRunning;
    specialRunning = !!running;
    var run = el('scholar-ai-run-btn');
    var stop = el('scholar-ai-stop-btn');
    var quick = el('scholar-ai-academic-ida-btn');
    var translate = el('scholar-ai-academic-translate-btn');
    var slides = el('scholar-ai-slide-generate-btn');
    [run, quick, translate, slides].forEach(function (button) {
      if (button) button.disabled = !!running;
    });
    if (stop) stop.disabled = !running;
    if (stage) {
      var result = el('scholar-ai-result');
      if (result) result.value = stage;
    }
    if (!wasRunning && specialRunning) startQuickProgress();
    else if (wasRunning && !specialRunning) finishQuickProgress(completed);
  }
  function stopUpgradedRun() {
    if (!specialRunning) {
      if (baseStop) return baseStop();
      return;
    }
    var abort = getCallback('abortCurrentTask');
    if (abort) {
      try { abort(); } catch (_) {}
    }
    setRunning(false, 'Stopped by user.', false);
  }
  function normalizeCodeFence(text) {
    return String(text || '').trim()
      .replace(/^```(?:html|markdown|md)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();
  }
  function parseEnvelope(raw, answerFirst) {
    var text = String(raw || '').replace(/\r\n/g, '\n').trim();
    var explanation = '';
    var answer = '';
    var re = /\[\s*(EXPLANATION|RESULT|REASONING|ANSWER|설명|결과|답변)\s*(?::[^\]]*)?\]/ig;
    var marks = [];
    var match;
    while ((match = re.exec(text)) !== null) {
      var key = String(match[1] || '').toUpperCase();
      marks.push({ key: key, start: match.index, end: re.lastIndex });
    }
    marks.forEach(function (mark, index) {
      var segment = text.slice(mark.end, marks[index + 1] ? marks[index + 1].start : text.length).trim();
      if (/^(RESULT|ANSWER|결과|답변)$/.test(mark.key)) answer += (answer ? '\n\n' : '') + segment;
      else explanation += (explanation ? '\n\n' : '') + segment;
    });
    if (!marks.length) {
      if (answerFirst || /^\s*(?:<!doctype html|<html|<div[^>]+class=["'][^"']*(?:slide|slide-container))/i.test(text)) answer = text;
      else explanation = text;
    }
    return { explanation: explanation.trim(), answer: normalizeCodeFence(answer) };
  }
  function setPresentation(mode) {
    activePresentation = mode === 'translation' || mode === 'slides' ? mode : 'default';
    var wrap = el('scholar-ai-result-wrap');
    if (wrap) wrap.setAttribute('data-result-presentation', activePresentation);
    var explanationTab = el('scholar-ai-tab-explanation');
    var answerTab = el('scholar-ai-tab-insert');
    if (explanationTab) explanationTab.textContent = activePresentation === 'translation' ? '주요 용어 풀이' : '설명';
    if (answerTab) answerTab.textContent = activePresentation === 'translation' ? '번역결과' : (activePresentation === 'slides' ? 'HTML 결과' : '삽입 결과');
    var footnote = el('scholar-ai-insert-translation-footnotes');
    if (footnote) footnote.style.display = activePresentation === 'translation' ? '' : 'none';
    var preview = el('scholar-ai-slide-preview');
    if (preview) preview.hidden = activePresentation !== 'slides';
  }
  function applyResult(raw, options) {
    var parsed = parseEnvelope(raw, !!options.answerFirst);
    var explanation = el('scholar-ai-result');
    var answer = el('scholar-ai-result-insert');
    if (explanation) explanation.value = parsed.explanation;
    if (answer) answer.value = parsed.answer;
    setPresentation(options.presentation);
    if (typeof window.scholarAISetResultTab === 'function') {
      window.scholarAISetResultTab(parsed.answer ? 'insert' : 'explanation');
    }
    if (options.presentation === 'slides') renderSlides(parsed.answer);
    return parsed;
  }
  async function runSpecial(options) {
    var selected = el('scholar-ai-selected');
    var passage = selected ? String(selected.value || '').trim() : '';
    if (!passage) {
      alert(options.emptyMessage || 'Selected text에 작업할 내용을 입력하세요.');
      return;
    }
    var call = getCallback('callScholarAI') || getCallback('callGemini');
    if (!call) {
      alert('ScholarAI API를 사용할 수 없습니다. AI 연동 설정을 확인하세요.');
      return;
    }
    setRunning(true, options.stage || 'ScholarAI 실행 중...');
    setPresentation(options.presentation);
    var modelId = getCallback('getScholarAIModelId');
    var completed = false;
    try {
      var prompt = passage + '\n\n' + options.prompt;
      var response = await call(
        prompt,
        options.system,
        false,
        modelId ? modelId() : null,
        options.requestOptions || {}
      );
      var raw = response && response.text != null ? response.text : response;
      var text = typeof raw === 'string' ? raw : JSON.stringify(raw || '');
      applyResult(text, options);
      completed = true;
      if (typeof window.scholarAIHistoryAdd === 'function') {
        window.scholarAIHistoryAdd(options.historyLabel || 'ScholarAI', text);
        if (typeof window.scholarAIHistoryRender === 'function') window.scholarAIHistoryRender();
      }
      return text;
    } catch (error) {
      var message = error && error.message ? error.message : String(error || 'Unknown error');
      var result = el('scholar-ai-result');
      if (result) result.value = /abort/i.test(message) ? 'Stopped by user.' : 'Error: ' + message;
      if (typeof window.scholarAISetResultTab === 'function') window.scholarAISetResultTab('explanation');
    } finally {
      setRunning(false, null, completed);
    }
  }

  function protectedRanges(text) {
    var ranges = [];
    [
      /```[\s\S]*?```/g, /~~~[\s\S]*?~~~/g, /`[^`\n]*`/g,
      /\$\$[\s\S]*?\$\$/g, /\$[^$\n]+\$/g,
      /!?\[[^\]\n]*\]\([^\)\n]+\)/g, /https?:\/\/[^\s<>)]+/g,
      /<[^>\n]+>/g, /"[^"\n]*"/g, /“[^”\n]*”/g, /‘[^’\n]*’/g,
      /「[^」\n]*」/g, /『[^』\n]*』/g
    ].forEach(function (pattern) {
      var match;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(text)) !== null) ranges.push({ start: match.index, end: pattern.lastIndex });
    });
    ranges.sort(function (a, b) { return a.start - b.start || b.end - a.end; });
    return ranges.reduce(function (merged, range) {
      var last = merged[merged.length - 1];
      if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
      else merged.push({ start: range.start, end: range.end });
      return merged;
    }, []);
  }
  function isProtected(start, end, ranges) {
    return ranges.some(function (range) { return range.end > start && range.start < end; });
  }
  function hasBoundary(text, end) {
    return /^[ \t]*(?:[*_~]{0,3})?(?:[.!?…]+|\r?\n|\||$)/.test(text.slice(end));
  }
  function lineNumber(text, index) { return (text.slice(0, index).match(/\n/g) || []).length + 1; }
  function sentenceContext(text, start, end) {
    var left = Math.max(text.lastIndexOf('\n', start - 1), text.lastIndexOf('.', start - 1), text.lastIndexOf('!', start - 1), text.lastIndexOf('?', start - 1));
    var rights = [text.indexOf('\n', end), text.indexOf('.', end), text.indexOf('!', end), text.indexOf('?', end)].filter(function (v) { return v >= 0; });
    var right = rights.length ? Math.min.apply(Math, rights) + 1 : text.length;
    return text.slice(Math.max(0, left + 1), right).trim().slice(0, 360);
  }
  function applyPatches(text, patches) {
    var output = String(text || '');
    patches.slice().sort(function (a, b) { return b.start - a.start; }).forEach(function (patch) {
      output = output.slice(0, patch.start) + patch.replacement + output.slice(patch.end);
    });
    return output;
  }
  function collectAmbiguous(text) {
    var ranges = protectedRanges(text);
    var candidates = [];
    var re = /([\uAC00-\uD7A3]{1,30}(?:습니다|ㅂ니다|니다|이에요|예요|어요|아요|해요|돼요|네요|군요|죠))/g;
    var match;
    while ((match = re.exec(text)) !== null) {
      if (hasBoundary(text, re.lastIndex) && !isProtected(match.index, re.lastIndex, ranges)) {
        candidates.push({ id: candidates.length, start: match.index, end: re.lastIndex, original: match[0], context: sentenceContext(text, match.index, re.lastIndex), line: lineNumber(text, match.index) });
      }
    }
    return candidates;
  }
  function transformAcademicIda(value) {
    var text = String(value || '');
    var ranges = protectedRanges(text);
    var patches = [];
    var occupied = [];
    var rules = [
      ['것으로 판단됩니다','것으로 판단된다'], ['것으로 보입니다','것으로 보인다'],
      ['하였습니다','하였다'], ['했습니다','하였다'], ['했어요','하였다'],
      ['되었습니다','되었다'], ['됐습니다','되었다'], ['되었어요','되었다'], ['됐어요','되었다'],
      ['이었습니다','이었다'], ['였습니다','였다'], ['아닙니다','아니다'], ['아니에요','아니다'],
      ['입니다','이다'], ['이에요','이다'], ['예요','이다'], ['있습니다','있다'], ['있어요','있다'],
      ['없습니다','없다'], ['없어요','없다'], ['됩니다','된다'], ['돼요','된다'], ['보입니다','보인다'],
      ['나타납니다','나타난다'], ['같습니다','같다'], ['다릅니다','다르다'], ['높습니다','높다'],
      ['낮습니다','낮다'], ['많습니다','많다'], ['적습니다','적다'], ['좋습니다','좋다'],
      ['어렵습니다','어렵다'], ['쉽습니다','쉽다'], ['크습니다','크다'], ['작습니다','작다']
    ];
    function overlaps(start, end) { return occupied.some(function (r) { return r.end > start && r.start < end; }); }
    function add(start, end, original, replacement) {
      if (!hasBoundary(text, end) || isProtected(start, end, ranges) || overlaps(start, end)) return;
      patches.push({ start: start, end: end, original: original, replacement: replacement, line: lineNumber(text, start), context: sentenceContext(text, start, end) });
      occupied.push({ start: start, end: end });
    }
    rules.forEach(function (rule) {
      var re = new RegExp(rule[0], 'g');
      var match;
      while ((match = re.exec(text)) !== null) add(match.index, re.lastIndex, match[0], rule[1]);
    });
    var adjectives = { '가능':1,'간단':1,'강력':1,'바람직':1,'불가능':1,'불분명':1,'불필요':1,'충분':1,'중요':1,'필요':1,'명확':1,'타당':1,'적절':1,'적합':1,'유용':1,'유의':1,'동일':1,'복잡':1,'심각':1,'우수':1 };
    var actions = { '분석':1,'연구':1,'제시':1,'설명':1,'확인':1,'수행':1,'비교':1,'평가':1,'검토':1,'논의':1,'제안':1,'적용':1,'활용':1,'제공':1,'사용':1,'측정':1,'조사':1,'관찰':1,'보고':1,'주장':1,'가정':1,'정의':1,'분류':1,'예측':1,'해석':1,'고려':1,'포함':1,'의미':1,'시사':1,'기여':1,'증가':1,'감소':1,'발생':1,'존재':1,'일치':1 };
    [/([\uAC00-\uD7A3]{1,24})합니다/g, /([\uAC00-\uD7A3]{1,24})해요/g].forEach(function (re) {
      var match;
      while ((match = re.exec(text)) !== null) {
        var replacement = adjectives[match[1]] ? match[1] + '하다' : (actions[match[1]] ? match[1] + '한다' : '');
        if (replacement) add(match.index, re.lastIndex, match[0], replacement);
      }
    });
    var transformed = applyPatches(text, patches);
    return { text: transformed, patches: patches, changes: patches.length, ambiguous: collectAmbiguous(transformed), sourceCharacters: text.length, sourceTokens: estimateTokens(text), protectedCount: ranges.length };
  }
  function academicIdaRules() {
    return [
      '서술어와 문장 종결어미만 학술적 -이다/-다 문체로 교정하세요.',
      '동사와 형용사는 문법에 맞는 -다/-한다/-된다/-있다/-없다 형태를 사용하고 모든 서술어에 "이다"를 기계적으로 붙이지 마세요.',
      '서술어의 핵심 어휘와 시제, 긍정·부정, 가능성·당위·추정의 강도는 그대로 유지하세요.',
      '주어, 목적어, 수식어, 전문용어, 숫자, 기호, 인용, 출처, 링크, 코드, 수식, 문장 순서, 문단 및 Markdown 구조는 절대 바꾸지 마세요.',
      '요약, 설명 추가, 내용 삭제, 동의어 치환 또는 문장 재작성 없이 원문 전체를 빠짐없이 반환하세요.'
    ].join('\n');
  }
  function parseTonePatches(raw, candidates) {
    var text = String(raw || '');
    var first = text.indexOf('{');
    var last = text.lastIndexOf('}');
    if (first < 0 || last <= first) return [];
    var parsed;
    try { parsed = JSON.parse(text.slice(first, last + 1)); } catch (_) { return []; }
    return (parsed.items || []).map(function (item) {
      var candidate = candidates[Math.floor(Number(item.id))];
      var replacement = String(item.to || '').trim();
      if (!candidate || String(item.from || '') !== candidate.original || !replacement || /[\r\n<>\[\]{}]/.test(replacement)) return null;
      return { start: candidate.start, end: candidate.end, original: candidate.original, replacement: replacement, line: candidate.line, context: candidate.context };
    }).filter(Boolean);
  }
  function toneReport(local, ai, unresolved, note) {
    var lines = ['[문체변경 완료 결과]'];
    lines.push('- 입력량: ' + local.sourceCharacters.toLocaleString() + '자 · 약 ' + local.sourceTokens.toLocaleString() + ' tok');
    lines.push('- 로컬 즉시 변경: ' + local.patches.length + '개');
    lines.push('- AI 확인 후 변경: ' + ai.length + '개');
    lines.push('- 미변경 후보: ' + unresolved.length + '개');
    lines.push('- 보호 영역: ' + local.protectedCount + '개 (코드·수식·링크·HTML·인용)');
    if (local.patches.length || ai.length) {
      lines.push('', '[변경 목록]');
      local.patches.concat(ai).forEach(function (patch) { lines.push('- ' + patch.original + ' → ' + patch.replacement + ' · ' + patch.line + '행'); });
    }
    if (note) lines.push('', '- 처리 메모: ' + note);
    return lines.join('\n');
  }
  async function rewriteAcademicIda() {
    var selected = el('scholar-ai-selected');
    var source = selected ? String(selected.value || '') : '';
    if (!source.trim()) { alert('Selected text에 문체를 변경할 내용을 입력하세요.'); return; }
    setRunning(true, '학술적 ~이다 문체로 변경 중...');
    var local = transformAcademicIda(source);
    var ai = [];
    var unresolved = local.ambiguous.slice();
    var note = 'AI 호출 없이 명확한 어미만 변경';
    if (local.ambiguous.length) {
      var call = getCallback('callScholarAI') || getCallback('callGemini');
      if (call) {
        setRunning(true, '명확한 어미는 변경 완료 · 애매한 서술어 ' + local.ambiguous.length + '개만 AI 확인 중');
        try {
          var prompt = academicIdaRules() + '\n\n전체 문장을 다시 쓰지 말고 아래 후보 서술어만 판정하세요.\n각 항목의 from을 자연스러운 학술적 -이다/-다 서술형으로 바꾼 짧은 to만 반환하세요.\n반드시 JSON 하나만 반환하세요: {"items":[{"id":0,"from":"원문","to":"교정문"}]}\n후보 목록:\n' + JSON.stringify(local.ambiguous.map(function (item) { return { id: item.id, from: item.original, context: item.context }; }));
          var model = getCallback('getScholarAIModelId');
          var response = await call(prompt, '당신은 한국어 형태론 교정기이다. 전체 문장을 재작성하지 말고 요청된 서술어 후보의 교체 문자열만 JSON으로 반환한다.', false, model ? model() : null, { mode: 'quick', reasoning: 'off', maxOutputTokens: Math.max(1024, local.ambiguous.length * 48) });
          ai = parseTonePatches(response && response.text != null ? response.text : response, local.ambiguous);
          unresolved = local.ambiguous.filter(function (candidate) { return !ai.some(function (patch) { return patch.start === candidate.start && patch.end === candidate.end; }); });
          note = '원문의 다른 글자는 유지';
        } catch (error) {
          note = 'AI 확인 실패: ' + (error && error.message ? error.message : String(error));
        }
      }
    }
    var finalText = applyPatches(local.text, ai);
    applyResult('[EXPLANATION]\n' + toneReport(local, ai, unresolved, note) + '\n\n[RESULT]\n' + finalText, { presentation: 'default' });
    if (typeof window.scholarAIHistoryAdd === 'function') window.scholarAIHistoryAdd('~이다 빠른 문체변경', '[RESULT]\n' + finalText);
    setRunning(false, null, true);
    return finalText;
  }

  function translationDirection() {
    var select = el('scholar-ai-translation-direction');
    var direction = select ? select.value : '';
    if (direction !== 'ko-en') direction = 'en-ko';
    try { localStorage.setItem(LS_TRANSLATION_DIRECTION, direction); } catch (_) {}
    return direction;
  }
  function responseMode() {
    var select = el('scholar-ai-response-mode-select');
    var mode = select && select.value === 'reasoning' ? 'reasoning' : 'quick';
    try { localStorage.setItem(LS_RESPONSE_MODE, mode); } catch (_) {}
    return mode;
  }
  function buildTranslationPrompt(direction, mode) {
    var koEn = direction === 'ko-en';
    var rules = [
      koEn ? '아래 원문 전체를 한국어에서 영어로 번역하세요.' : '아래 원문 전체를 영어에서 한국어로 번역하세요.',
      koEn ? '대학원생 이상의 연구자가 학위논문 또는 학술지 논문에 바로 사용할 수 있는 정확하고 자연스러운 academic English로 작성하세요.' : '대학원생 이상의 연구자가 학위논문 또는 학술지 논문에 바로 사용할 수 있는 전문적이고 자연스러운 한국어 학술 문체(-이다/-한다)로 작성하세요.',
      '원문의 주장, 논리 관계, 인과·조건·제한의 강도, 전문용어, 고유명사, 수치, 단위, 인용 및 참고문헌 표기를 정확히 보존하세요.',
      '요약하거나 내용을 추가·삭제하지 말고 원문 마지막 글자까지 빠짐없이 번역하세요.',
      '제목, 문단, 목록, 표, 각주, Markdown, 링크, 코드 및 수식 구조를 유지하세요. 코드와 수식 자체는 번역하지 마세요.',
      mode === 'reasoning' ? '초벌 번역 후 의미 충실도, 누락·오역, 전문용어 일관성, 학술적 어조, 문법 및 번역투를 내부적으로 재검토하고 교정한 최종본을 제시하세요.' : '빠른 번역 모드입니다. 숨은 추론이나 장황한 검증 보고서 없이 최종 번역문과 주요 용어 풀이를 즉시 생성하세요.',
      '결과 순서를 고정하세요. 먼저 [ANSWER]에 완전한 최종 번역문 전체를 제시하고, 번역문이 끝난 뒤 [REASONING]에 주요 용어 풀이만 Markdown 목록으로 정리하세요.',
      koEn ? '용어 형식: **한국어 용어 (English term)**: 의미와 용어 선택 이유' : '용어 형식: **English term (한국어 번역어)**: 의미와 용어 선택 이유'
    ];
    return rules.join('\n');
  }
  function translateAcademic() {
    var direction = translationDirection();
    var mode = responseMode();
    return runSpecial({
      prompt: buildTranslationPrompt(direction, mode),
      system: '당신은 대학원 학위논문과 학술지 논문을 전문으로 번역하는 학술 번역가이다. 의미 충실도와 전문용어 일관성을 최우선으로 하며 원문을 요약, 생략 또는 확장하지 않는다.',
      stage: mode === 'reasoning' ? '학술 번역 문체 검증 중...' : '빠른 학술 번역 중...',
      emptyMessage: '학술번역할 텍스트를 입력하세요.',
      historyLabel: '학술번역 ' + (direction === 'ko-en' ? 'KO→EN' : 'EN→KO'),
      answerFirst: true,
      presentation: 'translation',
      requestOptions: { mode: mode, reasoning: mode === 'reasoning' ? undefined : 'off' }
    });
  }
  function parseTerms(reasoning) {
    var terms = [];
    String(reasoning || '').split(/\r?\n/).forEach(function (line) {
      var match = line.match(/^\s*(?:[-*+]\s*|\d+[.)]\s*)?\*\*([^*]+)\*\*\s*[:：—-]\s*(.+?)\s*$/);
      if (match && !/주요 용어 풀이/.test(match[1])) terms.push({ label: match[1].trim(), explanation: match[2].trim() });
    });
    return terms.slice(0, 10);
  }
  function footnotedTranslation() {
    if (activePresentation !== 'translation') return '';
    var answer = el('scholar-ai-result-insert');
    var reasoning = el('scholar-ai-result');
    var text = answer ? String(answer.value || '').trim() : '';
    var terms = parseTerms(reasoning ? reasoning.value : '');
    if (!text || !terms.length) return text;
    var notes = [];
    terms.forEach(function (term, index) {
      var id = '학술용어-' + (index + 1);
      var labelParts = term.label.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
      var candidates = labelParts ? [labelParts[2], labelParts[1]] : [term.label];
      for (var i = 0; i < candidates.length; i++) {
        var candidate = String(candidates[i] || '').trim();
        var at = candidate ? text.indexOf(candidate) : -1;
        if (at >= 0 && text.indexOf('[^' + id + ']', at) < 0) {
          text = text.slice(0, at + candidate.length) + '[^' + id + ']' + text.slice(at + candidate.length);
          break;
        }
      }
      notes.push('[^' + id + ']: **' + term.label + '** — ' + term.explanation);
    });
    return text + '\n\n' + notes.join('\n');
  }

  function buildSlidePrompt(extra) {
    return [
      '선택 텍스트를 학술 발표용 슬라이드로 요약하고 ToGenslide에 바로 보낼 수 있는 완전한 HTML 문서 하나를 생성하세요.',
      '원문의 핵심 주장과 근거를 파악하여 제목, 문제/배경, 핵심 개념, 방법 또는 논리, 주요 근거, 시사점, 결론의 흐름으로 4~12장을 구성하세요.',
      '한 슬라이드에는 하나의 핵심 메시지와 3~5개의 간결한 발표용 요점만 두고 원문에 없는 사실, 수치, 인용 또는 참고문헌을 만들지 마세요.',
      '수치 비교, 추세, 비율, 관계, 단계, 계층, 흐름은 근거가 있을 때 자체 JavaScript Canvas 또는 SVG 차트·도표로 시각화하세요.',
      '[ANSWER]에는 Markdown 코드 펜스 없이 <!DOCTYPE html>로 시작하는 HTML 문서 하나만 넣으세요.',
      '공통 CSS와 JavaScript는 <head>에 한 번만 작성하고 외부 라이브러리, 외부 폰트, 외부 이미지 및 네트워크 요청을 사용하지 마세요.',
      '각 슬라이드는 반드시 <div class="slide-container">...</div>로 만들고 body 안에 순서대로 배치하세요.',
      '.slide-container는 width:1600px; height:900px; box-sizing:border-box; overflow:hidden인 16:9 캔버스여야 합니다.',
      '본문은 28~32px를 권장하고 24px 미만으로 축소하지 마세요. 표 th/td는 최소 24px, 머리글은 최소 26px로 유지하세요.',
      'MathJax 호환 수식은 인라인 $...$, 블록 $$...$$ 형식의 올바른 TeX 명령으로 작성하세요.',
      '각 슬라이드가 개별 문서로 분리되어도 차트 초기화가 동작하도록 DOMContentLoaded에서 각 컨테이너를 탐색하세요.',
      '짧은 디자인 설명은 [REASONING]에, 최종 HTML 문서만 [ANSWER]에 넣으세요.',
      extra ? '추가 지시: ' + extra : ''
    ].filter(Boolean).join('\n');
  }
  function generateSlides() {
    var prompt = el('scholar-ai-prompt');
    return runSpecial({
      prompt: buildSlidePrompt(prompt ? prompt.value : ''),
      system: (typeof window.getScholarAIPromptByRole === 'function' ? window.getScholarAIPromptByRole('slide_editor') : '') || 'You are a professional academic slide architect. Return a self-contained 1600x900 HTML slide deck.',
      stage: '슬라이드 구성 및 시각화 생성 중...',
      emptyMessage: '슬라이드로 만들 선택 텍스트를 입력하세요.',
      historyLabel: '슬라이드 생성',
      answerFirst: true,
      presentation: 'slides',
      requestOptions: { mode: responseMode(), maxOutputTokens: 32768 }
    });
  }
  function slideDocuments(html) {
    var source = normalizeCodeFence(html);
    if (!source) return [];
    try {
      var doc = new DOMParser().parseFromString(source, 'text/html');
      var nodes = Array.prototype.slice.call(doc.querySelectorAll('.slide-container, .slide'));
      var head = doc.head ? doc.head.innerHTML : '';
      return nodes.map(function (node) {
        return '<!doctype html><html><head><meta charset="utf-8">' + head + '<style>html,body{margin:0;width:100%;height:100%;overflow:hidden}body{display:block}</style></head><body>' + node.outerHTML + '</body></html>';
      });
    } catch (_) { return []; }
  }
  function renderSlides(html) {
    var host = el('scholar-ai-slide-preview');
    if (!host) return;
    var docs = slideDocuments(html);
    host.innerHTML = '';
    if (!docs.length) {
      host.innerHTML = '<div class="scholar-ai-slide-preview-empty">완성된 슬라이드 HTML을 기다리는 중입니다.</div>';
      return;
    }
    docs.forEach(function (doc, index) {
      var card = document.createElement('article');
      card.className = 'scholar-ai-slide-preview-card';
      card.innerHTML = '<header><strong>' + (index + 1) + '페이지</strong><span>1600 × 900</span></header><div class="scholar-ai-slide-preview-viewport"><iframe sandbox="allow-scripts" title="슬라이드 ' + (index + 1) + ' 미리보기"></iframe></div>';
      host.appendChild(card);
      card.querySelector('iframe').srcdoc = doc;
    });
  }
  function ensurePreviewHost() {
    var wrap = el('scholar-ai-result-wrap');
    if (!wrap || typeof wrap.appendChild !== 'function' || el('scholar-ai-slide-preview')) return;
    var host = document.createElement('div');
    host.id = 'scholar-ai-slide-preview';
    host.className = 'scholar-ai-slide-preview';
    host.hidden = true;
    wrap.appendChild(host);
  }
  function closeQuickMenu() {
    var menu = el('scholar-ai-quick-menu');
    var toggle = el('scholar-ai-quick-toggle');
    if (menu) menu.classList.remove('open');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
  }
  function toggleQuickMenu(event) {
    if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
    var menu = el('scholar-ai-quick-menu');
    var toggle = el('scholar-ai-quick-toggle');
    if (!menu) return;
    var open = !menu.classList.contains('open');
    closeQuickMenu();
    if (open) menu.classList.add('open');
    if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  function runQuickAction(action) {
    closeQuickMenu();
    if (action === 'tone') return rewriteAcademicIda();
    if (action === 'translate') return translateAcademic();
    if (action === 'slides') return generateSlides();
  }
  function init() {
    var direction = el('scholar-ai-translation-direction');
    if (direction) {
      try { direction.value = localStorage.getItem(LS_TRANSLATION_DIRECTION) === 'ko-en' ? 'ko-en' : 'en-ko'; } catch (_) {}
      direction.onchange = translationDirection;
    }
    var mode = el('scholar-ai-response-mode-select');
    if (mode) {
      try { mode.value = localStorage.getItem(LS_RESPONSE_MODE) === 'reasoning' ? 'reasoning' : 'quick'; } catch (_) {}
      mode.onchange = responseMode;
    }
    ensurePreviewHost();
    var answer = el('scholar-ai-result-insert');
    if (answer && typeof answer.addEventListener === 'function' && !answer.__scholarSlidePreviewBound) {
      answer.__scholarSlidePreviewBound = true;
      answer.addEventListener('input', function () { if (activePresentation === 'slides') renderSlides(answer.value); });
    }
    if (window.SidebarAIInsertDeps) window.SidebarAIInsertDeps.getTranslationFootnoteText = footnotedTranslation;
    if (!document.__scholarAIQuickMenuBound && typeof document.addEventListener === 'function') {
      document.__scholarAIQuickMenuBound = true;
      document.addEventListener('click', function (event) {
        var wrap = el('scholar-ai-quick-wrap');
        if (!wrap || !wrap.contains(event.target)) closeQuickMenu();
      });
    }
  }

  function installGlobals() {
    if (typeof window.scholarAIStop === 'function' && window.scholarAIStop !== stopUpgradedRun) baseStop = window.scholarAIStop;
    window.scholarAIRewritePredicatesAcademicIda = rewriteAcademicIda;
    window.scholarAITranslateAcademic = translateAcademic;
    window.scholarAIGenerateSlides = generateSlides;
    window.toggleScholarAIQuickMenu = toggleQuickMenu;
    window.closeScholarAIQuickMenu = closeQuickMenu;
    window.scholarAIQuickAction = runQuickAction;
    window.scholarAIStop = stopUpgradedRun;
    window.ScholarAcademicTone = { transformLocal: transformAcademicIda, applyPatches: applyPatches, parsePatchResponse: parseTonePatches };
    window.ScholarAcademicTranslation = { buildPrompt: buildTranslationPrompt, parseMajorTerms: parseTerms, buildFootnotedTranslation: footnotedTranslation, setPresentation: setPresentation };
    window.ScholarSlideGeneration = { buildPrompt: buildSlidePrompt, renderPreview: renderSlides };
    window.scholarAIUpgradeInit = init;
    init();
  }
  window.__scholarAIUpgradeInstall = installGlobals;
  installGlobals();
})();
