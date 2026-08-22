(function (global) {
    'use strict';

    function splitProtectedInlineCode(line) {
        return String(line).split(/(`+[^`]*`+)/g);
    }

    function convertInlineLinks(text, references, assignedKeys, mode) {
        return text.replace(/\[\[(\d+)\]\]\(\s*(https?:\/\/[^\s)]+(?:\([^\s)]*\)[^\s)]*)*)\s*\)/gi, function (_, number, url) {
            var pairKey = String(number) + '\n' + url;
            var key;
            if (Object.prototype.hasOwnProperty.call(assignedKeys, pairKey)) {
                key = assignedKeys[pairKey];
            } else {
                key = String(Object.keys(references).length + 1);
                references[key] = url;
                assignedKeys[pairKey] = key;
            }
            return mode === 'footnote' ? '[^' + key + ']' : '[' + key + ']';
        });
    }

    function inlineToReferences(source, options) {
        options = options || {};
        var mode = options.mode === 'footnote' ? 'footnote' : 'reference';
        var input = String(source == null ? '' : source);
        var references = {};
        var assignedKeys = {};
        var fence = null;
        var convertedCount = 0;
        var lines = input.replace(/\r\n?/g, '\n').split('\n');
        var output = lines.map(function (line) {
            var fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
            if (fenceMatch) {
                var marker = fenceMatch[1].charAt(0);
                if (!fence) fence = marker;
                else if (fence === marker) fence = null;
                return line;
            }
            if (fence || /^\s*\[\d+\]:\s*/.test(line)) return line;

            var parts = splitProtectedInlineCode(line);
            for (var i = 0; i < parts.length; i += 2) {
                var before = parts[i];
                parts[i] = convertInlineLinks(before, references, assignedKeys, mode);
                if (parts[i] !== before) {
                    convertedCount += (before.match(/\[\[\d+\]\]\(\s*https?:\/\//gi) || []).length;
                }
            }
            return parts.join('');
        });

        var keys = Object.keys(references);
        if (!keys.length) {
            return { value: input, changed: false, convertedCount: 0, referenceCount: 0, references: [] };
        }

        var value = output.join('\n').replace(/\s+$/, '');
        var definitions = keys.map(function (key) {
            var marker = mode === 'footnote' ? '[^' + key + ']' : '[' + key + ']';
            var newWindowMarker = mode === 'reference' ? ' "mdpro-inline2ref-new-window"' : '';
            return marker + ': ' + references[key] + newWindowMarker;
        });
        value += mode === 'footnote'
            ? '\n\n## 참고문헌\n\n' + definitions.join('\n') + '\n'
            : '\n\n' + definitions.join('\n') + '\n';
        return {
            value: value,
            changed: value !== input,
            mode: mode,
            convertedCount: convertedCount,
            referenceCount: definitions.length,
            references: keys.map(function (key) { return { number: key, url: references[key] }; })
        };
    }

    global.TidyInlineToRef = { convert: inlineToReferences };
})(window);
