/* Separates model reasoning accidentally embedded in a visible answer. */
(function (root) {
  'use strict';

  function trim(value) {
    return String(value == null ? '' : value).trim();
  }

  function cleanReasoning(value) {
    return trim(value)
      .replace(/^\s*(?:\[?REASONING\]?|\[?ANALYSIS\]?|THINKING|추론|분석)\s*:?\s*/i, '')
      .replace(/\s*(?:\[\/?(?:REASONING|ANALYSIS|THINK)\])\s*$/i, '')
      .trim();
  }

  function addReasoning(parts, value) {
    var cleaned = cleanReasoning(value);
    if (!cleaned) return;
    if (parts.some(function (part) { return part === cleaned; })) return;
    parts.push(cleaned);
  }

  function hasMetaReasoning(value) {
    return /(?:^|[\n.!?]\s*)(?:the\s+user\s+(?:wants|asks|requested)|i\s+(?:will|need|should|must|am\s+going\s+to)|we\s+(?:will|need|should|must)|the\s+final\s+(?:answer|output|response)\s+(?:should|will|must|is)|(?:analysis|reasoning|strategy|approach|plan)\s*:|(?:분석|추론|계획|전략)\s*:)/i.test(String(value || ''));
  }

  function explicitAnswerBoundary(value) {
    var marker = /(?:^|\n)\s*(?:#{1,6}\s*)?(?:\[ANSWER\]\s*|(?:FINAL\s+(?:ANSWER|RESPONSE|OUTPUT)|최종\s*답변)\s*[:：]\s*)/i.exec(value);
    if (!marker) return null;
    return {
      reasoningEnd: marker.index,
      answerStart: marker.index + marker[0].length
    };
  }

  function inlineKoreanAnswerBoundary(value) {
    var pattern = /(?:the\s+final\s+(?:answer|output|response)\s+(?:should|will|must|is)[^.!?\n]*[.!?])\s*(?=[가-힣])/ig;
    var match;
    var last = null;
    while ((match = pattern.exec(value))) last = match;
    if (!last) return null;
    return last.index + last[0].length;
  }

  function koreanLineAnswerBoundary(value, afterIndex) {
    var linePattern = /[^\n]*(?:\n|$)/g;
    var match;
    while ((match = linePattern.exec(value))) {
      var start = match.index;
      if (start <= afterIndex) {
        if (!match[0]) break;
        continue;
      }
      var line = trim(match[0]);
      if (!line) {
        if (!match[0]) break;
        continue;
      }
      var korean = (line.match(/[가-힣]/g) || []).length;
      var english = (line.match(/[A-Za-z]/g) || []).length;
      if (korean >= 2 && korean > english && !hasMetaReasoning(line)) return start;
      if (!match[0]) break;
    }
    return null;
  }

  function split(answer, explicitReasoning) {
    var original = trim(answer);
    var visible = original;
    var reasoningParts = [];
    addReasoning(reasoningParts, explicitReasoning);

    visible = visible.replace(/<(think|analysis|reasoning)>([\s\S]*?)<\/\1>/gi, function (_, tag, content) {
      addReasoning(reasoningParts, content);
      return '\n';
    }).replace(/\n{3,}/g, '\n\n').trim();

    var explicit = explicitAnswerBoundary(visible);
    if (explicit) {
      var prefix = trim(visible.slice(0, explicit.reasoningEnd));
      if (prefix && (reasoningParts.length || hasMetaReasoning(prefix) || /^\s*(?:\[?(?:reasoning|analysis)\]?|추론|분석)\s*:/i.test(prefix))) {
        addReasoning(reasoningParts, prefix);
        visible = trim(visible.slice(explicit.answerStart));
      } else {
        visible = trim(visible.slice(explicit.answerStart));
      }
    } else if (hasMetaReasoning(visible)) {
      var boundary = inlineKoreanAnswerBoundary(visible);
      if (boundary == null) {
        var metaMatch = /(?:the\s+user\s+(?:wants|asks|requested)|i\s+(?:will|need|should|must|am\s+going\s+to)|we\s+(?:will|need|should|must)|the\s+final\s+(?:answer|output|response)\s+(?:should|will|must|is))/ig;
        var current;
        var lastMetaEnd = -1;
        while ((current = metaMatch.exec(visible))) lastMetaEnd = current.index + current[0].length;
        if (lastMetaEnd >= 0) boundary = koreanLineAnswerBoundary(visible, lastMetaEnd);
      }
      if (boundary != null && boundary > 0) {
        var embeddedReasoning = trim(visible.slice(0, boundary));
        var candidateAnswer = trim(visible.slice(boundary));
        if (candidateAnswer) {
          addReasoning(reasoningParts, embeddedReasoning);
          visible = candidateAnswer;
        }
      }
    }

    return {
      answer: visible || original,
      reasoning: reasoningParts.join('\n\n')
    };
  }

  root.AIChatResponseSeparator = Object.freeze({ split: split });
})(typeof window !== 'undefined' ? window : globalThis);
