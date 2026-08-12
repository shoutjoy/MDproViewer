(function (global) {
    'use strict';

    function isObjectUrlList(value) {
        return value && typeof value.push === 'function' && typeof value.pop === 'function';
    }

    function pushObjectUrl(list, url) {
        if (!isObjectUrlList(list) || !url) return;
        list.push(url);
    }

    function registerInternalObjectUrl(url, collectorList) {
        if (typeof URL === 'undefined' || !URL.createObjectURL) return;
        pushObjectUrl(collectorList, url);
    }

    function ensureDeps(deps) {
        var input = deps && typeof deps === 'object' ? deps : {};
        return {
            sourceDeps: input,
            db: input.db || null,
            imageDb: input.imageDb || global.ImageDB || null,
            isEditMode: !!input.isEditMode,
            editorTextarea: input.editorTextarea || null,
            showToast: typeof input.showToast === 'function' ? input.showToast : null,
            setCurrentMarkdown: typeof input.setCurrentMarkdown === 'function' ? input.setCurrentMarkdown : null,
            renderMarkdown: typeof input.renderMarkdown === 'function' ? input.renderMarkdown : null,
            renderTOC: typeof input.renderTOC === 'function' ? input.renderTOC : null,
            performAutoSave: typeof input.performAutoSave === 'function' ? input.performAutoSave : null
        };
    }

    var base64ConversionBusy = false;

    async function applyBase64ToUrl(deps, applyResult) {
        var normalized = ensureDeps(deps);
        var editorTextarea = normalized.editorTextarea;

        if (!normalized.isEditMode || !editorTextarea) {
            if (normalized.showToast) normalized.showToast('편집 모드에서 사용하세요.');
            return;
        }

        if (base64ConversionBusy) {
            if (normalized.showToast) normalized.showToast('Base64 이미지를 변환하고 있습니다.');
            return;
        }

        if (!normalized.db || !normalized.imageDb || typeof normalized.imageDb.convertBase64ImagesInMarkdown !== 'function') {
            if (normalized.showToast) normalized.showToast('IndexedDB 이미지 저장소가 아직 준비되지 않았습니다.');
            return;
        }

        var start = editorTextarea.selectionStart;
        var end = editorTextarea.selectionEnd;
        var hasSelection = start !== end;
        var originalText = editorTextarea.value;
        var sourceText = hasSelection ? originalText.substring(start, end) : originalText;

        base64ConversionBusy = true;
        try {
            var result = await normalized.imageDb.convertBase64ImagesInMarkdown(normalized.db, sourceText);
            if (!result || !result.convertedCount) {
                if (normalized.showToast) normalized.showToast('변환할 Base64 Markdown/HTML 이미지가 없습니다.');
                return;
            }
            if (editorTextarea.value !== originalText) {
                if (normalized.showToast) normalized.showToast('변환 중 문서가 변경되었습니다. 다시 실행하세요.');
                return;
            }

            if (typeof applyResult === 'function') {
                applyResult({ value: result.markdown }, sourceText);
            } else {
                if (hasSelection) {
                    editorTextarea.value = originalText.substring(0, start) + result.markdown + originalText.substring(end);
                } else {
                    editorTextarea.value = result.markdown;
                }
                if (normalized.setCurrentMarkdown) normalized.setCurrentMarkdown(editorTextarea.value);
                if (typeof normalized.renderMarkdown === 'function') normalized.renderMarkdown();
                if (normalized.activeSidebarTab === 'toc' && typeof normalized.renderTOC === 'function') normalized.renderTOC();
                if (typeof normalized.performAutoSave === 'function') normalized.performAutoSave();
            }

            if (normalized.showToast) {
                var scope = hasSelection ? '선택 영역' : '문서 전체';
                var stored = Number(result.storedCount || result.convertedCount);
                normalized.showToast(scope + ' Base64 이미지 ' + result.convertedCount + '개를 internal:// 링크로 변환했습니다. (IndexedDB ' + stored + '개 저장, MDD 저장 가능)');
            }
        } catch (error) {
            if (normalized.showToast) {
                normalized.showToast('Base64 이미지 변환 실패: ' + (error && error.message ? error.message : error));
            }
        } finally {
            base64ConversionBusy = false;
        }
    }

    async function resolveInternalMarkdownImages(raw, db, imageDb, onObjectUrl) {
        var source = String(raw || '');
        if (!source.includes('internal://') || !imageDb || !db) return { markdown: source, resolvedCount: 0, missingIds: [] };
        try {
            return await imageDb.resolveInternalUrlsInMarkdown(db, source, onObjectUrl);
        } catch (error) {
            return { markdown: source, resolvedCount: 0, missingIds: [] };
        }
    }

    async function hydrateInternalImagesInElement(rootEl, options) {
        var opts = options && typeof options === 'object' ? options : {};
        var root = rootEl;
        var db = opts.db || null;
        var imageDb = opts.imageDb || global.ImageDB;
        var cache = opts.cache || null;
        var collector = opts.collector;
        if (!root || !db || !imageDb || typeof imageDb.getImage !== 'function' || !cache || typeof cache.get !== 'function') return;

        var nodes = root.querySelectorAll('img[src^="internal://"]');
        for (var i = 0; i < nodes.length; i++) {
            var img = nodes[i];
            var src = String(img.getAttribute('src') || '');
            var id = typeof imageDb.parseInternalUrl === 'function'
                ? imageDb.parseInternalUrl(src)
                : src.replace(/^internal:\/\//, '');
            if (!id) continue;

            try {
                var cached = cache.get(id);
                if (!cached) {
                    var rec = imageDb.getImage(db, id);
                    var record = rec && typeof rec.then === 'function' ? await rec : rec;
                    if (!record || !record.blob) continue;
                    cached = {
                        url: URL.createObjectURL(record.blob),
                        size: Number(record.blob.size || 0),
                        type: String(record.blob.type || record.mime || '')
                    };
                    cache.set(id, cached);
                    if (typeof collector === 'function') collector(id, cached);
                }
                img.src = cached.url;
                img.setAttribute('data-internal-id', id);
            } catch (_) {}
        }
    }

    function clearInternalImageObjectUrlCache(cache, id) {
        if (!cache || typeof cache.get !== 'function') return;
        var key = id != null ? String(id) : null;
        if (key) {
            var cached = cache.get(key);
            if (cached && cached.url) {
                try { URL.revokeObjectURL(cached.url); } catch (_) {}
            }
            cache.delete(key);
            return;
        }
        cache.forEach(function (cached) {
            if (!cached || !cached.url) return;
            try { URL.revokeObjectURL(cached.url); } catch (_) {}
        });
        cache.clear();
    }

    global.TidyImageRecovery = {
        applyBase64ToUrl: function (deps, applyResult) { return applyBase64ToUrl(deps, applyResult); },
        registerInternalObjectUrl: function (url, collector) { return registerInternalObjectUrl(url, collector); },
        resolveInternalMarkdownImagesForViewer: function (raw, deps) {
            var opt = deps && typeof deps === 'object' ? deps : {};
            return resolveInternalMarkdownImages(raw, opt.db, opt.imageDb || global.ImageDB, opt.onObjectUrl);
        },
        resolveInternalMarkdownImagesForPreview: function (raw, deps) {
            var opt = deps && typeof deps === 'object' ? deps : {};
            return resolveInternalMarkdownImages(raw, opt.db, opt.imageDb || global.ImageDB, opt.onObjectUrl);
        },
        hydrateInternalImagesInElement: function (rootEl, options) { return hydrateInternalImagesInElement(rootEl, options || {}); },
        clearInternalImageObjectUrlCache: clearInternalImageObjectUrlCache
    };
})(window);
