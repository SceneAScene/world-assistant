function cleanText(value) {
    return String(value ?? '').replace(/\r\n?/g, '\n').trim();
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeNarrativeTagNames(value) {
    const source = Array.isArray(value) ? value : String(value ?? '').split(/[\n,，;；]+/g);
    const result = [];
    const seen = new Set();
    for (const raw of source) {
        let name = String(raw ?? '').trim();
        if (!name) continue;
        const pair = name.match(/^<\s*([A-Za-z][\w:.-]*)\s*>\s*<\/\s*\1\s*>$/i);
        const opening = name.match(/^<\s*([A-Za-z][\w:.-]*)[^>]*>$/i);
        const closing = name.match(/^<\/\s*([A-Za-z][\w:.-]*)\s*>$/i);
        name = String(pair?.[1] ?? opening?.[1] ?? closing?.[1] ?? name).toLowerCase();
        if (!/^[a-z][\w:.-]*$/.test(name) || seen.has(name)) continue;
        seen.add(name);
        result.push(name);
        if (result.length >= 12) break;
    }
    return result;
}

export function narrativeFilterSignature({ tags = ['content'], fallbackToWholeMessage = false } = {}) {
    const normalized = normalizeNarrativeTagNames(tags);
    return `tags:${normalized.join(',')}|fallback:${fallbackToWholeMessage ? 1 : 0}`;
}

export function extractNarrativeContent(rawText, { tags = ['content'], fallbackToWholeMessage = false } = {}) {
    const raw = cleanText(rawText);
    const normalizedTags = normalizeNarrativeTagNames(tags);
    if (!raw) return { text: '', matchedTags: [], usedFallback: false, signature: narrativeFilterSignature({ tags: normalizedTags, fallbackToWholeMessage }) };

    // Empty tag list explicitly means "use the whole assistant message".
    if (!normalizedTags.length) {
        return { text: raw, matchedTags: [], usedFallback: true, signature: narrativeFilterSignature({ tags: [], fallbackToWholeMessage: true }) };
    }

    const chunks = [];
    const matchedTags = [];
    for (const tag of normalizedTags) {
        const escaped = escapeRegExp(tag);
        const re = new RegExp(`<\\s*${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/\\s*${escaped}\\s*>`, 'gi');
        let match;
        while ((match = re.exec(raw)) !== null) {
            const body = cleanText(match[1]);
            if (body) chunks.push({ index: match.index, body, tag });
            if (!matchedTags.includes(tag)) matchedTags.push(tag);
            if (match[0].length === 0) re.lastIndex += 1;
        }
    }
    chunks.sort((a, b) => a.index - b.index);
    const text = chunks.map(item => item.body).join('\n\n').trim();
    if (text) {
        return { text, matchedTags, usedFallback: false, signature: narrativeFilterSignature({ tags: normalizedTags, fallbackToWholeMessage }) };
    }
    if (fallbackToWholeMessage) {
        return { text: raw, matchedTags: [], usedFallback: true, signature: narrativeFilterSignature({ tags: normalizedTags, fallbackToWholeMessage }) };
    }
    return { text: '', matchedTags: [], usedFallback: false, signature: narrativeFilterSignature({ tags: normalizedTags, fallbackToWholeMessage }) };
}
